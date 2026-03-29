#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_FILE="${1:-$ROOT_DIR/infra/k8s/base/secrets.generated.yaml}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${CHAT_DATABASE_URL:?CHAT_DATABASE_URL is required}"
: "${REDIS_ADDR:?REDIS_ADDR is required}"
: "${REDIS_URL:?REDIS_URL is required}"
: "${ADMIN_API_TOKEN:?ADMIN_API_TOKEN is required}"
: "${ADMIN_CHAT_TOKEN:?ADMIN_CHAT_TOKEN is required}"
: "${USER_CHAT_TOKEN_SECRET:?USER_CHAT_TOKEN_SECRET is required}"

WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER:-stub}"
STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
S3_BUCKET="${S3_BUCKET:-}"
S3_REGION="${S3_REGION:-}"
S3_ENDPOINT_URL="${S3_ENDPOINT_URL:-}"
S3_PUBLIC_BASE_URL="${S3_PUBLIC_BASE_URL:-}"
S3_PREFIX="${S3_PREFIX:-payment-proofs}"
TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
TWILIO_WHATSAPP_FROM="${TWILIO_WHATSAPP_FROM:-}"
META_WHATSAPP_TOKEN="${META_WHATSAPP_TOKEN:-}"
META_PHONE_NUMBER_ID="${META_PHONE_NUMBER_ID:-}"

cat > "$OUT_FILE" <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: aditi-stays-secrets
  namespace: aditi-stays
type: Opaque
stringData:
  database_url: "$DATABASE_URL"
  chat_database_url: "$CHAT_DATABASE_URL"
  redis_addr: "$REDIS_ADDR"
  redis_url: "$REDIS_URL"
  admin_api_token: "$ADMIN_API_TOKEN"
  admin_chat_token: "$ADMIN_CHAT_TOKEN"
  user_chat_token_secret: "$USER_CHAT_TOKEN_SECRET"
  storage_backend: "$STORAGE_BACKEND"
  s3_bucket: "$S3_BUCKET"
  s3_region: "$S3_REGION"
  s3_endpoint_url: "$S3_ENDPOINT_URL"
  s3_public_base_url: "$S3_PUBLIC_BASE_URL"
  s3_prefix: "$S3_PREFIX"
  whatsapp_provider: "$WHATSAPP_PROVIDER"
  twilio_account_sid: "$TWILIO_ACCOUNT_SID"
  twilio_auth_token: "$TWILIO_AUTH_TOKEN"
  twilio_whatsapp_from: "$TWILIO_WHATSAPP_FROM"
  meta_whatsapp_token: "$META_WHATSAPP_TOKEN"
  meta_phone_number_id: "$META_PHONE_NUMBER_ID"
YAML

echo "Wrote $OUT_FILE"
