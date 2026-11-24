# Frontend: CloudFront na frente de tudo.
#   /_next/static/*  → S3 (bundles com hash no nome, cache longo)
#   todo o resto     → ALB interno via VPC origin (SSR, Server Actions, /api), sem cache

resource "aws_s3_bucket" "static" {
  bucket = "${local.name}-static-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "static" {
  bucket = aws_s3_bucket.static.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${local.name}-static"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${local.name}-alb"
    arn                    = aws_lb.app.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Repassa Host, cookies, query e headers do viewer: sessão e checagem de
# origem das Server Actions funcionam como na Vercel.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

locals {
  all_domains = concat([var.domain_name], var.redirect_domains)
}

data "aws_route53_zone" "main" {
  name = var.dns_zone
}

# Um certificado para o domínio canônico + os de redirect, validado por DNS
# no Route 53 (zona em infra/shared/) — sem passo manual.
resource "aws_acm_certificate" "main" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = var.redirect_domains
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.main.domain_validation_options : o.domain_name => o
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Redireciona os domínios extras (ex.: apex) para o canônico, preservando o
# caminho e a query. Roda no edge, antes de chegar ao app.
resource "aws_cloudfront_function" "redirect" {
  count   = length(var.redirect_domains) > 0 ? 1 : 0
  name    = "${local.name}-redirect"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var req = event.request;
      if (req.headers.host.value === "${var.domain_name}") return req;
      var qs = Object.keys(req.querystring).map(function (k) {
        var v = req.querystring[k];
        return v.multiValue
          ? v.multiValue.map(function (m) { return k + "=" + m.value; }).join("&")
          : k + "=" + v.value;
      }).join("&");
      return {
        statusCode: 301,
        statusDescription: "Moved Permanently",
        headers: { location: { value: "https://${var.domain_name}" + req.uri + (qs ? "?" + qs : "") } },
      };
    }
  EOT
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  aliases         = local.all_domains
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All" # inclui edges na América do Sul
  comment         = local.name

  origin {
    origin_id                = "static"
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  origin {
    origin_id   = "app"
    domain_name = aws_lb.app.dns_name

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.alb.id
    }
  }

  default_cache_behavior {
    target_origin_id         = "app"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true

    dynamic "function_association" {
      for_each = aws_cloudfront_function.redirect
      content {
        event_type   = "viewer-request"
        function_arn = function_association.value.arn
      }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.main.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# Domínios → CloudFront (ALIAS funciona também no apex).
resource "aws_route53_record" "cdn" {
  for_each = toset(flatten([for d in local.all_domains : ["${d}|A", "${d}|AAAA"]]))

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = split("|", each.key)[0]
  type            = split("|", each.key)[1]
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
