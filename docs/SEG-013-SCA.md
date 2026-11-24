# SEG-013 — Varredura de dependências e correção de vulnerabilidades (SCA)

> Status: **PRONTO PARA REVISÃO** — arquivos gerados fora do repositório do
> usuário (nesta sessão não há acesso de escrita/push ao GitHub). Falta:
> copiar os arquivos para `wave-v2-deploy` (branch `develop`), `git add/commit/push`
> pelo Robson, e dois toggles manuais no GitHub (ver seção 4).

## 1. O que foi implementado

### 1.1 Dependabot (`.github/dependabot.yml`)
- Ecossistema `npm`: checagem semanal (segunda-feira), agrupando **patch/minor**
  num único PR (reduz volume). Updates **major** (Next.js, Prisma, Stellar SDK
  etc.) **não** entram no agrupamento — chegam um a um, em PR próprio, para
  revisão isolada antes do merge (são os que mais podem quebrar compatibilidade).
- Ecossistema `github-actions`: mesma cadência, para manter as actions do
  próprio pipeline atualizadas.
- **Dependabot Alerts** e **Dependabot Security Updates** não são configuráveis
  por arquivo — são toggles em **Settings → Code security and analysis** do
  repositório. Ver seção 4 (ação manual do Robson).

### 1.2 Pipeline (`.github/workflows/ci.yml`) — novo job `dependency-scan`
Job separado, em paralelo ao `quality` e ao `secret-scan` (SEG-005) já
existentes, no mesmo padrão (`runs-on: ubuntu-latest`, checkout + setup Node):

1. `npm audit --audit-level=high` — **falha o job** (bloqueia o check) se
   houver vulnerabilidade **High ou Critical**. Esse é o mecanismo de bloqueio
   pedido no card; nenhuma outra etapa depende dele para existir.
2. `npm audit --json > npm-audit-report.json || true` — roda **sempre**
   (`if: always()`, mesmo se o passo 1 falhar), gera o relatório completo
   (inclui Moderate/Low) e sobe como **artifact** do workflow
   (`npm-audit-report`, 90 dias de retenção) — é o "registrar para avaliação"
   pedido no card para Moderate, e o "registrar sem bloquear" para Low.
3. `npx --yes @cyclonedx/cyclonedx-npm` — gera o **SBOM** em formato
   **CycloneDX** (`sbom.cdx.json`) a cada execução do job, também como
   artifact (`sbom-cyclonedx`, 90 dias). Cobre pacote, versão, dependências
   transitivas — o CycloneDX já correlaciona com bases de vulnerabilidade
   quando importado em uma ferramenta de leitura (ex. Dependency-Track), sem
   exigir infraestrutura própria da Wave para isso agora.

**Não foi usado** `npm audit fix --force` em nenhum passo — a correção de
vulnerabilidade é sempre uma decisão manual do desenvolvedor, feita via PR do
Dependabot ou upgrade manual, conforme o card exige.

## 2. Gate com exceções documentadas (`scripts/security/audit-gate.mjs`)
A primeira versão usava `npm audit --audit-level=high` puro. Ao rodar de
verdade na `develop`, apareceram **22 vulnerabilidades pré-existentes**
(nenhuma introduzida pelo SEG-013 — só ficaram visíveis porque não existia
gate antes). `npm audit fix` (sem `--force`) resolveu 5 sem risco de quebra
(`baseline-browser-mapping`, `brace-expansion`, `browserslist`, `js-yaml`,
`nanoid`). As **17 restantes** exigem upgrade major (`--force`, breaking
change) — inclusive um **Critical no `next`** (RCE não-autenticada, entre
~30 CVEs). Não dá pra corrigir isso dentro do escopo do SEG-013 sem virar uma
mudança grande e arriscada disfarçada de "ajuste de pipeline".

Por isso o gate final não é `npm audit` puro — é
`scripts/security/audit-gate.mjs`, que roda `npm audit --json` e só bloqueia
High/Critical que **não** estejam em `security/audit-exceptions.json`. Cada
exceção exige `reason` (motivo), `cardRef` (card de correção vinculado) e
`expiresAt` (prazo curto — força reavaliação periódica; passado o prazo, a
exceção para de valer e o pacote volta a bloquear). Isso atende diretamente
o critério de aceite do próprio card: *"não existem vulnerabilidades
High/Critical conhecidas **sem justificativa documentada**"* — a justificativa
fica no repositório, versionada, visível em todo log de CI, não escondida
numa exclusão silenciosa.

**Limitação aceita conscientemente:** o match é por nome do pacote, não pelo
ID da vulnerabilidade (GHSA) — documentado no cabeçalho do script. Por isso os
prazos são curtos (2 semanas), não meses.

Sem exceção (`security/audit-exceptions.json` vazio), o comportamento é
idêntico a `npm audit --audit-level=high` puro — o script não afrouxa nada
por padrão, só permite documentar o que já foi conscientemente adiado.

## 3. Arquivos
**Novos:** `.github/dependabot.yml`, `docs/SEG-013-SCA.md` (este arquivo),
`scripts/security/audit-gate.mjs`, `security/audit-exceptions.json`.
**Alterado:** `.github/workflows/ci.yml` (novo job `dependency-scan`; nada nos
jobs `secret-scan`/`quality` foi tocado), `package.json`/`package-lock.json`
(via `npm audit fix`, sem breaking change — commit `bf894f7`).

## 4. Ações manuais do Robson (não dá para fazer por arquivo)
1. **GitHub → repositório → Settings → Code security and analysis**:
   ligar **"Dependabot alerts"** e **"Dependabot security updates"**.
2. **GitHub → Settings → Branches** (`main` e `develop`): adicionar
   **"Dependências (SCA)"** à lista de checks obrigatórios (`required status
   checks`), junto dos já pendentes de marcar como required
   (`Lint • Types • Test • Build`, `Secret Scan (gitleaks)` — ver
   `docs/HOMOLOGACAO.md`, pendência já registrada antes do SEG-013).

## 5. Como validar (teste com vulnerabilidade conhecida)
Feito **numa branch descartável**, nunca em `develop`/`main`:

```powershell
git checkout -b test/seg-013-vuln
npm install --no-save axios@0.21.0   # versão com CVE conhecida (SSRF, High) — só para o teste
git add package.json package-lock.json
git commit -m "test: dependencia vulneravel para validar SEG-013 (nao mergear)"
git push origin test/seg-013-vuln
```

Abrir um PR dessa branch contra `develop` e verificar, na aba **Checks**:
1. `npm audit` identifica a vulnerabilidade (aparece no log do job).
2. O job **"Dependências (SCA)"** falha (vermelho) — o merge fica bloqueado
   pelo required check.
3. O `npm-audit-report` (artifact) mostra a entrada High/Critical.
4. O SBOM (`sbom-cyclonedx`) ainda é gerado (o passo roda mesmo com o audit
   falhando — serve para auditoria mesmo em build que não passou).

**Depois do teste:** fechar o PR **sem mergear**, apagar a branch local e
remota (`git branch -D test/seg-013-vuln` / `git push origin --delete
test/seg-013-vuln`) — nunca deixar a dependência vulnerável entrar em
`develop`.

## 6. Critérios de aceite — status
- [x] `npm audit` executado automaticamente no pipeline.
- [x] High/Critical bloqueiam o pipeline (via `audit-gate.mjs`, sem exceção válida).
- [x] Moderate/Low registrados (artifact `npm-audit-report`, não bloqueiam).
- [x] SBOM gerado automaticamente por build (artifact `sbom-cyclonedx`, CycloneDX).
- [x] Dependências críticas possuem rotina de atualização (Dependabot semanal).
- [x] Vulnerabilidades High/Critical conhecidas têm justificativa documentada
      (`security/audit-exceptions.json`, com motivo + card + prazo).
- [ ] Dependabot Alerts ativo — **toggle manual pendente** (seção 4.1).
- [ ] Dependabot Security Updates ativo — **toggle manual pendente** (seção 4.1).
- [ ] Evidência do teste com vulnerabilidade conhecida — **a rodar pelo
      Robson** (seção 5), pois exige abrir um PR real no GitHub.
- [ ] Checks marcados como `required` em Branches — **pendente** (seção 4.2).

## 9. Cards abertos a partir das exceções (correção real, não permanente)
- **SEG-014** — Upgrade Next.js 14 → 16 (corrige o Critical + `postcss`/`glob`/
  `eslint-config-next`/`@next/eslint-plugin-next` na mesma leva).
- **SEG-016** — Upgrade `@stellar/stellar-sdk` → 17.1.0 (corrige `toml`),
  com teste dedicado da âncora de integridade.
- **SEG-017** — Upgrade do Prisma CLI → 6.12.0+ (corrige `deepmerge-ts`/
  `@prisma/config`/`prisma`), com teste de migrations/seed.
- **SEG-018** — ✅ Concluído em 2026-11-24: Vitest 2 → 5.1.1 (com `vite` 8 e
  `@types/node` 22, a versão do runtime). 269 testes passando; exceções de
  `vite`/`vitest`/`tinypool` removidas.
- **SEG-019** — `picomatch` ReDoS ([GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
  `<=4.0.7`, aberta em 2026-11-18 **sem versão corrigida**). Atualizar o
  picomatch (via `npm audit fix` / overrides) assim que o patch sair e remover
  as 13 exceções `SEG-019` (picomatch + dependentes que herdam a severidade:
  tailwind, eslint, chokidar, vite…). No runtime, a única cópia é a compilada
  dentro do Next, que casa padrões do `next.config`, não entrada do usuário.
  Prazo curto (2026-12-02) para forçar a reavaliação.

**Renovação de 2026-11-24** (prazo novo: 2026-12-15), antes de ir para produção:

- `next` subiu para 14.2.35 (último patch da linha 14), que fecha o bypass de
  autorização no middleware e vários DoS. Das Critical restantes, a RCE no
  Image Optimization API foi mitigada com `images.unoptimized: true` (o app não
  usa `next/image`; `/_next/image` passou a responder 404). A RCE em servidor
  Windows não se aplica (Linux no ECS). Ficam advisories High de DoS/SSRF da
  linha 14: o SEG-014 (14 → 16) continua sendo a correção e é prioridade.
- `effect` entrou como exceção nova do SEG-017 (transitiva do Prisma CLI 6).

Se nenhum desses cards avançar até o prazo em `security/audit-exceptions.json`,
o pipeline volta a bloquear sozinho.

> Nota: rodando o script pela primeira vez de verdade, apareceram mais
> pacotes na allowlist do que os 5 "causa raiz" originalmente listados —
> `prisma`, `@prisma/config`, `@stellar/stellar-sdk`, `eslint-config-next`,
> `@next/eslint-plugin-next` herdam a severidade de quem depende deles no
> relatório JSON do `npm audit`, mesmo não sendo a origem da vulnerabilidade.
> Isso confirma a limitação já documentada no cabeçalho do script (match por
> nome de pacote) — foram todos mapeados para o mesmo `cardRef` da causa raiz.

## 7. Riscos / observações
- `npm audit` depende do banco de advisories do npm/GitHub — não é uma
  varredura "profunda" de código, só de dependências conhecidas; isso é
  exatamente o escopo pedido (SCA, não SAST).
- O agrupamento de patch/minor do Dependabot reduz ruído, mas **cada PR
  gerado ainda precisa ser avaliado antes do merge** (o card pede isso
  explicitamente) — não configurar auto-merge sem revisão.
- SBOM por build gera 1 artifact por execução (90 dias); se o volume de runs
  crescer muito, revisar a retenção ou gerar SBOM só nos pushes em
  `develop`/`main` (hoje roda em todo PR também, por simetria com o job de
  qualidade).

## 8. Melhorias futuras (fora do escopo)
- Consolidar os SBOMs num leitor dedicado (ex. Dependency-Track) para
  histórico de vulnerabilidade por versão do produto, em vez de só artifacts
  soltos no Actions.
- Adicionar SAST (ex. CodeQL) — é uma categoria de segurança diferente da
  pedida neste card (SCA), mas complementar.
