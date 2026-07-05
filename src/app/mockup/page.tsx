export default function MockupPage() {
  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 flex flex-col gap-4">

      {/* 상단 바 */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-[#133124] rounded-md flex items-center justify-center">
          <span className="text-white text-[11px] font-bold tracking-tight">인</span>
        </div>
        <span className="text-sm font-semibold text-slate-900 tracking-tight">인사기획 워크</span>
        <div className="ml-auto w-48 h-8 bg-white border border-slate-200 rounded-lg flex items-center px-3 gap-2 shadow-sm">
          <span className="text-slate-300 text-xs">🔍</span>
          <span className="text-xs text-slate-400">검색</span>
        </div>
      </div>

      {/* 3단 컬럼 */}
      <div className="grid grid-cols-3 gap-4" style={{ height: 'calc(100vh - 72px)' }}>

        {/* ── 좌측: 오늘 ── */}
        <div className="bg-[#133124] rounded-xl p-5 flex flex-col gap-0 overflow-hidden">

          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-semibold text-sm tracking-tight">오늘</span>
            <span className="text-white/50 text-[11px]">6월 27일 금</span>
          </div>

          {/* 날씨 */}
          <div className="mb-4 pb-4 border-b border-white/10">
            <p className="text-white/50 text-[10px] mb-1 tracking-wide uppercase">서울 · 맑음</p>
            <div className="flex items-end gap-2">
              <p className="text-white text-3xl font-light leading-none">26°</p>
              <p className="text-white/40 text-xs mb-1">체감 24°</p>
            </div>
          </div>

          {/* 일정 */}
          <div className="mb-4">
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">일정</p>
            <div className="flex flex-col gap-1.5">
              {[
                { time: '10:00', title: '팀 주간 회의', tag: '정기' },
                { time: '14:00', title: '신입 온보딩 1on1', tag: '1on1' },
                { time: '16:30', title: '평가제도 리뷰', tag: '프로젝트' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-3 py-2">
                  <span className="text-white/40 text-[10px] w-9 flex-shrink-0 font-medium tabular-nums">{item.time}</span>
                  <span className="text-white/90 text-xs flex-1 truncate font-medium">{item.title}</span>
                  <span className="text-white/40 text-[9px] border border-white/15 px-1.5 py-0.5 rounded">{item.tag}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div className="mt-auto pt-4 border-t border-white/10">
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">메모</p>
            <div className="bg-white/5 border border-white/8 rounded-lg p-3 min-h-[72px]">
              <p className="text-white/60 text-[11px] leading-relaxed">평가 기준 초안 검토 후 팀장님께 공유 예정. 온보딩 체크리스트 업데이트 필요.</p>
            </div>
          </div>
        </div>

        {/* ── 중간: 회고 ── */}
        <div className="bg-white rounded-xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)]">

          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-semibold text-sm tracking-tight">회고</span>
            <div className="flex gap-1 border border-slate-200 rounded-lg p-0.5">
              {['일', '주', '월'].map((t, i) => (
                <button key={t} className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
                  i === 0 ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'
                }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* 감정 트래커 */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">이번 주 컨디션</p>
            <div className="grid grid-cols-7 gap-1">
              {[
                { d: '월', e: '😊' }, { d: '화', e: '😐' }, { d: '수', e: '😊' },
                { d: '목', e: '🙂' }, { d: '금', e: '😴' }, { d: '토', e: '' }, { d: '일', e: '' },
              ].map(({ d, e }) => (
                <div key={d} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-400 font-medium">{d}</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    e ? 'bg-slate-100' : 'bg-slate-50 border border-slate-100'
                  }`}>{e}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 회고 항목 */}
          <div className="flex flex-col gap-2 flex-1">
            {[
              { label: '잘한 점',   bg: 'bg-emerald-50', fg: 'text-emerald-700', body: '온보딩 자료 전면 개편 완료. 신입 만족도 높아짐.' },
              { label: '개선할 점', bg: 'bg-amber-50',   fg: 'text-amber-700',   body: '1on1 기록을 좀 더 구체적으로 남겨야 함.' },
              { label: '배운 것',   bg: 'bg-blue-50',    fg: 'text-blue-700',    body: 'OKR 프레임워크 적용 시 부서 정렬이 핵심.' },
            ].map((item, i) => (
              <div key={i} className="rounded-lg p-3 border border-slate-100 bg-slate-50/60">
                <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${item.bg} ${item.fg} mb-2`}>
                  {item.label}
                </span>
                <p className="text-[11px] text-slate-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 우측: 오늘 할 일 ── */}
        <div className="bg-white rounded-xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)]">

          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-semibold text-sm tracking-tight">오늘 할 일</span>
            <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium">5 / 8</span>
          </div>

          {/* 진행률 바 */}
          <div>
            <div className="w-full bg-slate-100 rounded-full h-1">
              <div className="bg-[#133124] h-1 rounded-full" style={{ width: '62%' }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">62% 완료</p>
          </div>

          {/* 섹션: 미완료 */}
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">미완료</p>
              <div className="flex flex-col gap-1">
                {[
                  '평가제도 개선안 피드백 반영',
                  '하반기 채용 계획 초안',
                  '복지 설문 결과 분석',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-100 bg-white">
                    <div className="w-3.5 h-3.5 rounded-sm border border-slate-300 flex-shrink-0" />
                    <span className="text-[11px] text-slate-700 font-medium">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 섹션: 완료 */}
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">완료</p>
              <div className="flex flex-col gap-1">
                {[
                  '주간 보고서 초안 작성',
                  '채용 공고 JD 검토',
                  '팀장 1on1 사전 질문 준비',
                  '인사평가 일정 공지 발송',
                  '온보딩 체크리스트 업데이트',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50">
                    <div className="w-3.5 h-3.5 rounded-sm bg-[#133124] border border-[#133124] flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-[7px] font-bold leading-none">✓</span>
                    </div>
                    <span className="text-[11px] text-slate-400 line-through">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 추가 인풋 */}
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-slate-300 text-base leading-none">+</span>
            <span className="text-[11px] text-slate-400">할 일 추가</span>
          </div>
        </div>

      </div>
    </div>
  )
}
