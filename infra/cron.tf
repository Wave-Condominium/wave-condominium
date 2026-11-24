# Substitui o Vercel Cron (vercel.json): todo dia às 03:00 UTC chama
# /api/cron/purge-eventos-seguranca com `Authorization: Bearer <CRON_SECRET>`.
#
# Por que uma task ECS com curl e não uma API destination do EventBridge: a
# API destination guardaria o CRON_SECRET no state do Terraform. Aqui o segredo
# sai do SSM direto para o container, como no app.

resource "aws_ecs_task_definition" "cron" {
  family                   = "${local.name}-cron"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name       = "cron"
    image      = "curlimages/curl:8.23.0"
    essential  = true
    entryPoint = ["sh", "-c"]
    # -f: falha (exit != 0) em 401/5xx, para o erro aparecer no ECS e nos logs.
    command = [
      "curl -fsS --max-time 120 -H \"Authorization: Bearer $CRON_SECRET\" https://${var.domain_name}/api/cron/purge-eventos-seguranca",
    ]

    secrets = [{
      name      = "CRON_SECRET"
      valueFrom = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/CRON_SECRET"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "cron"
      }
    }
  }])
}

resource "aws_iam_role" "scheduler" {
  name = "${local.name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "run-cron-task"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = "${aws_ecs_task_definition.cron.arn_without_revision}:*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.execution.arn
      },
    ]
  })
}

resource "aws_scheduler_schedule" "purge_eventos_seguranca" {
  name                = "${local.name}-purge-eventos-seguranca"
  schedule_expression = "cron(0 3 * * ? *)" # mesmo horário do vercel.json (UTC)

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.cron.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = aws_subnet.public[*].id
        security_groups  = [aws_security_group.app.id]
        assign_public_ip = true
      }
    }

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}

output "cron_command" {
  description = "Roda o cron uma vez, fora do horário agendado."
  value = join(" ", [
    "aws ecs run-task --cluster ${aws_ecs_cluster.main.name}",
    "--task-definition ${aws_ecs_task_definition.cron.family} --launch-type FARGATE",
    "--network-configuration '${local.task_network}'",
  ])
}
