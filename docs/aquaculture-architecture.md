# AquaSphere Architecture Blueprint

## Product Standard

AquaSphere is a role-based aquaculture operations platform for multi-farm management, pond monitoring, field tasks, inventory, finance, offline synchronization, and human-approved AI assistance.

Primary slogan: Smart Aquaculture. Smarter Decisions.

## Layered Architecture

```text
React PWA
  -> REST API
  -> Business logic
  -> Prisma ORM
  -> PostgreSQL
  -> Backup and sync services
```

The frontend should remain role-aware, mobile-first, and optimized for repeated field workflows. The API should keep farm records structured and auditable. AI output should always be stored as first-class records and require human review before farm actions are taken.

## Core ERD

```mermaid
erDiagram
  User ||--o{ Session : owns
  Role ||--o{ User : assigned_to
  User ||--o{ Farm : owns
  User }o--o{ Farm : member_of
  Farm ||--o{ FarmSite : contains
  FarmSite ||--o{ Pond : contains
  FishBatch ||--o{ Pond : stocked_in
  User ||--o{ Pond : assigned_to

  Pond ||--o{ FeedingLog : records
  Pond ||--o{ WaterQualityLog : records
  Pond ||--o{ MortalityLog : records
  User ||--o{ FeedingLog : creates
  User ||--o{ WaterQualityLog : creates
  User ||--o{ MortalityLog : creates

  InventoryItem ||--o{ InventoryTransaction : tracks
  User ||--o{ Task : creates
  Task ||--o{ TaskAssignment : assigns
  User ||--o{ TaskAssignment : receives
  Task ||--o{ TaskComment : discusses
  User ||--o{ Notification : receives

  AiConversation ||--o{ AiMessage : contains
  AiConversation ||--o{ AiReport : summarizes
  User ||--o{ AiConversation : starts
  User ||--o{ AiReport : reviews
  MortalityLog ||--o{ AiReport : may_trigger

  Pond ||--o{ Attachment : has
  FeedingLog ||--o{ Attachment : has
  MortalityLog ||--o{ Attachment : has
  Task ||--o{ Attachment : has
  User ||--o{ AuditLog : performs
```

## Dashboard Roles

Owner dashboard: revenue, expenses, profit, farm health score, AI summaries, alerts across all farms, worker performance, monthly trends.

Worker dashboard: today's tasks, quick records, assigned ponds, pending sync, photo upload, problem reporting.

Finance dashboard: expenses, income, purchases, sales, budgets, profit and loss, export-ready reports.

Inventory dashboard: stock levels, low-stock alerts, usage trends, purchase orders, supplier activity, consumption by farm and pond.

AI dashboard: summaries, risk warnings, suggested actions, disease guidance, feeding recommendations, water quality interpretation.

System management is handled by the Farm Owner in this version. Workers do not get management screens.

## AI Provider Boundary

The API should expose a provider layer instead of tying the product to one model.

```text
AiProvider
  generateObservationSummary(input)
  interpretWaterQuality(input)
  draftDailyReport(input)
  recommendActions(input)
```

Provider targets:

- `local-ollama` for free/offline self-hosted inference.
- `groq` for fast hosted inference.
- `huggingface` for fallback hosted models.
- `openai-compatible` for future providers using a common HTTP shape.

AI must not automatically mutate farm records, delete history, make veterinary decisions, or bypass manager approval.

## Next Build Order

1. Add offline synchronization tables: device sync, sync queue, conflict records.
2. Add worker field forms for feeding, mortality, water level, and photo upload.
3. Add report exports for finance, pond performance, feed usage, and worker activity.
4. Add PWA service worker and local draft storage for workers.
5. Add owner-controlled user approval and worker account management.
