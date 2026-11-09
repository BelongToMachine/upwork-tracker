from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("UPWORK_DATA_DIR", Path(__file__).resolve().parent / "data")).expanduser()
DB_PATH = Path(os.environ.get("UPWORK_DB_PATH", DATA_DIR / "upwork.db")).expanduser()
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
DATA_DIR.mkdir(parents=True, exist_ok=True)

ApplicationStatus = Literal[
    "saved",
    "preparing",
    "applied",
    "replied",
    "interviewing",
    "hired",
    "rejected",
    "withdrawn",
    "archived",
]
PaymentType = Literal["hourly", "fixed"]


class JobInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = ""
    payment_type: PaymentType = "fixed"
    pay_min: float | None = Field(default=None, ge=0)
    pay_max: float | None = Field(default=None, ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    proposals_count: int | None = Field(default=None, ge=0)
    interviewing_count: int | None = Field(default=None, ge=0)
    posted_at: str | None = None
    posted_label: str | None = None
    interest: int | None = Field(default=None, ge=1, le=5)
    application_status: ApplicationStatus = "saved"
    source_url: str | None = None
    notes: str = ""

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("posted_at", "posted_label", "source_url", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def validate_pay_range(self) -> "JobInput":
        if self.pay_min is not None and self.pay_max is not None and self.pay_min > self.pay_max:
            raise ValueError("pay_min must be less than or equal to pay_max")
        return self


class JobRecord(JobInput):
    id: str
    created_at: str
    updated_at: str


class ImportResult(BaseModel):
    imported: int


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize_db() -> None:
    with connect_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                payment_type TEXT NOT NULL DEFAULT 'fixed' CHECK (payment_type IN ('hourly', 'fixed')),
                pay_min REAL,
                pay_max REAL,
                currency TEXT NOT NULL DEFAULT 'USD',
                proposals_count INTEGER,
                interviewing_count INTEGER,
                posted_at TEXT,
                posted_label TEXT,
                interest INTEGER CHECK (interest IS NULL OR interest BETWEEN 1 AND 5),
                application_status TEXT NOT NULL DEFAULT 'saved',
                source_url TEXT,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(application_status)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at)")


def row_to_job(row: sqlite3.Row) -> dict[str, object]:
    return dict(row)


def insert_job(db: sqlite3.Connection, job: JobInput, job_id: str | None = None) -> dict[str, object]:
    created_at = now_iso()
    record = job.model_dump()
    record.update({"id": job_id or str(uuid.uuid4()), "created_at": created_at, "updated_at": created_at})
    db.execute(
        """
        INSERT INTO jobs (
            id, title, description, payment_type, pay_min, pay_max, currency,
            proposals_count, interviewing_count, posted_at, posted_label, interest,
            application_status, source_url, notes, created_at, updated_at
        ) VALUES (
            :id, :title, :description, :payment_type, :pay_min, :pay_max, :currency,
            :proposals_count, :interviewing_count, :posted_at, :posted_label, :interest,
            :application_status, :source_url, :notes, :created_at, :updated_at
        )
        """,
        record,
    )
    return record


initialize_db()

app = FastAPI(title="Upwork Tracker API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/jobs", response_model=list[JobRecord])
def list_jobs() -> list[dict[str, object]]:
    with connect_db() as db:
        rows = db.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [row_to_job(row) for row in rows]


@app.post("/api/jobs", response_model=JobRecord, status_code=201)
def create_job(job: JobInput) -> dict[str, object]:
    with connect_db() as db:
        return insert_job(db, job)


@app.put("/api/jobs/{job_id}", response_model=JobRecord)
def update_job(job_id: str, job: JobInput) -> dict[str, object]:
    with connect_db() as db:
        existing = db.execute("SELECT created_at FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Job not found")
        record = job.model_dump()
        record.update({"id": job_id, "created_at": existing["created_at"], "updated_at": now_iso()})
        db.execute(
            """
            UPDATE jobs SET
                title=:title, description=:description, payment_type=:payment_type,
                pay_min=:pay_min, pay_max=:pay_max, currency=:currency,
                proposals_count=:proposals_count, interviewing_count=:interviewing_count,
                posted_at=:posted_at, posted_label=:posted_label, interest=:interest,
                application_status=:application_status, source_url=:source_url,
                notes=:notes, updated_at=:updated_at
            WHERE id=:id
            """,
            record,
        )
    return record


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str) -> Response:
    with connect_db() as db:
        result = db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Job not found")
    return Response(status_code=204)


@app.post("/api/import/json", response_model=ImportResult)
def import_json(jobs: list[JobInput]) -> ImportResult:
    with connect_db() as db:
        for job in jobs:
            insert_job(db, job)
    return ImportResult(imported=len(jobs))


@app.post("/api/import/csv", response_model=ImportResult)
async def import_csv(request: Request) -> ImportResult:
    body = (await request.body()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(body))
    if not reader.fieldnames or "title" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a title column")

    jobs: list[JobInput] = []
    for line_number, row in enumerate(reader, start=2):
        try:
            for field in ("pay_min", "pay_max"):
                value = (row.get(field) or "").strip()
                if value == "":
                    row[field] = None
                else:
                    row[field] = float(value)
            for field in ("proposals_count", "interviewing_count", "interest"):
                value = (row.get(field) or "").strip()
                if value == "":
                    row[field] = None
                else:
                    row[field] = int(value)
            for field in ("posted_at", "posted_label", "source_url"):
                row[field] = (row.get(field) or "").strip() or None
            jobs.append(JobInput.model_validate(row))
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"Invalid CSV row {line_number}: {error}") from error

    with connect_db() as db:
        for job in jobs:
            insert_job(db, job)
    return ImportResult(imported=len(jobs))


@app.get("/api/export")
def export_jobs(format: Literal["json", "csv"] = "json") -> Response:
    with connect_db() as db:
        rows = db.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    jobs = [row_to_job(row) for row in rows]
    if format == "csv":
        output = io.StringIO(newline="")
        fields = list(JobRecord.model_fields.keys())
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(jobs)
        return Response(
            content=output.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="upwork-jobs.csv"'},
        )
    return JSONResponse(
        content=json.loads(json.dumps(jobs, ensure_ascii=False)),
        headers={"Content-Disposition": 'attachment; filename="upwork-jobs.json"'},
    )


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
