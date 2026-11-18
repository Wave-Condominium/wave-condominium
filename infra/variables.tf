variable "region" {
  type    = string
  default = "sa-east-1"
}

variable "app_name" {
  type    = string
  default = "wave"
}

variable "environment" {
  description = "Nome do ambiente: prefixo dos recursos (wave-<env>), do SSM (/wave/<env>/) e nome do environment do GitHub que pode fazer deploy."
  type        = string
  default     = "homolog"
}

variable "domain_name" {
  description = "Domínio público do ambiente (CNAME no Registro.br apontando para o CloudFront)."
  type        = string
  default     = "homolog.wavecondominium.com.br"
}

variable "image_tag" {
  description = "Tag da imagem no ECR que o serviço ECS roda. O pipeline sempre atualiza `latest` e força um novo deployment; o digest fica fixado por deployment no ECS."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Tasks do app. Use 0 no primeiro apply, antes de existir imagem e segredos (ver README)."
  type        = number
  default     = 1
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "app_secrets" {
  description = "Variáveis injetadas no container a partir do SSM Parameter Store, em <ssm_prefix>/<NOME>. Os parâmetros são criados à mão (SecureString) — nunca pelo Terraform, para o valor não cair no state."
  type        = list(string)
  default = [
    "DATABASE_URL",
    "WAVE_SESSION_SECRET",
    "WAVE_STELLAR_SECRET",
    "PSP_WEBHOOK_SECRET",
    "CRON_SECRET",
    "BLOB_READ_WRITE_TOKEN",
  ]
}
