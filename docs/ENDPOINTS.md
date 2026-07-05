# API Endpoints

The frontend/browser only ever talks to the **Gateway** (`http://localhost:8090`), which routes
every path below to the right service (see `gateway/src/main/resources/application.yml`). The
per-service base URLs below are for direct service-to-service calls and local debugging.

## Catalog Service (Java / Spring Boot)
Base: `http://localhost:8081`

- `GET /health`
- `GET /actuator/prometheus`
- `GET /api/properties`
- `GET /api/properties/feedback-summary`
- `GET /api/properties/:id`
- `GET /api/properties/:id/feedback`
- `POST /api/properties/:id/feedback`
- `GET /api/banners`
- `POST /api/browsing-history`
- `GET /api/browsing-history/:visitorId`
- `POST /api/wishlist/items`
- `DELETE /api/wishlist/items?visitor_id=...&property_id=...`
- `GET /api/wishlist/:visitorId`
- `POST /api/comparisons`

Admin:
- Requires `Authorization: Bearer <keycloak-jwt>` (admin/service realm role) and optional `X-Admin-Actor`.
- `POST /api/admin/properties`
- `GET /api/admin/properties`
- `PUT /api/admin/properties/:id`
- `DELETE /api/admin/properties/:id`
- `GET /api/admin/banners`
- `POST /api/admin/banners`
- `PUT /api/admin/banners/:bannerId`
- `DELETE /api/admin/banners/:bannerId`

## CRM Service (Java / Spring Boot)
Base: `http://localhost:8080`

- `GET /health`
- `GET /actuator/prometheus`
- `POST /api/leads/check-availability` (validates the property against catalog-service before creating the lead)

Admin:
- Requires `Authorization: Bearer <keycloak-jwt>` (admin/service realm role) and optional `X-Admin-Actor`.
- `GET /api/admin/leads/active`
- `GET /api/admin/leads/all?limit=200` (last-message preview is fetched in bulk from chat-service)
- `GET /api/admin/leads/:leadId`
- `GET /api/admin/leads/:leadId/context` (browsing-history/wishlist fetched from catalog-service)
- `GET /api/admin/leads/:leadId/messages` (proxies to chat-service)
- `POST /api/admin/leads/:leadId/inventory-check`
- `POST /api/admin/leads/:leadId/payment`
- `POST /api/admin/leads/:leadId/confirm`
- `GET /api/admin/analytics/daily`
- `GET /api/admin/analytics/summary`

## Chat Service (Java / Spring Boot)
Base: `http://localhost:8000`

- `GET /api/health`
- `GET /actuator/prometheus`
- `GET /api/chat/:lead_id/messages` (requires `X-Chat-Token` for user or admin bearer token)
- `POST /api/chat/:lead_id/share-gpay` (admin auth required)
- `POST /api/chat/:lead_id/upload-proof` (multipart file, requires `X-Chat-Token` for user or admin bearer token; fetches the customer's name from crm-service)
- `POST /api/chat/:lead_id/confirm` (admin auth required; confirms the lead via crm-service)
- `POST /api/chat/:lead_id/auto-intro` (requires `X-Chat-Token`)

Admin (internal, used by crm-service):
- `GET /api/admin/chat/last-messages?leadIds=1,2,3` — bulk last-message-per-lead lookup for the admin leads list preview.

WebSockets:
- `/ws/chat/{lead_id}?role=user|admin&actor=...&token=...` (`ADMIN_CHAT_TOKEN` for admin role; lead-scoped user chat token for user role)
- `/ws/admin/notifications?token=<ADMIN_CHAT_TOKEN>`
