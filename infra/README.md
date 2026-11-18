# infra/ — Wave na AWS (Terraform)

Arquitetura e motivos: [ADR 0004](../docs/adr/0004-deploy-na-aws.md).

```text
Usuário ── HTTPS ──► CloudFront (homolog.wavecondominium.com.br)
                      ├─ /_next/static/*  ──► S3 (privado, via OAC)
                      └─ /* (resto)       ──► ALB interno (VPC origin) ──► ECS Fargate (Next.js)
                                                                              │
                                                                              ▼
                                                                    RDS PostgreSQL (privado)
```

| Arquivo       | O que tem                                                 |
| ------------- | --------------------------------------------------------- |
| `network.tf`  | VPC, subnets públicas/privadas, security groups           |
| `database.tf` | RDS PostgreSQL 16                                         |
| `app.tf`      | ECR, IAM, ALB interno, ECS cluster/task/service, logs     |
| `cdn.tf`      | Bucket S3 de estáticos, certificado ACM, CloudFront       |
| `github.tf`   | Provider OIDC + role de deploy do GitHub Actions          |
| `db-copy.tf`  | Task avulsa que copia um Postgres de origem para o RDS    |

Um ambiente = `var.environment` (padrão `homolog`) + `var.domain_name`. Recursos se
chamam `wave-<env>`, segredos ficam em `/wave/<env>/<NOME>` no SSM e o state em
`<env>/terraform.tfstate`.

Segredos da aplicação **não** ficam no Terraform: são parâmetros SecureString no SSM,
criados à mão (lista em `var.app_secrets`), para o valor nunca cair no state.

> **Terraform < 1.6 + AWS SSO:** o backend S3 antigo não lê perfis `sso-session`.
> Exporte as credenciais da sessão antes de cada comando:
> `eval "$(aws configure export-credentials --profile <perfil> --format env)"`.

## Primeiro deploy (bootstrap)

Pré-requisitos: AWS CLI autenticado na conta certa, Terraform ≥ 1.5, Docker.

```bash
ENV=homolog
REGION=sa-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
STATE_BUCKET="wave-tfstate-$ACCOUNT"

# 1. Bucket do state (uma vez por conta)
aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

# 2. Init
cd infra
terraform init -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=$ENV/terraform.tfstate" -backend-config="region=$REGION"

# 3. Certificado primeiro: o CloudFront só aceita o domínio com o certificado validado
terraform apply -target=aws_acm_certificate.main
terraform output certificate_validation
```

**4. Validação do certificado no Registro.br.** Em *Registro.br → domínio → DNS → Editar
zona*, crie o CNAME que o output mostrou (nome sem o `.wavecondominium.com.br.` final,
valor como está). A validação costuma levar alguns minutos.

```bash
# 5. Resto da infra, ainda sem tasks (não há imagem nem segredos).
#    Espera o certificado validar antes de criar o CloudFront.
terraform apply -var desired_count=0
```

**6. Segredos no SSM.** O RDS gerou a senha master no Secrets Manager
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

**7. Imagem + estáticos** (do mesmo build — os nomes com hash precisam bater):

```bash
cd ..
ECR=$(terraform -chdir=infra output -raw ecr_repository_url)
BUCKET=$(terraform -chdir=infra output -raw static_bucket)
TAG=$(git rev-parse --short HEAD)

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

```bash
# 8. Sobe o serviço (a task definition aponta para :latest)
terraform -chdir=infra apply
terraform -chdir=infra output dns_cname
```

**9. Domínio no Registro.br:** crie o CNAME do output `dns_cname`
(`homolog` → `dxxxx.cloudfront.net`). Se o nome já apontava para a Vercel, troque o valor.

As migrations do Prisma rodam no start do container. Logs:
`aws logs tail /ecs/wave-$ENV --follow`.

## Copiar dados de outro Postgres (ex.: homologação no Neon)

`db-copy.tf` define uma task avulsa que **substitui** o schema `public` do RDS pelo da
origem e depois troca a senha de **todos** os usuários por `DEMO_USERS_PASSWORD` — a
origem tem os usuários do seed com a senha pública que está no repositório.

1. Crie os parâmetros `/wave/$ENV/SOURCE_DATABASE_URL` (connection string da origem,
   endpoint **direto**, sem `-pooler`) e `/wave/$ENV/DEMO_USERS_PASSWORD`
   (`openssl rand -base64 24`).
2. Rode o comando de `terraform -chdir=infra output -raw db_copy_command` e acompanhe em
   `aws logs tail /ecs/wave-$ENV --follow` (prefixo `db-copy`).
3. Force um deployment do app para aplicar migrations que a origem ainda não tinha:
   `aws ecs update-service --cluster wave-$ENV --service wave-$ENV --force-new-deployment`.
4. Apague o `SOURCE_DATABASE_URL` do SSM quando não precisar mais.

## Deploy contínuo (GitHub Actions)

Depois do bootstrap, todo push em `develop` dispara
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), que também pode ser
disparado à mão (*Run workflow*). Ele: builda a imagem → sobe `/_next/static` no S3 →
publica `:<sha>` e `:latest` no ECR → força um novo deployment no ECS → falha se o
deployment não concluir (inclusive quando o circuit breaker faz rollback).

A autenticação é por OIDC, sem chave AWS no GitHub. Configuração, uma vez:

1. Em *Settings → Environments*, crie o environment **`homolog`** (mesmo nome de
   `var.environment`):
   - *Deployment branches*: só `develop`.
   - *Required reviewers* (opcional): exige aprovação antes de cada deploy.
   - *Variables*: `AWS_DEPLOY_ROLE_ARN` = `terraform -chdir=infra output -raw deploy_role_arn`.
2. A role (`infra/github.tf`) só aceita jobs desse environment e só tem permissão
   para push no ECR, escrita no bucket de estáticos e update do serviço ECS.

Rollback manual: aponte `:latest` para a imagem anterior e force um deployment.

```bash
docker pull "${ECR}:<sha-anterior>" && docker tag "${ECR}:<sha-anterior>" "${ECR}:latest"
docker push "${ECR}:latest"
aws ecs update-service --cluster wave-homolog --service wave-homolog --force-new-deployment
```

Mudanças de infra (CPU, variáveis, segredos novos em `var.app_secrets`) continuam por
`terraform apply`, feito por uma pessoa.

## Próximos passos (PRs separados — ADR 0004)

- Vercel Blob → S3 para os comprovantes.
- Vercel Cron → EventBridge para `/api/cron/purge-eventos-seguranca`.
- Ambiente de produção (`environment=prod`, domínio próprio) quando houver clientes.
