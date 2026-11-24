# SEG-021 · Esteira CI/CD com gates de segurança (DevSecOps)

> Status: **PRONTO PARA REVISÃO** — gerado fora do repositório do usuário
> (sem acesso de push nesta sessão). Falta: copiar os arquivos, rodar os 3
> testes de validação, marcar os 4 checks como `required` no GitHub, e
> revisar as duas referências externas que não tenho contexto (seção 6).

## 1. O que já existia (antes deste card)
A esteira já tinha 3 das 4 etapas de segurança pedidas — este card **não
parte do zero**:
- **Lint, Typecheck, Build, Testes** — job `quality` (`Lint • Types • Test • Build`).
- **SCA** — job `dependency-scan` (SEG-013): `npm audit` com allowlist
  documentada (`security/audit-exceptions.json`), SBOM CycloneDX, bloqueia
  High/Critical.
- **Secret Scan** — job `secret-scan` (SEG-005): gitleaks.
- **Permissões mínimas** — o workflow já tinha `permissions: contents: read`
  no nível raiz (least privilege já aplicado).
- **Trigger seguro** — `pull_request` (não `pull_request_target`), então
  secrets do repositório nunca ficam expostos a código de um fork malicioso
  num PR — o vetor de ataque "pwn request" já não se aplica aqui.

## 2. O que faltava e foi implementado nesta entrega

### SAST — Semgrep (novo, corrigido após teste real)
Novo job `sast` no `ci.yml`, mesmo padrão dos outros: roda em todo push/PR,
gera relatório completo (artifact) e bloqueia com um gate próprio.

- **Ferramenta:** Semgrep CLI (open-source, sem conta/token necessário para
  os rulesets públicos usados).
- **Rulesets públicos:** `p/owasp-top-ten`, `p/javascript`, `p/typescript`,
  `p/react`, `p/nextjs`.
- **Regras PRÓPRIAS** (`.semgrep/custom-rules.yml`) — adicionadas depois de
  descobrir, testando de verdade, que os pacotes públicos **não pegam
  `eval()` puro**. Em vez de confiar cegamente em composição de pacote que
  não controlo, escrevi 3 regras de alta confiança, testadas localmente
  (zero falso-positivo em código Prisma parametrizado legítimo):
  - `wave-eval-arbitrary-code` — `eval()`/`new Function()`.
  - `wave-dangerously-set-inner-html-unsanitized` — XSS via
    `dangerouslySetInnerHTML`.
  - `wave-raw-sql-unsafe` — SQL Injection via `$queryRawUnsafe`/
    `$executeRawUnsafe` com string interpolada (Prisma).
- **Gate:** `scripts/security/sast-gate.mjs` — mesma arquitetura do
  `audit-gate.mjs` (SEG-013).

### 🐛 Bug real encontrado e corrigido durante a validação (Teste 3)
O primeiro teste (branch `test/seg-021-sast`, arquivo com `eval()`) **passou
verde quando deveria bloquear** — e foi mergeado por engano antes de eu
identificar a causa (revertido em seguida, sem impacto: era só uma função
de teste, nada sensível). Duas causas, as duas corrigidas:

1. **Nenhum ruleset público testado pega `eval()` puro.** Resolvido com as
   regras próprias acima, testadas de verdade contra o mesmo `eval()` do
   teste (confirmei localmente: `1 finding, severidade ERROR, bloqueia`).
2. **Vocabulário de severidade incompleto no gate.** O relatório real do
   Semgrep trouxe achados com severidade `"MEDIUM"` e `"WARNING"` (regras de
   config/supply-chain, como falta de `cooldown` no Dependabot e uso de tag
   mutável `@v4` nas actions) — o Semgrep moderno usa **duas terminologias**
   dependendo da regra: `ERROR`/`WARNING`/`INFO` (padrão de código clássico)
   e `CRITICAL`/`HIGH`/`MEDIUM`/`LOW` (regras mais novas de config). Meu gate
   só reconhecia `"ERROR"`, então nunca bloquearia nada dessas regras mais
   novas. Corrigido: `BLOCKING_SEVERITIES = new Set(["ERROR", "CRITICAL", "HIGH"])`.

Os 13 achados do teste real eram legítimos, mas de severidade
`MEDIUM`/`WARNING` (não bloqueante por desenho, correto): 2 sobre
`dependabot.yml` sem `cooldown`, 11 sobre actions do `ci.yml` pinadas por
tag (`@v4`) em vez de SHA — ambos já anotados na seção 3 como trade-off
aceito conscientemente (não são erro, são o padrão comum). Ficam registrados
aqui como aviso: se um dia quiserem endurecer isso, é só criar exceções ou
corrigir — o gate já está pronto pra reconhecer a severidade certa quando
(se) algum desses virar `HIGH`/`CRITICAL` numa atualização futura do Semgrep.

### Ação pendente descoberta: checks obrigatórios incompletos
Conferindo o histórico de PRs desta sessão, **só 2 dos 3 checks já
existentes estavam marcados como `required`** em Settings → Branches
(`Lint • Types • Test • Build` e `Secret Scan`) — "Dependências (SCA)"
**nunca foi marcado**, apesar de já bloquear tecnicamente quando roda.
Isso significa que, na prática, um merge poderia (em teoria) ser forçado
sem esperar o SCA passar. **Corrigir isso é literalmente um critério de
aceite deste card** ("Status checks obrigatórios configurados", "Merge não
pode contornar os gates") — ver seção 5, ação manual nº 1.

## 3. Revisão de segurança dos próprios workflows (item 7 do card)
| Item do card | Situação |
|---|---|
| Permissões mínimas | ✅ Já tinha `permissions: contents: read` no root. Nenhum job precisa de mais que isso hoje. |
| Secrets no GitHub Secrets | ✅ Único uso é `secrets.GITHUB_TOKEN` (automático) no gitleaks-action. Nenhum secret de terceiro (Vercel/Neon/PSP) é usado nos workflows do CI. |
| Sem credencial no YAML | ✅ Conferido — nenhuma string com cara de credencial no `ci.yml`. |
| Actions de terceiros usadas | `actions/checkout`, `actions/setup-node`, `actions/setup-python`, `actions/upload-artifact` (todas oficiais do GitHub) + `gitleaks/gitleaks-action` (terceiro, mas muito usado/mantido). Pinadas por tag de versão maior (`@v4`/`@v5`/`@v2`), não por SHA — é o padrão aceitável e mais comum; pin por SHA é mais rígido mas exige atualização manual constante (trade-off documentado, não implementado por ora — YAGNI). |
| Proteção de branch | Configurada para `develop`/`main` (é o que já vínhamos usando — os pushes diretos são bloqueados, força PR). |
| Quem pode alterar workflows | **Não verificado nesta sessão** — é uma configuração de Settings → Actions → General (ou regra de CODEOWNERS para `.github/workflows/`), não um arquivo. Ação manual (seção 5, item 4). |
| Execução segura de PR de fork | ✅ Trigger é `pull_request` (não `pull_request_target`) — já seguro por padrão. |

## 4. Arquivos
**Novos:** `scripts/security/sast-gate.mjs`, `security/sast-exceptions.json`,
`.semgrep/custom-rules.yml`, `docs/SEG-021-CICD-DEVSECOPS.md` (este arquivo).
**Alterado:** `.github/workflows/ci.yml` (novo job `sast`; nada nos outros
3 jobs foi tocado).

## 5. Ações manuais (não dá pra fazer por arquivo)
1. ~~**Settings → Branches**: adicionar "Dependências (SCA)" e "SAST
   (Semgrep)" a required status checks~~ — **FEITO, confirmado em `develop`
   e `main`** (print conferido: os 4 checks aparecem como `Required`).
2. ~~Confirmar "Require branches to be up to date before merging"~~ —
   **FEITO** (visível ativo no mesmo print).
3. Revisar **quem pode aprovar PR** e **quem pode fazer push direto**
   (Settings → Branches → "Restrict who can push") — **pendente**.
4. Revisar **quem pode editar arquivos em `.github/workflows/`** — via regra
   de branch protection com "Restrict who can push to matching branches"
   aplicada a um padrão que cubra o diretório, ou via CODEOWNERS
   (`.github/CODEOWNERS` com `/.github/workflows/ @robsonmaia`, por
   exemplo) — não implementado nesta entrega, decisão de quem deve revisar
   fica com o time. **Pendente.**

## 6. Referências externas sem contexto disponível
O card menciona alinhamento com **TEC-009 — Staging** e **TEC-016 —
Pipeline de build**. Não tenho acesso ao conteúdo desses cards nesta
sessão — não vou supor o que eles pedem. O que existe hoje no projeto
(`docs/HOMOLOGACAO.md`/`fluxo-de-trabalho.md`) é: `develop` = homologação
(deploy automático de Preview), `main` = produção (só via PR
`develop → main`, CI verde obrigatório). Se TEC-009/016 pedirem um ambiente
de **staging** distinto de homolog, isso é mudança de infraestrutura fora
do escopo do que dá pra inferir aqui — **confirmar com quem escreveu esses
dois cards antes de considerar o item 6 do SEG-021 fechado.**

## 7. Testes (evidência exigida pelo card)

### Teste 1 — Segredo exposto
Este mecanismo (gitleaks) já existia antes deste card (SEG-005) — não gerei
evidência nova nesta sessão porque não participei da implementação original.
**Ação:** se não houver evidência já registrada do SEG-005, repetir o roteiro
abaixo numa branch descartável:
```powershell
git checkout -b test/seg-021-secret
# adicionar uma linha reconhecível, ex.: uma AWS key de exemplo (fake) num arquivo novo
git add . ; git commit -m "test: segredo fake para validar secret scan (nao mergear)"
git push origin test/seg-021-secret
```
Abrir o PR, confirmar que "Secret Scan" falha, depois descartar a branch
sem mergear.

### Teste 2 — Dependência vulnerável
**Já feito e documentado no SEG-013** (`axios@0.21.0`, PR de teste,
`npm audit` bloqueou, evidência no log do CI). Não precisa repetir — é a
mesma esteira, mesmo mecanismo.

### Teste 3 — Falha de SAST (feito nesta sessão, com um incidente no meio)
A primeira tentativa (antes da correção da seção 2) **passou verde por
engano e foi mergeada** — revertido em seguida (branch
`fix/remove-arquivo-teste-sast`, sem impacto real, era só uma função de
teste). Depois de corrigir o gate e adicionar as regras próprias, testei
localmente contra o mesmo `eval()` e confirmei o bloqueio (`1 finding,
severidade ERROR, exit 1`).

**Falta repetir em PR real** com o gate corrigido, pra ter a evidência
definitiva em CI (não só local). Roteiro, numa branch descartável:
```powershell
git checkout -b test/seg-021-sast-v2
```
```powershell
@"
// TEMP — só para validar o gate de SAST (SEG-021). Não mergear.
export function testeInseguro(entrada: string) {
  return eval(entrada);
}
"@ | Out-File -Encoding utf8 src\teste-seg-021-sast.ts
```
```powershell
git add src/teste-seg-021-sast.ts
git commit -m "test: padrao inseguro para validar SAST (nao mergear)"
git push origin test/seg-021-sast-v2
```
Abrir o PR contra `develop` e conferir na aba Checks:
1. Semgrep identifica o `eval()` via a regra própria `wave-eval-arbitrary-code`.
2. O job **"SAST (Semgrep)"** falha (vermelho).
3. O relatório (`semgrep-report`, artifact) mostra o finding.
4. O merge fica bloqueado — o check já é `required`.

**Depois do teste:** fechar o PR **sem mergear**, apagar `src/teste-seg-021-sast.ts`
e a branch local/remota — nunca deixar esse arquivo em `develop`.

## 8. Riscos / observações
- Semgrep com rulesets públicos tem falso-positivo ocasional — se aparecer
  um bloqueio genuinamente incorreto (não um risco real), o caminho é a
  exceção documentada em `security/sast-exceptions.json`, nunca desabilitar
  a regra globalmente.
- Rodar Semgrep soma tempo à esteira (baixa os rulesets a cada execução) —
  se isso incomodar no dia a dia, dá pra cachear os rulesets entre runs
  (`actions/cache` na pasta `~/.semgrep`) como otimização futura, não feita
  agora (YAGNI até virar problema real).
- Pin de actions por tag major (não SHA) é um trade-off aceito, não um erro
  — documentado na seção 3.
