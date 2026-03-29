# API Endpoints

## Core API (Go)
Base: `http://localhost:8080`

- `GET /health`
- `GET /metrics`
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
- `POST /api/leads/check-availability`

Admin:
- Requires `Authorization: Bearer <ADMIN_API_TOKEN>` and optional `X-Admin-Actor`.
- `GET /api/admin/leads/active`
- `GET /api/admin/leads/all?limit=200`
- `GET /api/admin/leads/:leadId`
- `GET /api/admin/leads/:leadId/context`
- `GET /api/admin/leads/:leadId/messages`
- `POST /api/admin/properties`
- `GET /api/admin/properties`
- `PUT /api/admin/properties/:id`
- `DELETE /api/admin/properties/:id`
- `POST /api/admin/leads/:leadId/inventory-check`
- `POST /api/admin/leads/:leadId/payment`
- `POST /api/admin/leads/:leadId/confirm`
- `GET /api/admin/analytics/daily`
- `GET /api/admin/analytics/summary`
- `GET /api/admin/banners`
- `POST /api/admin/banners`
- `PUT /api/admin/banners/:bannerId`
- `DELETE /api/admin/banners/:bannerId`

## Chat Service (FastAPI)
Base: `http://localhost:8000`

- `GET /api/health`
- `GET /api/metrics`
- `GET /api/chat/:lead_id/messages` (requires `X-Chat-Token` for user or admin bearer token)
- `POST /api/chat/:lead_id/share-gpay` (admin auth required)
- `POST /api/chat/:lead_id/upload-proof` (multipart file, requires `X-Chat-Token` for user or admin bearer token)
- `POST /api/chat/:lead_id/confirm` (admin auth required)
- `POST /api/chat/:lead_id/auto-intro` (requires `X-Chat-Token`)

WebSockets:
- `/ws/chat/{lead_id}?role=user|admin&actor=...&token=...` (`ADMIN_CHAT_TOKEN` for admin role; lead-scoped user chat token for user role)
- `/ws/admin/notifications?token=<ADMIN_CHAT_TOKEN>`
