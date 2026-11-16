variable "region" {
  type    = string
  default = "sa-east-1"
}

variable "app_name" {
  type    = string
  default = "wave"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "image_tag" {
  description = "Tag da imagem no ECR que o serviço ECS deve rodar."
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
