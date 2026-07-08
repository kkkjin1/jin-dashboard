-- v19: 안건 매트릭스 (agenda matrix)
-- meetings.category 기반으로 파트별 안건 흐름 추적
-- 3-tier: meeting_category(코어/비즈) → agenda_group(범주) → agenda_item(안건 행)
-- agenda_updates: 안건 × 회의 = 셀 노트 (희소 매트릭스)

-- ── 1. 범주 (평가/보상, 노무 등) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_groups (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  -- meetings.category 와 동일한 값 사용 (코어, 비즈 등)
  category   text    NOT NULL,
  name       text    NOT NULL,
  color      text    NOT NULL DEFAULT '#9CA3AF',
  sort_order integer NOT NULL DEFAULT 0,
  is_open    boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category, name)
);

-- ── 2. 안건 행 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_items (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id        uuid    NOT NULL REFERENCES agenda_groups(id) ON DELETE CASCADE,
  title           text    NOT NULL,
  item_type       text    NOT NULL DEFAULT 'do'
                          CHECK (item_type IN ('do', 'fb', 'rp', 'ag')),
  status          text    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'hold', 'done')),
  linked_task_id  uuid    REFERENCES tasks(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  hidden          boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── 3. 셀 노트 (안건 × 회의) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_updates (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agenda_item_id uuid NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  meeting_id     uuid NOT NULL REFERENCES meetings(id)     ON DELETE CASCADE,
  note           text NOT NULL DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (agenda_item_id, meeting_id)
);

-- ── 4. RLS (다른 테이블과 동일 패턴) ────────────────────────────
ALTER TABLE agenda_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON agenda_groups  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON agenda_items   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON agenda_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. updated_at 트리거 ─────────────────────────────────────────
CREATE TRIGGER agenda_items_updated_at
  BEFORE UPDATE ON agenda_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agenda_updates_updated_at
  BEFORE UPDATE ON agenda_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 6. 인덱스 ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agenda_groups_category  ON agenda_groups  (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_agenda_items_group      ON agenda_items   (group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_agenda_updates_item     ON agenda_updates (agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_agenda_updates_meeting  ON agenda_updates (meeting_id);

-- ── 7. meetings 테이블에 category 컬럼이 없으면 추가 ─────────────
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS category text;
