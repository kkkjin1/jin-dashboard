'use client'

// 학습자료 > 📚 책장 보기 — media_type='책'인 자료만 표지 카드로 보여주고, 오른쪽에서 책 기록(별점·완독일·한 줄 정리·
// 밑줄 문장·업무 적용·연결 안건)을 바로 고친다. 상태는 기존 학습자료와 같은 tags의 _doing/_done을 쓴다(schema_v73 칸 추가).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { LearningResource } from '@/types'
import { todayYmd } from '@/lib/tiptapExtensions'
import { getStatus } from './LearningRow'
import { TAG_PALETTE, NO_TAG_COLOR, resolveTagColors } from '@/lib/learningTagColors'

type Status = 'todo' | 'doing' | 'done'
type Apply = { text: string; done: boolean }

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  todo:  { label: '읽을 책', color: 'rgba(var(--text-rgb),0.55)', bg: 'rgba(var(--ink-rgb),0.07)' },
  doing: { label: '읽는 중', color: '#D97706', bg: 'rgba(245,158,11,0.14)' },
  done:  { label: '완독',   color: '#16A34A', bg: 'rgba(34,197,94,0.14)' },
}
const STATUS_ORDER: Status[] = ['todo', 'doing', 'done']


const T1 = 'rgba(var(--text-rgb),0.92)'
const T2 = 'rgba(var(--text-rgb),0.55)'
const T3 = 'rgba(var(--text-rgb),0.3)'
const LINE = 'rgba(var(--ink-rgb),0.08)'

interface Props {
  resources: LearningResource[]
  setResources: React.Dispatch<React.SetStateAction<LearningResource[]>>
  customTags: string[]
  saveCustomTags: (next: string[]) => void
  onRenameTag: (oldTag: string, newTag: string) => Promise<number>
  onDeleteTag: (tag: string) => Promise<boolean>
  tagColors: Record<string, string>
  onSetTagColor: (tag: string, color: string) => void
  adding: boolean
  setAdding: (v: boolean) => void
}

function bookTag(r: LearningResource, customTags: string[]): string {
  return (r.tags ?? []).find(t => customTags.includes(t)) ?? '미분류'
}

// 표지 자체로 상태가 보이게: 읽을 책=흐린 표지 / 읽는 중=주황 책갈피+하단 진행 막대 / 완독=초록 체크 도장
function Cover({ book, color, big = false }: { book: LearningResource; color: string; big?: boolean }) {
  const st = getStatus(book.tags ?? [])
  const w = big ? 92 : 64
  const h = big ? 128 : 88
  return (
    <div className="relative flex-shrink-0" style={{ width: w, height: h }}>
      <div
        className="absolute inset-0 rounded-md overflow-hidden shadow-sm"
        style={{
          background: `linear-gradient(160deg, ${color}, ${color}cc)`,
          opacity: st === 'todo' ? 0.5 : 1,
          filter: st === 'todo' ? 'saturate(0.55)' : undefined,
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: 'rgba(0,0,0,0.18)' }} />
        <div className="absolute inset-0 p-2 pl-3 flex flex-col justify-between" style={{ paddingBottom: st === 'doing' ? 10 : undefined }}>
          <span className="text-white font-bold leading-tight line-clamp-4" style={{ fontSize: big ? 13 : 10.5 }}>{book.title || '제목 없음'}</span>
          <span className="text-white/75 truncate" style={{ fontSize: big ? 10 : 8.5 }}>{book.author}</span>
        </div>
        {st === 'doing' && (
          <div className="absolute left-0 right-0 bottom-0" style={{ height: big ? 5 : 4, background: 'rgba(255,255,255,0.3)' }}>
            <div className="h-full" style={{ width: `${book.progress ?? 0}%`, background: '#FBBF24' }} />
          </div>
        )}
      </div>
      {st === 'doing' && (
        <div
          className="absolute shadow"
          style={{
            top: -2, right: big ? 10 : 7, width: big ? 13 : 10, height: big ? 30 : 22, background: '#F59E0B',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
          }}
          title="읽는 중"
        />
      )}
      {st === 'done' && (
        <div
          className="absolute flex items-center justify-center rounded-full font-bold text-white"
          style={{
            right: -5, bottom: -5, width: big ? 28 : 21, height: big ? 28 : 21, fontSize: big ? 14 : 11,
            background: '#16A34A', border: '2px solid var(--bg-page)',
          }}
          title="완독"
        >✓</div>
      )}
    </div>
  )
}

function Stars({ value, onChange, size = 11 }: { value?: number | null; onChange?: (n: number | null) => void; size?: number }) {
  if (!onChange && !value) return null
  return (
    <span className="inline-flex" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={onChange ? e => { e.stopPropagation(); onChange(value === n ? null : n) } : undefined}
          style={{ color: value && n <= value ? '#F59E0B' : 'rgba(var(--ink-rgb),0.18)', cursor: onChange ? 'pointer' : 'default' }}
        >★</span>
      ))}
    </span>
  )
}

// 포커스를 잃을 때만 저장하는 입력칸. key로 책이 바뀌면 새 값으로 다시 그림.
function BlurInput({ value, onSave, placeholder, className, style, multiline }: {
  value: string; onSave: (v: string) => void; placeholder?: string
  className?: string; style?: React.CSSProperties; multiline?: boolean
}) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) } // 바깥 값이 바뀌면(다른 책·삭제로 밀림) 새 값으로
  const commit = () => { if (v !== value) onSave(v) }
  const common = {
    value: v, placeholder,
    className: `bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.25)] ${className ?? ''}`,
    style: { color: T1, ...style },
    onBlur: commit,
  }
  return multiline
    ? <textarea {...common} rows={2} onChange={e => setV(e.target.value)} className={`${common.className} resize-none`} />
    : <input {...common} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.currentTarget as HTMLInputElement).blur() }} />
}

export default function BookShelf({
  resources, setResources, customTags, saveCustomTags, onRenameTag, onDeleteTag, tagColors, onSetTagColor, adding, setAdding,
}: Props) {
  const supabase = createClient()
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [tag, setTag] = useState('전체')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [addAuthor, setAddAuthor] = useState('')
  const [addStatus, setAddStatus] = useState<Status>('todo')
  const [addTag, setAddTag] = useState('미분류')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newTagOpen, setNewTagOpen] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [newQuote, setNewQuote] = useState('')
  const [newApply, setNewApply] = useState('')
  const [todoSent, setTodoSent] = useState<string | null>(null)
  const [agendas, setAgendas] = useState<{ id: string; title: string; hidden: boolean }[]>([])
  const [linking, setLinking] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')

  const books = useMemo(() => resources.filter(r => r.media_type === '책'), [resources])
  const colorMap = useMemo(() => resolveTagColors(customTags, tagColors), [customTags, tagColors])
  const colorOf = (t: string) => colorMap[t] ?? NO_TAG_COLOR

  useEffect(() => {
    supabase.from('agenda_items').select('id, title, hidden').order('updated_at', { ascending: false })
      .then(({ data }) => setAgendas((data ?? []) as { id: string; title: string; hidden: boolean }[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tagsInUse = useMemo(() => {
    const set = new Set(books.map(b => bookTag(b, customTags)))
    return [...customTags.filter(t => set.has(t)), ...(set.has('미분류') ? ['미분류'] : [])]
  }, [books, customTags])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return books.filter(b =>
      (status === 'all' || getStatus(b.tags ?? []) === status) &&
      (tag === '전체' || bookTag(b, customTags) === tag) &&
      (!q || b.title.toLowerCase().includes(q) || (b.author ?? '').toLowerCase().includes(q)),
    )
  }, [books, status, tag, search, customTags])

  const sel = books.find(b => b.id === selectedId) ?? list[0] ?? null
  const count = (s: Status) => books.filter(b => getStatus(b.tags ?? []) === s).length
  const year = todayYmd().slice(0, 4)
  const doneThisYear = books.filter(b => getStatus(b.tags ?? []) === 'done' && (b.finished_at ?? '').startsWith(year)).length

  async function patch(id: string, updates: Partial<LearningResource>) {
    const before = resources.find(r => r.id === id)
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    const { error: e } = await supabase.from('learning_resources').update(updates).eq('id', id)
    if (e) {
      console.error('책 저장 실패:', e.message)
      setError(`저장 실패: ${e.message}`)
      if (before) setResources(prev => prev.map(r => r.id === id ? before : r))
    } else setError(null)
  }

  async function addBook() {
    const title = addTitle.trim()
    if (!title) { setAdding(false); return }
    const initTags = [
      ...(addTag !== '미분류' ? [addTag] : []),
      ...(addStatus === 'done' ? ['_done'] : addStatus === 'doing' ? ['_doing'] : []),
    ]
    const { data, error: e } = await supabase.from('learning_resources')
      .insert({
        title, author: addAuthor.trim(), source: '', notes: [], tags: initTags, media_type: '책',
        ...(addStatus === 'done' ? { finished_at: todayYmd() } : addStatus === 'doing' ? { progress: 0 } : {}),
      })
      .select().single()
    if (e) { console.error('책 추가 실패:', e.message); setError(`추가 실패: ${e.message}`); return }
    setResources(prev => [data as LearningResource, ...prev])
    setSelectedId((data as LearningResource).id)
    setAddTitle(''); setAddAuthor(''); setAdding(false); setError(null)
  }

  // 상단 "+ 책 추가"를 누르면 지금 보고 있는 상태·분야를 기본값으로
  const [wasAdding, setWasAdding] = useState(adding)
  if (wasAdding !== adding) {
    setWasAdding(adding)
    if (adding) { setAddStatus(status === 'all' ? 'todo' : status); setAddTag(tag === '전체' ? '미분류' : tag) }
  }

  function changeStatus(b: LearningResource, next: Status) {
    if (getStatus(b.tags ?? []) === next) return
    const stripped = (b.tags ?? []).filter(t => t !== '_done' && t !== '_doing')
    const tags = next === 'done' ? [...stripped, '_done'] : next === 'doing' ? [...stripped, '_doing'] : stripped
    const updates: Partial<LearningResource> = { tags }
    if (next === 'done' && !b.finished_at) updates.finished_at = todayYmd()
    if (next === 'doing' && b.progress == null) updates.progress = 0
    patch(b.id, updates)
  }

  function setBookTag(b: LearningResource, t: string) {
    const rest = (b.tags ?? []).filter(x => !customTags.includes(x) && x !== t)
    patch(b.id, { tags: t === '미분류' ? rest : [t, ...rest] })
  }

  function addNewTag() {
    const name = newTagValue.trim()
    setNewTagOpen(false); setNewTagValue('')
    if (!name || name === '미분류' || name === '전체') return
    if (!customTags.includes(name)) saveCustomTags([...customTags, name])
    if (sel) setBookTag(sel, name)
  }

  // 분야 삭제·이름 변경은 학습자료 전체 공통 로직(LearningNew)을 쓴다 — 자료 태그까지 같이 바뀜
  async function deleteTag(target: string) {
    const done = await onDeleteTag(target)
    if (done && tag === target) setTag('전체')
  }

  async function renameTag(oldTag: string) {
    const name = renameValue.trim()
    setRenaming(null)
    const ok = name && name !== oldTag && name !== '미분류' && name !== '전체' && !customTags.includes(name)
    if (!ok) return
    if (tag === oldTag) setTag(name)
    await onRenameTag(oldTag, name)
  }

  async function sendToToday(text: string) {
    const { error: e } = await supabase.from('quick_todos').insert({ title: text.slice(0, 200), target_date: todayYmd() })
    if (e) { console.error('오늘 업무 추가 실패:', e.message); setError(`오늘 업무 추가 실패: ${e.message}`); return }
    setTodoSent(text)
    setTimeout(() => setTodoSent(null), 1800)
  }

  const agendaTitle = (id: string) => agendas.find(a => a.id === id)?.title ?? '(삭제된 안건)'
  const linkCandidates = useMemo(() => {
    if (!sel) return []
    const q = linkQuery.trim().toLowerCase()
    const linked = new Set(sel.linked_agenda_ids ?? [])
    return agendas.filter(a => !a.hidden && !linked.has(a.id) && (!q || a.title.toLowerCase().includes(q))).slice(0, 8)
  }, [agendas, linkQuery, sel])

  const chip = (active: boolean, color?: string): React.CSSProperties => active
    ? { background: color ?? 'var(--accent-primary)', color: '#fff', borderColor: 'transparent' }
    : { background: 'rgba(var(--ink-rgb),0.05)', color: T2, borderColor: LINE }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* 숫자 + 필터 */}
      <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
        {[
          { k: `${year} 완독`, v: doneThisYear, c: '#16A34A' },
          { k: '읽는 중', v: count('doing'), c: '#D97706' },
          { k: '읽을 책', v: count('todo'), c: T2 },
        ].map(s => (
          <div key={s.k} className="rounded-xl px-3.5 py-1.5" style={{ background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${LINE}` }}>
            <span className="text-[11px] mr-2" style={{ color: T3 }}>{s.k}</span>
            <span className="text-[15px] font-bold" style={{ color: s.c }}>{s.v}권</span>
          </div>
        ))}
        <div className="rounded-full p-1 flex gap-0.5" style={{ background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${LINE}` }}>
          {([['all', `전체 ${books.length}`], ['todo', `읽을 책 ${count('todo')}`], ['doing', `읽는 중 ${count('doing')}`], ['done', `완독 ${count('done')}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)}
              className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={status === k ? { background: 'var(--accent-primary)', color: '#fff' } : { color: T2 }}>{l}</button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="제목·저자 검색"
          className="text-[12px] px-3 py-1.5 rounded-lg bg-transparent focus:outline-none w-40 placeholder:text-[rgba(var(--text-rgb),0.3)]"
          style={{ color: T1, border: `1px solid ${LINE}` }}
        />
      </div>
      <div className="flex-shrink-0 flex gap-1.5 flex-wrap">
        {['전체', ...tagsInUse].map(t => renaming === t ? (
          <input key={t} autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
            onBlur={() => renameTag(t)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.currentTarget as HTMLInputElement).blur()
              if (e.key === 'Escape') setRenaming(null)
            }}
            className="text-[12px] px-2.5 py-1 rounded-full bg-transparent focus:outline-none w-28"
            style={{ color: T1, border: '1px solid var(--accent-primary)' }} />
        ) : (
          <span key={t} className="group relative inline-flex">
            <button onClick={() => setTag(t)}
              onDoubleClick={() => { if (t !== '전체' && t !== '미분류') { setRenaming(t); setRenameValue(t) } }}
              title={t !== '전체' && t !== '미분류' ? '더블클릭해서 이름 바꾸기' : undefined}
              className="text-[12px] px-2.5 py-1 rounded-full border"
              style={chip(tag === t, t === '전체' ? undefined : colorOf(t))}>
              {t === '전체' ? '# 전체 분야' : `# ${t}`}
            </button>
            {t !== '전체' && t !== '미분류' && (
              <button onClick={() => deleteTag(t)} title="분야 삭제"
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] leading-none hidden group-hover:flex items-center justify-center"
                style={{ background: '#EF4444', color: '#fff' }}>×</button>
            )}
          </span>
        ))}
        {tagsInUse.some(t => t !== '미분류') && <span className="text-[11px] self-center ml-1" style={{ color: T3 }}>더블클릭: 이름 바꾸기 · 마우스 올리고 ×: 삭제</span>}
      </div>

      {error && (
        <div className="flex-shrink-0 text-[12px] px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}{error.includes('column') && ' — supabase/schema_v73.sql 실행이 필요해요'}
        </div>
      )}

      {/* 책 추가 */}
      {adding && (
        <div className="flex-shrink-0 rounded-xl px-4 py-3 flex gap-2 items-center" style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${LINE}` }}>
          <span>📚</span>
          <input autoFocus value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="책 제목"
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addBook(); if (e.key === 'Escape') setAdding(false) }}
            className="flex-1 text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]" style={{ color: T1 }} />
          <input value={addAuthor} onChange={e => setAddAuthor(e.target.value)} placeholder="저자"
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addBook(); if (e.key === 'Escape') setAdding(false) }}
            className="w-40 text-[12px] px-2 py-1 rounded-lg bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]"
            style={{ color: T1, border: `1px solid ${LINE}` }} />
          <div className="flex gap-0.5 rounded-full p-0.5" style={{ border: `1px solid ${LINE}` }}>
            {STATUS_ORDER.map(s => (
              <button key={s} onClick={() => setAddStatus(s)} className="text-[11.5px] px-2.5 py-0.5 rounded-full"
                style={addStatus === s ? { color: STATUS_META[s].color, background: STATUS_META[s].bg, fontWeight: 600 } : { color: T3 }}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
          <select value={addTag} onChange={e => setAddTag(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-lg focus:outline-none [&>option]:bg-[var(--select-option-bg)]"
            style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${LINE}`, color: colorOf(addTag) }}>
            {[...customTags, '미분류'].map(x => <option key={x} value={x}># {x}</option>)}
          </select>
          <button onClick={addBook} className="text-[12px] px-3 py-1 rounded-lg" style={{ background: 'var(--accent-primary)', color: '#fff' }}>추가</button>
          <button onClick={() => setAdding(false)} className="text-[12px] px-2" style={{ color: T3 }}>취소</button>
        </div>
      )}

      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
        {/* 책장 */}
        <div className="min-h-0 overflow-y-auto scrollbar-hide pb-6">
          {books.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <p className="text-[13px]" style={{ color: T3 }}>아직 책이 없어요</p>
              <p className="text-[12px]" style={{ color: T3 }}>위의 &quot;+ 책 추가&quot;로 넣거나, 기존 자료의 매체를 📚 책으로 바꾸면 여기 보여요</p>
            </div>
          ) : (
            <div className="grid gap-3 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {list.map(b => {
                const st = getStatus(b.tags ?? [])
                const m = STATUS_META[st]
                const t = bookTag(b, customTags)
                const active = sel?.id === b.id
                return (
                  <button key={b.id} onClick={() => { setSelectedId(b.id); setLinking(false) }}
                    className="text-left rounded-xl p-3 flex gap-3 border transition-colors"
                    style={{
                      background: active ? 'rgba(var(--ink-rgb),0.07)' : 'rgba(var(--ink-rgb),0.03)',
                      borderColor: active ? 'var(--accent-primary)' : LINE,
                    }}>
                    <Cover book={b} color={colorOf(t)} />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: m.color, background: m.bg }}>{m.label}</span>
                        <span className="text-[10.5px] truncate" style={{ color: colorOf(t) }}># {t}</span>
                      </div>
                      <p className="text-[13.5px] font-semibold truncate" style={{ color: T1 }}>{b.title || '제목 없음'}</p>
                      <p className="text-[11.5px] truncate" style={{ color: T3 }}>{b.author || '저자 미입력'}</p>
                      {st === 'done' && (
                        <div className="flex items-center gap-2 mt-auto">
                          <Stars value={b.rating} />
                          <span className="text-[10.5px]" style={{ color: T3 }}>{b.finished_at ?? ''}</span>
                        </div>
                      )}
                      {st === 'doing' && (
                        <div className="mt-auto flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ink-rgb),0.08)' }}>
                            <div className="h-full" style={{ width: `${b.progress ?? 0}%`, background: '#F59E0B' }} />
                          </div>
                          <span className="text-[10.5px]" style={{ color: T3 }}>{b.progress ?? 0}%</span>
                        </div>
                      )}
                      {st === 'todo' && b.reason && <p className="mt-auto text-[11px] truncate" style={{ color: T2 }}>읽는 이유 · {b.reason}</p>}
                    </div>
                  </button>
                )
              })}
              {list.length === 0 && <p className="text-[13px] py-10" style={{ color: T3 }}>해당하는 책이 없어요</p>}
            </div>
          )}
        </div>

        {/* 상세 */}
        <aside className="min-h-0 overflow-y-auto scrollbar-hide rounded-2xl p-5 flex flex-col gap-4 mb-4"
          style={{ background: 'rgba(var(--ink-rgb),0.035)', border: `1px solid ${LINE}` }}>
          {!sel ? (
            <p className="text-[12.5px] m-auto" style={{ color: T3 }}>책을 고르면 기록이 여기 보여요</p>
          ) : (() => {
            const st = getStatus(sel.tags ?? [])
            const t = bookTag(sel, customTags)
            const quotes = sel.quotes ?? []
            const applies: Apply[] = sel.applies ?? []
            return (
              <>
                <div className="flex gap-4">
                  <Cover book={sel} color={colorOf(t)} big />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="self-start flex gap-0.5 rounded-full p-0.5" style={{ border: `1px solid ${LINE}` }}>
                      {STATUS_ORDER.map(s => (
                        <button key={s} onClick={() => changeStatus(sel, s)} className="text-[11px] px-2 py-0.5 rounded-full"
                          style={st === s ? { color: STATUS_META[s].color, background: STATUS_META[s].bg, fontWeight: 600 } : { color: T3 }}>
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>
                    <BlurInput key={`t-${sel.id}`} value={sel.title} onSave={v => v.trim() && patch(sel.id, { title: v.trim() })}
                      placeholder="제목" className="text-[16px] font-bold w-full" />
                    <BlurInput key={`a-${sel.id}`} value={sel.author ?? ''} onSave={v => patch(sel.id, { author: v.trim() })}
                      placeholder="저자" className="text-[12px] w-full" style={{ color: T2 }} />
                  </div>
                </div>

                {/* 분야 — 눌러서 고르기, 다시 누르면 해제, + 새 분야 */}
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[11px] mr-1" style={{ color: T3 }}>분야</span>
                  {customTags.map(x => (
                    <span key={x} className="group relative inline-flex">
                      <button onClick={() => setBookTag(sel, t === x ? '미분류' : x)}
                        className="text-[11.5px] px-2 py-0.5 rounded-full border" style={chip(t === x, colorOf(x))}>
                        # {x}
                      </button>
                      <button onClick={() => deleteTag(x)} title="분야 삭제"
                        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[9px] leading-none hidden group-hover:flex items-center justify-center"
                        style={{ background: '#EF4444', color: '#fff' }}>×</button>
                    </span>
                  ))}
                  {newTagOpen ? (
                    <input autoFocus value={newTagValue} onChange={e => setNewTagValue(e.target.value)} placeholder="새 분야"
                      onBlur={addNewTag}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.currentTarget as HTMLInputElement).blur()
                        if (e.key === 'Escape') { setNewTagValue(''); setNewTagOpen(false) }
                      }}
                      className="text-[11.5px] px-2 py-0.5 rounded-full bg-transparent focus:outline-none w-24"
                      style={{ color: T1, border: '1px solid var(--accent-primary)' }} />
                  ) : (
                    <button onClick={() => setNewTagOpen(true)} className="text-[11.5px] px-2 py-0.5 rounded-full border border-dashed"
                      style={{ borderColor: LINE, color: T3 }}>+ 새 분야</button>
                  )}
                </div>
                {t !== '미분류' && (
                  <div className="flex items-center gap-1.5 -mt-2">
                    <span className="text-[11px] mr-1" style={{ color: T3 }}>#{t} 색</span>
                    {TAG_PALETTE.map(c => (
                      <button key={c} onClick={() => onSetTagColor(t, c)} title={c}
                        className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                        style={{
                          background: c,
                          outline: colorOf(t) === c ? '2px solid rgba(var(--text-rgb),0.7)' : 'none',
                          outlineOffset: 1,
                        }} />
                    ))}
                    {/* 팔레트에 없는 색은 색상표에서 직접 */}
                    <label title="색상표에서 직접 고르기"
                      className="relative w-4 h-4 rounded-full cursor-pointer overflow-hidden flex-shrink-0"
                      style={{
                        background: TAG_PALETTE.includes(colorOf(t))
                          ? 'conic-gradient(#EF4444, #F59E0B, #22C55E, #06B6D4, #3B82F6, #EF4444)'
                          : colorOf(t),
                        outline: TAG_PALETTE.includes(colorOf(t)) ? 'none' : '2px solid rgba(var(--text-rgb),0.7)',
                        outlineOffset: 1,
                      }}>
                      <input type="color" value={colorOf(t)} onChange={e => onSetTagColor(t, e.target.value.toUpperCase())}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                )}

                {/* 상태별 정보 */}
                {st === 'done' && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Stars value={sel.rating} size={16} onChange={n => patch(sel.id, { rating: n })} />
                    <label className="text-[11.5px] flex items-center gap-1.5" style={{ color: T3 }}>
                      완독일
                      <input type="date" value={sel.finished_at ?? ''} onChange={e => patch(sel.id, { finished_at: e.target.value || null })}
                        className="text-[11.5px] bg-transparent focus:outline-none px-1.5 py-0.5 rounded" style={{ color: T1, border: `1px solid ${LINE}` }} />
                    </label>
                  </div>
                )}
                {st === 'doing' && (
                  <label className="flex items-center gap-2 text-[11.5px]" style={{ color: T3 }}>
                    진행
                    <input type="range" min={0} max={100} step={5} defaultValue={sel.progress ?? 0} key={`p-${sel.id}`}
                      onPointerUp={e => patch(sel.id, { progress: Number((e.target as HTMLInputElement).value) })}
                      onKeyUp={e => patch(sel.id, { progress: Number((e.target as HTMLInputElement).value) })}
                      onChange={e => setResources(prev => prev.map(r => r.id === sel.id ? { ...r, progress: Number(e.target.value) } : r))}
                      className="flex-1 accent-amber-500" />
                    <span style={{ color: T1 }}>{sel.progress ?? 0}%</span>
                  </label>
                )}

                {st === 'done' ? (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(var(--ink-rgb),0.06)' }}>
                    <p className="text-[10.5px] mb-1" style={{ color: T3 }}>한 줄 정리</p>
                    <BlurInput key={`k-${sel.id}`} multiline value={sel.takeaway ?? ''} onSave={v => patch(sel.id, { takeaway: v })}
                      placeholder="이 책에서 남길 한 문장" className="w-full text-[13px] font-medium leading-snug" />
                  </div>
                ) : (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(var(--ink-rgb),0.06)' }}>
                    <p className="text-[10.5px] mb-1" style={{ color: T3 }}>읽는 이유</p>
                    <BlurInput key={`r-${sel.id}`} multiline value={sel.reason ?? ''} onSave={v => patch(sel.id, { reason: v })}
                      placeholder="왜 이 책을 읽나요? (업무 맥락)" className="w-full text-[13px] leading-snug" />
                  </div>
                )}

                {/* 밑줄 친 문장 */}
                <section>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: T1 }}>✍️ 밑줄 친 문장</p>
                  {quotes.map((q, i) => (
                    <div key={`${sel.id}-q-${i}`} className="group flex items-start gap-1 border-l-2 pl-2.5 mb-1.5" style={{ borderColor: '#FBBF24' }}>
                      <BlurInput multiline value={q} className="flex-1 text-[12.5px] leading-relaxed"
                        onSave={v => patch(sel.id, { quotes: v.trim() ? quotes.map((x, j) => j === i ? v : x) : quotes.filter((_, j) => j !== i) })} />
                      <button onClick={() => patch(sel.id, { quotes: quotes.filter((_, j) => j !== i) })}
                        className="opacity-0 group-hover:opacity-100 text-[12px] px-1" style={{ color: T3 }} title="삭제">×</button>
                    </div>
                  ))}
                  <input value={newQuote} onChange={e => setNewQuote(e.target.value)} placeholder="+ 문장 추가 (Enter)"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && newQuote.trim()) {
                        patch(sel.id, { quotes: [...quotes, newQuote.trim()] }); setNewQuote('')
                      }
                    }}
                    className="w-full text-[12px] bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]" style={{ color: T1 }} />
                </section>

                {/* 업무 적용 */}
                <section>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: T1 }}>💼 내 업무에 적용</p>
                  {applies.map((a, i) => (
                    <div key={`${sel.id}-a-${i}`} className="group flex items-start gap-2 mb-1">
                      <input type="checkbox" checked={a.done} className="mt-1 flex-shrink-0"
                        onChange={() => patch(sel.id, { applies: applies.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} />
                      <BlurInput value={a.text} className="flex-1 min-w-0 text-[12.5px]"
                        style={a.done ? { textDecoration: 'line-through', color: T3 } : undefined}
                        onSave={v => patch(sel.id, { applies: v.trim() ? applies.map((x, j) => j === i ? { ...x, text: v } : x) : applies.filter((_, j) => j !== i) })} />
                      <button onClick={() => sendToToday(a.text)} className="text-[10.5px] flex-shrink-0 whitespace-nowrap"
                        style={{ color: todoSent === a.text ? '#16A34A' : 'var(--accent-soft)' }}>
                        {todoSent === a.text ? '✓ 추가됨' : '→ 오늘 업무로'}
                      </button>
                      <button onClick={() => patch(sel.id, { applies: applies.filter((_, j) => j !== i) })}
                        className="opacity-0 group-hover:opacity-100 text-[12px]" style={{ color: T3 }} title="삭제">×</button>
                    </div>
                  ))}
                  <input value={newApply} onChange={e => setNewApply(e.target.value)} placeholder="+ 적용할 것 추가 (Enter)"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && newApply.trim()) {
                        patch(sel.id, { applies: [...applies, { text: newApply.trim(), done: false }] }); setNewApply('')
                      }
                    }}
                    className="w-full text-[12px] bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]" style={{ color: T1 }} />
                </section>

                {/* 연결 안건 */}
                <section>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: T1 }}>🔗 연결된 안건</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(sel.linked_agenda_ids ?? []).map(id => (
                      <span key={id} className="group text-[11.5px] pl-2 pr-1 py-1 rounded-lg flex items-center gap-1"
                        style={{ background: 'rgba(76,127,224,0.12)', color: 'var(--accent-soft)', border: '1px solid rgba(76,127,224,0.25)' }}>
                        <Link href={`/project/items/${id}`} className="hover:underline">{agendaTitle(id)}</Link>
                        <button onClick={() => patch(sel.id, { linked_agenda_ids: (sel.linked_agenda_ids ?? []).filter(x => x !== id) })}
                          className="opacity-0 group-hover:opacity-100 px-0.5" title="연결 해제">×</button>
                      </span>
                    ))}
                    <button onClick={() => { setLinking(v => !v); setLinkQuery('') }}
                      className="text-[11.5px] px-2 py-1 rounded-lg border border-dashed" style={{ borderColor: LINE, color: T3 }}>+ 연결</button>
                  </div>
                  {linking && (
                    <div className="mt-2 rounded-lg p-2" style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${LINE}` }}>
                      <input autoFocus value={linkQuery} onChange={e => setLinkQuery(e.target.value)} placeholder="안건 이름 검색"
                        onKeyDown={e => { if (e.key === 'Escape') setLinking(false) }}
                        className="w-full text-[12px] bg-transparent focus:outline-none mb-1 placeholder:text-[rgba(var(--text-rgb),0.3)]" style={{ color: T1 }} />
                      {linkCandidates.map(a => (
                        <button key={a.id} className="block w-full text-left text-[12px] px-2 py-1 rounded hover:bg-[rgba(var(--ink-rgb),0.06)] truncate"
                          style={{ color: T2 }}
                          onClick={() => { patch(sel.id, { linked_agenda_ids: [...(sel.linked_agenda_ids ?? []), a.id] }); setLinking(false) }}>
                          {a.title}
                        </button>
                      ))}
                      {linkCandidates.length === 0 && <p className="text-[11.5px] px-2 py-1" style={{ color: T3 }}>맞는 안건이 없어요</p>}
                    </div>
                  )}
                </section>

                <Link href={`/learning/${sel.id}`} className="text-[11.5px] mt-auto pt-2" style={{ color: T3 }}>
                  자세한 노트 열기 →
                </Link>
              </>
            )
          })()}
        </aside>
      </div>
    </div>
  )
}
