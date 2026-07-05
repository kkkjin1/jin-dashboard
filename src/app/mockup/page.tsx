'use client'

import { useState } from 'react'

const TODOS = [
  { done: false, text: '평가제도 피드백 반영', tag: '평가' },
  { done: false, text: '하반기 채용 계획 초안', tag: '채용' },
  { done: false, text: '복지 설문 결과 분석', tag: '복지' },
  { done: true,  text: '주간 보고서 초안 작성', tag: '보고' },
  { done: true,  text: '채용 공고 JD 검토', tag: '채용' },
  { done: true,  text: '팀장 1on1 사전 준비', tag: '1on1' },
  { done: true,  text: '인사평가 일정 공지', tag: '평가' },
  { done: true,  text: '온보딩 체크리스트', tag: '온보딩' },
]

const SCHEDULE = [
  { time: '10:00', title: '팀 주간 회의', tag: '정기' },
  { time: '14:00', title: '신입 온보딩 1on1', tag: '1on1' },
  { time: '16:30', title: '평가제도 리뷰', tag: '프로젝트' },
]

export default function MockupPage() {
  const [query, setQuery] = useState('')

  const q = query.toLowerCase()
  const filteredTodos = TODOS.filter(t => !q || t.text.includes(q) || t.tag.includes(q))
  const filteredSchedule = SCHEDULE.filter(s => !q || s.title.includes(q) || s.tag.includes(q))

  return (
    <div className="h-screen overflow-hidden bg-[#F1F5F9] font-sans">
      <div className="max-w-7xl mx-auto px-6 py-5 h-full flex flex-col gap-4">

        {/* ── 상단 캡슐 메뉴바 ── */}
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#0F1E36] rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white text-[11px] font-bold">인</span>
          </div>
          <span className="text-sm font-semibold text-slate-900 tracking-tight">인사기획 워크</span>

          <div className="ml-6 bg-white border border-slate-200 rounded-full px-1.5 py-1 flex items-center gap-0.5 shadow-sm">
            {['오늘', '내일', '금주', '회고', '할 일'].map((t, i) => (
              <button key={t} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                i === 0 ? 'bg-[#0F1E36] text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}>{t}</button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 w-52 h-9 bg-white border border-slate-200 rounded-full px-3 shadow-sm">
            <span className="text-slate-300 text-xs">🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="업무 검색"
              className="flex-1 text-xs text-slate-700 bg-transparent focus:outline-none placeholder:text-slate-300"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-300 hover:text-slate-500 text-xs leading-none">×</button>
            )}
          </div>
        </div>

        {/* ── 메인 그리드: 좌 5 + 우 7 ── */}
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">

          {/* ── 좌측: 오늘 (col-span-5) ── */}
          <div className="col-span-5 bg-[#0F1E36] rounded-3xl p-7 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-6">
              <span className="text-white font-semibold text-base tracking-tight">오늘</span>
              <span className="text-white/40 text-xs">6월 27일 금요일</span>
            </div>

            {/* 날씨 */}
            <div className="mb-6 pb-6 border-b border-white/10">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-3">서울 · 맑음</p>
              <div className="flex items-end gap-4">
                <p className="text-white text-6xl font-thin leading-none">26°</p>
                <div className="mb-1.5">
                  <p className="text-white/50 text-sm">맑음</p>
                  <p className="text-white/30 text-xs mt-0.5">최고 29° / 최저 19° · 체감 24°</p>
                </div>
              </div>
            </div>

            {/* 일정 */}
            <div className="mb-6">
              <p className="text-white/30 text-[10px] uppercase tracking-widest mb-3">오늘 일정</p>
              <div className="flex flex-col gap-2">
                {(filteredSchedule.length ? filteredSchedule : SCHEDULE).map((item, i) => {
                  const highlighted = q && (item.title.includes(q) || item.tag.includes(q))
                  return (
                    <div key={i} className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                      highlighted ? 'bg-white/20 border border-white/30' : 'bg-white/5 border border-white/8'
                    }`}>
                      <span className="text-white/30 text-xs w-10 flex-shrink-0 tabular-nums font-medium">{item.time}</span>
                      <span className="text-white/85 text-sm flex-1 truncate font-medium">{item.title}</span>
                      <span className="text-white/30 text-[10px] border border-white/15 px-2 py-0.5 rounded-lg">{item.tag}</span>
                    </div>
                  )
                })}
                {filteredSchedule.length === 0 && q && (
                  <p className="text-white/30 text-xs py-3 text-center">검색 결과 없음</p>
                )}
              </div>
            </div>

            {/* 메모 */}
            <div className="mt-auto pt-6 border-t border-white/10">
              <p className="text-white/30 text-[10px] uppercase tracking-widest mb-3">오늘의 메모</p>
              <div className="bg-white/5 border border-white/8 rounded-2xl p-4 min-h-[100px]">
                <p className="text-white/50 text-sm leading-relaxed">평가 기준 초안 검토 후 팀장님께 공유 예정. 온보딩 체크리스트 업데이트 필요.</p>
              </div>
            </div>
          </div>

          {/* ── 우측: 2×2 그리드 (col-span-7) ── */}
          <div className="col-span-7 grid grid-cols-2 gap-5 min-h-0">

            {/* 내일 */}
            <div className="bg-white rounded-3xl p-5 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-semibold text-sm tracking-tight">내일</span>
                <span className="text-slate-400 text-[10px]">6월 28일 토</span>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">예정 일정</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { time: '09:00', title: '보고서 최종 제출', tag: '마감' },
                    { time: '11:00', title: '하반기 채용 킥오프', tag: '회의' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <span className="text-slate-400 text-[10px] w-8 flex-shrink-0 tabular-nums">{item.time}</span>
                      <span className="text-slate-700 text-xs flex-1 truncate font-medium">{item.title}</span>
                      <span className="text-slate-400 text-[9px] border border-slate-200 px-1.5 py-0.5 rounded-lg">{item.tag}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">준비 사항</p>
                <div className="flex flex-col gap-1.5">
                  {['JD 초안 검토', '면접 평가표 수정', '온보딩 일정 확인'].map((t, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 border border-slate-100 rounded-xl">
                      <div className="w-3 h-3 rounded border border-slate-300 flex-shrink-0" />
                      <span className="text-xs text-slate-600">{t}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-xs text-slate-400 leading-relaxed">토요일이지만 마감 건 처리 필요.</p>
              </div>
            </div>

            {/* 금주 */}
            <div className="bg-white rounded-3xl p-5 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-semibold text-sm tracking-tight">금주</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-medium">W26</span>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">주간 목표</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: '채용', text: '하반기 JD 3종 완성', done: true },
                    { label: '평가', text: '평가 기준 초안 확정', done: true },
                    { label: '온보딩', text: '신입 1주차 리뷰', done: false },
                    { label: '조직', text: '팀 빌딩 일정 조율', done: false },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl border ${item.done ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100'}`}>
                      <div className={`w-3.5 h-3.5 rounded mt-0.5 flex-shrink-0 flex items-center justify-center border ${item.done ? 'bg-[#0F1E36] border-[#0F1E36]' : 'border-slate-300'}`}>
                        {item.done && <span className="text-white text-[7px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mr-1">{item.label}</span>
                        <span className={`text-xs ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">마일스톤</p>
                {[
                  { title: '상반기 평가 마감', date: '6/28', pct: 90 },
                  { title: '하반기 채용 공고', date: '7/03', pct: 40 },
                ].map((m, i) => (
                  <div key={i} className="mb-3">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-slate-700 font-medium">{m.title}</span>
                      <span className="text-[10px] text-slate-400">{m.date}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-[#0F1E36] h-1.5 rounded-full" style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 회고 */}
            <div className="bg-white rounded-3xl p-5 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-semibold text-sm tracking-tight">회고</span>
                <div className="flex gap-0.5 bg-slate-100 rounded-full p-0.5">
                  {['일', '주', '월'].map((t, i) => (
                    <button key={t} className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${
                      i === 0 ? 'bg-[#0F1E36] text-white shadow-sm' : 'text-slate-400'
                    }`}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">이번 주 컨디션</p>
                <div className="grid grid-cols-7 gap-1">
                  {[
                    { d: '월', e: '😊' }, { d: '화', e: '😐' }, { d: '수', e: '😊' },
                    { d: '목', e: '🙂' }, { d: '금', e: '😴' }, { d: '토', e: '' }, { d: '일', e: '' },
                  ].map(({ d, e }) => (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <span className="text-[9px] text-slate-400 font-medium">{d}</span>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${e ? 'bg-slate-100' : 'bg-slate-50 border border-slate-100'}`}>{e}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {[
                  { label: '잘한 점',   bg: 'bg-blue-50',   fg: 'text-blue-700',  body: '온보딩 자료 전면 개편 완료. 신입 만족도 높아짐.' },
                  { label: '개선할 점', bg: 'bg-amber-50',  fg: 'text-amber-700', body: '1on1 기록을 더 구체적으로 남겨야 함.' },
                  { label: '배운 것',   bg: 'bg-slate-100', fg: 'text-slate-600', body: 'OKR 적용 시 부서 정렬이 핵심.' },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl p-3 border border-slate-100 bg-slate-50/60">
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.bg} ${item.fg} mb-1.5`}>
                      {item.label}
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 오늘 할 일 */}
            <div className="bg-white rounded-3xl p-5 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-semibold text-sm tracking-tight">오늘 할 일</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredTodos.filter(t => t.done).length}/{filteredTodos.length}
                </span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-[#0F1E36] h-1.5 rounded-full transition-all"
                  style={{ width: filteredTodos.length ? `${Math.round(filteredTodos.filter(t => t.done).length / filteredTodos.length * 100)}%` : '0%' }} />
              </div>

              <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
                {filteredTodos.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">검색 결과 없음</p>
                ) : filteredTodos.map((item, i) => {
                  const highlighted = q && (item.text.includes(q) || item.tag.includes(q))
                  return (
                    <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all ${
                      highlighted ? 'bg-blue-50 border border-blue-100' : item.done ? 'bg-slate-50' : 'border border-slate-100'
                    }`}>
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                        item.done ? 'bg-[#0F1E36] border-[#0F1E36]' : 'border-slate-300'
                      }`}>
                        {item.done && <span className="text-white text-[8px] font-bold">✓</span>}
                      </div>
                      <span className={`text-xs flex-1 ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.text}</span>
                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{item.tag}</span>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-2 border border-slate-200 rounded-2xl px-4 py-2.5">
                <span className="text-slate-300">+</span>
                <span className="text-xs text-slate-400">할 일 추가</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
