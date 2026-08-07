-- v26: manual_achievements — 완료성과 탭에서 자동 집계 외에 수기로 추가하는 성과 항목

CREATE TABLE IF NOT EXISTS manual_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL DEFAULT '성과' CHECK (category IN ('성과', '개선', '리소스', '수명', '기타')),
  content text NOT NULL DEFAULT '',
  month text NOT NULL, -- 'YYYY-MM'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE manual_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON manual_achievements FOR ALL TO authenticated USING (true) WITH CHECK (true);
