# Aditi Stays Platform

Enterprise CRM + catalog platform for a halal-compliant, human-assisted travel agency flow.

## Stack
- **Frontend:** Next.js 14 + Tailwind (admin login via NextAuth + Keycloak)
- **Gateway:** Java 21 + Spring Cloud Gateway (routing, CORS, JWT check on `/api/admin/**` — the frontend's only entrypoint)
- **Catalog Service:** Java 21 + Spring Boot (properties, feedback, banners, browsing history, wishlist)
- **CRM Service:** Java 21 + Spring Boot (leads, payments, audit log, analytics)
- **Chat Service:** Java 21 + Spring Boot (WebSocket)
- **Identity:** Keycloak (OIDC/OAuth2) — human admin login + service-to-service tokens
- **Data:** PostgreSQL (one database per service) + Redis (shared pub/sub bus)

> CI/CD and production infrastructure are owned by the DevOps team and live
> outside this repository. A `docker-compose.yml` is included here purely for
> a one-command local/dev stack — every service still self-bootstraps its own
> database schema on first boot, no migration step is required either way.

Each backend service owns its own database and its own tables — there is no
shared schema and no cross-service foreign keys. Where one service needs data
that lives in another (e.g. crm-service validating a property exists before
creating a lead, or chat-service looking up a customer's name), it makes a
plain HTTP call to that service's API instead of querying its database directly.

## Prerequisites
- Java 21+ and Maven 3.9+
- Node.js 18+ and npm
- A running PostgreSQL 16 and Redis 7 (e.g. `brew services start postgresql@16 redis`)

Create the three databases once:

```bash
createdb catalog_db
createdb crm_db
createdb chat_db
```

## Secrets
Admin HTTP authentication (all three services) is now a Keycloak-issued JWT — there is
no shared static admin API token anymore. The secrets that remain shared between services:

| Variable | Used by | Rules |
| --- | --- | --- |
| `ADMIN_CHAT_TOKEN` | chat-service, frontend | ≥ 24 chars. Unrelated to admin HTTP auth — chat-service's admin WebSocket connection still checks this static secret directly (see [Authentication](#authentication-keycloak--oidc)). |
| `USER_CHAT_TOKEN_SECRET` | crm-service, chat-service | ≥ 24 chars, identical on both |
| `KEYCLOAK_CLIENT_SECRET` | crm-service, chat-service, Keycloak realm import | Must match the `internal-service` client secret in `keycloak/realm-export.json` exactly — used for the M2M client-credentials grant crm-service/chat-service use to call each other's `/api/admin/**` endpoints. |

The services refuse to start if `ADMIN_CHAT_TOKEN`/`USER_CHAT_TOKEN_SECRET` are empty,
too short, or contain `change-me`. Generate strong values with e.g. `openssl rand -hex 24`.

## Run with Docker Compose (quickest path)

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, ADMIN_CHAT_TOKEN, USER_CHAT_TOKEN_SECRET
# KEYCLOAK_CLIENT_SECRET can stay as its placeholder for local dev -- it just
# needs to match keycloak/realm-export.json, which it does by default.
docker compose up --build
```

This brings up Postgres (auto-creating `catalog_db`/`crm_db`/`chat_db`), Redis, Jaeger,
Keycloak (self-importing the `aditi-stays` realm from `keycloak/realm-export.json` on
first boot), the gateway, and all three backend services, each self-bootstrapping its
own schema on first boot. Then run the frontend separately as below. The frontend is not
containerized here, matching the "runs on local toolchains" approach above.

Keycloak's admin console is at http://localhost:8180 (`admin` / `admin`, set via
`KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` in `docker-compose.yml`). The realm ships
with a seeded human admin user for logging into the app itself: `admin` / `AdminPass123!`.

> Keycloak's `KC_HOSTNAME` is pinned to `http://localhost:8180` so every JWT's `iss`
> claim is the same value regardless of whether the request came from a browser
> (`localhost:8180`) or another container on the docker network (`keycloak:8080`) --
> without this, tokens obtained via one path fail validation on the other. Each
> service's `OIDC_JWK_SET_URI` (and crm/chat-service's `OIDC_TOKEN_URI`) then points
> at the internal `keycloak:8080` hostname so containers can still actually reach
> Keycloak over the network to fetch signing keys / request M2M tokens, while
> `OIDC_ISSUER_URI` stays `localhost:8180` to match the JWT's `iss` claim. If you
> change the exposed port or deploy this beyond local dev, update `KC_HOSTNAME`
> and every service's `OIDC_ISSUER_URI` together.

## Run locally (without Docker)

Every service validates admin JWTs against Keycloak, so Keycloak itself still needs
to run even in this "otherwise no Docker" path — standing up Keycloak by hand isn't
practical for local dev, so start just that one container:

```bash
docker compose up keycloak
```

Open five terminals. Set the shared secrets in your shell first:

```bash
export ADMIN_CHAT_TOKEN="$(openssl rand -hex 24)"
export USER_CHAT_TOKEN_SECRET="$(openssl rand -hex 24)"
export KEYCLOAK_CLIENT_SECRET="internal-service-secret-change-me"  # matches keycloak/realm-export.json
```

**1. Catalog Service** (creates its own tables and seeds the catalog on first boot — start this first, crm-service depends on it)

```bash
cd catalog-service
DATABASE_URL="postgres://$(whoami)@localhost:5432/catalog_db?sslmode=disable" \
mvn spring-boot:run
```

**2. CRM Service**

```bash
cd crm-service
DATABASE_URL="postgres://$(whoami)@localhost:5432/crm_db?sslmode=disable" \
REDIS_ADDR="localhost:6379" \
CATALOG_SERVICE_URL="http://localhost:8081" \
CHAT_SERVICE_URL="http://localhost:8000" \
mvn spring-boot:run
```

**3. Chat Service**

```bash
cd chat-service
DATABASE_URL="postgresql+asyncpg://$(whoami)@localhost:5432/chat_db" \
REDIS_URL="redis://localhost:6379/0" \
CRM_SERVICE_URL="http://localhost:8080" \
mvn spring-boot:run
```

**4. Gateway** (the frontend's only entrypoint — routes to the three services above by path)

```bash
cd gateway
CATALOG_SERVICE_URL="http://localhost:8081" \
CRM_SERVICE_URL="http://localhost:8080" \
CHAT_SERVICE_URL="http://localhost:8000" \
CHAT_SERVICE_WS_URL="ws://localhost:8000" \
mvn spring-boot:run
```

**5. Frontend**

```bash
cd frontend
cp .env.example .env.local   # fill in NEXTAUTH_SECRET, KEYCLOAK_CLIENT_SECRET, ADMIN_CHAT_TOKEN
npm install
npm run dev
```

Services:
- Frontend: http://localhost:3000
- Gateway: http://localhost:8090
- Catalog Service: http://localhost:8081
- CRM Service: http://localhost:8080
- Chat Service: http://localhost:8000
- Keycloak: http://localhost:8180

> Start the Catalog Service first on a fresh database — crm-service calls it
> synchronously to validate a property exists before creating a lead. The
> gateway can start any time after the three backend services are up.

## Configuration reference

**Gateway** (the only service the frontend/browser talks to — CORS is centralized here)

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8090` | |
| `CATALOG_SERVICE_URL` | `http://localhost:8081` | |
| `CRM_SERVICE_URL` | `http://localhost:8080` | |
| `CHAT_SERVICE_URL` | `http://localhost:8000` | REST routes (`/api/chat/**`, uploads) |
| `CHAT_SERVICE_WS_URL` | `ws://localhost:8000` | `/ws/**` routes |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | comma-separated allowlist |
| `OIDC_ISSUER_URI` | `http://localhost:8180/realms/aditi-stays` | validates JWTs on `/api/admin/**` (defense in depth — each service re-validates too) |
| `OIDC_JWK_SET_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/certs` | where signing keys are actually fetched from — see the `KC_HOSTNAME` note above |

**Catalog Service**

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8081` | |
| `DATABASE_URL` | — (required) | `postgres://…?sslmode=disable` |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `120` | per-IP |
| `OIDC_ISSUER_URI` | `http://localhost:8180/realms/aditi-stays` | `/api/admin/**` requires a JWT with the `admin` or `service` realm role |
| `OIDC_JWK_SET_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/certs` | where signing keys are actually fetched from — see the `KC_HOSTNAME` note above |

**CRM Service**

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8080` | |
| `DATABASE_URL` | — (required) | `postgres://…?sslmode=disable` |
| `REDIS_ADDR` | `localhost:6379` | |
| `REDIS_PASSWORD` / `REDIS_DB` | `""` / `0` | |
| `CATALOG_SERVICE_URL` | `http://localhost:8081` | validates properties, fetches browsing-history/wishlist for lead context |
| `CHAT_SERVICE_URL` | `http://localhost:8000` | proxies lead messages, fetches last-message previews (M2M JWT, see below) |
| `USER_CHAT_TOKEN_TTL_HOURS` | `720` (30 days) | bounded 1–8760 |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `120` | per-IP |
| `LEAD_RATE_LIMIT_PER_MINUTE` | `20` | per-IP on lead capture |
| `OIDC_ISSUER_URI` | `http://localhost:8180/realms/aditi-stays` | `/api/admin/**` requires a JWT with the `admin` or `service` realm role |
| `OIDC_JWK_SET_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/certs` | where signing keys are actually fetched from — see the `KC_HOSTNAME` note above |
| `OIDC_TOKEN_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/token` | where this service fetches its own M2M token from |
| `KEYCLOAK_CLIENT_SECRET` | `internal-service-secret-change-me` | client-credentials secret used to call chat-service's `/api/admin/**` |

**Chat Service** (selected)

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_PORT` | `8000` | |
| `DATABASE_URL` | — (required) | `postgresql+asyncpg://…` |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `CRM_SERVICE_URL` | `http://localhost:8080` | fetches customer name, confirms leads (M2M JWT, see below) |
| `MAX_UPLOAD_SIZE_MB` | `8` | payment-proof image cap |
| `BANNER_MAX_UPLOAD_SIZE_MB` | `120` | banner video cap |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `WHATSAPP_PROVIDER` | `stub` | `stub`, `twilio`, or `meta` |
| `ADMIN_CHAT_TOKEN` | — (required) | admin WebSocket connections only (unrelated to the JWT-based HTTP admin auth) |
| `OIDC_ISSUER_URI` | `http://localhost:8180/realms/aditi-stays` | admin HTTP endpoints require a JWT with the `admin` or `service` realm role |
| `OIDC_JWK_SET_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/certs` | where signing keys are actually fetched from — see the `KC_HOSTNAME` note above |
| `OIDC_TOKEN_URI` | `http://localhost:8180/realms/aditi-stays/protocol/openid-connect/token` | where this service fetches its own M2M token from |
| `KEYCLOAK_CLIENT_SECRET` | `internal-service-secret-change-me` | client-credentials secret used to call crm-service's `/api/admin/**` |

**Frontend**

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_GATEWAY_URL` | `http://localhost:8090` | |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | `ws://localhost:8090` | |
| `NEXTAUTH_URL` | `http://localhost:3000` | |
| `NEXTAUTH_SECRET` | — (required) | generate with `openssl rand -base64 32` |
| `KEYCLOAK_ISSUER` | `http://localhost:8180/realms/aditi-stays` | |
| `KEYCLOAK_CLIENT_ID` | `admin-dashboard` | |
| `KEYCLOAK_CLIENT_SECRET` | `admin-dashboard-secret-change-me` | must match `keycloak/realm-export.json`'s `admin-dashboard` client |
| `ADMIN_CHAT_TOKEN` | — (required) | must match chat-service's value; served to a signed-in admin session via `/api/admin/chat-token`, never bundled to the client |

## Product constraints implemented
- **Halal compliance:** no banking/riba/alcohol/gambling/music-party content in catalog.
- **Agent shield:** only masked property IDs (`AD-*`) are exposed.
- **Human-in-loop:** no auto-booking endpoint; all bookings are manual availability inquiries + chat follow-up.

## Security hardening
- Admin HTTP endpoints (`/api/admin/**`) require a Keycloak-issued JWT with the `admin` or
  `service` realm role — enforced at the gateway (defense in depth) and independently
  re-validated by each service (see [Authentication](#authentication-keycloak--oidc)).
- Admin websocket enforcement via `ADMIN_CHAT_TOKEN` (unchanged, unrelated to the JWT migration).
- Lead-scoped user chat authorization tokens signed with `USER_CHAT_TOKEN_SECRET` (30-day default TTL, configurable).
- Request rate limits on lead capture and chat HTTP APIs.
- CORS allowlist via `CORS_ALLOWED_ORIGINS`, centralized at the gateway (no wildcard required).
- Request IDs, security headers, and audit logs (own `audit_logs` table per service) for sensitive admin actions.
- Chat upload size/type enforcement and optional S3 object storage backend.
- Startup secret validation rejects empty, short, or placeholder secrets.

## Authentication (Keycloak / OIDC)
Admin authentication runs through a self-hosted Keycloak realm (`aditi-stays`,
pre-provisioned from the checked-in `keycloak/realm-export.json` — no manual setup):

- **`admin-dashboard`** client — confidential, authorization-code flow with PKCE. The
  frontend's `/admin` page redirects here via NextAuth (`next-auth`'s Keycloak provider);
  a seeded `admin`/`AdminPass123!` user carries the `admin` realm role for local dev/testing.
- **`internal-service`** client — confidential, client-credentials (M2M) flow. crm-service
  and chat-service each fetch a token for this client (cached and refreshed automatically,
  see `ServiceTokenProvider` in both services) to call each other's `/api/admin/**` endpoints,
  carrying the `service` realm role.
- Every service (`catalog-service`, `crm-service`, `chat-service`, `gateway`) is an OAuth2
  resource server: it validates the JWT's signature/issuer/expiry against Keycloak and requires
  the `admin` or `service` realm role for `/api/admin/**`. chat-service is the one exception —
  some of its `/api/chat/**` endpoints accept *either* an admin JWT *or* a per-lead user chat
  token on the same path, so its admin check happens in code (`ChatSecurity`) rather than as a
  blanket gateway rule.
- The admin WebSocket connection (chat notifications) is **not** part of this JWT migration —
  it still authenticates with the static `ADMIN_CHAT_TOKEN` secret, served to the frontend only
  after a valid NextAuth session is established (`GET /api/admin/chat-token`), never bundled
  into client-side JS directly.
- This replaces the old shared static `ADMIN_API_TOKEN` bearer scheme entirely for HTTP admin
  auth — there is no fallback to it, and pasting an arbitrary bearer token into the admin UI no
  longer works.

## Reliable event delivery
crm-service publishes lead lifecycle events (`lead_created`, `lead_resumed`, `inventory_status`,
`payment_received`, `lead_confirmed`) via the transactional outbox pattern instead of publishing
to Redis directly from the request thread: each business write and its event both land in the
same Postgres transaction (`outbox_events` table), and a background poller (`OutboxRelay`, every
500ms) publishes unpublished rows to Redis and marks them sent. This means a crash between "wrote
the lead" and "notified Redis" can't silently drop the event — the next poll (on restart, if the
process died) picks up any row still marked unpublished.

## Observability
- Metrics (Micrometer + Prometheus format) on all three services: `GET /actuator/prometheus`.
- Distributed tracing (Micrometer Tracing + OpenTelemetry, OTLP export) is enabled on all three
  services and fully automatic for HTTP calls (gateway/frontend → service, and the inter-service
  `RestClient` calls in Phase A). The one path that isn't auto-instrumented is the Redis-carried
  admin-notification event: crm-service embeds the current trace's `traceparent` into the outbox
  event JSON, and chat-service's `AdminNotificationsWebSocketHandler` extracts it to continue the
  same trace when relaying the notification.
- Set `OTLP_TRACING_ENDPOINT` to a Jaeger (or any OTLP-compatible) collector to view traces — the
  `docker compose` stack above includes one (`jaegertracing/all-in-one`, UI on `http://localhost:16686`).
  Without one configured, span export just logs a harmless connection-refused warning and the
  services otherwise run normally.

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
