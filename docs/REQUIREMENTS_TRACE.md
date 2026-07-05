# Aditi Stays Requirement Traceability

## 1) Iron Rules
- Agent Shield:
  - Public catalog uses masked property IDs (`AD-*`) as display identity.
  - Implemented in core service masking logic and seeded data IDs.
- Human-in-the-loop booking:
  - No instant-book endpoint exists.
  - Flow is lead creation -> admin inventory check -> chat/payment -> admin confirmation.

## 2) User Journey
- Discovery and browsing tracking:
  - Property listing endpoint + browsing history endpoint implemented.
- Wishlist + comparison:
  - Wishlist add/remove/list and comparison endpoints implemented.
- Lead capture + compliance:
  - `check-availability` requires name/mobile/disclaimer acceptance.
  - Compliance notice returned in response payload.
  - Lead creation publishes realtime event over Redis to admin notifications websocket.
- Conversational transaction:
  - Realtime websocket chat per lead.
  - Admin GPay share API posts QR + number in chat.
  - Proof upload API posts payment screenshot in chat.
  - Confirm API posts confirmation in chat and triggers WhatsApp provider integration.

## 3) Admin Operations
- Active lead dashboard:
  - Admin APIs for active leads and lead context.
  - Context includes browsing history + wishlist for negotiation support.
- Inventory check:
  - Manual inventory status endpoint with admin note.
- Analytics:
  - Daily inquiries/bookings and advance/full payment totals.
- Conflict resolution:
  - Chat logs stored in `chat_messages`.
  - Admin actions stored in `audit_logs`.

## 4) Technical Architecture
- Frontend:
  - Next.js + Tailwind with catalog, wishlist, comparison, lead modal, chat, admin CRM.
  - Hero video runs muted autoplay.
- Core API:
  - Java (Spring Boot) service with listings, lead management, analytics, redis notifications.
- Chat Service:
  - Java (Spring Boot) + websockets + upload support.
  - Upload guardrails and optional S3 backend.
- Redis + PostgreSQL:
  - Redis event channels + active lead set.
  - PostgreSQL schema for all operational entities, self-bootstrapped by the
    core API on startup (`EnsureSchema`), so no external migration step is needed.
- Deployment:
  - Infrastructure, CI/CD, and container orchestration are managed outside this
    repository by the DevOps team.
