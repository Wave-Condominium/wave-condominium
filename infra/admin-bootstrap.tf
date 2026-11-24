# Task avulsa que cria o primeiro usuário ADMIN num banco vazio (produção).
# Depois dele, condomínios e usuários são cadastrados pela própria plataforma.
#
# - O e-mail vem no run-task (ADMIN_EMAIL), para não ficar no repositório.
# - A senha inicial vem do SSM (ADMIN_INITIAL_PASSWORD) e o usuário nasce com
#   mustChangePassword = true: no primeiro login a plataforma obriga a troca.
# - Idempotente: se o e-mail já existe, não altera nada.
# Como rodar: `terraform output -raw admin_bootstrap_command` (troque o e-mail).

locals {
  task_network = "awsvpcConfiguration={subnets=[${join(",", aws_subnet.public[*].id)}],securityGroups=[${aws_security_group.app.id}],assignPublicIp=ENABLED}"
}

resource "aws_ecs_task_definition" "admin_bootstrap" {
  family                   = "${local.name}-admin-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name      = "admin-bootstrap"
    image     = "postgres:18"
    essential = true

    secrets = [for s in ["DATABASE_URL", "ADMIN_INITIAL_PASSWORD"] : {
      name      = s
      valueFrom = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/${s}"
    }]

    entryPoint = ["bash", "-c"]
    command = [<<-EOT
      set -euo pipefail
      : "$${ADMIN_EMAIL:?passe ADMIN_EMAIL no run-task}"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -v email="$ADMIN_EMAIL" -v pw="$ADMIN_INITIAL_PASSWORD" <<'SQL'
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      INSERT INTO "User" (id, email, "passwordHash", name, role, "mustChangePassword")
      VALUES (gen_random_uuid()::text, lower(:'email'), crypt(:'pw', gen_salt('bf', 12)),
              'Administrador Wave', 'ADMIN', true)
      ON CONFLICT (email) DO NOTHING;
      DROP EXTENSION pgcrypto;
      SQL
      psql "$DATABASE_URL" -tAc "select 'admins: ' || count(*) from \"User\" where role = 'ADMIN'"
    EOT
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "admin-bootstrap"
      }
    }
  }])
}

output "admin_bootstrap_command" {
  value = join(" ", [
    "aws ecs run-task --cluster ${aws_ecs_cluster.main.name}",
    "--task-definition ${aws_ecs_task_definition.admin_bootstrap.family} --launch-type FARGATE",
    "--network-configuration '${local.task_network}'",
    "--overrides '{\"containerOverrides\":[{\"name\":\"admin-bootstrap\",\"environment\":[{\"name\":\"ADMIN_EMAIL\",\"value\":\"<seu-email>\"}]}]}'",
  ])
}
