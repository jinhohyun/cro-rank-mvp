"""FastAPI Web Server for CRO-Rank MVP (Dual-Prefix Vercel Serverless Ready)"""

import json
from typing import Optional
from pathlib import Path
from fastapi import FastAPI, APIRouter, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from database import get_db, init_db

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
PUBLIC_DIR = BASE_DIR / "public"

app = FastAPI(
    title="CRO-Rank API 🔬",
    description="대한민국 비임상 GLP & 임상 CRO 팩트 랭킹 및 B2B 견적 매칭 플랫폼",
    version="1.1.0"
)

# Mount static files for local execution
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

router = APIRouter()


class RFPRequest(BaseModel):
    cro_id: int = Field(..., description="대상 CRO ID")
    sponsor_company: str = Field(..., min_length=2, description="의뢰 기업명")
    contact_name: str = Field(..., min_length=2, description="담당자 성명")
    contact_email: str = Field(..., min_length=5, description="담당자 이메일")
    contact_phone: Optional[str] = Field(None, description="연락처")
    service_type: str = Field(..., description="요청 서비스 분야")
    therapeutic_area: Optional[str] = Field(None, description="적응증/질환군")
    estimated_budget: Optional[str] = Field(None, description="예상 예산 범위")
    target_start_date: Optional[str] = Field(None, description="착수 희망 시기")
    requirements_text: Optional[str] = Field(None, description="상세 요구사항")


class ReviewRequest(BaseModel):
    cro_id: int
    reviewer_company_type: str = Field("바이오벤처", description="기업 유형")
    rating_communication: float = Field(5.0, ge=1.0, le=5.0)
    rating_schedule: float = Field(5.0, ge=1.0, le=5.0)
    rating_quality: float = Field(5.0, ge=1.0, le=5.0)
    review_comment: str = Field(..., min_length=5)


@app.on_event("startup")
def startup():
    try:
        init_db()
    except Exception as e:
        print(f"Startup DB init notice: {e}")


@app.get("/", response_class=HTMLResponse)
def read_root():
    for p in [PUBLIC_DIR / "index.html", STATIC_DIR / "index.html"]:
        if p.exists():
            return p.read_text(encoding="utf-8")
    return "<h1>CRO-Rank API Live</h1>"


@router.get("/ping")
def ping(request: Request):
    """Health check endpoint returning DB count and request path info."""
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM cros").fetchone()[0]
    return {
        "status": "ok",
        "total_cros": count,
        "path": request.url.path,
        "message": "CRO-Rank API is live and operational!"
    }


@router.get("/stats")
def get_platform_stats():
    """Retrieve platform-wide summary statistics."""
    with get_db() as conn:
        cur = conn.cursor()
        total_cros = cur.execute("SELECT COUNT(*) FROM cros").fetchone()[0]
        avg_score = cur.execute("SELECT AVG(cro_score) FROM cros").fetchone()[0] or 0.0
        clinical_count = cur.execute("SELECT COUNT(*) FROM cros WHERE cro_type IN ('clinical', 'both')").fetchone()[0]
        nonclinical_count = cur.execute("SELECT COUNT(*) FROM cros WHERE cro_type IN ('nonclinical', 'both')").fetchone()[0]
        s_plus_count = cur.execute("SELECT COUNT(*) FROM cros WHERE tier = 'S+'").fetchone()[0]
        total_rfps = cur.execute("SELECT COUNT(*) FROM rfp_inquiries").fetchone()[0]

    return {
        "total_cros": total_cros,
        "avg_score": round(avg_score, 1),
        "clinical_count": clinical_count,
        "nonclinical_count": nonclinical_count,
        "s_plus_count": s_plus_count,
        "total_rfps": total_rfps
    }


@router.get("/cros")
def get_cros(
    cro_type: Optional[str] = Query(None, description="Filter by type: 'clinical', 'nonclinical', 'both'"),
    tier: Optional[str] = Query(None, description="Filter by tier: 'S+', 'S', 'A', 'B'"),
    query: Optional[str] = Query(None, description="Search query across name, tags, services"),
    sort_by: Optional[str] = Query("cro_score_desc", description="Sort option")
):
    """Retrieve filtered and sorted CRO ranking list."""
    with get_db() as conn:
        cur = conn.cursor()
        sql = "SELECT * FROM cros WHERE 1=1"
        params = []

        if cro_type:
            if cro_type == "clinical":
                sql += " AND cro_type IN ('clinical', 'both')"
            elif cro_type == "nonclinical":
                sql += " AND cro_type IN ('nonclinical', 'both')"
            else:
                sql += " AND cro_type = ?"
                params.append(cro_type)

        if tier:
            sql += " AND tier = ?"
            params.append(tier)

        if query:
            q = f"%{query.strip()}%"
            sql += " AND (name LIKE ? OR name_en LIKE ? OR covered_services LIKE ? OR category_tags LIKE ? OR location LIKE ?)"
            params.extend([q, q, q, q, q])

        sort_map = {
            "cro_score_desc": "cro_score DESC, reputation_score DESC",
            "staff_desc": "staff_count DESC",
            "turnover_asc": "turnover_rate ASC",
            "reputation_desc": "reputation_score DESC",
            "project_desc": "project_count DESC",
            "score_asc": "cro_score ASC"
        }
        order_clause = sort_map.get(sort_by, "cro_score DESC")
        sql += f" ORDER BY {order_clause}"

        rows = cur.execute(sql, params).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        d["stats"] = json.loads(d["stats_json"]) if d.get("stats_json") else {}
        results.append(d)

    return results


@router.get("/cros/{cro_id}")
def get_cro_detail(cro_id: int):
    """Retrieve detailed profile of a specific CRO with auto-incremented view count."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE cros SET view_count = view_count + 1 WHERE id = ?", (cro_id,))
        row = cur.execute("SELECT * FROM cros WHERE id = ?", (cro_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="CRO not found")
        d = dict(row)
        d["stats"] = json.loads(d["stats_json"]) if d.get("stats_json") else {}

        rev_rows = cur.execute(
            "SELECT * FROM cro_reviews WHERE cro_id = ? ORDER BY id DESC LIMIT 10", (cro_id,)
        ).fetchall()
        d["reviews"] = [dict(rv) for rv in rev_rows]

    return d


@router.get("/cros/{cro_id}/radar")
def get_cro_radar(cro_id: int):
    """Get standardized Chart.js Radar payload for a single CRO."""
    with get_db() as conn:
        row = conn.execute("SELECT name, tier, cro_score, stats_json FROM cros WHERE id = ?", (cro_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="CRO not found")

        stats = json.loads(row["stats_json"]) if row["stats_json"] else {}

    labels = ["전문성 (Quality)", "규모 (Scale)", "업계 평판 (Reputation)", "근속성 (Retention)", "수행 과제 (Volume)", "서비스 범위 (Range)"]
    data = [
        stats.get("quality", 80.0),
        stats.get("scale_score", 80.0),
        stats.get("reputation", 80.0),
        stats.get("retention", 80.0),
        stats.get("volume", 80.0),
        stats.get("service_range", 80.0)
    ]
    avg_data = [88.0, 81.0, 86.5, 87.0, 84.0, 87.5]

    return {
        "id": cro_id,
        "name": row["name"],
        "tier": row["tier"],
        "cro_score": row["cro_score"],
        "labels": labels,
        "current_data": data,
        "benchmark_avg": avg_data
    }


@router.post("/rfp")
def submit_rfp(rfp: RFPRequest):
    """Submit B2B Request For Proposal (RFP) quotation lead."""
    with get_db() as conn:
        cur = conn.cursor()
        target = cur.execute("SELECT name FROM cros WHERE id = ?", (rfp.cro_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="Target CRO does not exist")

        cur.execute("""
            INSERT INTO rfp_inquiries (
                cro_id, sponsor_company, contact_name, contact_email, contact_phone,
                service_type, therapeutic_area, estimated_budget, target_start_date, requirements_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rfp.cro_id, rfp.sponsor_company, rfp.contact_name, rfp.contact_email, rfp.contact_phone,
            rfp.service_type, rfp.therapeutic_area, rfp.estimated_budget, rfp.target_start_date, rfp.requirements_text
        ))
        inquiry_id = cur.lastrowid
        cur.execute("UPDATE cros SET rfp_count = rfp_count + 1 WHERE id = ?", (rfp.cro_id,))

    return {
        "status": "success",
        "inquiry_id": inquiry_id,
        "cro_name": target["name"],
        "message": f"'{target['name']}'에 견적 요청서(RFP)가 성공적으로 접수되었습니다. 담당 검토팀에서 24시간 이내에 회신드립니다."
    }


@router.get("/compare")
def compare_cros(ids: str = Query(..., description="Comma-separated CRO IDs, e.g. '1,2,5'")):
    """Multi-institution comparison endpoint."""
    id_list = []
    for piece in ids.split(","):
        clean = piece.strip()
        if clean.isdigit():
            id_list.append(int(clean))

    if not id_list:
        raise HTTPException(status_code=400, detail="Invalid CRO IDs provided")

    if len(id_list) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 CROs can be compared at once")

    with get_db() as conn:
        cur = conn.cursor()
        placeholders = ",".join(["?"] * len(id_list))
        rows = cur.execute(f"SELECT * FROM cros WHERE id IN ({placeholders})", id_list).fetchall()

    results = []
    labels = ["전문성 (Quality)", "규모 (Scale)", "업계 평판 (Reputation)", "근속성 (Retention)", "수행 과제 (Volume)", "서비스 범위 (Range)"]
    datasets = []
    palette = [
        {"bg": "rgba(6, 182, 212, 0.2)", "border": "#06b6d4"},
        {"bg": "rgba(99, 102, 241, 0.2)", "border": "#6366f1"},
        {"bg": "rgba(236, 72, 153, 0.2)", "border": "#ec4899"},
        {"bg": "rgba(16, 185, 129, 0.2)", "border": "#10b981"},
    ]

    for idx, r in enumerate(rows):
        d = dict(r)
        stats = json.loads(d["stats_json"]) if d.get("stats_json") else {}
        d["stats"] = stats
        results.append(d)

        color = palette[idx % len(palette)]
        datasets.append({
            "label": f"{d['name']} ({d['tier']})",
            "data": [
                stats.get("quality", 80.0),
                stats.get("scale_score", 80.0),
                stats.get("reputation", 80.0),
                stats.get("retention", 80.0),
                stats.get("volume", 80.0),
                stats.get("service_range", 80.0)
            ],
            "backgroundColor": color["bg"],
            "borderColor": color["border"],
            "borderWidth": 2,
            "pointBackgroundColor": color["border"]
        })

    return {
        "cros": results,
        "radar_chart": {
            "labels": labels,
            "datasets": datasets
        }
    }


@router.post("/reviews")
def add_review(rev: ReviewRequest):
    """Add a verified client review for a CRO."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cro_reviews (
                cro_id, reviewer_company_type, rating_communication, rating_schedule, rating_quality, review_comment
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            rev.cro_id, rev.reviewer_company_type, rev.rating_communication, rev.rating_schedule, rev.rating_quality, rev.review_comment
        ))
    return {"status": "success", "message": "리뷰가 등록되었습니다."}


# Mount router with and without /api prefix to support both direct and rewritten routes seamlessly
app.include_router(router, prefix="/api")
app.include_router(router)
