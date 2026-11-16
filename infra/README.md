# infra/ — Wave na AWS (Terraform)

Arquitetura e motivos: [ADR 0004](../docs/adr/0004-deploy-na-aws.md).

```text
Usuário ── HTTPS ──► CloudFront
                      ├─ /_next/static/*  ──► S3 (privado, via OAC)
                      └─ /* (resto)       ──► ALB interno (VPC origin) ──► ECS Fargate (Next.js)
                                                                              │
                                                                              ▼
                                                                    RDS PostgreSQL (privado)
```

| Arquivo       | O que tem                                              |
|---------------|--------------------------------------------------------|
| `network.tf`  | VPC, subnets públicas/privadas, security groups         |
| `database.tf` | RDS PostgreSQL 16                                       |
| `app.tf`      | ECR, IAM, ALB interno, ECS cluster/task/service, logs   |
| `cdn.tf`      | Bucket S3 de estáticos, CloudFront, VPC origin          |

Segredos da aplicação **não** ficam no Terraform: são parâmetros SecureString no SSM
em `/wave/<env>/<NOME>` (lista em `var.app_secrets`), criados à mão.

## Primeiro deploy (bootstrap)

Pré-requisitos: AWS CLI autenticado na conta certa, Terraform ≥ 1.5, Docker.

```bash
ENV=prod
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

# 3. Infra sem tasks rodando (ainda não há imagem nem segredos)
terraform apply -var desired_count=0
```

**4. Segredos no SSM.** O RDS gerou a senha master no Secrets Manager
(`terraform output db_master_secret_arn`). Monte o `DATABASE_URL` com ela —
`postgresql://wave:<senha-url-encoded>@<db_endpoint>:5432/wave?sslmode=require` — e crie
cada parâmetro de `var.app_secrets` sem deixar o valor no histórico do shell:

```bash
for NOME in DATABASE_URL WAVE_SESSION_SECRET WAVE_STELLAR_SECRET PSP_WEBHOOK_SECRET CRON_SECRET BLOB_READ_WRITE_TOKEN; do
  read -rs -p "$NOME: " VALOR; echo
  aws ssm put-parameter --type SecureString --overwrite \
    --name "/wave/$ENV/$NOME" --value "$VALOR"
done
unset VALOR
```

Use valores **novos** para produção na AWS (Constituição, princípio 6); nunca reaproveite
os de dev/homolog. `NEXT_PUBLIC_SHOW_DEMO_LOGINS` / `NEXT_PUBLIC_DEMO_SEED_PASSWORD` não
entram aqui: são embutidas no build e devem ficar **fora** da imagem de produção.

**5. Imagem + estáticos** (do mesmo build — os nomes com hash precisam bater):

```bash
cd ..
ECR=$(terraform -chdir=infra output -raw ecr_repository_url)
BUCKET=$(terraform -chdir=infra output -raw static_bucket)
TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR%%/*}"
docker build --platform linux/amd64 -t "$ECR:$TAG" .
docker push "$ECR:$TAG"

# Sem --delete: HTML antigo ainda em cache referencia bundles antigos.
CID=$(docker create "$ECR:$TAG")
docker cp "$CID:/app/.next/static" ./.static-out && docker rm "$CID"
aws s3 sync ./.static-out "s3://$BUCKET/_next/static" \
  --cache-control "public,max-age=31536000,immutable"
rm -rf ./.static-out
```

```bash
# 6. Sobe o serviço com a imagem
terraform -chdir=infra apply -var image_tag="$TAG"

# 7. Confere
curl -sI "$(terraform -chdir=infra output -raw url)/login"
```

As migrations do Prisma rodam no start do container. Logs:
`aws logs tail /ecs/wave-$ENV --follow`.

## Próximos passos (PRs separados — ADR 0004)

- Pipeline no GitHub Actions (OIDC, build/push, sync do S3, deploy no ECS).
- Vercel Blob → S3 para os comprovantes.
- Vercel Cron → EventBridge para `/api/cron/purge-eventos-seguranca`.
- Domínio customizado (ACM em us-east-1) e cutover de DNS/dados a partir do Neon.
