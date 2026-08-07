-- v27: 완료 성과 탭 전면 재설계
-- - agenda_sub_tasks(프로젝트 탭 세부task)에 기획/운영/개선 태그 컬럼 추가
-- - manual_achievements를 그룹(agenda_groups) + 기획/운영/개선 태그 기반으로 재생성
--   (v26의 성과/개선/리소스/수명/기타 카테고리 체계는 폐기)

ALTER TABLE agenda_sub_tasks
  ADD COLUMN IF NOT EXISTS achievement_type text
  CHECK (achievement_type IN ('기획', '운영', '개선'));

DROP TABLE IF EXISTS manual_achievements;

CREATE TABLE manual_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES agenda_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  achievement_type text CHECK (achievement_type IN ('기획', '운영', '개선')),
  month text NOT NULL, -- 완료 처리 월, 'YYYY-MM'
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE manual_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON manual_achievements FOR ALL TO authenticated USING (true) WITH CHECK (true);
