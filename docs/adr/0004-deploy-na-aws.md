# ADR 0004 — Deploy na AWS: CloudFront + S3 + ECS Fargate + RDS PostgreSQL

- **Status:** proposed
- **Date:** 2026-11-16
- **Decision-makers:** José Menezes

## Context

Hoje o Wave roda na Vercel (`vercel.json`), com Postgres gerenciado externo (Neon),
comprovantes no Vercel Blob e o expurgo do SEG-016 disparado pelo Vercel Cron. A
decisão é levar o deploy para a AWS, com o frontend servido por S3 + CloudFront e o
backend no ECS, seguindo KISS.

A restrição que molda tudo: o app é **um único Next.js 14 (App Router)**. Não há um
"frontend" separável — as páginas são renderizadas no servidor, 23 módulos usam
Server Actions, o `middleware.ts` valida a sessão JWT a cada request, e as rotas
`/api/*` (webhook PSP, cron) vivem no mesmo processo. Um `next export` estático para o
S3 exigiria reescrever auth, Server Actions e middleware como uma API separada.

## Decision

Vamos rodar o Next.js inteiro como container no ECS e usar o S3 só para o que é
estático de verdade, com o CloudFront como porta única:

1. **CloudFront** é o único ponto de entrada público (HTTPS).
   - `/_next/static/*` → **S3** (bundles JS/CSS com hash no nome; cache longo).
   - Todo o resto (páginas, Server Actions, `/api/*`, `public/`) → **ALB interno →
     ECS Fargate**, sem cache, repassando todos os headers/cookies do viewer
     (o `Host` original é o que mantém a checagem de origem das Server Actions válida).
2. **ALB interno** em subnets privadas, alcançado pelo CloudFront via **VPC origin**:
   o ALB não tem IP público e não precisa de certificado próprio.
3. **ECS Fargate** roda a imagem `output: "standalone"` do Next. As tasks ficam em
   subnets públicas com IP público só para **saída** (Stellar, ECR, Vercel Blob) —
   sem NAT Gateway; o security group aceita entrada apenas do ALB. As migrations
   (`prisma migrate deploy`) rodam no start do container (o Prisma usa advisory lock,
   então várias tasks subindo juntas é seguro).
4. **RDS PostgreSQL 18** (mesma major do Neon de origem), `db.t4g.micro`, single-AZ, criptografado, backup de 7 dias,
   em subnets privadas, acessível só pelo SG das tasks. A senha master fica no
   Secrets Manager gerenciada pelo próprio RDS (`manage_master_user_password`), que a
   troca a cada 7 dias. Por isso o app conecta com um usuário próprio (`wave_app`, dono
   do schema `public`), com senha fixa no SSM. O master só é usado por uma task avulsa
   de administração.
5. **Segredos da aplicação** (`DATABASE_URL`, `WAVE_SESSION_SECRET`,
   `WAVE_STELLAR_SECRET`, …) ficam no **SSM Parameter Store** (SecureString), criados
   fora do Terraform — o state nunca contém segredo — e injetados pelo ECS.
6. **Terraform** em `infra/`, um diretório só, sem módulos próprios; state em S3.
   Região `sa-east-1`. Um state por ambiente (`homolog`, `prod`, identidade em
   `infra/envs/<env>.tfvars`) e um `infra/shared/` para o que é único por conta.
7. **DNS no Route 53** (zona em `infra/shared/`, nameservers no Registro.br): cada
   ambiente cria a validação do ACM e o alias do CloudFront sozinho. Em produção o
   domínio canônico é `www`; o apex responde 301 para `www` por uma CloudFront Function.
8. **Cron no EventBridge Scheduler**, que roda uma task ECS com `curl` chamando a rota do
   cron com `CRON_SECRET` lido do SSM. Uma API destination do EventBridge guardaria o
   segredo no state.
9. **Deploy contínuo** pelo GitHub Actions com OIDC: `develop` → homolog, `main` → prod,
   cada um com o seu environment no GitHub e a sua role na AWS.

Fora do escopo, em PR próprio: troca do Vercel Blob por S3.

## Alternatives considered

- **Reescrever como SPA (S3) + API (ECS):** atende "frontend no S3" ao pé da letra,
  mas é uma reescrita grande de auth/Server Actions/middleware, com risco alto de
  regressão em RBAC e isolamento multi-tenant. Rejeitada por KISS.
- **AWS Amplify Hosting / OpenNext em Lambda:** Next "serverless" na AWS, mas foge do
  ECS pedido e traz mais peças mágicas para depurar.
- **ALB público + prefix list do CloudFront:** funciona, mas o tráfego CloudFront→ALB
  sairia em HTTP pela internet (ou exigiria certificado e domínio já no ALB). A VPC
  origin resolve com menos peças.
- **NAT Gateway com tasks em subnet privada:** isolamento extra, custo fixo
  (~US$ 35/mês por AZ) sem ganho real — o SG já bloqueia toda entrada que não vem do ALB.
- **Aurora Serverless v2:** autoscaling, porém custo mínimo maior e mais
  complexidade sem carga que justifique hoje.
- **Manter o Neon:** menos mudanças, mas o tráfego do banco sairia da AWS e
  continuaríamos com dois fornecedores no caminho crítico.
- **AWS CDK:** mesma linguagem do app, mas adiciona dependências npm e uma camada de
  abstração; Terraform é mais direto para quem lê.

## Consequences

### Positive
- Nenhuma mudança de código de produto: mesmo Next.js, mesmo Prisma, mesmo Postgres.
- Um único domínio no CloudFront → sem CORS, cookies de sessão funcionam como hoje.
- ALB e RDS sem exposição pública.
- Custo base baixo (RDS micro, Fargate pequeno, sem NAT).

### Negative (accepted costs)
- O "frontend" no S3 é só o bundle estático; o HTML continua vindo do ECS.
- Passamos a operar o que a Vercel fazia de graça: build/deploy, logs, escalabilidade,
  preview por PR (não haverá preview por PR neste primeiro passo).
- RDS single-AZ: uma falha de AZ derruba o banco até a recuperação (aceitável na fase
  atual; Multi-AZ é um flag).
- Migrations no start do container acoplam deploy e schema: migrations precisam ser
  compatíveis com a versão anterior durante o rolling deploy (expand/contract).
- Tasks com IP público (só saída): depende de o SG continuar restrito.

### Neutral
- Depois do cutover, `vercel.json` e o projeto na Vercel só saem quando a Vercel for
  desligada. O Vercel Blob continua em uso.
- `next.config.mjs` ganha `output: "standalone"`, que a Vercel ignora.

## Constitution adherence

- **Principle 5:** esta decisão é registrada antes da implementação.
- **Principle 6:** segredos ficam no SSM/Secrets Manager, fora do repo e do state do
  Terraform.
- **Principle 7:** a migração é fatiada em PRs atômicos (infra base agora; pipeline,
  storage, cron e cutover depois).
- **Principle 1:** não há mudança de comportamento observável do produto, então não
  há spec; o critério de aceite da infra é o app respondendo pelo CloudFront com login
  e Server Actions funcionando.

## Future review

Revisitar quando: houver SLA contratual (Multi-AZ, 2+ tasks em AZs diferentes);
o custo de Fargate/RDS crescer a ponto de justificar outra opção; ou o time precisar
de ambientes de preview por PR.
