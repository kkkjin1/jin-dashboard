export default function MockupPage() {
  return (
    <div className="min-h-screen bg-[#F1F5F9] font-sans py-4 flex flex-col items-center gap-4">

      {/* 상단 캡슐 메뉴바 — 80% 너비, 중앙 정렬 */}
      <div className="w-[80%] flex items-center gap-3">
        <div className="w-8 h-8 bg-[#0F1E36] rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-white text-[11px] font-bold tracking-tight">인</span>
        </div>
        <span className="text-sm font-semibold text-slate-900 tracking-tight">인사기획 워크</span>
        <div className="ml-6 bg-white border border-slate-200 rounded-full px-1.5 py-1 flex items-center gap-0.5 shadow-sm">
          {['오늘', '내일', '금주', '회고', '할 일'].map((t, i) => (
            <button key={t} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              i === 0 ? 'bg-[#0F1E36] text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}>{t}</button>
          ))}
        </div>
        <div className="ml-auto w-44 h-8 bg-white border border-slate-200 rounded-full flex items-center px-3 gap-2 shadow-sm">
          <span className="text-slate-300 text-xs">🔍</span>
          <span className="text-xs text-slate-400">검색</span>
        </div>
      </div>

      {/* 5단 비대칭 칸반 보드 — 동일한 80% 너비 */}
      <div className="w-[80%] grid grid-cols-6 gap-3" style={{ height: 'calc(100vh - 80px)' }}>

        {/* ① 오늘 — col-span-2 (주인공) */}
        <div className="col-span-2 bg-[#0F1E36] rounded-3xl p-6 flex flex-col gap-0 overflow-hidden">
          <div className="flex items-center justify-between mb-5">
            <span className="text-white font-semibold text-base tracking-tight">오늘</span>
            <span className="text-white/40 text-[11px]">6월 27일 금요일</span>
          </div>

          {/* 날씨 */}
          <div className="mb-5 pb-5 border-b border-white/10">
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">서울 · 맑음</p>
            <div className="flex items-end gap-3">
              <p className="text-white text-5xl font-thin leading-none">26°</p>
              <div className="mb-1">
                <p className="text-white/40 text-xs">최고 29° / 최저 19°</p>
                <p className="text-white/30 text-xs">체감 24°</p>
              </div>
            </div>
          </div>

          {/* 일정 */}
          <div className="mb-5">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-3">오늘 일정</p>
            <div className="flex flex-col gap-2">
              {[
                { time: '10:00', title: '팀 주간 회의', tag: '정기' },
                { time: '14:00', title: '신입 온보딩 1on1', tag: '1on1' },
                { time: '16:30', title: '평가제도 리뷰', tag: '프로젝트' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-2xl px-4 py-2.5">
                  <span className="text-white/30 text-xs w-10 flex-shrink-0 tabular-nums font-medium">{item.time}</span>
                  <span className="text-white/80 text-sm flex-1 truncate font-medium">{item.title}</span>
                  <span className="text-white/30 text-[10px] border border-white/15 px-2 py-0.5 rounded-lg">{item.tag}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div className="mt-auto pt-5 border-t border-white/10">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2">오늘의 메모</p>
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4 min-h-[80px]">
              <p className="text-white/50 text-xs leading-relaxed">평가 기준 초안 검토 후 팀장님께 공유 예정. 온보딩 체크리스트 업데이트 필요.</p>
            </div>
          </div>
        </div>

        {/* ② 내일 — col-span-1 */}
        <div className="col-span-1 bg-white rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-semibold text-sm tracking-tight">내일</span>
            <span className="text-slate-400 text-[10px]">6/28 토</span>
          </div>

          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">예정 일정</p>
            <div className="flex flex-col gap-1.5">
              {[
                { time: '09:00', title: '보고서 최종 제출', tag: '마감' },
                { time: '11:00', title: '하반기 채용 킥오프', tag: '회의' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2">
                  <span className="text-slate-400 text-[10px] w-8 flex-shrink-0 tabular-nums">{item.time}</span>
                  <span className="text-slate-700 text-[11px] flex-1 truncate font-medium">{item.title}</span>
                  <span className="text-slate-400 text-[9px] border border-slate-200 px-1.5 py-0.5 rounded-lg">{item.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">준비 사항</p>
            <div className="flex flex-col gap-1.5">
              {['JD 초안 검토', '면접 평가표 수정', '온보딩 일정 확인'].map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-100 rounded-xl">
                  <div className="w-3 h-3 rounded border border-slate-300 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto bg-slate-50 border border-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">토요일이지만 마감 건 처리 필요.</p>
          </div>
        </div>

        {/* ③ 금주 — col-span-1 */}
        <div className="col-span-1 bg-white rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
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
                <div key={i} className={`flex items-start gap-2 px-2.5 py-2 rounded-xl border ${item.done ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100'}`}>
                  <div className={`w-3.5 h-3.5 rounded mt-0.5 flex-shrink-0 flex items-center justify-center border ${item.done ? 'bg-[#0F1E36] border-[#0F1E36]' : 'border-slate-300'}`}>
                    {item.done && <span className="text-white text-[7px] font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mr-1">{item.label}</span>
                    <span className={`text-[11px] ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</span>
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
                  <span className="text-[11px] text-slate-700 font-medium">{m.title}</span>
                  <span className="text-[10px] text-slate-400">{m.date}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-[#0F1E36] h-1.5 rounded-full" style={{ width: `${m.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ④ 회고 — col-span-1 */}
        <div className="col-span-1 bg-white rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
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
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm ${e ? 'bg-slate-100' : 'bg-slate-50 border border-slate-100'}`}>{e}</div>
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
                <p className="text-[11px] text-slate-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ⑤ 오늘 할 일 — col-span-1 (단순 메모 수준) */}
        <div className="col-span-1 bg-white rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-semibold text-sm tracking-tight">오늘 할 일</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">5/8</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-[#0F1E36] h-1.5 rounded-full" style={{ width: '62%' }} />
          </div>

          <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
            {[
              { done: false, text: '평가제도 피드백 반영' },
              { done: false, text: '하반기 채용 계획 초안' },
              { done: false, text: '복지 설문 결과 분석' },
              { done: true,  text: '주간 보고서 초안' },
              { done: true,  text: '채용 공고 JD 검토' },
              { done: true,  text: '팀장 1on1 준비' },
              { done: true,  text: '인사평가 일정 공지' },
              { done: true,  text: '온보딩 체크리스트' },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl ${item.done ? 'bg-slate-50' : 'border border-slate-100'}`}>
                <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border ${item.done ? 'bg-[#0F1E36] border-[#0F1E36]' : 'border-slate-300'}`}>
                  {item.done && <span className="text-white text-[7px] font-bold">✓</span>}
                </div>
                <span className={`text-[11px] ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border border-slate-200 rounded-2xl px-3 py-2.5">
            <span className="text-slate-300">+</span>
            <span className="text-xs text-slate-400">할 일 추가</span>
          </div>
        </div>

      </div>
    </div>
  )
}
