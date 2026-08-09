-- ============================================
-- v37: 생각스케치 프레임(그룹) 기능
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. sketch_frames 테이블
create table if not exists sketch_frames (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references sketch_boards(id) on delete cascade,
  title       text not null default '제목 없는 프레임',
  position_x  double precision not null default 0,
  position_y  double precision not null default 0,
  width       double precision not null default 400,
  height      double precision not null default 300,
  collapsed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sketch_frames_board_id_idx on sketch_frames(board_id);

-- updated_at 자동 갱신 트리거
create or replace function update_sketch_frames_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_sketch_frames_updated_at
  before update on sketch_frames
  for each row execute function update_sketch_frames_updated_at();

alter table sketch_frames enable row level security;
create policy "auth_all" on sketch_frames for all to authenticated using (true) with check (true);

-- 2. sketch_cards 에 frame_id 컬럼 추가
--    position_x/y 는 frame_id가 null이면 절대좌표, non-null이면 프레임 상대좌표
alter table sketch_cards add column if not exists
  frame_id uuid references sketch_frames(id) on delete set null;

create index if not exists sketch_cards_frame_id_idx on sketch_cards(frame_id);
