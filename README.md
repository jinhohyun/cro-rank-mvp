# CRO-Rank (크로랭크) 🔬

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjinhohyun%2Fcro-rank-mvp)
[![Release](https://img.shields.io/badge/release-v1.1.0-blue.svg)](https://github.com/jinhohyun/cro-rank-mvp/releases/tag/v1.1.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **대한민국 비임상 GLP & 임상시험수탁기관(CRO) 팩트 랭킹 & B2B 견적 매칭 플랫폼**  
> 제약·바이오텍의 최적 벤더 탐색 시간을 90% 단축하고, 공시 및 인허가 팩트 데이터(임직원 수, 연간 퇴사율, 업계 평판, 수주 과제 수)를 6축 다차원 정량 평가 엔진으로 투명하게 공개합니다.

---

## 🌟 핵심 기능 (Key Features)

1. **6축 다차원 정량 평가 엔진 (CRO-Score)**
   - Quality (25%): 전문의/박사/전문 CRA 비율, GLP 인증 범위
   - Scale (20%): 임직원 수, 자본금, 연간 매출액
   - Reputation (20%): 스폰서사 만족도, 실무 평판
   - Retention (15%): 연간 퇴사율 (낮을수록 고득점), 평균 근속 연수
   - Volume (10%): 식약처 승인 실적, 누적 수주 과제 수
   - Service Range (10%): 프로토콜, EDC/DM, STAT, 인허가 원스톱 커버리지
2. **인터랙티브 3D 플립 카드 & Chart.js 네온 레이더 시각화**
   - 앞면: 핵심 4대 팩트 지표 및 등급 배지 (S+, S, A, B)
   - 뒷면: 기관 역량 vs 업계 평균 기준선 6각형 방사형 레이더 차트
3. **원스톱 B2B RFP 견적 매칭 시스템**
   - 파이프라인 단계, 타겟 적응증, 예산 규모별 최적 CRO 후보군 원클릭 견적 의뢰
4. **다자간 1:1 레이더 다각 비교 분석**
   - 하단 비교함(Compare Tray)에 최대 4개 사를 담아 중첩 레이더 차트 및 스펙 시트 비교

---

## 🚀 빠른 Vercel 1클릭 배포 (Deploy to Vercel)

아래 버튼을 클릭하면 Vercel 클라우드에서 서버리스 백엔드와 전 세계 CDN 프론트엔드가 즉시 배포됩니다:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjinhohyun%2Fcro-rank-mvp)

---

## 💻 로컬 실행 가이드 (Local Development)

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/jinhohyun/cro-rank-mvp.git
cd cro-rank-mvp
pip install -r requirements.txt
```

### 2. 데이터베이스 초기화 (SQLite)
```bash
python database.py
```

### 3. 로컬 서버 구동
```bash
python -m uvicorn app:app --port 8000 --reload
```
브라우저에서 `http://localhost:8000` 접속

### 4. 단위 테스트 실행
```bash
python test_cro_rank.py
```

---

## 📂 프로젝트 구조

```
cro-rank-mvp/
├── api/
│   └── index.py             # Vercel Serverless Function 진입점
├── public/                  # Vercel Edge CDN 정적 에셋 (index.html, app.js)
├── static/                  # FastAPI 로컬 정적 에셋
│   ├── index.html
│   └── app.js
├── app.py                   # FastAPI 코어 애플리케이션 & REST API
├── database.py              # SQLite DB 레이어 & /tmp 서버리스 마이그레이션
├── scoring.py               # 6축 가중치 계산 & 티어링 알고리즘
├── seed_data.json           # 20개 대표 CRO 팩트 데이터셋
├── test_cro_rank.py         # 자동화 단위/통합 테스트 (7개 시나리오)
├── requirements.txt         # Python 의존성 정의
└── vercel.json              # Vercel 클라우드 라우팅 설정
```
