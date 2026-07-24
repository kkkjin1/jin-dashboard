# Color TODO — 우선순위 C (이번 revamp 범위 제외)

> color-only-revamp 브랜치에서 셸 팔레트 교체 완료 후,
> 콘텐츠 전용 색상(버튼·뱃지·카테고리)은 별도 작업으로 남김.
> 아래 목록은 향후 필요 시 참조용.

---

## 1. Brand Navy Primary — `#1B3A6B` 계열

가장 빈번한 클러스터. 버튼·활성 상태·링크에 사용.

| 파일 | 값 | 용도 | 빈도 |
|------|----|------|------|
| `app/(app)/tasks/page.tsx` | `bg-[#1B3A6B]` | 활성 필터 pill | 1 |
| `app/(app)/completed/page.tsx` | `bg-[#1B3A6B]` | 활성 기간 필터 | 1 |
| `app/(app)/decisions/page.tsx` | `bg-[#1B3A6B]` | 활성 pill | 1 |
| `app/(app)/meetings/page.tsx` | `bg-[#1B3A6B]` | 활성 pill | 1 |
| `app/(app)/memos/page.tsx` | `bg-[#1B3A6B]` | 활성 pill | 1 |
| `app/(app)/schedule/page.tsx` | `bg-[#1B3A6B]` | 활성 pill/toggle | 2 |
| `app/(app)/learning/page.tsx` | `bg-[#1B3A6B]` / `background: '#1B3A6B'` | 활성 pill, 컬럼 toggle | 2 |
| `app/(app)/one-on-one/page.tsx` | `bg-[#1B3A6B]` | 활성 view tab | 2 |
| `app/(app)/objectives/page.tsx` | `bg-[#1B3A6B]` | 추가/확인 버튼 | 3 |
| `app/(app)/journal/page.tsx` | `background: '#1B3A6B'` | 활성 선택 / export | 2 |
| `app/(app)/archive/page.tsx` | `background: '#1B3A6B'` | 저장 버튼 | 1 |
| `components/home/DailyLogWidget.tsx` | `bg-[#1B3A6B]` | 추가 버튼 | 1 |
| `components/home/DailyJournalWidget.tsx` | `bg-[#E8F0FB] text-[#1B3A6B]` | 저장 버튼 | 1 |
| `components/home/TodayTodoWidget.tsx` | `hover:text-[#1B3A6B]` 등 | hover/link | 3 |
| `components/home/TomorrowPlanWidget.tsx` | `text-[#1B3A6B]` | 완료 tick/count | 3 |
| `components/home/WeeklyGoalsWidget.tsx` | `bg-[#1B3A6B]` | 완료 체크박스 | 1 |
| `components/home/QuickAgendaInput.tsx` | `bg-[#E8F0FB] text-[#1B3A6B]` | 추가 버튼 | 1 |
| `components/home/QuickTaskInput.tsx` | `text-[#1B3A6B]` | 선택 텍스트 | 1 |
| `components/TextSelectionCapture.tsx` | `bg-[#1B3A6B]` | 팝업 bg / 저장 | 2 |
| `components/memo/QuickMemoPanel.tsx` | `background: '#1c2a3c'` | 저장 버튼 bg | 1 |
| `app/(app)/subtasks/[id]/page.tsx` | `bg-[#E8F0FB] text-[#1B3A6B]` | 저장/추가 버튼 | 2 |
| `app/(app)/tasks/[id]/page.tsx` | `bg-[#E8F0FB] text-[#1B3A6B]` | 저장 버튼 | 2 |
| `app/(app)/meetings/[id]/page.tsx` | `bg-[#E8F0FB] text-[#1B3A6B]` | 저장 버튼 | 2 |
| `app/login/page.tsx` | `bg-[#1B3A6B]` | 제출 버튼 | 1 |

**교체 후보**: `#1B3A6B` → `#4C7FE0` (ACCENT), `#E8F0FB` → `rgba(76,127,224,0.12)`

---

## 2. Green Accent — `#BADEC8` / `#5DBD97` / `#10B981` 계열

성공 상태·완료·성과 카테고리에 사용.

| 파일 | 값 | 용도 | 빈도 |
|------|----|------|------|
| `app/(app)/completed/page.tsx` | `bg-[#BADEC8]` | 성과 stat card | 3 |
| `app/(app)/tasks/page.tsx` | `bg-[#BADEC8]` | 드롭 타겟 / 완료 badge | 3 |
| `app/(app)/one-on-one/page.tsx` | `bg-[#BADEC8]` | 최신 badge / 멤버 ring | 2 |
| `app/(app)/schedule/page.tsx` | `bg-[#BADEC8]` | focus time bar / 범례 | 2 |
| `components/home/QuickAgendaInput.tsx` | `bg-[#BADEC8]` | 선택 item | 3 |
| `components/home/HomeCalendar.tsx` | `bg-[#10B981]` | 오늘 날짜 badge | 2 |
| `components/meetings/AgendaMatrix.tsx` | `'#10B981'` | STATUS_COLOR done | 1 |
| `app/(app)/tasks/[id]/page.tsx` | `bg-[#5DBD97]` | 저장 toast / 버튼 | 3 |
| `app/(app)/subtasks/[id]/page.tsx` | `bg-[#5DBD97]` | 저장 toast | 1 |
| `components/TextSelectionCapture.tsx` | `bg-[#5DBD97]` | 저장됨 toast | 1 |
| `components/memo/MobileMemoSheet.tsx` | `bg-[#10B981]` | 저장 버튼 | 1 |
| `app/(app)/meetings/[id]/page.tsx` | `text-[#5DBD97]` | 링크 버튼 / focus | 2 |

---

## 3. Category Pastels — 회의/일정 카테고리 색상

| 값 | 용도 | 사용 파일 |
|----|------|----------|
| `#90A7D8` | 경영진/일정 범주 | meetings, schedule, one-on-one, completed |
| `#EBA698` | 부정 피드백 / 범주 | one-on-one, completed, schedule |
| `#F3E482` | 비즈 범주 / 개선점 | schedule, completed, archive |
| `#BFE4B5` | 본부장 범주 / 잘한점 | meetings, completed, one-on-one |
| `#A8C0E0` | 회의 dot / 내일 계획 | meetings, schedule, TomorrowPlan |

---

## 4. 기타 다크 UI 색상

| 파일 | 값 | 용도 | 비고 |
|------|----|------|------|
| `app/(app)/objectives/page.tsx` | `bg-[#1A1C1F]` | 날짜 input bg | input 계열 |
| `app/(app)/settings/page.tsx` | `background: '#1e2130'` | select option bg | input 계열 |
| `components/memo/QuickMemoPanel.tsx` | `'#1f3045'` / `'#1c2a3c'` | 버튼 hover bg | 버튼 계열 |
| `app/(app)/completed/page.tsx` | `#2D5A45`, `#1E3A6B` | stat card text | 카테고리 텍스트 |
| `app/(app)/project/items/[id]/page.tsx` | `color: '#8FA0B5'` | chevron / 서브텍스트 | 보조 텍스트 |
| `components/MarkdownContent.tsx` | `rgba(226,232,240,0.x)` | 헤딩 텍스트 스케일 | 에디터 내부 |
| `components/TiptapEditor.tsx` | 에디터 팔레트 10종 | 텍스트 색상 선택기 | 사용자 선택값 — 변경 금지 |
| `components/meetings/AgendaMatrix.tsx` | `GROUP_COLORS` 7종 | 그룹 색상 picker | 사용자 선택값 — 변경 금지 |
| `components/ui/EmptyState.tsx` | SVG fill 색상 | 장식 일러스트 | 변경 낮은 우선순위 |

---

_Last updated: color-only-revamp 브랜치 (2026-07-24)_
