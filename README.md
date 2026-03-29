# Aditi Stays Platform

Enterprise CRM + catalog platform for a halal-compliant, human-assisted travel agency flow.

## Stack
- Frontend: Next.js + Tailwind
- Core API: Golang
- Chat Service: FastAPI + WebSockets
- Data: PostgreSQL + Redis
- Infra: Terraform + K3s manifests + GitHub Actions + ArgoCD skeleton

## Local quick start
1. Copy env templates.
2. Run Docker Compose.

```bash
cp .env.example .env
# set strong values for ADMIN_API_TOKEN, ADMIN_CHAT_TOKEN, USER_CHAT_TOKEN_SECRET
docker compose up --build
```

Services:
- Frontend: http://localhost:3000
- Core API: http://localhost:8080
- Chat Service: http://localhost:8000
- Postgres: localhost:5432
- Redis: localhost:6379

## Product constraints implemented
- Halal compliance: no banking/riba/alcohol/gambling/music-party content in catalog.
- Agent shield: only masked property IDs are exposed.
- Human-in-loop: no auto-booking endpoint; all bookings are manual availability inquiries + chat follow-up.

## Security hardening
- Admin role enforcement on protected CRM routes via `ADMIN_API_TOKEN`.
- Admin websocket enforcement via `ADMIN_CHAT_TOKEN`.
- Lead-scoped user chat authorization tokens signed with `USER_CHAT_TOKEN_SECRET`.
- Request rate limits on core lead capture and chat HTTP APIs.
- CORS allowlist via `CORS_ALLOWED_ORIGINS` (no wildcard required in production).
- Request IDs, security headers, and audit logs (`audit_logs` table) for sensitive admin actions.
- Chat upload size enforcement (`MAX_UPLOAD_SIZE_MB`) and optional S3 object storage backend.

## Observability and alerts
- Core API metrics: `GET /metrics`
- Chat service metrics: `GET /api/metrics`
- Prometheus and alert templates: `infra/monitoring/`

## Production wiring
- Set secrets in CI: `ECR_REGISTRY`, `AWS_ROLE_ARN`, `AWS_REGION`, `BASE_DOMAIN`, `API_DOMAIN`, `CHAT_DOMAIN`, `GITOPS_REPO_URL`.
- Set Kubernetes app secret values in `infra/k8s/base/secrets.template.yaml` (or use external secret manager).
- Use provider-backed WhatsApp via env: `WHATSAPP_PROVIDER=twilio|meta` plus credentials.
- Optional helper: `scripts/render-k8s-secrets.sh` to generate `secrets.generated.yaml` from environment variables.

See also:
- `docs/PRODUCTION.md`
- `docs/ENDPOINTS.md`
- `docs/ARCHITECTURE.md`
- `docs/REQUIREMENTS_TRACE.md`

## Key flows
- Browsing history tracking
- Dedicated property detail page (gallery, reviews, compare, availability trigger)
- Wishlist + side-by-side comparison
- Check availability lead capture with compliance disclaimer and chat resume by matching name+mobile+property
- Floating real-time chat popup with proof upload and admin confirmation
- Admin dashboard with active leads, pre-chat intelligence, payments, analytics
- Property feedback capture with aggregate rating summary
- Admin-managed Instagram/YouTube banner rail served to landing page
