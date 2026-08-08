-- ============================================
-- v36: 생각스케치 카드 연결/종속 관계
-- 추가 테이블: sketch_edges
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

create table if not exists sketch_edges (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references sketch_boards(id) on delete cascade,
  source_card_id uuid not null references sketch_cards(id) on delete cascade,
  target_card_id uuid not null references sketch_cards(id) on delete cascade,
  created_at timestamp with time zone default now()
);

create index if not exists sketch_edges_board_id_idx on sketch_edges(board_id);

alter table sketch_edges enable row level security;
create policy "auth_all" on sketch_edges for all to authenticated using (true) with check (true);
