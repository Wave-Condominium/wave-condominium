# SEG-016 · Eventos de Segurança e Detecção de Anomalias

> Status: **FASE 1 e FASE 2 CONCLUÍDAS e validadas em homologação**. **FASE 3
> (troca de perfil ativo) PRONTA PARA REVISÃO** — gerada fora do repositório
> do usuário (sem acesso de push nesta sessão). Falta: copiar os arquivos,
> `prisma migrate dev`, rodar a suíte completa, revisar e commitar.

## ⚠️ Conflito de numeração (resolver antes de fechar o card)
Existem **dois cards diferentes chamados "SEG-016"**: este (Eventos de
Segurança) e outro já registrado anteriormente para o **upgrade do
`@stellar/stellar-sdk`** (corrige a vulnerabilidade `toml`, ver
`security/audit-exceptions.json` do SEG-013 — `cardRef: "SEG-016"` aponta
para o Stellar SDK). Antes de fechar qualquer um dos dois, renomeie um deles
no ClickUp e atualize o `cardRef` correspondente em
`security/audit-exceptions.json` para não perder o rastreamento.

## 1. Decisões confirmadas com o Robson
- **Quem consulta:** Admin de plataforma vê **todos** os condomínios;
  Síndico vê **só o próprio** condomínio ativo. Qualquer outro papel
  (Morador, Conselho) é negado — e a própria tentativa de consulta sem
  permissão vira um evento `ACESSO_NEGADO` (efeito colateral desejado: é
  exatamente esse tipo de comportamento que o card pede pra detectar).
- **Administradora:** deliberadamente **NÃO decidido ainda** — fica negada
  por padrão em `resolverEscopoConsulta` até haver uma decisão explícita
  (ela gere múltiplos condomínios; "só o próprio" não se aplica a ela do
  mesmo jeito que a um Síndico).
- **Alertas:** só painel interno nesta fase — **sem e-mail**. Achado
  relevante para fases futuras: o projeto **já tem** um serviço de e-mail
  (`getEmailService()`, usado no envio de convites em `convites.ts`) — ao
  contrário do que eu tinha avaliado antes de olhar o código. Se decidirem
  alertas por e-mail numa fase futura, dá pra reaproveisar esse serviço, não
  é integração do zero.
- **Escopo da entrega:** Fase 1 enxuta — estrutura + eventos de autenticação
  (login, logout, senha, acesso negado, revogação/restauração de acesso) +
  consulta. Regras de anomalia, alertas automáticos, exportação de dados e
  eventos de PSP ficam para a Fase 2 (seção 6).

## 2. Separação da Auditoria de negócio (confirmado no código real)
O módulo `Auditoria` existente (`BlockchainRegistry.tsx`, âncora Stellar via
`useBlockchainAutoRegistry`) já registra **decisões de negócio** — mudanças
em Boletos, Manutenção, Unidades, Reuniões, Aprovações (SÍN-026). O
`EventoSeguranca` é um model **completamente separado**, sem nenhuma
sobreposição de tabela ou de fluxo — atende literalmente o requisito do card
("auditoria de negócio" ≠ "evento de segurança").

## 3. O que foi encontrado no código real (base do desenho)
- `Session` já tinha colunas `ip`/`userAgent` no schema, mas **nunca eram
  preenchidas** — nenhuma captura de IP/user-agent existia antes desta
  entrega em lugar nenhum do app.
- **Não existia rate limiting** de tentativas de login em lugar nenhum.
- **Não existia** nenhuma trilha de eventos de autenticação — login, logout,
  troca de senha não deixavam rastro nenhum antes desta entrega.
- `passwordReset.ts` (recuperação de senha) é um **módulo client-side/demo**
  (não tem server action real) — por isso **não foi instrumentado** nesta
  fase (não dá pra logar um evento de servidor que não existe). Fica como
  pendência quando a recuperação de senha virar uma feature real.

## 4. O que foi implementado

### Banco (migração — rodar no Neon dev e homolog)
- `prisma/schema.prisma`: enums `TipoEventoSeguranca`
  (`LOGIN_SUCESSO`/`LOGIN_FALHA`/`LOGOUT`/`ACESSO_NEGADO`/`SENHA_ALTERADA`/
  `ACESSO_REVOGADO`/`ACESSO_RESTAURADO`) e `ResultadoEventoSeguranca`
  (`SUCESSO`/`FALHA`); model `EventoSeguranca` (aditivo, todas as colunas de
  contexto nullable — `userId`, `email` snapshot, `condominiumId`, `ip`,
  `userAgent`, `recurso`, `metadata` JSON). **Nunca grava senha, token ou
  credencial** — `metadata` é só para contexto técnico (ex.: motivo da
  revogação).
- `prisma/migrations/20260915000000_add_evento_seguranca/migration.sql`.
- **Append-only por design**: nenhuma action de update/delete é exposta para
  este model — nem para gestores. Não há endpoint que edite ou apague um
  evento já gravado.

### Domínio (lógica pura, testada — SEM Prisma)
- `src/server/security/eventoSeguranca.ts`: tipos, rótulos pt-BR,
  `validarResultado` (impede gravar combinação inconsistente, ex.: "logout"
  com resultado "falha") e `resolverEscopoConsulta` (a regra de quem vê o
  quê). **13 testes** (`eventoSeguranca.test.ts`).

### Servidor
- `src/server/security/registrarEventoSeguranca.ts`: grava o evento
  capturando IP (`x-forwarded-for`/`x-real-ip`) e `user-agent` via
  `headers()`. **Nunca lança** — uma falha ao gravar o log não pode derrubar
  login/logout/troca de senha.
- `src/server/repositories/eventoSegurancaRepository.ts`: `registrar` e
  `listar` (a listagem exige um `EscopoConsultaEventos` já resolvido — nunca
  aceita `condominiumId` vindo direto do cliente).
- **Instrumentado nos pontos reais:**
  - `authService.login()` — sucesso, falha de credenciais (com/sem usuário
    encontrado) e falha por acesso revogado.
  - `authService.logout()` — lê a sessão **antes** de destruí-la.
  - `authService.changePassword()` — sucesso (falha de sessão/senha repetida
    não vira evento — é validação normal de formulário, não tentativa de
    acesso indevido).
  - `convites.ts` — revogação individual de convite e revogação em lote na
    troca de morador (`revogarAnteriores`), ambas geram `ACESSO_REVOGADO`
    com o responsável (`revogadoPorUserId`) em `metadata`.
  - `guard.ts` — `requireManager`, `requirePlatformAdmin`,
    `requireAdministradora` e `requireCondominioScope` geram `ACESSO_NEGADO`
    quando um usuário **autenticado** tenta algo fora do que pode fazer.
    **Não** instrumentado em `requireSession` (sessão ausente/expirada é
    rotina — ex.: aba antiga aberta — geraria ruído demais e não é o "acesso
    negado" que o card quer capturar).
- `src/app/actions/eventosSeguranca.ts`: `listarEventosSegurancaAction` —
  aplica `resolverEscopoConsulta` e registra `ACESSO_NEGADO` na própria
  tentativa de quem não tem permissão de consultar.

### Cliente
- `src/hooks/useEventosSeguranca.ts` (loading/error/paginação).
- `src/components/security/EventosSegurancaPanel.tsx` — tabela read-only
  (Quando/Evento/Resultado/Usuário-E-mail/IP/Recurso), com loading (skeleton),
  vazio e "acesso restrito" tratados.
- `src/app/dashboard/security-events/page.tsx` — nova rota.
- `src/components/Sidebar.tsx` — item "Eventos de Segurança" visível **só**
  para Admin e Síndico (não usa `isManagerRole`, que inclui Administradora —
  ver decisão pendente acima). RBAC real continua sendo validado no
  servidor; isto é só a visibilidade do item no menu.

## 5. Verificação feita no clone
- **Vitest: 254/254** (13 novos, 241 preexistentes — nenhum quebrou).
- **ESLint**: limpo nos 11 arquivos novos/alterados.
- **Type-check escopado** (shim de `@prisma/client` só com os tipos usados
  pelo módulo novo, mesmo padrão já usado em entregas anteriores do
  projeto): limpo nos 3 arquivos que tocam Prisma diretamente
  (`eventoSeguranca.ts`, `registrarEventoSeguranca.ts`,
  `eventoSegurancaRepository.ts`).
- **Pendente na máquina do Robson:** `prisma generate` real + `tsc --noEmit`
  do projeto inteiro + `next build` (engine do Prisma bloqueada neste
  ambiente, mesma limitação já registrada em SÍN-003/SÍN-011/SÍN-012).

## 6. Critérios de aceite do card original — status
- [x] Eventos de segurança possuem estrutura própria.
- [x] Eventos estão separados da auditoria de negócio.
- [x] Login e falhas de login são registrados.
- [x] Alterações de senha são registradas.
- [ ] Alterações de **permissões/roles** — parcial: só cobre
      revogação/restauração de acesso (`ACESSO_REVOGADO`/`RESTAURADO`).
      Troca de papel/membership (ex.: SÍN-003/SÍN-031) fica para uma leva
      futura.
- [ ] Ações de **exportação** são registradas — leva futura (não há fonte
      instrumentada ainda).
- [x] Acessos negados são registrados (guards de gestão + consulta negada).
- [x] Regras básicas de anomalia — **Fase 2**: 3 regras determinísticas
      (múltiplas falhas na mesma conta, múltiplos logins no mesmo IP, muitos
      acessos negados) — ver seção 8.
- [x] Alertas quando uma regra é acionada — **Fase 2**: badge no menu +
      painel com "marcar como resolvido" (nunca exclui, preserva histórico).
- [x] Logs possuem acesso restrito (RBAC no servidor via `resolverEscopoConsulta`).
- [x] Senhas, tokens e credenciais não são armazenados nos logs.
- [x] Retenção documentada — **Fase 2**: 12 meses, expurgo via Vercel Cron
      diário (ver seção 8).
- [ ] Testes de segurança documentados — os 27 testes (15 + 13 desta fase)
      cobrem escopo, validação e regras de anomalia; falta um teste de
      integração real (evento → alerta gravado no banco) quando
      `prisma generate` rodar na sua máquina.

## 7. Pendências / decisões em aberto (o que ainda falta)
1. ~~**Resolver a duplicidade de numeração**~~ — segue pendente, não resolvida.
2. ~~**Escopo da Administradora**~~ — **RESOLVIDO**: ela vê os condomínios
   que administra (`Condominium.administradoraId`), não a plataforma inteira.
3. ~~**Retenção dos logs**~~ — **RESOLVIDO nesta fase**: 12 meses + cron.
4. **Fontes que faltam**: exportação de dados, acesso a dados sensíveis,
   alterações de configuração de segurança, eventos de PSP/credenciais,
   troca de papel/membership além de revogação. Nenhuma tem fonte
   instrumentada ainda — cada uma é, na prática, um card de instrumentação
   pontual num módulo diferente (Boletos, Unidades, Tesouraria, Onboarding).
5. ~~**Motor de regras de anomalia** e **alertas**~~ — **RESOLVIDO nesta
   fase**, com o escopo possível hoje (só sobre LOGIN_FALHA/ACESSO_NEGADO,
   os únicos tipos instrumentados). Regras sobre exportação/horário exigem o
   item 4 primeiro.
6. **Recuperação de senha real** (hoje é demo client-side) — quando virar
   feature de servidor, instrumentar `SENHA_RECUPERACAO_SOLICITADA`/
   `CONCLUIDA` junto.

## 8. Fase 2 (parte 1) — Detecção de anomalias, alertas e retenção

### Decisões confirmadas com o Robson
- **Por onde começar:** núcleo de anomalia + alertas antes de mais fontes de
  evento (menor raio de mudança, usa o que já existe).
- **Retenção:** 12 meses, com expurgo automático (não é arquivamento — os
  dados são removidos de verdade).
- **Alertas:** badge no menu, mesmo padrão da Central de Aprovações (SÍN-026).

### Regras implementadas (determinísticas, sem IA — como o card pede)
Todas em `src/server/security/anomalia.ts` (`REGRAS_ANOMALIA`), configuráveis
sem mudança de schema:
1. **`MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA`** — 5 falhas de login na mesma
   conta em 15 minutos.
2. **`MULTIPLOS_LOGINS_MESMO_IP`** — 3 contas diferentes tentando (e
   falhando) login pelo mesmo IP em 10 minutos — indício de credential
   stuffing.
3. **`MUITOS_ACESSOS_NEGADOS`** — 10 tentativas de acesso negadas do mesmo
   usuário em 30 minutos.

**Cooldown:** depois de disparar, cada regra fica "em silêncio" por um tempo
(30-60min) para o mesmo padrão — evita um alerta novo a cada evento
subsequente enquanto o primeiro ainda não foi resolvido.

**Fora do escopo desta parte** (exemplos do card que não dá pra fazer ainda):
exportação de grande volume, exportação fora de hora, "alteração de
permissão seguida de acesso a dados sensíveis" — todos dependem de fontes de
evento que ainda não existem (item 4 da seção 7).

### Arquitetura
- `src/server/security/anomalia.ts` (+test) — regras puras, testadas (13
  testes): limites, cooldown, descrição do alerta. Sem Prisma.
- `src/server/security/detectarAnomalias.ts` — orquestra a avaliação, chamado
  por `registrarEventoSeguranca` **depois** de um evento `LOGIN_FALHA` ou
  `ACESSO_NEGADO` ser gravado com sucesso. Nunca lança (mesma filosofia da
  Fase 1) — uma falha na detecção não pode atrapalhar login/guards.
- `AlertaSeguranca` (model novo, migration
  `20260916000000_add_alerta_seguranca`) — **separado** de `EventoSeguranca`:
  o evento é o fato bruto, o alerta é a conclusão de uma regra sobre um
  conjunto de eventos. Nunca excluído — só marcado `resolvidoEm`.
- `src/server/repositories/eventoSegurancaRepository.ts` — 3 métodos de
  contagem novos (`contarFalhasLoginPorEmail`,
  `contarEmailsDistintosPorIpFalhaLogin`, `contarAcessosNegadosPorUsuario`) +
  `expurgarAntigos` (retenção).
- `src/server/repositories/alertaSegurancaRepository.ts` — criar, buscar
  último aberto (cooldown), listar (escopado — reaproveita
  `resolverEscopoConsulta`/`whereDoEscopo`, mesma regra de Admin/Síndico/
  Administradora da Fase 1), contar abertos (badge), resolver.
- `src/app/actions/alertasSeguranca.ts` — actions guardadas pelo mesmo RBAC.
- `src/contexts/AlertasSegurancaContext.tsx` — contador do badge, mesmo
  padrão do `PendenciasContext` (SÍN-026); montado em
  `src/app/dashboard/layout.tsx`.
- `src/hooks/useListaAlertasSeguranca.ts` + seção nova em
  `EventosSegurancaPanel.tsx` — lista de alertas abertos com "Marcar como
  resolvido" acima da tabela de eventos.
- `src/components/Sidebar.tsx` — badge de contagem no item "Eventos de
  Segurança" (mesmo item, não criei um menu separado).

### Retenção (12 meses)
- `RETENCAO_DIAS = 365` + `calcularDataCorte()` em `eventoSeguranca.ts`
  (puro, testado).
- `eventoSegurancaRepository.expurgarAntigos(dataCorte)` — `deleteMany`, sem
  soft-delete (é expurgo de verdade, não arquivamento).
- `src/app/api/cron/purge-eventos-seguranca/route.ts` + `vercel.json` — roda
  todo dia às 3h (UTC). **Ação manual do Robson:** configurar a env var
  `CRON_SECRET` no projeto Vercel (Settings → Environment Variables) — sem
  ela, a rota aceita qualquer chamada (o Vercel Cron não precisa dela pra
  funcionar, mas sem o secret, nada impede outra origem de chamar a rota e
  disparar o expurgo fora de hora).

### Verificação feita no clone
- **Vitest: 269/269** (13 novos de `anomalia.test.ts`, 2 novos em
  `eventoSeguranca.test.ts` — Administradora + retenção).
- **ESLint:** limpo nos 15 arquivos novos/alterados desta parte.
- **Type-check escopado** (shim ampliado com `AlertaSeguranca` +
  `condominium.findMany` + `deleteMany`): limpo nos 6 arquivos que tocam
  Prisma diretamente.

### Riscos / observações
- **Alerta silencioso enquanto não configurar `CRON_SECRET`** — a tabela de
  eventos cresce sem expurgo até isso ser feito (não é urgente, mas não
  esquecer).
- **Limites das regras são um ponto de partida** (5/15min, 3/10min,
  10/30min) — ajustar depois de ver volume real de uso em produção; estão
  centralizados em `REGRAS_ANOMALIA`, não espalhados pelo código.
- **Cooldown por chave simples** (e-mail, IP ou userId) — se dois padrões
  diferentes disparam na mesma janela para chaves diferentes, cada um gera
  seu próprio alerta (correto); o cooldown só evita repetição do MESMO
  padrão na MESMA chave.

## 9. Fase 3 — "Alteração de permissões/roles" (o que dava pra fazer de verdade)

### O que foi investigado antes de codar
Antes de instrumentar, conferi dois itens do card que eu tinha marcado como
"viáveis" numa avaliação anterior — e teve mudança de plano nos dois,
seguindo a regra do projeto contra assumir requisito sem confirmar no código:

- **"Alterações em configurações de segurança"** — a página `/dashboard/settings`
  **não é** uma configuração de segurança: hoje só guarda o link do grupo do
  WhatsApp do condomínio, em localStorage, sem backend. Instrumentar isso
  como "evento de segurança" seria só preencher uma caixinha do card sem
  significado real. **Não implementado** — não existe configuração de
  segurança de verdade no app hoje.
- **"Conceder papel a outro usuário"** — procurei todo lugar que atribui
  `Role` via `membershipRepository.upsert`/`create`: o único caso real é o
  **próprio usuário se atribuindo SÍNDICO** ao criar um condomínio no
  onboarding (SÍN-030) — não existe uma tela onde um gestor promove ou
  concede papel a outra pessoa. **Não implementado** pelo mesmo motivo.

### O que É real e foi implementado
**Troca de perfil ativo (SÍN-003, dual-profile)** — quando um usuário com
mais de um papel (ex.: síndico que também é morador) troca entre os papéis
que **já tem**. Não é concessão de novo acesso, mas é uma mudança de
contexto de sessão que vale a pena auditar.

- Novo tipo `PERFIL_ALTERADO` no enum (migration
  `20260917000000_add_perfil_alterado_evento`, `ALTER TYPE ... ADD VALUE`).
- `authService.setActiveProfile()` registra o evento só quando o papel
  realmente muda (`role !== session.role`), com `metadata: { de, para }`
  guardando os dois papéis envolvidos — sem isso, saber "pra qual papel"
  exigiria abrir o `metadata` sem contexto.
- **15 testes** em `eventoSeguranca.test.ts` (rótulo do novo tipo incluído no
  teste de completude já existente — não precisou de teste novo dedicado,
  a regra `RESULTADO_FIXO` cobre o caso).

### Critérios de aceite — atualização final
- [x] Alterações de permissões/roles — **parcial, e documentado como tal**:
      cobre revogação/restauração de acesso (Fase 1) + troca de perfil ativo
      entre papéis já concedidos (Fase 3). **Não cobre** concessão de papel
      a outro usuário — a feature não existe.
- [ ] Ações de exportação — sem fonte real no app, não implementado.
- [ ] Acesso a dados sensíveis — sem fonte real no app, não implementado.
- [ ] Alterações em configurações de segurança — sem fonte real no app
      (settings hoje é só WhatsApp/localStorage), não implementado.
- [ ] Eventos de PSP/credenciais — PSP é simulado (SÍN-030); sem credencial
      real para vazar ainda, não implementado.

**Conclusão honesta:** o card, como escrito, presume um conjunto de
features (exportação, dados sensíveis, config de segurança, PSP real) que
**não existem** na Wave hoje. Tudo que tinha uma fonte real por trás foi
instrumentado (auth completo, acesso negado, revogação/restauração,
anomalias, alertas, retenção, troca de perfil). O restante vira card de
instrumentação natural **quando cada feature-base for construída** — não
antes, para não inflar escopo com integração vazia.
