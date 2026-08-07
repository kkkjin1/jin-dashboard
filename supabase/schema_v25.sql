-- v25: annual_goal_category_labels
-- 카테고리 표시 이름을 편집 가능하게 만들기 위한 작은 매핑 테이블.
-- category_key는 annual_goal_items.category에 저장된 고정 키('1. 인재 확보' 등)를 그대로 사용하고,
-- name만 편집 가능한 표시용 이름으로 분리한다. 기존 안건/세부task 데이터의 category 값은 손대지 않는다.

CREATE TABLE IF NOT EXISTS annual_goal_category_labels (
  category_key text PRIMARY KEY,
  name text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE annual_goal_category_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON annual_goal_category_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER annual_goal_category_labels_updated_at BEFORE UPDATE ON annual_goal_category_labels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO annual_goal_category_labels (category_key, name) VALUES
  ('1. 인재 확보', '인재 확보'),
  ('2. 검증과 정렬', '검증과 정렬'),
  ('3. 유지와 보상', '유지와 보상'),
  ('4. 지속가능성', '지속가능성'),
  ('5. 확장 기반', '확장 기반')
ON CONFLICT (category_key) DO NOTHING;
