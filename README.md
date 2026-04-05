# Digital Twin of Locomotive

Real-time locomotive health monitoring system for KTZ (Kazakhstan Railways) Hackathon 2026.

## Architecture

```
┌─────────────┐    ┌───────────┐    ┌──────────────┐    ┌─────────────┐
│  Simulator   │───▶│   Redis   │───▶│   FastAPI    │───▶│ TimescaleDB │
│  (Python)    │    │  Queue    │    │   Backend    │    │  (Postgres) │
│  1Hz/loco    │    │  :6379    │    │   :8000      │    │   :5432     │
└─────────────┘    └───────────┘    └──────┬───────┘    └─────────────┘
                                           │ WebSocket
                                           ▼
                                    ┌──────────────┐
                                    │   Next.js    │
                                    │   Frontend   │
                                    │   :3000      │
                                    └──────────────┘
```

**Data Flow:**
- **Simulator** → Redis Queue → **FastAPI** (validate, smooth, compute HI) → **TimescaleDB**
- **FastAPI** (WebSocket) → **Browser** (real-time updates at 1Hz)
- **Browser** → **FastAPI** (REST API) → **TimescaleDB** (historical queries)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Next.js 16, Tailwind CSS, shadcn/ui, ECharts, Leaflet |
| Backend | Python 3.11, FastAPI (async), structlog (JSON) |
| Queue | Redis 7 |
| Database | TimescaleDB (PostgreSQL + hypertables) |
| Auth | JWT (bcrypt password hashing) |
| Realtime | WebSocket (1Hz telemetry streaming) |
| Infrastructure | Docker Compose |

## Quick Start

### Prerequisites
- Docker & Docker Compose

### Launch

```bash
git clone <repo-url>
cd KTZ
cp .env.example .env
docker-compose up --build -d
```

Wait ~30 seconds for all services to start, then open:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Demo Credentials

| Username | Password | Role | Access |
|----------|----------|------|--------|
| admin | admin123 | Admin | Full access + Admin panel |
| dispatcher | disp123 | Dispatcher | Dashboard, Alerts, Trends, Map, Replay |
| cabin | cabin123 | Cabin | Simplified cabin display |

## Features

### Health Index (0-100)
- **Hierarchical calculation**: Parameters → Subsystems → Global HI
- **Normalization**: Safe zone (1.0), Warning zone (linear decay), Critical (0.0)
- **Alert penalties**: Active alerts reduce subsystem scores
- **Top-5 factors**: Explainability — which parameters contribute most to degradation
- **Categories**: Normal (70-100), Attention (40-69), Critical (0-39)

### Supported Locomotives
- **KZ8A** — Electric locomotive (25kV AC, 4 traction motors)
- **TE33A** — Diesel-electric (GEVO12 engine, fuel monitoring)

Each has its own configuration profile with parameters, thresholds, and subsystem weights.

### Screens

| Screen | Description |
|--------|------------|
| **Dashboard** | Health Index gauge, subsystem cards, top factors, alerts feed |
| **Alerts** | Full alert table with filters, acknowledge, annotations |
| **Trends** | Real-time ECharts graphs (speed, temperature, pressure, HI) |
| **Map** | Leaflet route map (Astana-Karaganda), locomotive marker |
| **Replay** | Historical playback with timeline scrubber, Play/Pause/Speed |
| **Admin** | Simulation control, user management, data export |
| **Cabin** | Simplified high-contrast display for in-cab use |

### Emergency Scenarios
Controllable via Admin panel or API:
- **Overheat** — Gradual temperature drift (2 min)
- **Electrical Fault** — Instant voltage drop
- **Highload Burst** — 10Hz message rate (30s)
- **Connection Loss** — 12s silence

### API
- 19 REST endpoints documented at `/docs` (Swagger/OpenAPI)
- WebSocket: `ws://localhost:8000/ws/telemetry/{loco_id}?token=...`
- Export: CSV and PDF reports

## Data Pipeline

1. Simulator generates telemetry at 1Hz per locomotive
2. JSON messages pushed to Redis queue (LPUSH)
3. Ingest worker: BRPOP → validate → deduplicate → filter outliers → EMA smooth (α=0.3)
4. Write to `telemetry_raw` hypertable
5. Compute Health Index → write to `health_index_history`
6. Check thresholds → generate alerts
7. Broadcast via WebSocket to connected clients

## Database Schema

- `telemetry_raw` — Hypertable, 1h chunks, 72h retention
- `health_index_history` — Hypertable, 1h chunks, 72h retention
- `alerts` — Alert records with acknowledge/annotate
- `loco_config` — JSONB configuration per locomotive type
- `users` — Auth with bcrypt hashed passwords

## Project Structure

```
KTZ/
├── docker-compose.yml
├── .env.example
├── db/init.sql                 # Schema + seed data
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app
│       ├── config.py           # Settings
│       ├── api/                # REST endpoints
│       ├── auth/               # JWT auth
│       ├── db/                 # Database connection
│       ├── services/           # HI engine, alerts, ingest
│       └── ws/                 # WebSocket manager
├── simulator/
│   ├── Dockerfile
│   ├── main.py                 # Telemetry generator
│   ├── loco_profiles/          # KZ8A.json, TE33A.json
│   └── scenarios/              # YAML emergency scenarios
└── frontend/
    ├── Dockerfile
    ├── src/
    │   ├── app/                # Next.js pages
    │   ├── components/         # UI components
    │   ├── stores/             # Zustand state
    │   ├── hooks/              # WebSocket hook
    │   └── lib/                # API client
    └── public/routes/          # GeoJSON route data
```
