terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82" # aws_cloudfront_vpc_origin
    }
  }

  # Configuração parcial: bucket/key/region vêm de `terraform init -backend-config=...`
  # (ver infra/README.md), para o mesmo código servir a mais de um ambiente.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name       = "${var.app_name}-${var.environment}"
  ssm_prefix = "/${var.app_name}/${var.environment}"
}
