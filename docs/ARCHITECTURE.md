# Aditi Stays Architecture

## Product guardrails
- Halal policy enforced in core catalog responses.
- Agent shield by exposing only property IDs (`AD-*`) publicly.
- No instant booking APIs; only manual inquiry -> admin-assisted conversion.

## Services
- **Frontend (Next.js + Tailwind)**
  - Catalog browsing, wishlist, comparison engine.
  - Visitor-facing feedback capture + rating summary per property.
  - Floating chat popup that opens immediately after lead capture.
  - Configurable Instagram/YouTube campaign banner rail.
  - Lead capture form with required compliance disclaimer.
  - User chat experience and payment proof upload.
  - Admin CRM dashboard with operational controls.

- **Core API (Go)**
  - Property feed, browsing history, wishlist, comparisons.
  - Lead capture and admin workflows.
  - Analytics (inquiries vs bookings, advance/full payments).
  - Redis publish for inquiry notifications.
  - Admin token auth, request IDs, rate limits, audit logs, and `/metrics`.

- **Chat Service (FastAPI + WebSockets)**
  - Realtime chat rooms per lead.
  - Admin notification websocket.
  - GPay detail sharing and payment screenshot upload.
  - Confirmation broadcast + WhatsApp integration stub.
  - Provider-backed WhatsApp (Twilio/Meta via env).
  - Chat logs persisted for audit/training.
  - Admin websocket token checks and `/api/metrics`.

- **State Store (Redis)**
  - Active chat sessions and event fanout.
  - Terraform-managed ElastiCache replication group output for production wiring.

- **Database (PostgreSQL / RDS)**
  - Listings, leads, payments, browsing, wishlist, chat logs.
  - Payment proof metadata (object URLs) for audit/training trails.

- **Object Storage (Optional S3 backend)**
  - Chat payment screenshot files can be stored in S3 via `STORAGE_BACKEND=s3`.
  - Local filesystem mode retained for local/dev usage.

## Deployment chain
1. Terraform provisions VPC + RDS + Redis + S3 + EC2 nodes for a kubeadm-based Kubernetes cluster.
2. GitHub Actions builds images and pushes to ECR.
3. Workflow updates K8s manifests with image tags.
4. ArgoCD detects git changes and syncs to the cluster.

## Disaster recovery design
- One-command infrastructure + app sync (`scripts/recover.sh`).
- Recovery objective under 6 minutes depends on:
  - Prebuilt Ubuntu node baseline via Terraform user data.
  - Cached container layers in ECR.
  - Pre-provisioned IAM and DNS zones.

## Monitoring
- `infra/monitoring/prometheus-rules.yaml`
- `infra/monitoring/service-monitors.yaml`
- `infra/monitoring/alertmanager-config.yaml`
