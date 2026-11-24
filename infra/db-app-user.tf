# Usuário do banco que a aplicação usa (wave_app), separado do master (wave).
#
# Por quê: o RDS troca a senha do master sozinho a cada 7 dias
# (manage_master_user_password). Se o DATABASE_URL usa o master, toda task
# nova falha depois da troca. O wave_app tem senha fixa no SSM
# (APP_DB_PASSWORD); o master continua girando e só é usado por esta task.
#
# A task é idempotente: cria o wave_app (ou só atualiza a senha) e passa para ele
# a posse do schema public e de tudo que está nele, para as migrations do Prisma
# continuarem funcionando (ALTER TABLE exige ser dono).
#
# Como rodar: `terraform output -raw db_app_user_command`. Depois aponte o
# DATABASE_URL para o wave_app (infra/README.md).

resource "aws_ecs_task_definition" "db_app_user" {
  family                   = "${local.name}-db-app-user"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name      = "db-app-user"
    image     = "postgres:18"
    essential = true

    environment = [
      { name = "PGHOST", value = aws_db_instance.main.address },
      { name = "PGUSER", value = aws_db_instance.main.username },
      { name = "PGDATABASE", value = aws_db_instance.main.db_name },
      { name = "PGSSLMODE", value = "require" },
    ]
    secrets = [
      { name = "PGPASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
      { name = "APP_DB_PASSWORD", valueFrom = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/APP_DB_PASSWORD" },
    ]

    entryPoint = ["bash", "-c"]
    command = [<<-EOT
      set -euo pipefail
      psql -v ON_ERROR_STOP=1 -q -v pw="$APP_DB_PASSWORD" <<'SQL'
      SELECT 'CREATE ROLE wave_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wave_app') \gexec
      ALTER ROLE wave_app WITH LOGIN PASSWORD :'pw';
      -- O master precisa ser membro para poder passar a posse (PG 16+).
      GRANT wave_app TO CURRENT_USER;
      -- CREATE no banco: CREATE SCHEMA (db-copy) e extensões trusted (pgcrypto).
      GRANT CONNECT, CREATE ON DATABASE wave TO wave_app;
      ALTER SCHEMA public OWNER TO wave_app;
      SELECT format('ALTER TABLE public.%I OWNER TO wave_app', tablename)
        FROM pg_tables WHERE schemaname = 'public' AND tableowner <> 'wave_app' \gexec
      -- Sequences de coluna serial mudam junto com a tabela; aqui só as avulsas.
      SELECT format('ALTER SEQUENCE public.%I OWNER TO wave_app', c.relname)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'S'
         AND pg_get_userbyid(c.relowner) <> 'wave_app'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i')) \gexec
      SELECT format('ALTER TYPE public.%I OWNER TO wave_app', t.typname)
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'
         AND pg_get_userbyid(t.typowner) <> 'wave_app' \gexec
      SQL
      psql -tAc "select 'objetos do master no public: ' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and pg_get_userbyid(c.relowner) <> 'wave_app'"
      echo "wave_app pronto"
    EOT
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "db-app-user"
      }
    }
  }])
}

# Só esta task referencia o segredo do master; a task do app não o recebe.
resource "aws_iam_role_policy" "execution_db_master" {
  name = "read-db-master-secret"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_db_instance.main.master_user_secret[0].secret_arn
    }]
  })
}

output "db_app_user_command" {
  value = join(" ", [
    "aws ecs run-task --cluster ${aws_ecs_cluster.main.name}",
    "--task-definition ${aws_ecs_task_definition.db_app_user.family} --launch-type FARGATE",
    "--network-configuration '${local.task_network}'",
  ])
}
