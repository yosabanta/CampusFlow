# CampusFLow — Unified Campus Operations Platform

**BPUT Hackathon 2026 &bull; Problem Statement 07 (Fretbox)**  
*Attendance, Mess, Hostel, Repeat: Campus Life, Debugged*

---

## 1. Overview & Purpose
CampusFLow is a streamlined, low-bandwidth campus operations platform designed to eliminate paper registers, chaotic WhatsApp groups, physical queues, and outdated physical notice boards across university campuses.

This repository contains the **Hackathon MVP**, architected as a high-cohesion **Modular Monolith** optimized for fast execution, rock-solid demo reliability, and low data payloads (<180 KB budget) on campus 2G/3G networks.

---

## 2. Technology Stack

### Frontend
* **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+ native modules)
* **Design System:** Custom CSS tokens (Signal Blue `#0057FF`, Porcelain `#F8F7F4`, Graphite `#0B0F19`, Lime Spark `#B6FF2E`)
* **Client Architecture:** Zero frameworks (no React/Next/Vue/Angular), zero build step required.

### Backend
* **Language & Framework:** Python 3.11+ with FastAPI & Uvicorn
* **Data Validation:** Pydantic v2 & Pydantic Settings
* **Database & ORM:** Neon Serverless PostgreSQL 16 with SQLAlchemy 2.0 & Alembic
* **Background Tasks:** Native FastAPI `BackgroundTasks` (zero Celery/Redis dependencies)

---

## 3. Project Directory Structure

```text
MVP/
├── backend/
│   ├── app/
│   │   ├── core/           # Configuration, security, database sessionmaker
│   │   ├── models/         # SQLAlchemy 2.0 ORM entity models
│   │   ├── schemas/        # Pydantic v2 request/response schemas
│   │   ├── routers/        # FastAPI APIRouters (/api/v1/)
│   │   ├── services/       # Domain business logic & triage heuristics
│   │   ├── utils/          # PDF generator, Segno QR, SMS provider, file storage
│   │   └── main.py         # Application entrypoint & exception handlers
│   ├── alembic/            # Database migration environment
│   ├── uploads/            # Local storage for photos, certificates, materials
│   ├── tests/              # Pytest test suite
│   ├── requirements.txt    # Pinned dependencies
│   ├── alembic.ini         # Alembic configuration
│   └── .env.example        # Environment variable template
│
├── frontend/
│   ├── index.html          # Semantic HTML5 application entrypoint
│   ├── css/
│   │   └── base.css        # Design tokens, reset, themes, layout
│   └── js/
│       └── app.js          # Native ES6+ module with health check
│
├── README.md               # This project documentation
└── .gitignore              # Git ignore rules
```

---

## 4. Prerequisites
* **Python:** Python 3.11+ (Python 3.14 compatible)
* **PostgreSQL:** Neon Serverless PostgreSQL database (or local PostgreSQL)
* **Web Browser:** Any modern evergreen browser (Chrome, Edge, Firefox, Safari)

---

## 5. Local Setup & Configuration

### Step 1: Install Dependencies
From the repository root, install the required Python packages:
```bash
pip install -r backend/requirements.txt
```

### Step 2: Configure Environment Variables
Copy the `.env.example` template to `.env` inside `backend/`:
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` with your Neon PostgreSQL connection string:
```ini
DATABASE_URL=postgresql+psycopg2://<user>:<password>@<neon-host>/<dbname>?sslmode=require
JWT_SECRET=your_jwt_secret_key_here
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000
```

---

## 6. Running the Application

### Launch Backend Server
From the `backend/` directory:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```
The FastAPI interactive documentation will be available at:
* Swagger UI: `http://localhost:8000/docs`
* ReDoc: `http://localhost:8000/redoc`

### Launch Frontend Client
From the `frontend/` directory, launch a lightweight static web server:
```bash
cd frontend
python -m http.server 3000
```
Open `http://localhost:3000` in your web browser. The frontend will automatically probe `http://localhost:8000/health` and display **"Backend Connected"** with live telemetry.

---

## 7. Verifying System Health

### Command Line Health Check
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{
  "status": "ok",
  "app": "CampusFLow",
  "version": "1.0.0",
  "database": {
    "connected": true,
    "engine": "postgresql",
    "message": "Database connection successful"
  }
}
```

### Running Automated Foundation Tests
From the project root:
```bash
python -m pytest backend/tests
```
All 7 foundation test cases will execute and validate:
1. Pydantic settings loading and CORS origins parsing
2. Root `GET /` endpoint
3. System `GET /health` endpoint
4. Standardized 404 error handler
5. SQLAlchemy declarative Base metadata
6. In-memory database query execution
7. Unreachable database graceful error degradation
