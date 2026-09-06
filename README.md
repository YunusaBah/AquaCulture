# AquaSphere

AquaSphere is a mobile-first aquaculture farm management platform designed for fish farming operations, field workflows, stock monitoring, task tracking, and owner-only financial oversight.

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

AquaSphere
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

# AquaSphere Ecosystem

Instead of thinking about "one website," think about a complete platform.

```text
                    AquaSphere

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

This is the same approach many professional software teams follow because it keeps the foundation solid before implementation. I think it's the best next step for AquaSphere.

---

# 10. Enterprise Dashboard Strategy

To make AquaSphere feel world-class, the UI should not be one generic dashboard. It should adapt to each role and workload.

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

If we build AquaSphere correctly, it should feel like an enterprise platform from day one:

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