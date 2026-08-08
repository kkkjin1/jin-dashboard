-- ============================================
-- v35: 생각스케치 (무한 캔버스 보드)
-- 추가 테이블: sketch_boards, sketch_cards
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. 보드 테이블 (주제별로 여러 개 생성)
create table if not exists sketch_boards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. 카드 테이블 (보드에 속한 자유배치 텍스트 카드)
--    color: CATEGORY_PALETTE(src/lib/categoryColors.ts) 키와 동일하게 맞춤
create table if not exists sketch_cards (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references sketch_boards(id) on delete cascade,
  content text not null default '',
  color text not null default 'blue'
    check (color in ('blue', 'purple', 'teal', 'amber', 'pink', 'green', 'cyan', 'lilac', 'neutral')),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  width double precision not null default 220,
  height double precision not null default 140,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists sketch_cards_board_id_idx on sketch_cards(board_id);

-- 3. RLS 활성화 + 인증된 사용자만 접근 허용
alter table sketch_boards enable row level security;
alter table sketch_cards enable row level security;

create policy "auth_all" on sketch_boards for all to authenticated using (true) with check (true);
create policy "auth_all" on sketch_cards for all to authenticated using (true) with check (true);

-- 4. updated_at 자동 갱신 트리거
--    update_updated_at() 함수는 schema.sql / schema_v2.sql에 이미 정의됨
create trigger sketch_boards_updated_at
  before update on sketch_boards
  for each row execute function update_updated_at();

create trigger sketch_cards_updated_at
  before update on sketch_cards
  for each row execute function update_updated_at();
