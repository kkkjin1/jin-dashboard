export default function MockupPage() {
  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 flex flex-col gap-4">

      {/* 상단 바 */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[#133124] rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">인</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">인사기획 워크</span>
        <div className="ml-auto w-48 h-8 bg-white border border-slate-200 rounded-full flex items-center px-3 gap-2 shadow-sm">
          <span className="text-slate-300 text-xs">🔍</span>
          <span className="text-xs text-slate-400">검색</span>
        </div>
      </div>

      {/* 3단 컬럼 */}
      <div className="flex-1 grid grid-cols-3 gap-4" style={{ height: 'calc(100vh - 80px)' }}>

        {/* 좌측: 오늘 */}
        <div className="bg-[#133124] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-white font-bold text-base">오늘</span>
            <span className="text-white/60 text-xs">6월 27일 금</span>
          </div>

          {/* 날씨/요약 */}
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-white/60 text-[11px] mb-1">서울 · 맑음</p>
            <p className="text-white text-2xl font-light">26°</p>
          </div>

          {/* 일정 목록 */}
          <div className="flex flex-col gap-2">
            <p className="text-white/40 text-[10px] uppercase tracking-wide">일정</p>
            {[
              { time: '10:00', title: '팀 주간 회의', tag: '정기' },
              { time: '14:00', title: '신입 온보딩 1on1', tag: '1on1' },
              { time: '16:30', title: '평가제도 리뷰', tag: '프로젝트' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                <span className="text-white/40 text-[10px] w-10 flex-shrink-0">{item.time}</span>
                <span className="text-white text-xs flex-1 truncate">{item.title}</span>
                <span className="text-white/50 text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full">{item.tag}</span>
              </div>
            ))}
          </div>

          {/* 메모 */}
          <div className="mt-auto">
            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-2">오늘의 메모</p>
            <div className="bg-white/10 rounded-xl p-3 min-h-[80px]">
              <p className="text-white/60 text-xs leading-relaxed">평가 기준 초안 검토 후 팀장님께 공유 예정. 온보딩 체크리스트 업데이트 필요.</p>
            </div>
          </div>
        </div>

        {/* 중간: 회고 */}
        <div className="bg-white rounded-xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-bold text-base">회고</span>
            <div className="flex gap-1">
              {['일', '주', '월'].map((t, i) => (
                <button key={t} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  i === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 감정 트래커 */}
          <div className="grid grid-cols-7 gap-1">
            {[
              { d: '월', e: '😊' },
              { d: '화', e: '😐' },
              { d: '수', e: '😊' },
              { d: '목', e: '🙂' },
              { d: '금', e: '😴' },
              { d: '토', e: '' },
              { d: '일', e: '' },
            ].map(({ d, e }, i) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate-400">{d}</span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                  e ? 'bg-slate-100' : 'bg-slate-50 border border-slate-100'
                }`}>
                  {e}
                </div>
              </div>
            ))}
          </div>

          {/* 회고 카드들 */}
          <div className="flex flex-col gap-2 flex-1">
            {[
              { label: '잘한 점', bg: 'bg-emerald-50', text_color: 'text-emerald-700', body: '온보딩 자료 전면 개편 완료. 신입 만족도 높아짐.' },
              { label: '개선할 점', bg: 'bg-amber-50', text_color: 'text-amber-700', body: '1on1 기록을 좀 더 구체적으로 남겨야 함.' },
              { label: '배운 것', bg: 'bg-blue-50', text_color: 'text-blue-700', body: 'OKR 프레임워크 적용 시 부서 정렬이 핵심.' },
            ].map((item, i) => (
              <div key={i} className="rounded-lg p-3 bg-slate-50 border border-slate-100">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${item.bg} ${item.text_color} mb-1.5 inline-block`}>
                  {item.label}
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 우측: 오늘 할 일 */}
        <div className="bg-white rounded-xl p-5 flex flex-col gap-4 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <span className="text-slate-900 font-bold text-base">오늘 할 일</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">5 / 8 완료</span>
          </div>

          {/* 진행률 바 */}
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-[#133124] h-1.5 rounded-full" style={{ width: '62%' }} />
          </div>

          {/* 할 일 목록 */}
          <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
            {[
              { done: true,  text: '주간 보고서 초안 작성' },
              { done: true,  text: '채용 공고 JD 검토' },
              { done: true,  text: '팀장 1on1 사전 질문 준비' },
              { done: true,  text: '인사평가 일정 공지 발송' },
              { done: true,  text: '온보딩 체크리스트 업데이트' },
              { done: false, text: '평가제도 개선안 피드백 반영' },
              { done: false, text: '하반기 채용 계획 초안' },
              { done: false, text: '복지 설문 결과 분석' },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                item.done ? 'bg-slate-50' : 'bg-white border border-slate-100'
              }`}>
                <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${
                  item.done ? 'bg-[#133124] border-[#133124]' : 'border-slate-300'
                }`}>
                  {item.done && <span className="text-white text-[8px] font-bold">✓</span>}
                </div>
                <span className={`text-xs ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>

          {/* 추가 인풋 */}
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 mt-auto">
            <span className="text-slate-300 text-sm">+</span>
            <span className="text-xs text-slate-400">새 할 일 추가</span>
          </div>
        </div>

      </div>
    </div>
  )
}
