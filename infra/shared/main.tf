# Recursos únicos por conta AWS, usados por todos os ambientes (homolog, prod).
# State próprio (shared/terraform.tfstate): um `terraform destroy` de ambiente
# nunca derruba o DNS nem o OIDC dos outros. Ver infra/README.md.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = {
      Project     = "wave"
      Environment = "shared"
      ManagedBy   = "terraform"
    }
  }
}

variable "dns_zone" {
  type    = string
  default = "wavecondominium.com.br"
}

# DNS do domínio. Os nameservers (output) vão no Registro.br, em
# "Alterar servidores DNS". Os registros de cada ambiente (CloudFront,
# validação do ACM) ficam no Terraform do próprio ambiente.
resource "aws_route53_zone" "main" {
  name = var.dns_zone

  lifecycle {
    prevent_destroy = true
  }
}

# Um provider OIDC do GitHub por conta; cada ambiente tem a sua role (github.tf).
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

output "name_servers" {
  description = "Nameservers a configurar no Registro.br."
  value       = aws_route53_zone.main.name_servers
}
