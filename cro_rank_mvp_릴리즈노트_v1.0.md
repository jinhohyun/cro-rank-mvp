# [cro_rank_mvp] 릴리즈 노트 (Release Notes)

## [v1.1.0] - 2026-11-17
### 🚀 Added (신규 기능)
- **20개 대표 CRO 시드 데이터셋 전면 확장**: 국내 상장사, 비상장 전문기관, 글로벌 Top 5 한국법인 팩트 데이터 적재 (`seed_data.json`)
- **6축 다차원 정량 평가 엔진 (CRO-Score)**: Quality(25%), Scale(20%), Reputation(20%), Retention(15%), Volume(10%), Service Range(10%) 가중치 알고리즘 정규화 (`scoring.py`)
- **3D 플립 인터랙티브 카드 & Chart.js 레이더 차트**: 앞면(팩트 지표) ↔ 뒷면(6각형 방사형 레이더 시각화) 인터랙션 구현 (`static/app.js`)
- **원스톱 B2B RFP 견적 매칭 시스템**: 의뢰 기업의 파이프라인 단계, 적응증, 예산별 원클릭 견적 의뢰 수신 엔드포인트 및 모달 UI 구현 (`/api/rfp`)
- **다자간 CRO 1:1 레이더 비교 분석**: 하단 비교함(Compare Tray) 및 다자간 중첩 레이더 차트 비교 뷰 추가 (`/api/compare`)
- **SQLite 3종 테이블 스키마**: `cros`, `rfp_inquiries`, `cro_reviews` 테이블 및 자동 마이그레이션 (`database.py`)
- **자동화 단위/통합 테스트 스위트**: 7개 전수 시나리오 테스트 구축 및 통과 (`test_cro_rank.py`)

### 🔄 Changed (변경 사항)
- `static/index.html`: 네온 사이언-인디고 다크 테마 고도화, 히어로 KPI 요약 배너, 다기능 검색 및 필터 툴바 반영
- `app.py`: 다차원 검색/필터/정렬 API, 단일/비교 레이더 데이터 엔드포인트 확장

### 🐛 Fixed (버그 수정 및 개선)
- 누락되었던 `static/app.js` 신규 작성으로 프론트엔드 미렌더링 결함 해결
- SQLite Connection Context Manager 적용으로 리소스 누수 방지

---

## [v1.0.0] - 2026-11-14
### 🚀 Added (신규 기능)
- `cro_rank_mvp` 프로젝트 초기 구조 및 핵심 소스코드 통합 완료
- Antigravity 아카이브(`09_Antigravity_Archive`) 참조 문서 반영
- 사업계획서 및 릴리즈노트 표준 네이밍 룰 적용 (`cro_rank_mvp_사업계획서_v1.0.md`, `cro_rank_mvp_릴리즈노트_v1.0.md`)

### 🔄 Changed (변경 사항)
- 프로젝트 디렉토리 구조 표준화 및 모듈 분리
- 중복 문서 통합 (`krank` 및 `krank_mvp` 통합 완료)

### 🐛 Fixed (버그 수정 및 개선)
- 초기 실행 시 발생하는 의존성 및 파일 경로 예외 처리 보완
- 로컬 검증 게이트(`verify_gate`) 통과 기준 충족
