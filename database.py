"""CRO-Rank Database Layer & Migrations"""

import os
import shutil
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from scoring import calculate_cro_score, calculate_tier

try:
    from seed_backup import SEED_BACKUP_DATA
except ImportError:
    SEED_BACKUP_DATA = []

BASE_DIR = Path(__file__).resolve().parent
SEED_PATH = BASE_DIR / "seed_data.json"

# Serverless (Vercel) /tmp database support
if os.environ.get("VERCEL"):
    TMP_DIR = Path("/tmp")
    TMP_DB = TMP_DIR / "cro_rank.db"
    ORIGIN_DB = BASE_DIR / "cro_rank.db"
    if not TMP_DB.exists() and ORIGIN_DB.exists():
        try:
            shutil.copyfile(ORIGIN_DB, TMP_DB)
        except Exception as e:
            print(f"Warning: failed to copy DB to /tmp: {e}")
    DB_PATH = TMP_DB
else:
    DB_PATH = BASE_DIR / "cro_rank.db"


def get_raw_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    conn = get_raw_db()
    try:
        # Self-healing check: ensure cros table exists
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cros';")
        if not cur.fetchone():
            _do_init_db(conn)

        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _do_init_db(conn):
    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS cros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_en TEXT NOT NULL,
        cro_type TEXT NOT NULL,
        category_tags TEXT,
        scale TEXT,
        established_year INTEGER,
        location TEXT,
        homepage_url TEXT,
        staff_count INTEGER DEFAULT 0,
        cra_staff_count INTEGER DEFAULT 0,
        turnover_rate REAL DEFAULT 0.0,
        reputation_score REAL DEFAULT 0.0,
        project_count INTEGER DEFAULT 0,
        covered_services TEXT,
        cro_score REAL DEFAULT 0.0,
        tier TEXT DEFAULT 'B',
        stats_json TEXT,
        is_verified INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        rfp_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rfp_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cro_id INTEGER NOT NULL,
        sponsor_company TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        service_type TEXT NOT NULL,
        therapeutic_area TEXT,
        estimated_budget TEXT,
        target_start_date TEXT,
        requirements_text TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cro_id) REFERENCES cros(id)
    );

    CREATE TABLE IF NOT EXISTS cro_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cro_id INTEGER NOT NULL,
        reviewer_company_type TEXT,
        rating_communication REAL,
        rating_schedule REAL,
        rating_quality REAL,
        review_comment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cro_id) REFERENCES cros(id)
    );
    """)

    count = cur.execute("SELECT COUNT(*) FROM cros;").fetchone()[0]
    if count == 0:
        seed_data = []
        if SEED_PATH.exists():
            try:
                with open(SEED_PATH, "r", encoding="utf-8") as f:
                    seed_data = json.load(f)
            except Exception as e:
                print(f"Warning: could not read {SEED_PATH}: {e}")

        if not seed_data and SEED_BACKUP_DATA:
            seed_data = SEED_BACKUP_DATA

        for item in seed_data:
            stats = item.get("stats", {})
            score = calculate_cro_score(stats)
            tier = calculate_tier(score)
            cur.execute("""
                INSERT INTO cros (
                    id, name, name_en, cro_type, category_tags, scale, established_year,
                    location, homepage_url, staff_count, cra_staff_count, turnover_rate,
                    reputation_score, project_count, covered_services, cro_score, tier,
                    stats_json, is_verified, view_count, rfp_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            """, (
                item.get("id"),
                item.get("name"),
                item.get("name_en", ""),
                item.get("cro_type", "clinical"),
                item.get("category_tags", ""),
                item.get("scale", ""),
                item.get("established_year", 2000),
                item.get("location", ""),
                item.get("homepage_url", ""),
                item.get("staff_count", 0),
                item.get("cra_staff_count", 0),
                item.get("turnover_rate", 0.0),
                item.get("reputation_score", 0.0),
                item.get("project_count", 0),
                item.get("covered_services", ""),
                score,
                tier,
                json.dumps(stats, ensure_ascii=False),
                item.get("is_verified", 0),
            ))


def init_db(force_reload: bool = False):
    conn = get_raw_db()
    try:
        cur = conn.cursor()
        if force_reload:
            cur.execute("DROP TABLE IF EXISTS cros;")
            cur.execute("DROP TABLE IF EXISTS rfp_inquiries;")
            cur.execute("DROP TABLE IF EXISTS cro_reviews;")
        _do_init_db(conn)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    init_db(force_reload=True)
    print("✓ [CRO-Rank] SQLite database initialized successfully with 20 representative CROs!")
