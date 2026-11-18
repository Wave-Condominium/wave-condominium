output "url" {
  value = "https://${var.domain_name}"
}

output "certificate_validation" {
  description = "CNAME a criar no Registro.br para o ACM validar o certificado."
  value = [for o in aws_acm_certificate.main.domain_validation_options : {
    nome  = o.resource_record_name
    tipo  = o.resource_record_type
    valor = o.resource_record_value
  }]
}

output "dns_cname" {
  description = "CNAME a criar no Registro.br: <domain_name> → CloudFront."
  value       = "${var.domain_name} CNAME ${aws_cloudfront_distribution.main.domain_name}"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "static_bucket" {
  value = aws_s3_bucket.static.bucket
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "db_master_secret_arn" {
  description = "Secret do Secrets Manager com usuário/senha master do RDS (para montar o DATABASE_URL)."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "deploy_role_arn" {
  description = "Role do GitHub Actions — vai na variável AWS_DEPLOY_ROLE_ARN do environment production."
  value       = aws_iam_role.deploy.arn
}

output "ssm_prefix" {
  value = local.ssm_prefix
}
