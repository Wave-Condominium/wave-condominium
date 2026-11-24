# Deploy pelo GitHub Actions via OIDC: nenhuma chave de acesso AWS fica no GitHub.
# Só jobs no environment do GitHub com o mesmo nome de var.environment podem
# assumir a role — o environment é onde se restringe a branch e se exige aprovação.

# O repositório usa o "immutable subject" do OIDC: o sub do token leva os IDs do
# dono e do repo (repo:<dono>@<id>/<repo>@<id>:...), não só os nomes. Isso impede
# que um repo renomeado ou recriado com o mesmo nome assuma a role.
# IDs: gh api repos/<dono>/<repo> --jq '.owner.id, .id'
variable "github_repo_subject" {
  type    = string
  default = "Wave-Condominium@354637883/wave-condominium@1303359859"
}

# O provider OIDC é um por conta e fica em infra/shared/.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "deploy" {
  name = "${local.name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo_subject}:environment:${var.environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = aws_ecr_repository.app.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.static.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.static.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = aws_ecs_service.app.id
      },
    ]
  })
}
