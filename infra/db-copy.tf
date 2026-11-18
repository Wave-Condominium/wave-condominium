# Task avulsa (não é serviço): copia um Postgres de origem para o RDS deste
# ambiente. Roda dentro da VPC porque o RDS não é público — os dados vão direto
# da origem para o RDS, sem passar pela máquina de ninguém.
#
# SUBSTITUI todo o schema public do RDS. Depois da cópia, troca a senha de TODOS
# os usuários pelo valor de DEMO_USERS_PASSWORD: a origem (homologação) tem os
# usuários do seed com a senha pública do repositório.
#
# Parâmetros SSM, criados à mão: SOURCE_DATABASE_URL (endpoint direto, sem
# -pooler) e DEMO_USERS_PASSWORD. Como rodar: `terraform output db_copy_command`.

resource "aws_ecs_task_definition" "db_copy" {
  family                   = "${local.name}-db-copy"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name      = "db-copy"
    image     = "postgres:18" # pg_dump precisa ser >= a versão da origem (Neon: 18)
    essential = true

    secrets = [for s in ["SOURCE_DATABASE_URL", "DATABASE_URL", "DEMO_USERS_PASSWORD"] : {
      name      = s
      valueFrom = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/${s}"
    }]

    entryPoint = ["bash", "-c"]
    command = [<<-EOT
      set -euo pipefail
      echo "origem: Postgres $(psql "$SOURCE_DATABASE_URL" -tAc 'show server_version')"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
      # O CREATE SCHEMA public já foi feito acima.
      pg_dump --no-owner --no-privileges --no-comments --schema=public "$SOURCE_DATABASE_URL" \
        | sed -e '/^CREATE SCHEMA public;/d' \
        | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -v pw="$DEMO_USERS_PASSWORD" <<'SQL'
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      UPDATE "User" SET "passwordHash" = crypt(:'pw', gen_salt('bf', 12));
      DROP EXTENSION pgcrypto;
      SQL
      for T in '"User"' '"Condominium"' '_prisma_migrations'; do
        echo "$T: $(psql "$DATABASE_URL" -tAc "select count(*) from $T")"
      done
      echo "cópia concluída"
    EOT
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "db-copy"
      }
    }
  }])
}

output "db_copy_command" {
  value = join(" ", [
    "aws ecs run-task --cluster ${aws_ecs_cluster.main.name}",
    "--task-definition ${aws_ecs_task_definition.db_copy.family} --launch-type FARGATE",
    "--network-configuration 'awsvpcConfiguration={subnets=[${join(",", aws_subnet.public[*].id)}],securityGroups=[${aws_security_group.app.id}],assignPublicIp=ENABLED}'",
  ])
}
