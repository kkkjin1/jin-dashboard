-- seed-annual-goals: HR전략프레임 자동 생성 SQL (Supabase SQL Editor에 붙여넣어 실행)
DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '인력계획', '#3B82F6', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '사업계획 연동 인력 계획 수립', 2, '월별 루틴 인력계획 취합 및 경영진 싱크', 'A', '상', '상', '26.3Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인건비 예산 연계', 1, '급여 지급시 관리되고 있으나, 사후보고에 머무름.', 'B', '상', '상', '26.3~4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '결원·대체충원 기준', 1, '채용단의 기능은 수립되었으나, 기준에 따라 진행하고 있진 않음', 'A', '상', '상', '26.3Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '고용형태 포트폴리오(정규·계약·인턴·아웃소싱)', 2, '비정규직 관리방안에 따라 운영되었으나, 전체 TO 고려한 기준까지는 미비', 'A', '중', '상', '26.3Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인력 생산성 분석(1인당 매출·인건비 효율)', 2, '급여기안을 통한 보고', 'A', '상', '상', '26.3Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 4);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '적정인력 산정·정원(HC) 관리', 1, '비율 기반 배분에 의존, 산정 기준 부재', 'A', '상', '상', '26.3Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 5);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인력 운영 시나리오(증원·재배치·감축)', 1, '근거 불충분 – 사업 시나리오 연동 필요', 'A', '상', '중', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 6);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '채용 전략', '#F59E0B', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '직군별 채용 난이도 진단', 2, '우선순위 및 소서배분 등 실무단에서 일부 F/UP', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채널 포트폴리오(공고·소싱·추천·에이전시)', 2, '채널별 관리, 유료상품, 소싱 등 유연하게 활용', 'A', '상', '상', '26.3Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채용 리드타임·비용 목표 설정', 3, '채용보고서 통한 리드타임, 비용, 주요지표 관리', 'A', '상', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리더 채용 별도 트랙', 1, '콘마인턴을 BP로 경력직/리더십 복수채용 필요', 'A', '상', '상', '26.3~4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '소싱·파이프라인', '#10B981', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '다이렉트 소싱 체계', 2, '운영 중이나 모수 감소·효율 저하, 리뉴얼 필요성 제기', 'A', '상', '상', '26.3Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인재풀(Talent Pool) 구축·관리', 2, 'Raw는 확보. 기획초입단계에서의 속도감 필요', 'A', '상', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '사내추천 제도', 1, '운영 중이나 설계 의도대로 진행 어렵고 별도 기획 없음', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '경쟁사·타깃 기업 매핑', 1, '아주 얕은 수준에서 머물러있음', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '잠재후보 CRM', 1, '아웃바운딩활동 취약', 'A', '하', '하', '27년 이후', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '선발 프로세스', '#EF4444', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'JD 표준화', 1, '운영 중, 현업-피플 간 주된 커뮤니케이션 단위', 'C', '중', '중', '상시', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '서류·스크리닝 기준', 1, '기준은 있으나 소서-현업 간 역할 배분 미정리', 'A', '상', '상', '26.3Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '면접 구조화(역량·컬처핏)', 1, '면접 운영되나 사전 변별 한계가 반복 인식됨', 'A', '상', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '면접관 교육·인증', 1, '근거 불충분 – 현황 확인 필요', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가표·합의 절차', 1, '근거 불충분 – 현황 확인 필요', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 4);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '처우 협상·오퍼 관리', 2, '운영담당자가 나름의 논리에 따라 처우협의 진행', 'C', '중', '중', '상시', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 5);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '레퍼런스 체크', 1, '근거 불충분 – 현황 확인 필요', 'A', '중', '하', '27년 이후', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 6);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '채용 브랜딩', '#8B5CF6', 4);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'EVP 정의', 1, '미션·비전·브랜딩 전반 미흡', 'A', '상', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채용 홈페이지·채널 운영', 1, '전면 개편 필요성은 지속적으로 대두', 'A', '상', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '콘텐츠·PR', 1, '주기적인 게시에 그침', 'A', '중', '하', '27년 이후', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채용설명회·외부 활동', 1, '근거 불충분 – 현황 확인 필요', 'A', '하', '하', '27년 이후', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리뷰 플랫폼 평판 관리', 1, '부정 바이럴은 인지, 대응 체계 부재', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '온보딩', '#EC4899', 5);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '입사 전 커뮤니케이션(오퍼~입사 이탈 방지)', 2, '프리보딩 선물 및 특이건 대응관리', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '온보딩 프로그램 설계', 3, '일정 볼륨 이상의 입사자에게 양/질의 온보딩 가능한 시스템 구축', 'A', '상', '상', '26.3Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '초기 정착 지원(버디·멘토)', 1, '제도 전무', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '30·60·90일 체크인', 2, '1주차, 4개월 체크인 진행하고 있음', 'A', '중', '중', '26.4Q', 'F2. 채용·확보', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '1. 인재 확보', '채용 운영·측정', '#06B6D4', 6);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'ATS 운영', 2, 'HR담당자 외 유관자들의 친숙도는 올라왔으나 고도화까지는 이루지 못함', 'C', '중', '하', '상시', 'F10. HR운영·시스템', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '퍼널 지표 체계', 2, '수기 관리 중, 대시보드화 진행 중', 'A', '상', '상', '26.3Q', 'F10. HR운영·시스템', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채용 만족도(현업·후보자)', 1, '진행되지못함', 'A', '하', '하', '27년 이후', 'F2. 채용·확보', NULL, NULL, NULL, NULL, NULL, 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '목표관리', '#84CC16', 7);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '목표 캐스케이딩 구조(전사→본부→팀→개인)', 1, '목표관리를 위한 전사회의체 참석 중이나 진척상황X', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '목표 수립 방법론(MBO·KPI·OKR)', 1, '목표관리를 위한 전사회의체 참석 중이나 진척상황X', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '목표 설정 가이드·교육', 1, '목표관리를 위한 전사회의체 참석 중이나 진척상황X', 'A', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '목표 변경·롤링 규칙', 1, '목표관리를 위한 전사회의체 참석 중이나 진척상황X', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '진척 트래킹 주기(연-분기-월-주 연계)', 1, '목표관리를 위한 전사회의체 참석 중이나 진척상황X', 'A', '상', '상', '26.3~4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '성과평가', '#A78BFA', 8);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가체계 수립', 2, 'CIC 대비 기획 필요', 'B', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가 대상·주기·등급체계', 2, '임팩트*핵심가치 중심의 평가체계 운영', 'B', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가 지표(정량·정성 배분)', 1, '설계되었으나 의의X', 'A', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가자 교육', 2, '신규리더 대상 진행', 'A', '중', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '다면·동료평가', 1, '필요성부터 분석 필요', 'A', '중', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 4);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가 캘리브레이션', 2, '부문대표-경영진간 진행되나, 기준에 따라 진행은 미흡', 'A', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 5);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '이의제기 절차', 1, '사실상 형식적', 'B', '중', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 6);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '수습·전환 평가', '#F97316', 9);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '수습 기준·기간', 3, '매우 타이트한 기준과 원칙을 가지고 운영 중', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가 항목·척도', 2, '초기 설계는 나쁘지 않았으나 일부 업데이트 필요', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리더 운영 가이드', 2, '초기 정착 이후 혼선이나 질문X', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '전환·미전환 의사결정 프로세스', 3, '입사일 기준 단위기간을 나누고, 기한 내에서 체계적으로 운영', 'A', '상', '상', '26.3Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '피드백 체계', '#22C55E', 10);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '상시 피드백 문화', 1, 'X', 'A', '중', '하', '27년 이후', 'F4. 평가·성과관리', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '저성과자 관리(PIP)', 1, 'X', 'B', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '평가 결과 활용', '#EAB308', 11);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '보상 연계', 2, '인센티브, 정기연봉조정 시 근거항목', 'A', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가결과활용(승진·직책·배치·육성 연계)', 1, '직책 보임 기준 불명확', 'A', '상', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '2. 검증과 정렬', '성과 데이터', '#3B82F6', 12);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '평가 결과 분포·변별력 분석', 1, '서베이·분석 수행 이력 있으나 큰 의미없음', 'A', '중', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '조직별 성과 편차 진단', 1, '진행필요', 'A', '중', '중', '26.4Q', 'F4. 평가·성과관리', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '보상 전략', '#F59E0B', 13);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '보상 철학·원칙 정의', 1, '평가와 연계한 최소수준에서 진행', 'A', '상', '상', '26.3Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '페이밴드·직무급 체계', 1, 'Raw 데이터는 확보하였으나 아직 Band화 되지 못함', 'A', '상', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '보상 시장 데이터 확보', 2, 'Raw 데이터는 확보하여 직무별로 3단계 분석', 'A', '중', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '고정보상', '#10B981', 14);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '연봉 조정 로직', 2, '정기연봉조정 도입으로 회계연도 기준 통일 및 연봉개념 정의 완료', 'A', '상', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '승급·승격 기준', 1, '필요', 'A', '상', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '초임·처우 기준', 2, '기준은 수립되었으나 경력직 위주의 채용으로 논의 필요', 'C', '중', '중', '상시', 'F5. 보상', NULL, NULL, NULL, NULL, NULL, 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '직책수당·직무수당', 2, '기준에 따라 직접비/간접비 나누어 운영 중', 'A', '중', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '변동보상', '#EF4444', 15);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '성과급 재원 산정', 2, '로직 재설계 필요', 'A', '상', '상', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '배분 로직(전사·조직·개인)', 2, '조직 단위 변별력 문제 확인됨', 'A', '상', '상', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '사업부 단위 성과 연동', 1, 'CIC 대비 기획 필요', 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '단기 인센티브', '#8B5CF6', 16);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '성과인센티브', 1, NULL, 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리텐션보너스', 1, NULL, 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '세일즈 매출 인센티브', 1, NULL, 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '장기 인센티브', '#EC4899', 17);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '스톡옵션·RSU·팬텀스톡', 1, 'CFO 리딩하에 실무계약서 팔로업 수준', 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '부여 기준·베스팅 설계', 1, '스톡옵션규정 수립 필요', 'A', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '보상 운영', '#06B6D4', 18);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '급여·4대보험', 2, '무난한 수준에서 운영 중', 'C', '상', '상', '상시', 'F5. 보상', NULL, NULL, NULL, NULL, NULL, 0);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '복리후생', '#84CC16', 19);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '비용 효율성 검토', 1, '미진행. 진행필요', 'A', '중', '하', '27년 이후', 'F5. 보상', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '만족도 조사', 1, '미진행. 진행필요', 'A', '하', '하', '27년 이후', 'F5. 보상', NULL, NULL, NULL, NULL, NULL, 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '핵심인재 관리', '#A78BFA', 20);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '정의·선정 기준', 2, '그룹핑되었으나 이후 유의미한 진전X', 'A', '상', '상', '26.3Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리텐션 패키지', 1, '필요성만 합의된 상태', 'A', '상', '상', '26.3~4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '승계계획(Succession Planning)', 1, '미구축', 'A', '중', '하', '27년 이후', 'F3. 인력운영·유지', NULL, NULL, NULL, NULL, NULL, 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '이탈 위험 모니터링', 1, '1on1 기반 정성 파악에 의존', 'A', '상', '중', '26.4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '리텐션', '#F97316', 21);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '턴오버 분석(자발·비자발, 근속구간)', 1, '수치 산출·발표 이력, 기준점 미합의', 'A', '상', '상', '26.3Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'Stay Interview(재직자 인터뷰)', 2, '재직자 1on1 운영 중', 'A', '중', '중', '26.4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리텐션 대상/방법론 설계', 1, '진행필요', 'A', '상', '상', '26.3~4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '3. 유지와 보상', '인건비 관리', '#22C55E', 22);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인건비 예산 수립·통제', 2, '연간/반기/분기단위 인건비 예상 시뮬레이션 수립', 'B', '상', '상', '26.3~4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '다년 인건비 추계', 1, '인력예측과 맞물려 진행되진 못함', 'B', '상', '중', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인건비율·생산성 지표', 2, '급여대장에 일부 분석', 'A', '상', '중', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '노무 관리', '#EAB308', 23);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '취업규칙·인사규정 정비', 1, '진행필요', 'B', '상', '상', '26.3~4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '근로계약 관리', 2, '법정의무사항 준수', 'B', '중', '중', '상시', 'F8. 노무·ER', NULL, NULL, NULL, NULL, NULL, 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '근로시간 관리(연장·야간·휴일)', 2, '관리는 되고 있으나 52H 통제불가', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '휴가·휴직 관리', 3, 'ERP 인터페이스 외 체계적으로 관리되고 있음', 'B', '중', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '컴플라이언스', '#3B82F6', 24);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '노사협의회·근로자대표 운영', 1, '필요', 'B', '상', '상', '26.3~4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '법정의무교육 이수 관리', 3, '법정의무사항 준수', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '임금 컴플라이언스(최저임금·통상임금·명세서)', 3, '법정의무사항 준수', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '퇴직급여·퇴직연금 제도 운영', 2, '퇴직금은 올바르게 지급되고 있으나, 연금 가입 필요', 'B', '상', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '비정규직 사용·차별금지 관리', 2, '규정, 구성원 마인드교육 등 체계 부재', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 4);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '채용절차법 준수', 2, '무난한 수준에서 운영 중', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 5);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '중대재해처벌법 대응', 1, 'X', 'B', '상', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 6);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '법적 리스크', '#F59E0B', 25);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '근로감독 대응', 1, '준비필요', 'B', '상', '중', '상시', 'F8. 노무·ER', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '노동 관계법령 변화 모니터링', 1, '피플 리더 1인 개인기에 의존 중', 'B', '상', '중', '상시', 'F8. 노무·ER', NULL, NULL, NULL, NULL, NULL, 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '직장 내 괴롭힘·성희롱 대응 체계', 2, '핫라인 구축 및 법정의무교육 진행', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '산업안전보건', 2, '법정의무교육 진행', 'B', '상', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '개인정보·정보보호', 2, '법정의무교육 진행', 'B', '상', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '징계·ER', '#10B981', 26);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '징계 기준·절차', 1, '규정 존재하나 운영 미정착', 'B', '상', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '고충처리', 2, '핫라인 운영중이나 이 외 시스템 X', 'B', '중', '중', '26.4Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '개별 노사 이슈 대응', 1, '개별대응수준', 'B', '상', '상', '상시', 'F8. 노무·ER', NULL, NULL, NULL, NULL, NULL, 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '오프보딩', '#EF4444', 27);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '퇴직 유형별 프로세스(자발·권고·징계)', 1, '규정과 함께 진전 필요', 'B', '상', '상', '26.3Q', 'F8. 노무·ER', NULL, NULL, NULL, '2026-07-01', '2026-09-30', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '문서·법적 리스크 관리', 2, '사직서 수취 및 유형별 시나리오 수립', 'B', '상', '상', '상시', 'F8. 노무·ER', NULL, NULL, NULL, NULL, NULL, 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '육성', '#8B5CF6', 28);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '역량모델', 1, '미구축', 'A', '중', '하', '27년 이후', 'F6. 교육·육성', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '계층별 교육 및 직무교육', 1, '미구축', 'A', '상', '중', '26.4Q', 'F6. 교육·육성', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리더십 파이프라인', 1, '미구축', 'A', '상', '중', '27년 이후', 'F6. 교육·육성', NULL, NULL, NULL, NULL, NULL, 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '교육 효과 측정', 1, '미구축', 'A', '하', '하', '27년 이후', 'F6. 교육·육성', NULL, NULL, NULL, NULL, NULL, 3);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '경력개발', '#EC4899', 29);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '경력경로(Career Path) 설계', 1, '미구축', 'A', '중', '중', '27년 이후', 'F6. 교육·육성', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '성장 로드맵·레벨업 기준 커뮤니케이션', 1, '미구축', 'A', '상', '중', '26.4Q', 'F6. 교육·육성', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '인사 회계·계리', '#06B6D4', 30);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '퇴직급여채무 계리평가 대응(K-IFRS 1019)', 1, '요청시 대응', 'B', '상', '상', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '주식기준보상 공정가치 평가·비용 인식(K-IFRS 1102)', 1, '요청시 대응', 'B', '상', '상', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '팬텀스톡·RSU 부채 인식 사전 검토', 1, '요청시 대응', 'B', '상', '상', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '연차수당·미사용휴가 충당부채 산정', 3, '요청시 대응', 'B', '상', '중', '26.4Q', 'F5. 보상', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인건비 계정 배부·부문 원가 귀속', 2, '요청시 대응', 'B', '상', '상', '26.3~4Q', 'F5. 보상', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', 'IPO·내부통제', '#84CC16', 31);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '내부회계관리제도 인사·급여 프로세스 통제 설계', 2, '요청시 대응', 'B', '상', '상', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인사·급여 시스템 접근권한 통제', 2, '드라이브, ERP, 전자결재 툴 마스터계정 별도 관리', 'B', '상', '중', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'IPO 노무 실사 대응(임금체불·근로시간·4대보험)', 1, '미비', 'B', '상', '상', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '임원 보수한도·임원퇴직금 규정', 3, '규정 제정 완료', 'B', '상', '상', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 3);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '주식매수선택권 부여 절차 적법성·공시', 1, '미구축', 'B', '상', '상', '26.3~4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 4);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '4. 지속가능성', '거버넌스', '#A78BFA', 32);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인사위원회 등 의사결정 기구', 1, '미구축. 리스크 취약', 'B', '중', '중', '26.4Q', 'F1. 인사기획·HR전략', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '사규·내부규정', '#F97316', 33);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '규정 체계 정비·통합', 2, '필수 규정 제한적으로 제개정', 'C', '중', '중', '26.4Q', 'F10. HR운영·시스템', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '복무·경비·출장 규정', 2, '필수 규정 제한적으로 제개정', 'C', '하', '중', '26.4Q', 'F10. HR운영·시스템', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '조직설계', '#22C55E', 34);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '조직구조 원칙(기능·사업부·매트릭스)', 1, 'CIC체제 도입하였으나 미흡', 'A', '상', '상', '26.3~4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '조직 신설·통폐합 기준', 1, '기준없음', 'A', '상', '중', '26.4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '스팬 오브 컨트롤', 1, '향후논의필요', 'A', '중', '중', '26.4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '직무관리', '#EAB308', 35);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '직무분석·직무기술서·잡레벨 설계', 1, 'X', 'A', '상', '중', '26.4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '직급·직책 체계', '#3B82F6', 36);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '직급체계 설계', 1, 'X', 'A', '상', '상', '26.3~4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '권한과 책임', '#F59E0B', 37);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'R&R 정의', 1, 'X', 'A', '상', '상', '26.3~4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '위임전결 규정', 1, 'X', 'A', '상', '상', '26.3~4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '리더십', '#10B981', 38);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리더 선발 기준', 1, 'X', 'A', '상', '상', '26.3~4Q', 'F7. 조직·직무설계', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '리더십 역량모델', 1, 'X', 'A', '상', '중', '26.4Q', 'F6. 교육·육성', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '신임리더 교육', 2, '리더십타운홀, 직책자 신규안내 수준에서 진행', 'A', '상', '상', '26.3~4Q', 'F6. 교육·육성', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '인력운영', '#EF4444', 39);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '배치·전환배치·직무이동·순환·겸직·파견', 1, '이슈인원 대응 수준', 'A', '중', '중', '26.4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '인력 재배치', 1, 'X', 'A', '중', '중', '26.4Q', 'F3. 인력운영·유지', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '변화관리', '#8B5CF6', 40);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '변화 커뮤니케이션 플랜', 1, '타운홀에서 전체 맥락 설명 및 경영진 개별 플레이', 'A', '상', '상', '26.3~4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '전환기 안정화 조치', 1, '미구축, 필요성 인식', 'A', '상', '상', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '회의체·정보구조', '#EC4899', 41);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '회의체 체계 설계', 2, '기존 회의체 유지관리 및 일부 변화', 'A', '상', '상', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '문서화·기록 체계', 1, '고맥락·구두 의존 구조', 'A', '상', '중', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '조직문화', '#06B6D4', 42);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '문화 진단(서베이·지표)', 1, '진행X', 'A', '상', '중', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '심리적 안정감·몰입도 측정', 1, '진행X', 'A', '상', '중', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '내부 커뮤니케이션', 2, '타운홀 및 사내메신저 통한 진행', 'A', '상', '상', '26.3~4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-07-01', '2026-12-31', 2);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', '구성원 경험', '#84CC16', 43);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'EX 여정 설계(입사~퇴사 터치포인트)', 1, 'X', 'A', '중', '중', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, '몰입도·경험 서베이(eNPS 등)', 1, '신규입사자에 한하여 제한적', 'A', '상', '중', '26.4Q', 'F9. 조직문화·커뮤니케이션', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;

DO $$
DECLARE item_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES
    (item_id, '5. 확장 기반', 'HR 시스템', '#A78BFA', 44);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'HRIS 구축·운영', 2, '일부 구축되어있으나 기능개선, 신규툴 도입 검토 필요', 'A', '상', '중', '27년 이후', 'F10. HR운영·시스템', NULL, NULL, NULL, NULL, NULL, 0);
  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES
    (item_id, 'HR 대시보드', 2, '피플대시보드 운영 중', 'A', '상', '상', '26.4Q', 'F10. HR운영·시스템', NULL, NULL, NULL, '2026-10-01', '2026-12-31', 1);
END $$;
