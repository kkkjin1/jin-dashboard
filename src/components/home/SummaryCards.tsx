import type { Task } from '@/types'
import { isMidDateSoon } from '@/lib/tasks'

interface Props { tasks: Task[] }

export default function SummaryCards({ tasks }: Props) {
  const counts = {
    진행필요: tasks.filter(t => t.status === '진행필요').length,
    진행중: tasks.filter(t => t.status === '진행중').length,
    완료: tasks.filter(t => t.status === '완료').length,
    임박: tasks.filter(t => isMidDateSoon(t)).length,
  }

  const cards = [
    { label: '진행필요', value: counts.진행필요, color: 'text-gray-500', dot: 'bg-gray-300' },
    { label: '진행중', value: counts.진행중, color: 'text-blue-600', dot: 'bg-blue-400' },
    { label: '완료', value: counts.완료, color: 'text-green-600', dot: 'bg-green-400' },
    { label: '중간공유 임박', value: counts.임박, color: 'text-amber-600', dot: 'bg-amber-400', suffix: '건' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map(card => (
        <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`w-2 h-2 rounded-full ${card.dot}`} />
            <span className="text-sm text-gray-500">{card.label}</span>
          </div>
          <p className={`text-3xl font-bold ${card.color}`}>
            {card.value}
            {card.suffix && <span className="text-lg font-medium ml-1">{card.suffix}</span>}
          </p>
        </div>
      ))}
    </div>
  )
}
