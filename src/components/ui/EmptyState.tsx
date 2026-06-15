interface EmptyStateProps {
  icon: 'tasks' | 'memo' | 'meeting' | 'learning' | 'oneOnOne'
  title: string
  description?: string
  action?: React.ReactNode
}

const ICONS = {
  tasks: (
    <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20">
      <rect x="12" y="10" width="56" height="60" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="22" y="24" width="24" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="22" y="33" width="36" height="3" rx="1.5" fill="#E2E8F0"/>
      <rect x="22" y="42" width="30" height="3" rx="1.5" fill="#E2E8F0"/>
      <rect x="22" y="51" width="20" height="3" rx="1.5" fill="#E2E8F0"/>
      <circle cx="57" cy="57" r="14" fill="#10B981"/>
      <path d="M51 57l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  memo: (
    <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20">
      <rect x="10" y="14" width="44" height="52" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="20" y="26" width="24" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="20" y="35" width="30" height="3" rx="1.5" fill="#E2E8F0"/>
      <rect x="20" y="44" width="20" height="3" rx="1.5" fill="#E2E8F0"/>
      <rect x="30" y="8" width="44" height="52" rx="8" fill="white" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="40" y="22" width="24" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="40" y="31" width="20" height="3" rx="1.5" fill="#E2E8F0"/>
      <rect x="40" y="40" width="16" height="3" rx="1.5" fill="#E2E8F0"/>
      <circle cx="62" cy="62" r="10" fill="#10B981"/>
      <path d="M58 62h8M62 58v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  meeting: (
    <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20">
      <circle cx="30" cy="28" r="10" fill="#E2E8F0"/>
      <circle cx="50" cy="28" r="10" fill="#CBD5E1"/>
      <ellipse cx="30" cy="52" rx="16" ry="8" fill="#E2E8F0"/>
      <ellipse cx="50" cy="52" rx="16" ry="8" fill="#CBD5E1" opacity="0.7"/>
      <circle cx="62" cy="20" r="10" fill="#10B981"/>
      <path d="M58 20h8M62 16v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  learning: (
    <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20">
      <rect x="14" y="16" width="32" height="44" rx="4" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="34" y="16" width="32" height="44" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="38" y="26" width="20" height="2.5" rx="1.25" fill="#CBD5E1"/>
      <rect x="38" y="33" width="16" height="2.5" rx="1.25" fill="#E2E8F0"/>
      <rect x="38" y="40" width="18" height="2.5" rx="1.25" fill="#E2E8F0"/>
      <rect x="38" y="47" width="12" height="2.5" rx="1.25" fill="#E2E8F0"/>
      <path d="M34 16 L34 60" stroke="#E2E8F0" strokeWidth="1.5"/>
      <circle cx="60" cy="60" r="12" fill="#10B981"/>
      <path d="M55 60l4 4 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  oneOnOne: (
    <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20">
      <circle cx="28" cy="28" r="12" fill="#E2E8F0"/>
      <circle cx="52" cy="28" r="12" fill="#CBD5E1"/>
      <path d="M10 62c0-10 8-16 18-16s18 6 18 16" stroke="#E2E8F0" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M34 62c0-10 8-16 18-16s18 6 18 16" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"/>
      <rect x="32" y="40" width="16" height="12" rx="3" fill="#10B981"/>
      <path d="M36 46h8M40 43v6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 opacity-80">{ICONS[icon]}</div>
      <p className="text-sm font-semibold text-gray-500 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 mb-4 max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
