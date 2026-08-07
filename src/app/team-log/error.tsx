'use client'

// 다른 컴포넌트를 import하지 않는 독립된 에러 화면.
// /team-log에서 어떤 예외가 나도 이 화면만 보이고, 다른 탭으로 이어지는 코드 경로는 없다.

export default function TeamLogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5] px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm text-center">
        <p className="text-sm text-gray-700 mb-4">일시적인 오류가 발생했습니다.</p>
        <button
          onClick={reset}
          className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
