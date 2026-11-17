"""Automated Unit & Integration Test Suite for CRO-Rank MVP"""

import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from database import get_db, init_db
from scoring import calculate_cro_score, calculate_tier, normalize_value
from app import app


class TestCRORankSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Force re-initialize DB to clean state with 20 seed CROs
        init_db(force_reload=True)
        cls.client = TestClient(app)

    def test_01_db_schema_and_records(self):
        """Verify SQLite tables exist and 20 representative CROs are loaded."""
        with get_db() as conn:
            cur = conn.cursor()
            # Check tables
            tables = [row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            self.assertIn("cros", tables)
            self.assertIn("rfp_inquiries", tables)
            self.assertIn("cro_reviews", tables)

            # Check count
            count = cur.execute("SELECT COUNT(*) FROM cros").fetchone()[0]
            self.assertEqual(count, 20, f"Expected 20 CROs, found {count}")

            # Verify columns
            cols = [row[1] for row in cur.execute("PRAGMA table_info(cros)").fetchall()]
            for col in ["category_tags", "location", "is_verified", "rfp_count", "view_count", "cro_score", "tier"]:
                self.assertIn(col, cols)

    def test_02_scoring_engine(self):
        """Verify 6-axis scoring calculation and tier classification."""
        sample_stats = {
            "quality": 95.0,
            "scale_score": 90.0,
            "reputation": 92.0,
            "retention": 90.0,
            "volume": 94.0,
            "service_range": 95.0
        }
        score = calculate_cro_score(sample_stats)
        self.assertAlmostEqual(score, 92.6, places=1)
        tier = calculate_tier(score)
        self.assertEqual(tier, "S+")

        # Test boundary cases
        self.assertEqual(calculate_tier(92.0), "S+")
        self.assertEqual(calculate_tier(91.9), "S")
        self.assertEqual(calculate_tier(86.0), "S")
        self.assertEqual(calculate_tier(85.9), "A")
        self.assertEqual(calculate_tier(78.0), "A")
        self.assertEqual(calculate_tier(77.9), "B")
        self.assertEqual(calculate_tier(69.9), "C")

        # Test normalization
        self.assertEqual(normalize_value(10, 0, 100), 10.0)
        self.assertEqual(normalize_value(10, 0, 100, invert=True), 90.0)

    def test_03_api_root_and_stats(self):
        """Verify root HTML rendering and platform stats endpoint."""
        res_root = self.client.get("/")
        self.assertEqual(res_root.status_code, 200)
        self.assertIn("CRO-RANK", res_root.text)

        res_stats = self.client.get("/api/stats")
        self.assertEqual(res_stats.status_code, 200)
        stats = res_stats.json()
        self.assertEqual(stats["total_cros"], 20)
        self.assertGreater(stats["avg_score"], 70.0)
        self.assertGreaterEqual(stats["s_plus_count"], 1)

    def test_04_api_cros_filtering_and_search(self):
        """Verify list endpoint with type filtering and keyword search."""
        # 1. Total list
        res_all = self.client.get("/api/cros")
        self.assertEqual(res_all.status_code, 200)
        cros = res_all.json()
        self.assertEqual(len(cros), 20)
        # Check sorting default (descending score)
        scores = [c["cro_score"] for c in cros]
        self.assertEqual(scores, sorted(scores, reverse=True))

        # 2. Filter clinical
        res_clin = self.client.get("/api/cros?cro_type=clinical")
        self.assertEqual(res_clin.status_code, 200)
        for c in res_clin.json():
            self.assertIn(c["cro_type"], ["clinical", "both"])

        # 3. Filter nonclinical
        res_non = self.client.get("/api/cros?cro_type=nonclinical")
        self.assertEqual(res_non.status_code, 200)
        for c in res_non.json():
            self.assertIn(c["cro_type"], ["nonclinical", "both"])

        # 4. Search query
        res_search = self.client.get("/api/cros?query=GLP")
        self.assertEqual(res_search.status_code, 200)
        self.assertGreater(len(res_search.json()), 0)

    def test_05_api_cro_detail_and_radar(self):
        """Verify single CRO detail view and radar data formatting."""
        res = self.client.get("/api/cros/1")
        self.assertEqual(res.status_code, 200)
        detail = res.json()
        self.assertEqual(detail["id"], 1)
        self.assertIn("씨앤알리서치", detail["name"])
        self.assertGreater(detail["view_count"], 0)

        res_radar = self.client.get("/api/cros/1/radar")
        self.assertEqual(res_radar.status_code, 200)
        radar = res_radar.json()
        self.assertEqual(len(radar["labels"]), 6)
        self.assertEqual(len(radar["current_data"]), 6)
        self.assertEqual(len(radar["benchmark_avg"]), 6)

    def test_06_rfp_submission_flow(self):
        """Verify B2B RFP submission and database increment."""
        payload = {
            "cro_id": 1,
            "sponsor_company": "(주)바이오넥스",
            "contact_name": "김수현 팀장",
            "contact_email": "shkim@bionex.com",
            "contact_phone": "010-9876-5432",
            "service_type": "임상 Phase I 시험",
            "therapeutic_area": "항암제 (고형암)",
            "estimated_budget": "3억 ~ 10억 원",
            "target_start_date": "2027년 1Q",
            "requirements_text": "단회 투여 용량증량(SAD) 및 다회 투여(MAD) 시험 프로토콜 개발 포함"
        }
        res = self.client.post("/api/rfp", json=payload)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "success")
        self.assertIn("inquiry_id", body)

        # Check in DB
        with get_db() as conn:
            cur = conn.cursor()
            inq = cur.execute("SELECT * FROM rfp_inquiries WHERE id = ?", (body["inquiry_id"],)).fetchone()
            self.assertIsNotNone(inq)
            self.assertEqual(inq["sponsor_company"], "(주)바이오넥스")

            # Check rfp_count increment on target CRO
            rfp_cnt = cur.execute("SELECT rfp_count FROM cros WHERE id = 1").fetchone()[0]
            self.assertGreaterEqual(rfp_cnt, 1)

    def test_07_compare_endpoint(self):
        """Verify multi-institution comparison endpoint."""
        res = self.client.get("/api/compare?ids=1,2,5")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["cros"]), 3)
        self.assertEqual(len(data["radar_chart"]["datasets"]), 3)


if __name__ == "__main__":
    unittest.main()
