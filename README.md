# Delhi Accountability Monitoring System (DAMS)

A full-stack GovTech accountability command deck and multi-persona simulator designed for civic transparency, real-time spatiotemporal anomaly tracking, and automated SLA compliance loops.

---

## Quick Start

Deploy the full local microservice ecosystem, start the persistent database network, and inject high-density transactional seed data with the commands below.

### 1. Boot the Containerized Infrastructure

From the repository root, start the PostgreSQL database and FastAPI backend containers:

```bash
docker-compose up -d --build
```

### 2. Inject High-Density Telemetry Seeds

Load the operational transactional seed data, including 15 PWD SLA breaches and 55 DJB cluster surge records:

```bash
docker-compose exec backend python seed.py
```

### 3. Launch the Local Client Interface

Open a separate terminal window, move into the frontend workspace, install the client dependencies, and start the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to access the live command center.

---

## System Architecture and Data Topology

The application is engineered as a decoupled, multi-tier transactional network built to handle high-density civic grievance inflow.

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend Client | React, Vite, Tailwind CSS, PostCSS | Minimalist SPA with live state synchronization and a triple-persona workspace: Citizen Portal, Field Operations, and CM Command Deck. |
| Backend REST API | FastAPI, Pydantic | High-performance routing engine with validation schemas, dependency-injected database sessions, and explicit CORS security layers. |
| Persistent Storage | PostgreSQL 15, SQLAlchemy | Relational persistence with indexed models, foreign keys, and transactional grievance state. |
| Asynchronous Daemon | FastAPI background thread | Runs the `run_sla_compliance_monitor` loop to evaluate transactional metadata and escalate breached SLA deadlines. |

---

## Core Engineering Features

### 1. Spatiotemporal Deduplication Engine

Incoming citizen grievances skip standard administrative delay pipelines through an autonomous algorithmic triage process. The platform establishes a 50-meter spatiotemporal bounding box using the Haversine formula across incoming latitude and longitude coordinates:

$$
d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)
$$

If an incoming ticket overlaps with an active, unresolved complaint in that spatial envelope within a rolling 14-day window, the system registers a duplicate, increments localized counter parameters, and automatically steps up ticket priority metrics.

### 2. Proactive Executive Cluster Surge Tracking

If overlapping neighborhood anomalies scale beyond a critical volume threshold of 50 or more overlapping tracking entries within a single ward over 7 days, the aggregation engine triggers an emergency alert marker.

This produces a high-visibility amber warning banner on the CM Command Deck, allowing administrative supervisors to intercept infrastructure failures before they spread.

### 3. Automated Closed-Loop SLA Escalation

Grievance lifecycles are bound to explicit, subcategory-specific target windows. If a field queue item breaches its target date parameters, the asynchronous background daemon automatically intervenes by:

- Scaling the ticket priority permanently to `Critical`.
- Appending automated log indicators inside the `grievance_logs` table.
- Firing administrative notifications that track compliance failures for district-level review.

---

## API Routing Blueprints

The interactive Swagger documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs) when the backend container is running.

| Method | Endpoint | Access Role | Operational Target |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/otp` | Citizen | Evaluator single-token bypass login using `1234`. |
| `POST` | `/api/v1/auth/login` | Staff / Admin | Administrative credentials validation check. |
| `POST` | `/api/v1/grievances/intake` | Citizen | Form ingestion with spatiotemporal triage. |
| `GET` | `/api/v1/officer/{id}/queue` | Field Crew | Fetches active unresolved ward queue items. |
| `POST` | `/api/v1/grievances/{id}/resolve` | Field Crew | Evidence-enforced ticket resolution updates. |
| `POST` | `/api/v1/grievances/{id}/reopen` | Citizen | Citizen veto path to reopen resolved entries. |
| `GET` | `/api/v1/admin/executive-alerts` | CM Office | Real-time telemetry feed and compliance rates. |

---

## Repository File Topology

```text
delhi-grievance-dashboard/
├── docker-compose.yml           # Unified multi-container orchestration manifest
├── README.md                    # System architecture guide and documentation
├── backend/                     # Python microservice core
│   ├── Dockerfile               # Slim service container environment layer
│   ├── requirements.txt         # Service dependency manifest
│   ├── database.py              # Connection pool configuration and SessionLocal generators
│   ├── models.py                # Relational schemas, indices, and database model definitions
│   ├── main.py                  # API router definitions and background monitoring threads
│   └── seed.py                  # High-density transactional anomaly injection seeder
└── frontend/                    # React UI client workspace
    ├── index.html               # App viewport structure base
    ├── package.json             # Node library module registry
    ├── tailwind.config.js       # Tailwind template scanning configuration
    ├── postcss.config.js        # PostCSS compiler plugin map
    └── src/
        ├── main.jsx             # React virtual DOM mount point
        ├── index.css            # Root Tailwind CSS layout directives
        └── App.jsx              # Master integrated multi-persona view logic
```
