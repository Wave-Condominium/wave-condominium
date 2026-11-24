# infra/ — Wave na AWS (Terraform)

Arquitetura e motivos: [ADR 0004](../docs/adr/0004-deploy-na-aws.md).

```text
Usuário ── HTTPS ──► CloudFront (www / homolog .wavecondominium.com.br)
                      ├─ /_next/static/*  ──► S3 (privado, via OAC)
                      └─ /* (resto)       ──► ALB interno (VPC origin) ──► ECS Fargate (Next.js)
                                                                              │
EventBridge Scheduler ── 03:00 UTC ──► task ECS (curl no cron) ─┘             ▼
                                                                    RDS PostgreSQL (privado)
```

| Arquivo              | O que tem                                                      |
| -------------------- | -------------------------------------------------------------- |
| `shared/`            | Root separado, um por conta: zona Route 53 + provider OIDC     |
| `envs/<env>.tfvars`  | Identidade do ambiente: nome, domínio, domínios de redirect    |
| `network.tf`         | VPC, subnets públicas/privadas, security groups                |
| `database.tf`        | RDS PostgreSQL 18                                              |
| `app.tf`             | ECR, IAM, ALB interno, ECS cluster/task/service, logs          |
| `cdn.tf`             | S3 de estáticos, ACM, CloudFront, registros DNS, redirect apex |
| `github.tf`          | Role de deploy do GitHub Actions (OIDC)                        |
| `cron.tf`            | EventBridge Scheduler → `/api/cron/purge-eventos-seguranca`    |
| `admin-bootstrap.tf` | Task avulsa que cria o primeiro ADMIN num banco vazio          |
| `db-copy.tf`         | Task avulsa que copia um Postgres para o RDS (nunca em prod)   |

Ambientes: `homolog` (`homolog.wavecondominium.com.br`, deploy do `develop`) e `prod`
(`www.wavecondominium.com.br`, apex redireciona para `www`, deploy do `main`). Recursos
se chamam `wave-<env>`, segredos ficam em `/wave/<env>/<NOME>` no SSM e o state em
`<env>/terraform.tfstate`.

Segredos da aplicação **não** ficam no Terraform: são parâmetros SecureString no SSM,
criados à mão (lista em `var.app_secrets`), para o valor nunca cair no state.

> **Terraform < 1.6 + AWS SSO:** o backend S3 antigo não lê perfis `sso-session`.
> Exporte as credenciais da sessão antes de cada comando:
> `eval "$(aws configure export-credentials --profile <perfil> --format env)"`.

## Trocar de ambiente

O diretório `infra/` aponta para um state por vez. **Sempre** reinicialize ao trocar e
passe o tfvars do ambiente (sem ele o Terraform pede `environment` e `domain_name`):

```bash
ENV=prod   # ou homolog
STATE_BUCKET="wave-tfstate-$(aws sts get-caller-identity --query Account --output text)"
terraform -chdir=infra init -reconfigure -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=$ENV/terraform.tfstate" -backend-config="region=sa-east-1"
terraform -chdir=infra plan -var-file="envs/$ENV.tfvars"
```

## Primeiro deploy (bootstrap)

Pré-requisitos: AWS CLI autenticado na conta certa, Terraform ≥ 1.5, Docker.

**1. Uma vez por conta: bucket do state + `shared/`.**

```bash
REGION=sa-east-1
STATE_BUCKET="wave-tfstate-$(aws sts get-caller-identity --query Account --output text)"
aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

terraform -chdir=infra/shared init -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=shared/terraform.tfstate" -backend-config="region=$REGION"
terraform -chdir=infra/shared apply
terraform -chdir=infra/shared output name_servers
```

No *Registro.br → domínio → Alterar servidores DNS*, troque os nameservers pelos 4 do
output. A partir daí todo o DNS do domínio é o Route 53.

**2. Infra do ambiente, ainda sem tasks** (não há imagem nem segredos). Faça o `init`
de [Trocar de ambiente](#trocar-de-ambiente) e:

```bash
terraform -chdir=infra apply -var-file="envs/$ENV.tfvars" -var desired_count=0
```

O certificado ACM é validado sozinho pelos registros no Route 53; o apply espera a
validação antes de criar o CloudFront e o alias do domínio.

**3. Segredos no SSM.** O RDS gerou a senha master no Secrets Manager
(`terraform output db_master_secret_arn`). Monte o `DATABASE_URL` com ela —
`postgresql://wave:<senha-url-encoded>@<db_endpoint>:5432/wave?sslmode=require` — e crie
cada parâmetro de `var.app_secrets` sem deixar o valor no histórico do shell (zsh):

```bash
for NOME in DATABASE_URL WAVE_SESSION_SECRET WAVE_STELLAR_SECRET PSP_WEBHOOK_SECRET CRON_SECRET BLOB_READ_WRITE_TOKEN; do
  read -rs "VALOR?$NOME: "; echo
  aws ssm put-parameter --type SecureString --overwrite \
    --name "/wave/$ENV/$NOME" --value "$VALOR" --query Version --output text
done
unset VALOR
```

- `WAVE_STELLAR_SECRET`: secret key Stellar, 56 caracteres começando com `S`.
- `PSP_WEBHOOK_SECRET`: sempre preencher (vazio = webhook sem autenticação). Sem PSP
  integrado, use `openssl rand -hex 32`.
- `WAVE_SESSION_SECRET` / `CRON_SECRET`: `openssl rand -base64 48`, únicos por ambiente.
- `NEXT_PUBLIC_SHOW_DEMO_LOGINS` / `NEXT_PUBLIC_DEMO_SEED_PASSWORD` não entram aqui: são
  embutidas no build e ficam **fora** da imagem.

**4. Imagem + estáticos** (do mesmo build — os nomes com hash precisam bater):

```bash
ECR=$(terraform -chdir=infra output -raw ecr_repository_url)
BUCKET=$(terraform -chdir=infra output -raw static_bucket)
TAG=$(git rev-parse HEAD)

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR%%/*}"
docker build --platform linux/amd64 -t "${ECR}:$TAG" -t "${ECR}:latest" .
docker push "${ECR}:$TAG" && docker push "${ECR}:latest"

# Sem --delete: HTML antigo ainda em cache referencia bundles antigos.
CID=$(docker create "${ECR}:$TAG")
docker cp "$CID:/app/.next/static" ./.static-out && docker rm "$CID"
aws s3 sync ./.static-out "s3://$BUCKET/_next/static" \
  --cache-control "public,max-age=31536000,immutable"
rm -rf ./.static-out
```

**5. Sobe o serviço** (a task definition aponta para `:latest`). As migrations do Prisma
rodam no start do container. Logs: `aws logs tail /ecs/wave-$ENV --follow`.

```bash
terraform -chdir=infra apply -var-file="envs/$ENV.tfvars"
```

**6. Dados.** Homolog: copie de outro Postgres ([abaixo](#copiar-dados-de-outro-postgres-só-homolog)).
Prod: nasce vazio; crie o primeiro ADMIN ([abaixo](#primeiro-admin-banco-vazio)).

## Primeiro admin (banco vazio)

1. Crie `/wave/$ENV/ADMIN_INITIAL_PASSWORD` no SSM (`openssl rand -base64 18`).
2. Rode o comando de `terraform -chdir=infra output -raw admin_bootstrap_command`
   trocando `<seu-email>`. Log com prefixo `admin-bootstrap` termina em `admins: 1`.
3. Entregue a senha por canal seguro. No primeiro login a plataforma obriga a troca.

É idempotente: se o e-mail já existe, nada muda.

## Copiar dados de outro Postgres (só homolog)

`db-copy.tf` define uma task avulsa que **substitui** o schema `public` do RDS pelo da
origem e depois troca a senha de **todos** os usuários por `DEMO_USERS_PASSWORD` — a
origem tem os usuários do seed com a senha pública que está no repositório. A task não
existe em `prod`.

1. Crie os parâmetros `/wave/$ENV/SOURCE_DATABASE_URL` (connection string da origem,
   endpoint **direto**, sem `-pooler`) e `/wave/$ENV/DEMO_USERS_PASSWORD`
   (`openssl rand -base64 24`).
2. Rode o comando de `terraform -chdir=infra output -raw db_copy_command` e acompanhe em
   `aws logs tail /ecs/wave-$ENV --follow` (prefixo `db-copy`).
3. Force um deployment do app para aplicar migrations que a origem ainda não tinha:
   `aws ecs update-service --cluster wave-$ENV --service wave-$ENV --force-new-deployment`.
4. Apague o `SOURCE_DATABASE_URL` do SSM quando não precisar mais.

## Cron

`cron.tf` agenda, todo dia às 03:00 UTC, uma task ECS que chama
`/api/cron/purge-eventos-seguranca` com o `CRON_SECRET` do SSM. Para rodar à mão, use o
comando de `terraform -chdir=infra output -raw cron_command`. Resultado no log com
prefixo `cron` (`{"ok":true,...}`).

## Deploy contínuo (GitHub Actions)

Depois do bootstrap, todo push em `develop` (homolog) ou `main` (prod) dispara
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), que também pode ser
disparado à mão (*Run workflow*). Ele: builda a imagem → sobe `/_next/static` no S3 →
publica `:<sha>` e `:latest` no ECR → força um novo deployment no ECS → falha se o
deployment não concluir (inclusive quando o circuit breaker faz rollback).

A autenticação é por OIDC, sem chave AWS no GitHub. Configuração, uma vez por ambiente:

1. Em *Settings → Environments*, crie o environment com o mesmo nome de
   `var.environment` (`homolog` ou `prod`):
   - *Deployment branches*: só `develop` (homolog) ou só `main` (prod).
   - *Required reviewers*: obrigatório em `prod`, opcional em homolog.
   - *Variables*: `AWS_DEPLOY_ROLE_ARN` = `terraform -chdir=infra output -raw deploy_role_arn`.
2. A role (`infra/github.tf`) só aceita jobs desse environment e só tem permissão
   para push no ECR, escrita no bucket de estáticos e update do serviço ECS.

Rollback manual: aponte `:latest` para a imagem anterior e force um deployment.

```bash
docker pull "${ECR}:<sha-anterior>" && docker tag "${ECR}:<sha-anterior>" "${ECR}:latest"
docker push "${ECR}:latest"
aws ecs update-service --cluster wave-$ENV --service wave-$ENV --force-new-deployment
```

Mudanças de infra (CPU, variáveis, segredos novos em `var.app_secrets`) continuam por
`terraform apply`, feito por uma pessoa.

## Próximos passos (PRs separados — ADR 0004)

- Vercel Blob → S3 para os comprovantes.
- Desligar o projeto na Vercel (e remover `vercel.json`).
