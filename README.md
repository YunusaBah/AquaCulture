# AquaCulture

AquaCulture is a mobile-first aquaculture farm management platform designed for fish farming operations, field workflows, stock monitoring, task tracking, and owner-only financial oversight.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- Database: PostgreSQL + Prisma ORM
- Auth: JWT + bcrypt
- Mobile-first design for farmworkers and owner oversight

## Monorepo

- `apps/api` — REST API and Prisma schema
- `apps/web` — React front end

## Quick start

1. Install dependencies:
   `npm install`
2. Copy environment files:
   `cp .env.example .env`
3. Configure PostgreSQL and update `DATABASE_URL`.
4. Run Prisma setup:
   `npm run db:generate`
   `npm run db:push`
   `npm run db:seed`
5. Start the app:
   `npm run dev`

## Demo role logins

- Farm Owner: `owner@aquaculture.localapp` / `Owner7614091`
- farmworker: `worker@aquaculture.localapp` / `Worker5221`

The system enforces a strict two-role RBAC model: OWNER and WORKER. There is no separate system manager role in Prisma, the API, the UI, or the permission model.

this is the project design
## Product direction

The project is intentionally structured for multi-farm readiness, worker-only field operations, owner-only finance controls, and future offline synchronization with audit-safe record handling.

AquaCulture
```

## Slogan

```text
Smart Aquaculture. Smarter Decisions.
```

Alternative:

```text
Manage Every Pond. Monitor Every Fish.
```

---

## Primary Colors

```text
Ocean Blue
#1565C0
```

```text
Deep Navy
#0D47A1
```

```text
Fresh Green
#2E7D32
```

```text
Warning Orange
#F57C00
```

```text
Danger Red
#D32F2F
```

```text
Background
#F8FAFC
```

Dark Mode

```text
#0F172A
```

---

## Fonts

Heading

```text
Poppins
```

Body

```text
Inter
```

Numbers

```text
Roboto Mono
```

---

# AquaCulture Ecosystem

Instead of thinking about "one website," think about a complete platform.

```text
                    AquaCulture

        ┌────────────────────────────┐
        │        Web Application      │
        └─────────────┬──────────────┘
                      │
      ┌───────────────┼────────────────┐
      │               │                │
 Dashboard      REST API          Processing Engine
      │               │                │
      └───────────────┼────────────────┘
                      │
                 PostgreSQL
                      │
          Offline Synchronization
                      │
               Mobile PWA
```

---

# System Architecture

```text
Frontend (React)

↓

REST API (Express)

↓

Business Logic

↓

Prisma ORM

↓

PostgreSQL

↓

Cloud Backup
```

This is called a **layered architecture**, and it keeps the code organized and easy to maintain.

---

# Database Version 2.0

The schema you shared is a solid starting point. Here's how I would evolve it into an enterprise-grade design.

## Core Tables

```text
farms

farm_sites

ponds

fish_batches

users

roles

permissions

user_roles

farm_members
```

---

## Daily Operations

```text
feeding_logs

water_quality_logs

water_change_logs

mortality_logs

observation_logs

growth_sampling_logs
```

Notice I renamed many tables to `*_logs`. This makes it immediately clear they store historical records.

---

## Health

```text
diseases

treatments

vaccinations

lab_tests

medicine_inventory
```

---

## Inventory

```text
inventory

inventory_transactions

purchase_orders

suppliers

warehouses
```

---

## Finance

```text
expenses

income

budgets

sales

customers

invoices
```

---

## Production

```text
harvests

grading

packaging

transport

buyers
```

---


## Security

```text
audit_logs

login_history

notifications

attachments

device_sync

api_keys
```

---

# Dashboard

When Dr. Bah logs in, I imagine something like this:

```text
─────────────────────────────────────

Good Evening Dr. Bah
```


<!-- Project summary, technologies and deployment details added below -->

## How it works

AquaCulture is a monorepo with two apps:

- apps/api — Express + TypeScript REST API with Prisma ORM talking to PostgreSQL. It provides business logic, auth (JWT + bcrypt), and all data endpoints (ponds, feedings, water quality, mortality, harvests, inventory, tasks, finance).
- apps/web — React + Vite single-page app (TypeScript) that authenticates with the API and provides owner/worker UI. The web app stores a token in localStorage and supports an offline sync queue.

Workflow summary:

1. Owner creates farms, sites, and ponds via the web UI (or API). Ponds are shared (no per-worker assignment by default).
2. Workers record feeding, water, mortality and harvest events through the web UI; these POST to the API.
3. The API persists records in PostgreSQL via Prisma and emits notifications. A demo seed is available for local testing.
4. The frontend supports offline queuing for field work; queued entries are flushed when the device is online.

## Technologies used

- Node.js (Express + TypeScript)
- React + Vite + TypeScript for frontend
- Prisma ORM + PostgreSQL
- JWT for auth and bcrypt for password hashing
- Vite for dev server and build
- Docker-friendly: services are designed to be containerized

## Deployment (Render — recommended)

This project is ready to deploy on Render using the included Blueprint at `.render/render.yaml`. It provisions:
- `aquaculture-db` (managed PostgreSQL)
- `aquaculture-api` (Node web service)
- `aquaculture-web` (static site)

Deploy steps:

1. Sign in to https://render.com and create a new team or use your account (GitHub Student Pack credits may apply).
2. Create a new PostgreSQL Database (Managed) on Render.
3. Create a new Blueprint service in Render and point it to this repository (`.render/render.yaml`).
4. Render will build/start with:
   - API build: `npm ci && npm run db:generate -w @aquaculture/api && npm run build -w @aquaculture/api`
   - API start: `npm run db:migrate:deploy -w @aquaculture/api && npm run start -w @aquaculture/api`
   - Web build: `npm ci && npm run build -w @aquaculture/web`
   - Web publish dir: `apps/web/dist`
5. Confirm/set environment variables:
   - API: `DATABASE_URL` (from Render DB), `JWT_SECRET`, `CLIENT_URL`
   - Web: `VITE_API_URL` (example: `https://aquaculture-api.onrender.com/api`)
6. Deploy and validate the site. Optional seed step: `npm run db:seed -w @aquaculture/api`.

## Local development quickstart

1. npm install
2. copy .env.example to .env and configure DATABASE_URL locally
3. npm run db:generate -w @aquaculture/api
4. npm run db:push -w @aquaculture/api
5. npm run db:seed -w @aquaculture/api
6. npm run dev


## Infrastructure-as-code (Render)

A `.render/render.yaml` file is included to help Render create services and a managed Postgres instance when you connect the repo. Edit the YAML in the Render UI if you want custom plans, region, or env vars.


## Notes about GitHub Student Pack

GitHub Student Developer Pack can be used to obtain credits for Render or other hosting providers. Use those credits to provision the managed Postgres and web services. Render also integrates directly with GitHub for automatic deploys on push.


## License

(keep license details here)


## Contact

If you want automated deployment via GitHub Actions instead of connecting Render directly, use `.github/workflows/render-deploy.yml`. Add the following repository secrets in GitHub settings before pushing to main:

- RENDER_API_KEY — your Render API key (personal or service key)
- RENDER_SERVICE_ID_API — the Render service ID for the backend
- RENDER_SERVICE_ID_WEB — the Render service ID for the frontend

The workflow builds both packages and triggers a deploy for each service through the Render API.


## Finance


Farm Health

96%

─────────────────────────────────────

Today's Feed

146 kg

─────────────────────────────────────

Today's Mortality

2 Fish

─────────────────────────────────────

Water Tests

7 / 9 Completed

─────────────────────────────────────

Inventory

Feed Running Low

─────────────────────────────────────

Revenue This Month

D185,000

─────────────────────────────────────

Expenses

D92,000

─────────────────────────────────────

Profit

D93,000

─────────────────────────────────────

Pending Tasks

5

─────────────────────────────────────

```

---

# Worker Dashboard

This dashboard is intentionally simple because workers need speed in the field.

```text
Today's Tasks

Feed Pond 1

Feed Pond 4

Measure Pond 7

Replace Water Pond 3

────────────────────

My Assigned Ponds

1

3

4

7

────────────────────

Quick Actions

Feed Fish

Water Quality

Mortality

Take Photo

Report Problem

────────────────────

Pending Sync

2 Records
```

---

# Pond Screen

This is one of the most important pages.

```text
Pond 4

Species

Catfish

Current Population

4,520

──────────────────

Today's Feed

18kg

──────────────────

Water

Good

──────────────────

pH

7.3

──────────────────

Ammonia

0.02

──────────────────

Mortality Today

2

──────────────────

Growth

Healthy

──────────────────

Assigned Worker

Yunusa
```

From here, users can add a feeding, record a mortality, log water quality, upload a photo, or view the pond's history.

---


# Notifications

Examples of notifications:

```text
Task Assigned

Low Feed Inventory

High Mortality Alert

Low Oxygen Alert

Harvest Due

Worker Completed Task

Daily Summary Ready

Water Quality Critical

Offline Data Synced
```

---

# Git Workflow

Since you already use GitHub, let's organize development like a professional team.

## Main branch

```text
main
```

Always stable.

---

## Development branch

```text
develop
```

Where completed features are merged before going to `main`.

---

## Feature branches

```text
feature/authentication

feature/dashboard

feature/feeding

feature/water-quality

feature/mortality

feature/tasks

feature/inventory

feature/finance


feature/reports

feature/offline-sync
```

Each feature is developed independently and merged after testing.

---

# Development Roadmap

This is the roadmap I propose:

### Milestone 1

* Project setup
* PostgreSQL
* Prisma
* Authentication
* Roles and permissions

### Milestone 2

* Farms
* Sites
* Ponds
* Fish batches

### Milestone 3

* Feeding
* Water quality
* Mortality
* Tasks

### Milestone 4

* Inventory
* Finance
* Harvests
* Reports

### Milestone 5

* Offline mode
* Notifications

### Milestone 6

* Testing
* Performance tuning
* Deployment
* Documentation

---

## My recommendation before we write more code

The next thing I want to build is the **database model itself**—but not just the Prisma schema.

I want to design the **Entity Relationship Diagram (ERD)** first. It will show every table, every relationship, every foreign key, and every cardinality (one-to-many, many-to-many, etc.) visually.

Think of it as the blueprint of the entire system. Once the ERD is finalized, translating it into `schema.prisma` becomes straightforward, and we avoid costly redesigns later.

This is the same approach many professional software teams follow because it keeps the foundation solid before implementation. I think it's the best next step for AquaCulture.

---

# 10. Enterprise Dashboard Strategy

To make AquaCulture feel world-class, the UI should not be one generic dashboard. It should adapt to each role and workload.

## Owner Dashboard

Focus:

* Revenue
* Expenses
* Profit
* Farm health score
* Alerts across all farms
* Worker performance
* Monthly trends

## Administrator Dashboard

Focus:

* Pond status
* Daily feeding
* Water quality compliance
* Mortality alerts
* Inventory levels
* Task completion
* Uploads and offline sync

## Worker Dashboard

Focus:

* Today’s assigned tasks
* Quick record buttons
* Assigned ponds
* Pending sync items
* Photo upload
* Simple, large mobile-friendly controls

## Finance Dashboard

Focus:

* Expenses
* Income
* Purchases
* Sales
* Budget tracking
* Profit and loss
* Export-ready reports

## Inventory Dashboard

Focus:

* Stock levels
* Low-stock alerts
* Usage trends
* Purchase orders
* Supplier activity
* Consumption by farm and pond

## Insights Dashboard

Focus:

* Risk warnings
* Suggested actions
* Disease guidance
* Feeding recommendations
* Water quality interpretation

## System Admin Dashboard

Focus:

* Users
* Roles
* Permissions
* Audit logs
* Sync health
* API activity
* Feature flags

---

# 12. World-Standard Product Direction

If we build AquaCulture correctly, it should feel like an enterprise platform from day one:

* Role-based dashboards
* Mobile-first PWA
* Offline capture and auto-sync
* Strong audit logging
* Real-time notifications
* Structured reports
* Multi-farm support
* Clean design system
* Scalable database design

That means the next implementation step is not random UI pages. It is:

1. Finalize the ERD
2. Confirm dashboard roles and widgets
3. Define the provider abstraction
4. Then build the frontend and APIs from that blueprint


this is my project build it to its standard