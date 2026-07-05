# Aditi Stays Platform

Enterprise CRM + catalog platform for a halal-compliant, human-assisted travel agency flow.

## Stack
- **Frontend:** Next.js 14 + Tailwind
- **Core API:** Java 21 + Spring Boot
- **Chat Service:** Java 21 + Spring Boot (WebSocket)
- **Data:** PostgreSQL + Redis

> Infrastructure, CI/CD, and container orchestration are owned by the DevOps team
> and live outside this repository. The application runs directly on local
> toolchains and self-bootstraps its database schema — no migration or bootstrap
> step is required.

## Prerequisites
- Java 21+ and Maven 3.9+
- Node.js 18+ and npm
- A running PostgreSQL 16 and Redis 7 (e.g. `brew services start postgresql@16 redis`)

Create the database once:

```bash
createdb aditi_stays
```

## Secrets
Both backends share a set of secrets that **must match** between services, because
the Core API *signs* user chat tokens that the Chat Service *verifies*:

| Variable | Used by | Rules |
| --- | --- | --- |
| `ADMIN_API_TOKEN` | core-api, chat-service | ≥ 24 chars, not a `change-me` placeholder |
| `ADMIN_CHAT_TOKEN` | chat-service | ≥ 24 chars |
| `USER_CHAT_TOKEN_SECRET` | core-api, chat-service | ≥ 24 chars, identical on both |

The services refuse to start if any secret is empty, too short, or contains
`change-me`. Generate strong values with e.g. `openssl rand -hex 24`.

## Run locally

Open three terminals. Set the shared secrets in your shell first:

```bash
export ADMIN_API_TOKEN="$(openssl rand -hex 24)"
export ADMIN_CHAT_TOKEN="$(openssl rand -hex 24)"
export USER_CHAT_TOKEN_SECRET="$(openssl rand -hex 24)"
```

**1. Core API** (creates all tables and seeds the catalog on first boot)

```bash
cd core-api
DATABASE_URL="postgres://$(whoami)@localhost:5432/aditi_stays?sslmode=disable" \
REDIS_ADDR="localhost:6379" \
mvn spring-boot:run
```

**2. Chat Service**

```bash
cd chat-service
DATABASE_URL="postgresql+asyncpg://$(whoami)@localhost:5432/aditi_stays" \
REDIS_URL="redis://localhost:6379/0" \
mvn spring-boot:run
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

Services:
- Frontend: http://localhost:3000
- Core API: http://localhost:8080
- Chat Service: http://localhost:8000

> Start the Core API first on a fresh database — it owns `EnsureSchema`, which
> creates every table both services use.

## Configuration reference

**Core API**

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8080` | |
| `DATABASE_URL` | — (required) | `postgres://…?sslmode=disable` |
| `REDIS_ADDR` | `localhost:6379` | |
| `REDIS_PASSWORD` / `REDIS_DB` | `""` / `0` | |
| `USER_CHAT_TOKEN_TTL_HOURS` | `720` (30 days) | bounded 1–8760 |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `120` | per-IP |
| `LEAD_RATE_LIMIT_PER_MINUTE` | `20` | per-IP on lead capture |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | comma-separated allowlist |

**Chat Service** (selected)

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8000` | |
| `DATABASE_URL` | — (required) | `postgresql+asyncpg://…` |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `MAX_UPLOAD_SIZE_MB` | `8` | payment-proof image cap |
| `BANNER_MAX_UPLOAD_SIZE_MB` | `120` | banner video cap |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `WHATSAPP_PROVIDER` | `stub` | `stub`, `twilio`, or `meta` |

**Frontend**

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_CORE_API_URL` | `http://localhost:8080` |
| `NEXT_PUBLIC_CHAT_HTTP_URL` | `http://localhost:8000` |
| `NEXT_PUBLIC_CHAT_WS_URL` | `ws://localhost:8000` |

## Product constraints implemented
- **Halal compliance:** no banking/riba/alcohol/gambling/music-party content in catalog.
- **Agent shield:** only masked property IDs (`AD-*`) are exposed.
- **Human-in-loop:** no auto-booking endpoint; all bookings are manual availability inquiries + chat follow-up.

## Security hardening
- Admin role enforcement on protected CRM routes via `ADMIN_API_TOKEN`.
- Admin websocket enforcement via `ADMIN_CHAT_TOKEN`.
- Lead-scoped user chat authorization tokens signed with `USER_CHAT_TOKEN_SECRET` (30-day default TTL, configurable).
- Request rate limits on lead capture and chat HTTP APIs.
- CORS allowlist via `CORS_ALLOWED_ORIGINS` (no wildcard required).
- Request IDs, security headers, and audit logs (`audit_logs` table) for sensitive admin actions.
- Chat upload size/type enforcement and optional S3 object storage backend.
- Startup secret validation rejects empty, short, or placeholder secrets.

## Observability
- Core API metrics: `GET /metrics`
- Chat service metrics: `GET /api/metrics`

## Key flows
- Browsing history tracking
- Dedicated property detail page (gallery, reviews, compare, availability trigger)
- Wishlist + side-by-side comparison
- Check-availability lead capture with compliance disclaimer and chat resume by matching name + mobile + property
- Floating real-time chat popup with proof upload and admin confirmation
- Admin dashboard with active leads, pre-chat intelligence, payments, analytics
- Property feedback capture with aggregate rating summary
- Admin-managed campaign banner rail served to the landing page

See also: [`docs/ENDPOINTS.md`](docs/ENDPOINTS.md), [`docs/REQUIREMENTS_TRACE.md`](docs/REQUIREMENTS_TRACE.md).
