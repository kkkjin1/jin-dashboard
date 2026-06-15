import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-gray-100', className)} />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 p-4 space-y-3', className)}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <Skeleton className="h-3.5 w-3.5 rounded-sm flex-shrink-0" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-5 w-14 rounded-full flex-shrink-0" />
    </div>
  )
}

export function TaskPageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <Skeleton className="h-4 w-28 mb-3" />
          {[1, 2, 3].map(j => <SkeletonRow key={j} />)}
        </div>
      ))}
    </div>
  )
}

export function MemoPageSkeleton() {
  return (
    <div className="p-4 md:p-6 animate-pulse">
      <Skeleton className="h-6 w-24 mb-5" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-20" />
            {[1, 2].map(j => <SkeletonCard key={j} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomePageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg hidden sm:block" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  )
}
