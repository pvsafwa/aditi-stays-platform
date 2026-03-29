# Production Setup

## 1) Terraform
```bash
cd infra/terraform
terraform init
terraform apply -var-file=terraform.tfvars
```

Terraform now provisions ECR repositories and outputs repository URLs.
It also provisions Redis (ElastiCache replication group) and outputs `redis_primary_endpoint`.

## 2) Required GitHub Secrets
- `AWS_ROLE_ARN`
- `AWS_REGION`
- `ECR_REGISTRY`
- `BASE_DOMAIN`
- `API_DOMAIN`
- `CHAT_DOMAIN`
- `GITOPS_REPO_URL`
- `ARGOCD_SERVER`
- `ARGOCD_AUTH_TOKEN`

## 3) Kubernetes Application Secret
Generate and apply:
```bash
export DATABASE_URL='postgres://...'
export CHAT_DATABASE_URL='postgresql+asyncpg://...'
export REDIS_ADDR='your-elasticache-primary-endpoint:6379'
export REDIS_URL='redis://your-elasticache-primary-endpoint:6379/0'
export ADMIN_API_TOKEN='replace-with-strong-token'
export ADMIN_CHAT_TOKEN='replace-with-strong-token'
export USER_CHAT_TOKEN_SECRET='replace-with-strong-random-secret'
export STORAGE_BACKEND='s3' # local|s3
export S3_BUCKET='your-proof-bucket'
export S3_REGION='ap-south-1'
export S3_PUBLIC_BASE_URL='https://cdn.example.com' # optional
export S3_PREFIX='payment-proofs'
export WHATSAPP_PROVIDER='twilio' # or meta/stub
export TWILIO_ACCOUNT_SID=''
export TWILIO_AUTH_TOKEN=''
export TWILIO_WHATSAPP_FROM=''

./scripts/render-k8s-secrets.sh
kubectl apply -f infra/k8s/base/secrets.generated.yaml
```

## 4) WhatsApp Provider Notes
- Twilio: set `WHATSAPP_PROVIDER=twilio` and fill Twilio credentials.
- Meta Cloud API: set `WHATSAPP_PROVIDER=meta` and fill Meta token + phone number ID.
- Stub: `WHATSAPP_PROVIDER=stub` for non-production testing.

## 5) CORS and Upload Guardrails
- Set `CORS_ALLOWED_ORIGINS` for both core-api and chat-service deployments (example: `https://aditistays.com,https://www.aditistays.com`).
- Set `MAX_UPLOAD_SIZE_MB` in chat-service to enforce screenshot upload limits.
- For multi-replica chat-service, set `STORAGE_BACKEND=s3` so payment screenshots are shared across pods.

## 6) Admin Access
- Core API admin endpoints require: `Authorization: Bearer <ADMIN_API_TOKEN>`
- Chat admin websocket requires: `?token=<ADMIN_CHAT_TOKEN>`
- User chat HTTP/WS endpoints require the lead-scoped `chat_token` returned by `POST /api/leads/check-availability`.
