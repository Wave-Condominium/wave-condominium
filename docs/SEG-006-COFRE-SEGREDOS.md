# SEG-006 · Cofre de Segredos e Rotação de Credenciais

> Status: **PRONTO PARA REVISÃO** — gerado fora do repositório do usuário
> (sem acesso de push nesta sessão). Boa parte deste card é auditoria e
> documentação, não código — o que precisava de código (script de varredura
> do bundle, passo novo no CI) está pronto e testado. O que exige
> preenchimento humano (quem tem acesso a quê, datas de rotação) está
> marcado explicitamente como pendência — não inventei nomes nem datas.

## 1. Levantamento real feito nesta sessão (não suposto)

### Todas as `NEXT_PUBLIC_*` do projeto (Teste 1 do card)
Busca no código inteiro — só existem **2**, e as duas já são
intencionalmente públicas e documentadas:

| Variável | Uso | Por que é seguro ser pública |
|---|---|---|
| `NEXT_PUBLIC_SHOW_DEMO_LOGINS` | Mostra os botões de login rápido de demo (SÍN-002) | É só um flag on/off, não é credencial |
| `NEXT_PUBLIC_DEMO_SEED_PASSWORD` | Preenche a senha nos botões de demo | Contém `Senha@12345` — a senha de **todos os usuários de seed**, já documentada abertamente em `docs/HOMOLOGACAO.md` e no runbook de seed. Não é segredo real: é a senha padrão de contas de demonstração, criada exatamente pra ser conhecida. O `.env.example` já tem aviso explícito "NUNCA definir em produção" |

**Nenhuma outra variável privada (senha, token, chave) usa o prefixo
`NEXT_PUBLIC_`.** Confirmado por grep no código inteiro, não só nos exemplos.

### Inventário de credenciais (Teste 4 + critério de aceite "inventário")
Levantado a partir do `.env.example`, do código (`process.env.*`) e dos docs
existentes (`ambiente-homologacao.md`). **Nenhum valor de credencial está
neste documento** — só nome, propósito e situação.

| Nome | Serviço | Ambiente(s) | Finalidade | Responsável | Última rotação | Periodicidade proposta | Situação |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Neon (Postgres) | Dev / Homolog / Produção — **3 bancos Neon separados** (confirmado: `wave-homologacao` é projeto Neon distinto de produção) | Conexão do app ao banco | *[a preencher]* | *[não rastreado ainda]* | Trimestral, ou imediata em suspeita | ✅ Separado por ambiente |
| `WAVE_SESSION_SECRET` | Interno (assinatura JWT) | Dev / Homolog / Produção — **valores próprios por ambiente**, confirmado no `.env.example` ("DIFERENTE por ambiente") | Assina a sessão httpOnly | *[a preencher]* | *[não rastreado]* | Só em incidente (rotacionar derruba **todas** as sessões — ver runbook §4) | ✅ Separado; ⚠️ sem calendário de rotação preventiva |
| `WAVE_STELLAR_SECRET` | Stellar (testnet) | Homolog + Produção | Conta operacional da âncora de integridade | *[a preencher]* | *[não rastreado]* | Semestral, ou em incidente | ⚠️ **Risco já conhecido e documentado** (`ambiente-homologacao.md`): homolog **reusa a mesma chave testnet de produção** — não há separação real aqui ainda |
| `WAVE_ADMIN_STELLAR_SECRET` | Stellar (testnet) | Opcional, mesmo padrão acima | Conta administrativa da âncora | *[a preencher]* | *[não rastreado]* | Semestral, ou em incidente | Mesmo risco de compartilhamento acima |
| `CRON_SECRET` | Interno (Vercel Cron) | Preview (Homolog) — configurado nesta sessão anterior (SEG-016) | Autentica a chamada do cron de expurgo | *[a preencher]* | 2026-09 (configurado no SEG-016) | Anual, ou em incidente | ✅ Configurado; confirmar se também existe em Production |
| `PSP_WEBHOOK_SECRET` | PSP (simulado — SÍN-030/MOR-057) | Homolog | Valida a assinatura do webhook do PSP | *[a preencher]* | N/A (PSP ainda simulado) | Definir quando o PSP real (Asaas) entrar | ⚠️ Hoje sem valor real — nada a rotacionar ainda |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Homolog + Produção | Upload de comprovantes de despesa (SÍN-011) | *[a preencher]* | *[não rastreado]* | Conforme recomendação da Vercel, ou em incidente | *[confirmar se está configurado — SÍN-011 registrou que sem ele o upload simplesmente falha, sem quebrar o resto]* |
| `PROD_DATABASE_URL` | Neon (Postgres) | **Só uso manual, terminal do operador** — nunca configurado como env var persistente em nenhum ambiente | Script `rotate-compromised-passwords.mjs` aponta EXPLICITAMENTE para produção, isolado do `DATABASE_URL` do app | Robson (quem roda o script) | N/A (não é credencial própria — é a mesma `DATABASE_URL` de produção, referenciada com nome diferente por segurança) | — | ✅ Desenho deliberado: nome diferente evita confusão com o `.env` local (comentário no próprio script explica o porquê) |
| `GITLEAKS_LICENSE` | Gitleaks (opcional, comentado no `ci.yml`) | CI | Licença Pro do Gitleaks (features extras) | *[a preencher]* | N/A | — | Não configurado — usando a versão free, suficiente para o escopo atual |
| `WAVE_ALLOWED_ORIGINS` | Interno (Next.js) | Todos, opcional | Lista de origens extras para Server Actions | N/A | N/A | — | **Não é segredo** — é configuração, não credencial |

**Pendências reais neste inventário** (não dá pra preencher sem você):
1. Coluna "Responsável" — preciso que você diga quem tem acesso hoje a
   cada serviço (Vercel, Neon, GitHub Secrets).
2. Coluna "Última rotação" — nenhuma dessas credenciais tem data de
   criação/rotação registrada em lugar nenhum que eu tenha acesso.
3. Confirmar se `BLOB_READ_WRITE_TOKEN` está de fato configurado em
   Produção (SÍN-011 registrou que, sem ele, o app funciona só sem upload
   de comprovante — não quebra nada, mas preciso confirmar o estado atual).

## 2. Controle de acesso (item 3 do card)
**Não tenho visibilidade de quem tem acesso a quê** (Vercel, Neon, GitHub) —
isso só dá pra levantar entrando nos próprios painéis. Ação para você:

- Vercel → Settings → Members: listar quem tem acesso ao time `Wave-4` e
  qual papel (Owner/Member/Viewer).
- Neon → cada projeto (`wave` produção, `wave-homologacao`) → Settings →
  quem tem acesso.
- GitHub → repositório → Settings → Collaborators and teams → quem pode
  ver/editar GitHub Secrets (só quem tem permissão de **Admin** ou
  **Maintain** no repo consegue ver a lista de secrets, embora nunca o
  valor).

Isso vira uma tabela simples (nome, serviço, papel, motivo de precisar) —
posso montar o esqueleto se você me passar os nomes/e-mails.

## 3. Calendário de rotação (item 5 do card)
Proposto na tabela do inventário (coluna "Periodicidade"). Resumo da lógica:
- **Credenciais de banco** (Neon): rotação trimestral é o padrão razoável
  pra um projeto deste porte — nem tão frequente que vire fardo operacional,
  nem tão raro que uma exposição não descoberta fique aberta por muito tempo.
- **`WAVE_SESSION_SECRET`**: rotacionar **derruba a sessão de todo mundo
  ao mesmo tempo** (é o segredo de assinatura do JWT) — por isso a
  recomendação é "só em incidente", não calendário fixo. Se quiserem uma
  rotação preventiva mesmo assim, sugiro semestral, fora de horário de uso.
- **Chaves Stellar testnet**: risco baixo (testnet, sem valor real em jogo),
  mas ainda assim semestral é razoável — e a separação homolog/produção
  (hoje inexistente) é mais urgente que a rotação em si.
- **`PSP_WEBHOOK_SECRET`**: sem valor real ainda (PSP simulado) — vira
  pauta quando o PSP real entrar.

## 4. Procedimento de resposta a vazamento (item 6 do card)
**Já existe um caso real e documentado** disso no projeto — o SEG-005
encontrou a senha de demo hardcoded em `Login.tsx`, publicada no repositório
público, e o `scripts/rotate-compromised-passwords.mjs` já implementa boa
parte deste runbook na prática. Generalizando esse caso real para qualquer
credencial:

1. **Identificar o segredo comprometido** — qual credencial, onde apareceu
   (código, log, chat), desde quando está exposta.
2. **Revogar/desabilitar a credencial antiga** imediatamente no serviço de
   origem (Neon: reset de senha do role; Vercel Blob: revogar token; Stellar:
   gerar par de chaves novo).
3. **Gerar a nova credencial** — nunca reaproveitar o valor antigo.
4. **Atualizar o ambiente afetado** (Vercel → Environment Variables → editar
   o valor → redeploy, já que a env var só é lida em build/cold-start).
5. **Verificar logs e uso indevido** — com o SEG-016 em produção, isso
   agora significa checar **Eventos de Segurança** (login/acesso negado
   fora do padrão no período em que a credencial esteve exposta) além dos
   logs do próprio serviço (ex.: Neon → Monitoring → conexões).
6. **Verificar se o segredo apareceu no Git/histórico** — `gitleaks detect
   --source . --log-opts="--all"` (o mesmo comando que rodei nesta sessão,
   seção 5). Se aparecer, considerar reescrever histórico (`git filter-repo`)
   além de rotacionar — reescrever histórico é uma operação destrutiva,
   avaliar com cuidado antes.
7. **Registrar o incidente** — data, credencial, como foi descoberta, quem
   tratou, tempo entre exposição e correção. Sugiro um arquivo
   `docs/incidentes/` no mesmo padrão dos `decisoes/`, um por incidente.
8. **Revisar como aconteceu** — no caso do SEG-005, foi hardcode direto no
   componente. A prevenção correspondente já existe: o gate de Secret Scan
   (SEG-005) bloqueia isso **antes** do merge agora; o SAST (SEG-021)
   cobre padrões de código inseguro em geral.

**Exemplo de rotação sem indisponibilidade** (o caso real do SEG-005 seguiu
essa exata sequência — gerar → validar → revogar):
1. Gera senha nova + hash, mas mantém a antiga válida até confirmar.
2. Grava a nova no banco, marca `mustChangePassword=true`.
3. Confirma que o usuário consegue logar com a senha temporária.
4. A senha antiga já não é mais válida a partir do passo 2 (foi
   sobrescrita) — não há janela de indisponibilidade real porque o
   usuário só percebe a troca no próximo login, quando já é forçado a
   trocar.

## 5. Testes — evidência

### Teste 1 — Variáveis públicas ✅ Feito
Ver seção 1 — só 2 `NEXT_PUBLIC_*` no projeto inteiro, ambas
intencionalmente públicas e já documentadas como tal no próprio código.

### Teste 2 — Bundle do cliente ✅ Script pronto e testado, ⚠️ falta rodar contra o build real
Não consegui rodar `npm run build` neste ambiente (a engine do Prisma não
baixa aqui — mesma limitação já registrada em sessões anteriores). Escrevi
`scripts/security/scan-client-bundle.mjs` e **testei contra bundles
sintéticos** (um com uma connection string de propósito, outro limpo) —
confirmei que ele bloqueia o primeiro e passa o segundo. Também virou passo
novo no CI (`ci.yml`, job `quality`, depois do `next build`) — vira
verificação **contínua**, não pontual.
**Ação sua:** rodar `npm run build` seguido de
`node scripts/security/scan-client-bundle.mjs` localmente pra ter a
evidência contra o build real (deve dar "OK", mas precisa confirmar).

### Teste 3 — Repositório ✅ Feito de verdade nesta sessão
```
gitleaks detect --source . --log-opts="--all"
→ 93 commits scanned, no leaks found
```
**Ressalva importante**: o gitleaks pega segredos com **formato
reconhecível** (chaves de API, tokens, chaves privadas) — não uma senha
genérica em texto puro como a que o SEG-005 corrigiu. Ou seja, "zero leaks"
não significa "nunca existiu uma senha hardcoded no histórico" — significa
"nenhum segredo no formato que o gitleaks reconhece está no histórico
atual". É a limitação da ferramenta, não um resultado falso.

### Teste 4 — Separação de ambientes ⚠️ Parcial
- ✅ Banco: Neon `wave-homologacao` é projeto **separado** do de produção
  (confirmado em `ambiente-homologacao.md`).
- ✅ Demo logins: gated por env var, documentado para nunca ir em produção.
- ⚠️ **Gap real encontrado**: `WAVE_STELLAR_SECRET`/`WAVE_ADMIN_STELLAR_SECRET`
  são **compartilhados** entre homolog e produção hoje — já era um
  follow-up conhecido (`ambiente-homologacao.md`, "rever depois: chave
  Stellar separada para homolog"), mas nunca foi feito. Como é testnet
  (sem valor financeiro real em jogo), o risco é baixo, mas tecnicamente
  viola a regra do card ("staging não usa credenciais de produção sem
  justificativa") — a "justificativa" aqui seria só "ainda não fizemos",
  não uma decisão deliberada.

## 6. Arquivos
**Novos:** `scripts/security/scan-client-bundle.mjs`,
`docs/SEG-006-COFRE-SEGREDOS.md` (este arquivo).
**Alterado:** `.github/workflows/ci.yml` (novo passo no job `quality`,
depois do build — nada mais tocado).

## 7. Pendências reais (não dá pra fechar sem você)
1. Preencher responsável + data de última rotação no inventário (seção 1).
2. Levantar e documentar controle de acesso real por serviço (seção 2).
3. Rodar o Teste 2 contra o build real na sua máquina (seção 5).
4. **Decidir sobre a chave Stellar compartilhada** homolog/produção — gerar
   uma chave testnet separada para homolog é trabalho pequeno (é só criar
   uma conta nova na testnet e trocar a env var), mas é uma decisão sua
   sobre prioridade, não algo que eu deva simplesmente fazer sem confirmar.
5. Confirmar se `BLOB_READ_WRITE_TOKEN` está configurado em Produção.
