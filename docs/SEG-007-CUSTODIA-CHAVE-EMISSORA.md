# SEG-007 · Custódia da Chave da Conta Emissora

> Status: **PRONTO PARA REVISÃO** — gerado fora do repositório do usuário
> (sem acesso de push nesta sessão). A arquitetura de custódia já era
> sólida antes deste card (chave nunca sai do servidor); o que faltava de
> verdade era **monitoramento** (implementado agora, reaproveitando o
> SEG-016) e **documentação** (avaliação de multisig, runbook de
> recuperação). Um gap real de separação de ambiente foi confirmado — a
> mesma questão já levantada no SEG-006, ainda sem decisão sua.

## 1. O que já estava certo (confirmado lendo o código, não suposto)

### Custódia (item 1 do card) ✅
- `src/lib/stellar.ts` lê a chave só de `process.env.WAVE_STELLAR_SECRET` —
  nunca hardcoded, nunca em banco.
- **Cadeia de importação inteira verificada**: todo componente client que
  aciona uma assinatura (`PagamentoStellarModal.tsx`) só importa a **Server
  Action** (`@/app/actions/payment.ts`), que importa `stellar-payment.ts`,
  que importa `stellar.ts`. Em nenhum ponto dessa cadeia um arquivo
  client-side (`"use client"` ou sem diretiva, importável no browser)
  importa o módulo que lê a chave. A chave **fisicamente não tem como**
  chegar ao bundle do navegador — não é só convenção, é estrutural.
- A assinatura acontece **localmente no processo do servidor**
  (`transaction.sign(operatorKeypair)`) — a chave privada nunca trafega pela
  rede, nem para o Horizon (só a transação já assinada, em formato público,
  é enviada). Isso é uma propriedade do próprio protocolo Stellar, não algo
  que precisamos garantir por conta própria.
- Mensagens de erro (`catch (err) { error: err?.message }`) repassam só a
  mensagem do SDK/Horizon (ex.: "op_src_equals_dest", erros de rede) — nunca
  o objeto de erro inteiro, nunca a chave.

### Teste 1 do card — feito de verdade nesta sessão
```
grep -rE "\bS[A-Z0-9]{55}\b" (código atual)         → nada encontrado
git log -p --all | grep -Eo "\bS[A-Z0-9]{55}\b"      → nada encontrado
```
Chave Stellar (formato `S` + 55 caracteres) **não aparece em nenhum commit,
em nenhum branch, nem no código atual**. `.env.example` só tem placeholder
vazio (`WAVE_STELLAR_SECRET=""`).

## 2. Gap real confirmado (item 2 do card, Teste 3)
**Mesmo achado do SEG-006, agora formalmente dentro do escopo deste card**:
homologação e produção **compartilham a mesma chave/conta operacional**
Stellar hoje. Isso viola diretamente o critério de aceite "Desenvolvimento e
staging não devem possuir acesso à chave privada real da conta emissora de
produção".

**Mitigante real**: é testnet — não há fundos reais em risco, e o pior caso
de uma chave testnet comprometida é alguém conseguir ancorar dados falsos
como se fossem da Wave (prejudica a integridade dos registros, não rouba
dinheiro). Isso não torna o gap aceitável para sempre, mas explica por que
não é uma emergência.

**Ainda não corrigi isso** — gerar uma conta testnet nova para homolog é
trabalho pequeno (5 minutos no Stellar Laboratory + trocar 1 env var no
Preview da Vercel), mas é uma decisão sua sobre prioridade, a mesma que já
está em aberto desde o SEG-006. Se quiser, faço agora.

## 3. Acesso restrito (item 3) — confirmado, com uma ressalva
Toda action que aciona assinatura já exige sessão (`requireSession`) ou
gestor (`requireManager`) no servidor — nunca só ocultando botão no
frontend. Ressalva real: `anchorMetadataOnChain` (usada por
`useBlockchainAutoRegistry`, o "registro automático" de vários eventos do
sistema) exige só `requireSession` — **qualquer usuário autenticado**,
inclusive Morador, pode chamar essa action diretamente (fora da UI) e
disparar uma assinatura real na conta emissora com metadata arbitrária.
Não é um vazamento de chave, mas é uso da capacidade de assinatura mais
aberto do que o "somente quem realmente necessite" que o card pede.
**Não restringi isso sozinho** — não tenho visibilidade de todos os tipos
de `metadata` que passam por essa action hoje para saber se algum deles é
legitimamente usado por Morador (ex.: `registerVoteOnChain` já é uma action
separada e correta para voto). Fica como decisão sua: quer que eu levante
todos os usos de `anchorMetadataOnChain` no app e proponha uma restrição
por tipo de evento?

## 4. Assinatura controlada (item 4) — arquitetura já seguia o padrão; passo 5 implementado agora
O fluxo já era: recebe pedido → (parcialmente) valida autorização → assina
→ retorna resultado. **O que faltava era o passo 5: "registrar o evento de
segurança"** — hoje implementado, reaproveitando toda a infraestrutura do
SEG-016 (não inventei um sistema de log paralelo):

- 2 novos tipos em `EventoSeguranca`: `ASSINATURA_EMISSORA_SUCESSO` e
  `ASSINATURA_EMISSORA_FALHA`.
- `anchorHashOnStellar()` (`src/lib/stellar.ts`) ganhou um parâmetro
  `contexto` opcional (`userId`, `condominiumId`, `origem`) e registra o
  evento internamente, em **sucesso e falha** — um único ponto de
  instrumentação cobre os 5 lugares do app que chamam essa função.
- **Os 5 pontos de chamada atualizados** para passar o contexto:
  `blockchain.ts` (voto, proposta, ata, metadata genérica — 4 funções),
  `despesas.ts` (comprovante de despesa), `stellar-payment.ts` (comprovante
  de pagamento de boleto).
- **A chave nunca entra no evento** — só metadados da operação
  (`stellarTxHash`, `ledger`, ou o motivo da falha, truncado a 300
  caracteres e vindo só de `err.message`, nunca do objeto de erro inteiro).
- Tentativa de acesso não autorizado a essas actions **já vira
  `ACESSO_NEGADO`** automaticamente (guards do SEG-016, sem mudança
  necessária aqui) — cobre o "tentativa de acesso não autorizado" do item 7.

## 5. Assinatura múltipla / multisig (item 5) — avaliado, recomendo NÃO adotar agora
O card pede **avaliar**, não necessariamente implementar. Minha avaliação:

**A favor de multisig**: reduz o risco de uma única chave comprometida
conseguir agir sozinha — é o ganho de segurança clássico.

**Contra, no estado atual do produto**:
1. A "blockchain invisível" é o desenho deliberado do produto — o
   morador/síndico nunca assina nada, só a conta operacional da Wave, de
   forma automática e frequente (voto, ata, comprovante, pagamento —
   dezenas de operações por dia num condomínio ativo). Multisig na Stellar
   exige **coletar assinaturas de múltiplas contas antes de submeter cada
   transação** — ou automatizamos os co-signatários também (o que anula o
   ganho de segurança, já que todos ficam com acesso automatizado igual
   hoje), ou exigimos aprovação humana por operação (o que quebra a
   automação que é o ponto central do produto).
2. É testnet, sem valor financeiro em risco — o cálculo de custo/benefício
   de adicionar essa complexidade operacional agora é desfavorável.
3. Não há, hoje, mais de uma pessoa/serviço logicamente distinto que
   devesse co-assinar (é uma única "conta operacional da plataforma", não
   uma tesouraria com múltiplos sócios).

**Recomendação**: não adotar agora. **Revisitar quando** (o que vier
primeiro): (a) a conta emissora movimentar valor real (não só hash-anchoring),
ou (b) existir mais de um serviço/ambiente logicamente distinto que
justifique um quórum de aprovação. Documentado aqui como avaliação
concluída — satisfaz o critério de aceite "estratégia avaliada" sem inflar
escopo com uma solução que não serve ao produto como ele é hoje.

## 6. Recuperação e contingência (item 6) — documentado agora

### Perda da chave / suspeita de comprometimento / comprometimento confirmado
1. **Quem pode iniciar**: qualquer pessoa com acesso ao código ou à
   Vercel que perceba o problema — não precisa de aprovação prévia para
   *iniciar* a investigação (perder tempo esperando aprovação numa suspeita
   de vazamento é o erro mais comum nesse tipo de incidente).
2. **Quem aprova a ação de revogar/substituir**: *[a definir com o time —
   sugiro: qualquer um dos sócios/mantenedores pode aprovar sozinho, dado o
   porte atual do time; formalizar quando o time crescer]*.
3. **Credenciais alternativas**: não existe uma "chave reserva" hoje —
   gerar uma nova é criar um par de chaves novo na Stellar (testnet:
   imediato e gratuito, via Stellar Laboratory; mainnet, se um dia migrar:
   requer fundear a conta nova antes de usar).
4. **Como uma chave comprometida é revogada**: não existe "revogação" na
   Stellar como em um certificado — a mitigação real é **parar de usar a
   chave antiga imediatamente** (trocar `WAVE_STELLAR_SECRET` na Vercel +
   redeploy) e, se a conta antiga tiver qualquer saldo (mainnet), mover para
   a conta nova. Em testnet, não há saldo real a proteger.
5. **Como a nova conta é vinculada ao sistema**: só trocar o valor de
   `WAVE_STELLAR_SECRET` no ambiente afetado (Vercel → Environment
   Variables → editar → redeploy). Nenhuma migração de banco — a
   aplicação não guarda a chave pública operacional em lugar nenhum do
   schema, ela é derivada da secret em runtime.
6. **Como preservar a rastreabilidade dos registros anteriores** — **isso
   já funciona por design, sem precisar de nada extra**: a verificação de
   qualquer hash ancorado (`verifyAnchoredHash`) busca a transação **pelo
   `stellarTxHash` guardado no banco**, direto no Horizon — não depende da
   conta operacional atual continuar existindo ou ativa. Uma vez ancorada,
   a transação é permanente no ledger Stellar; trocar de chave operacional
   não invalida nenhum registro anterior.
7. **Registrar o incidente**: mesmo runbook do SEG-006 (`docs/incidentes/`),
   citando que o SEG-007 cobre especificamente a conta emissora.

### Indisponibilidade do responsável
*[Pendência real: hoje só uma pessoa (Robson) tem acesso operacional a
Vercel/Neon/Stellar — não há um "segundo ao comando" documentado. Isso é
uma decisão de time, não técnica — sinalizo aqui para constar, mas não
posso resolver sozinho.]*

### Substituição da conta emissora (troca planejada, não incidente)
Mesmo procedimento do item 5 acima (trocar env var + redeploy), só que sem
a urgência de um incidente — dá pra fazer com aviso prévio, fora de
horário de pico, e validar com uma âncora de teste antes de considerar
concluído.

## 7. Monitoramento (item 7) — implementado
Ver seção 4. Cobertura contra a lista do card:

| Pedido pelo card | Coberto por |
|---|---|
| Solicitação de assinatura | Implícito — toda solicitação vira sucesso ou falha registrada |
| Assinatura realizada | `ASSINATURA_EMISSORA_SUCESSO` (novo) |
| Operação rejeitada | `ASSINATURA_EMISSORA_FALHA` (novo, falha técnica/Horizon) + `ACESSO_NEGADO` (já existia, SEG-016 — falha de autorização) |
| Alteração de configuração | N/A — não existe UI de configuração da conta emissora (só env var) |
| Alteração de responsável | N/A — mesmo motivo |
| Tentativa de acesso não autorizado | `ACESSO_NEGADO` (SEG-016, guards já instrumentados) |
| Troca/rotação de credencial | Não automatizado — é manual (seção 6); registrar manualmente em `docs/incidentes/` quando acontecer |
| Eventos de recuperação | Mesmo — manual, registrado em `docs/incidentes/` |

## 8. Testes — evidência

### Teste 1 — Exposição ✅ Feito de verdade
Ver seção 1 — grep no código + histórico completo do Git, zero ocorrências
do formato de chave Stellar.

### Teste 2 — Acesso ⚠️ Parcial
- ✅ Confirmado: guards (`requireSession`/`requireManager`) bloqueiam
  usuário não autenticado ou sem papel de gestão nas actions que exigem.
- ⚠️ **Não confirmado que "não consegue solicitar assinatura indevidamente"
  no sentido mais estrito** — ver a ressalva da seção 3
  (`anchorMetadataOnChain` aceita qualquer autenticado). Testar de verdade
  isso exigiria decidir primeiro qual é o conjunto de metadata legítimo por
  papel — não fiz essa restrição sem confirmar com você.

### Teste 3 — Ambiente ❌ Falha confirmada (gap real, seção 2)
Homolog e produção compartilham a mesma chave — o teste, se rodado
literalmente, **falharia**. Registrado como pendência real, não maquiado.

### Teste 4 — Recuperação ⚠️ Procedimento documentado, exercício não executado
O runbook está na seção 6. O card pede um **exercício controlado** — ou
seja, de fato simular (numa conta de teste, nunca a real) gerar uma chave
nova e trocar a env var, sem comprometer a chave real. Não fiz esse
exercício nesta sessão porque envolve mexer em env vars da Vercel de
verdade — prefiro que você rode esse exercício com o runbook em mãos,
posso te guiar passo a passo quando quiser fazer.

### Teste 5 — Multisig N/A
Não adotado (seção 5) — teste não se aplica.

## 9. Arquivos
**Novos:** `prisma/migrations/20260918000000_add_assinatura_emissora_evento/migration.sql`,
`docs/SEG-007-CUSTODIA-CHAVE-EMISSORA.md` (este arquivo).
**Alterados:** `prisma/schema.prisma`, `src/server/security/eventoSeguranca.ts`,
`src/server/security/eventoSeguranca.test.ts`, `src/lib/stellar.ts`,
`src/lib/stellar-payment.ts`, `src/app/actions/blockchain.ts`,
`src/app/actions/despesas.ts`, `src/app/actions/payment.ts`.

## 10. Verificação feita
- **Vitest: 269/269** (nenhum teste novo dedicado — a mudança é aditiva e
  opcional em `anchorHashOnStellar`; os testes existentes de
  `eventoSeguranca.test.ts` já cobrem a validação de tipo/resultado, e os
  dois novos tipos foram incluídos no teste de completude de rótulos).
- **ESLint**: limpo nos 7 arquivos alterados.
- **Type-check escopado**: limpo em `stellar.ts` e na cadeia
  `eventoSeguranca.ts`/`registrarEventoSeguranca.ts` (shim de
  `@prisma/client`, mesma limitação de sempre neste ambiente).
- **Teste 1 do card**: rodado de verdade (seção 1).

## 11. Pendências reais (não dá pra fechar sem você)
1. **Decidir separar a chave Stellar de homolog/produção** — mesma
   pendência do SEG-006, agora também bloqueando um critério de aceite
   deste card (Teste 3).
2. **Decidir sobre restringir `anchorMetadataOnChain` por papel/tipo de
   evento** — levantar todos os usos e propor uma regra, se você quiser.
3. **Definir quem aprova ações de recuperação** e quem é o "segundo ao
   comando" operacional — decisão de time, não técnica.
4. **Rodar o exercício de recuperação controlado** (Teste 4) — posso
   te guiar quando quiser.
