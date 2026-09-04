'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDevPilotClient } from '@/lib/supabase/devPilotClient'
import { useAutosave, clearAutosaveBuffer } from '@/hooks/useAutosave'
import type { MemoTag } from '@/types'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어']
const TAG_COLORS: Record<MemoTag, string> = {
  '공지': 'bg-gray-100 text-gray-500',
  '업무관련': 'bg-emerald-50 text-emerald-700',
  '회의관련': 'bg-blue-50 text-blue-700',
  '아이디어': 'bg-teal-50 text-teal-600',
  '완료': 'bg-gray-100 text-gray-400',
}

// 탭별 격리 목적 — localStorage가 아니라 sessionStorage를 씀(같은 브라우저의 다른 탭이
// 서로 다른 qid를 갖게 하기 위함). 이 컴포넌트는 mount effect([] deps)에서
// isNarrow && isTouch일 때 딱 한 번만 visible=true가 되고, 이후 다시 여는 경로가
// 없으므로(다른 곳에서 setVisible(true) 호출 없음) post-save qid rotation은 불필요 —
// Final Save 성공 시엔 아래 QID_STORAGE_KEY를 clear만 한다.
const QID_STORAGE_KEY = 'mobile_memo_sheet_qid'

export default function MobileMemoSheet() {
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [qid, setQid] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // ── Autosave 아키텍처 PoC (dev pilot 전용) ──────────────────────────────
  // pilotClient가 null이면(=.env.development.local 미설정, 프로덕션과 100% 동일)
  // useAutosave 내부의 supabase가 null이라 완전히 비활성(idle) 상태로 남는다 —
  // 이 화면의 기존 동작은 조금도 바뀌지 않는다.
  const pilotClient = getDevPilotClient()
  const isDevPilot = pilotClient !== null
  // devPilotClient.ts의 설계 계약상 dev-pilot은 autosave_drafts/content_versions만
  // 격리하기 위한 것 — canonical quick_memos 저장은 항상 production(`supabase`)을
  // 써야 한다(회의록 MeetingNotesNew.tsx/Quick Memo에서 동일 원인으로 발견/수정된
  // 버그와 같은 클래스, 2026-09-04). activeSupabase는 이제 쓰지 않는다 — autosave는
  // 아래 useAutosave 호출에서 `pilotClient`를 직접 받아 처리한다(꺼져 있으면 null →
  // enabled 게이트와 함께 완전히 비활성).

  useEffect(() => {
    // 실제 모바일 기기에서만 표시. 너비만 보면 창을 좁게 띄운 데스크톱 브라우저도
    // 모바일로 오인해 이 시트가 튀어나왔음 — 터치 기기 여부(pointer: coarse)도 같이 확인
    const isNarrow = window.innerWidth < 768
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    if (isNarrow && isTouch) {
      // dev pilot이 꺼져 있으면(isDevPilot=false, 일반/프로덕션 케이스) qid는 이 화면
      // 어디에서도 쓰이지 않으므로 sessionStorage를 아예 건드리지 않는다 — pilot이
      // 꺼진 상태에서 dev-pilot 관련 스토리지 접근이 0회여야 한다는 계약을 지킨다.
      if (isDevPilot) {
        // sessionStorage(탭별 격리)에서 qid를 읽거나, 없으면 새로 발급해 저장
        let existingQid = ''
        try { existingQid = sessionStorage.getItem(QID_STORAGE_KEY) ?? '' } catch {}
        const nextQid = existingQid || crypto.randomUUID()
        if (!existingQid) {
          try { sessionStorage.setItem(QID_STORAGE_KEY, nextQid) } catch {}
        }
        setQid(nextQid)
      }
      setVisible(true)
      setTimeout(() => titleRef.current?.focus(), 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave PoC(dev pilot 전용): entityId(qid)가 아직 없으면 enabled=false라 완전히
  // 비활성 — 기존 화면 동작에 어떤 영향도 주지 않는다.
  // value는 반드시 useMemo로 감싼다 — 감싸지 않으면 매 렌더마다 새 객체 참조가 생겨
  // useAutosave의 "값 변경" effect(deps에 value 포함)가 렌더할 때마다 재실행되고,
  // Final Save 직후의 sessionStorage/버퍼 cleanup을 바로 다음 렌더에서 되살려버린다
  // (quick/page.tsx의 draftValue와 동일한 이유로 필요, 참고: 그 파일의 useMemo).
  const draftValue = useMemo(() => ({ title, content, tag }), [title, content, tag])
  const autosave = useAutosave({
    supabase: pilotClient,
    enabled: isDevPilot && visible && !!qid,
    entityType: 'quick_memo',
    entityId: qid,
    fieldKey: 'draft',
    value: draftValue,
    // 자동 적용 금지(architecture Ch.6) — 값 적용은 아래 배너의 "적용" 버튼에서만
    // autosave.recovered를 직접 읽어 명시적으로 수행한다(이 콜백은 상태를 건드리지 않음).
    onRecoveredAvailable: () => {},
  })

  function applyRecovered() {
    if (!autosave.recovered) return
    const v = autosave.recovered.value as { title: string; content: string; tag: MemoTag }
    setTitle(v.title ?? '')
    setContent(v.content ?? '')
    setTag(v.tag ?? '업무관련')
    autosave.discardRecovered()
  }

  async function handleSave() {
    if (!title.trim()) { titleRef.current?.focus(); return }
    setSaving(true)
    setSaveError('')
    const { data: newMemo, error } = await supabase
      .from('quick_memos')
      .insert({ title: title.trim(), content: content.trim(), tag: [tag] })
      .select('id')
      .single()
    setSaving(false)
    if (error) {
      // 저장 실패 — 제목/내용을 지우지 않고 시트도 닫지 않아 재시도 가능하게 함
      setSaveError(`저장 실패: ${error.message}`)
      return
    }

    // canonical quick_memos INSERT 성공 → canonical id 확보 → 아래는 각각 개별
    // try/catch로 감싸 하나의 실패가 다음 단계 진행을 막지 않게 한다. rebind/
    // sessionStorage 삭제/버퍼 cleanup 중 무엇이 실패하더라도, 이미 성공한 canonical
    // Save(quick_memos row 자체)를 롤백하거나 실패로 표시하지 않는다.
    const canonicalId = newMemo?.id
    if (isDevPilot && qid && canonicalId) {
      try {
        const result = await autosave.flush({ source: 'final', rebindToEntityId: canonicalId })
        if (!result.rebind?.ok) {
          // rebind 실패해도 canonical Save 자체는 이미 성공했으므로 롤백하지 않음 —
          // 민감정보 없는 최소한의 추적 가능한 로그만 남김.
          console.error('mobile_memo_sheet_autosave_rebind_failed', {
            event: 'mobile_memo_sheet_autosave_rebind_failed',
            qid,
            canonicalId,
            step: result.ok ? 'rebind' : 'sync',
            error: result.rebind?.error ?? result.error ?? 'unknown',
            timestamp: new Date().toISOString(),
          })
        }
      } catch (e) {
        console.error('mobile_memo_sheet_autosave_rebind_failed', {
          event: 'mobile_memo_sheet_autosave_rebind_failed',
          qid,
          canonicalId,
          step: 'flush',
          error: e instanceof Error ? e.message : 'unknown',
          timestamp: new Date().toISOString(),
        })
      }

      // Final Save 성공 시에만: sessionStorage qid 키 삭제 + 로컬 autosave 버퍼 정리
      // (rotation이 아니라 clear — 저장하지 않고 닫은 경우엔 이 블록에 진입하지 않아
      // qid/버퍼가 그대로 유지되어 다음 진입 시 복구 가능함).
      try { sessionStorage.removeItem(QID_STORAGE_KEY) } catch {}
      try { clearAutosaveBuffer('quick_memo', qid, 'draft') } catch {}
    }

    setSaved(true)
    setTimeout(() => setVisible(false), 800)
  }

  function handleClose() {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* 배경 딤 */}
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={handleClose} />

      {/* 바텀시트 */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] bg-white rounded-t-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* 핸들 + 닫기 버튼 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <span className="text-sm font-semibold text-gray-700">빠른 메모</span>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg font-light hover:bg-gray-200 transition-colors">
            ×
          </button>
        </div>

        <div className="px-5 pb-6 space-y-3">
          {/* Autosave PoC: 복구 배너 (dev pilot 전용) — 자동 적용하지 않음 */}
          {isDevPilot && autosave.recovered && (
            <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700">
              <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
              <button onClick={applyRecovered} className="underline underline-offset-2">적용</button>
              <button onClick={() => autosave.discardRecovered()} className="underline underline-offset-2">무시</button>
            </div>
          )}

          {/* 태그 선택 */}
          <div className="flex gap-2">
            {TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  tag === t
                    ? TAG_COLORS[t] + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* 제목 */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="메모 제목"
            className="w-full text-base font-medium text-gray-800 placeholder-gray-300 focus:outline-none border-b border-gray-100 pb-2 bg-transparent"
          />

          {/* 내용 (선택) */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용 (선택)"
            rows={3}
            className="w-full text-sm text-gray-600 placeholder-gray-300 focus:outline-none resize-none bg-transparent"
          />

          {/* 저장 실패 안내 — 실패 시 제목/내용은 지우지 않으므로 재시도하면 됨 */}
          {saveError && (
            <p className="text-xs text-red-500 px-1">{saveError}</p>
          )}

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saving || saved || !title.trim()}
            className={`w-full py-3.5 text-white text-sm font-semibold rounded-2xl transition-all active:scale-[0.98] ${
              saved ? 'bg-[#10B981]' : 'bg-[#1C2B3A] disabled:opacity-40'
            }`}>
            {saved ? '✓ 저장됐어요' : saving ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>
    </>
  )
}
