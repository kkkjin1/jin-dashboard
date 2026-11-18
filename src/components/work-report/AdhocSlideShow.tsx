'use client'

// 수시보고 확대보기(슬라이드) — 2026-11-18. "보고 내용" 본문에 그은 가로줄(--- 입력)을 경계로
// 페이지를 나눠 16:9 슬라이드로 보여준다. 구글 슬라이드/PPT 발표 화면처럼 ←/→로 넘기고 Esc로 닫는다.
// 편집은 하지 않는 보기 전용 — 본문 HTML을 그대로 그리고, 글이 슬라이드보다 길면 글자를 줄여 한 장에 맞춘다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { legacyToHtml } from '@/lib/tiptapExtensions'
import { fmtDateFull } from './style'

// 슬라이드 원본 크기(16:9). 화면 크기에 맞춰 통째로 확대·축소한다 — 그래서 어떤 모니터에서도 배치가 같다.
const W = 1280
const H = 720
const BASE_FONT = 30
const MIN_FONT = 13

// 본문 HTML을 가로줄(<hr>) 기준으로 나눈다. 빈 페이지(줄을 연달아 그은 경우)는 뺀다.
// 스크립트·이벤트 속성은 미리 걷어낸다(본인 글이지만 붙여넣기로 섞여 들어온 것까지 그대로 실행하지 않게).
export function splitSlides(html: string): string[] {
  if (typeof window === 'undefined') return []
  const doc = new DOMParser().parseFromString(legacyToHtml(html || ''), 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed').forEach(n => n.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) if (a.name.toLowerCase().startsWith('on')) el.removeAttribute(a.name)
  })
  const pages: string[] = []
  let cur: string[] = []
  const flush = () => {
    const joined = cur.join('')
    const probe = doc.createElement('div'); probe.innerHTML = joined
    if ((probe.textContent ?? '').trim() || probe.querySelector('img')) pages.push(joined)
    cur = []
  }
  for (const node of [...doc.body.childNodes]) {
    if (node.nodeType === 1 && (node as Element).tagName === 'HR') { flush(); continue }
    cur.push(node.nodeType === 1 ? (node as Element).outerHTML : (node.textContent ?? ''))
  }
  flush()
  return pages
}

export default function AdhocSlideShow({
  title, audience, reportDate, body, onClose,
}: {
  title: string
  audience: string
  reportDate: string
  body: string
  onClose: () => void
}) {
  const slides = useMemo(() => splitSlides(body), [body])
  const total = Math.max(slides.length, 1)
  const [idx, setIdx] = useState(0)
  const [scale, setScale] = useState(1)
  const [isFull, setIsFull] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const go = useCallback((d: number) => setIdx(i => Math.min(total - 1, Math.max(0, i + d))), [total])

  // 화면 크기에 맞춰 슬라이드 배율 계산(위아래 여백·아래 조작줄 몫을 남김)
  useEffect(() => {
    function fit() { setScale(Math.min((window.innerWidth - 48) / W, (window.innerHeight - 96) / H)) }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // 전체화면 상태 추적(브라우저 Esc로 나간 경우 포함)
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void rootRef.current?.requestFullscreen?.().catch(() => {})
  }, [])

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    onClose()
  }, [onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') { e.preventDefault(); setIdx(0) }
      else if (e.key === 'End') { e.preventDefault(); setIdx(total - 1) }
      else if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') { e.preventDefault(); toggleFull() }
      else if (e.key === 'Escape') {
        // 전체화면이면 브라우저가 먼저 전체화면만 푼다 — 그다음 Esc에서 닫힌다
        if (!document.fullscreenElement) { e.preventDefault(); close() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, total, toggleFull, close])

  // 열려 있는 동안 뒤 화면 스크롤 막기
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 글이 슬라이드보다 길면 글자 크기를 한 단계씩 줄여 한 장에 맞춘다
  const html = slides[idx] ?? ''
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    let size = BASE_FONT
    el.style.fontSize = `${size}px`
    while (size > MIN_FONT && el.scrollHeight > el.clientHeight + 1) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [html, idx])

  const meta = [fmtDateFull(reportDate), audience.trim()].filter(Boolean).join(' · ')

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center select-text"
      style={{ background: '#0F1115' }}
      role="dialog"
      aria-label="수시보고 확대보기"
    >
      {/* 슬라이드 — 왼쪽/오른쪽 가장자리를 누르면 이전/다음 */}
      <div style={{ width: W * scale, height: H * scale, position: 'relative' }}>
        <div
          className="adhoc-slide"
          style={{
            width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left',
            background: '#FFFFFF', borderRadius: 10, boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', padding: '44px 64px 36px', boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, paddingBottom: 14, borderBottom: '2px solid #1F2A44', flexShrink: 0 }}>
            <p style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title.trim() || '(제목 없음)'}
            </p>
            {meta && <p style={{ fontSize: 15, color: '#6B7280', margin: 0, flexShrink: 0 }}>{meta}</p>}
          </div>
          {slides.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 20 }}>
              보고 내용이 비어 있습니다
            </div>
          ) : (
            <div
              ref={contentRef}
              className="note-html adhoc-slide-body"
              style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 24, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 14, color: '#9CA3AF', paddingTop: 8 }}>
            {idx + 1} / {total}
          </div>
        </div>
        <button aria-label="이전 장" onClick={() => go(-1)} className="absolute left-0 top-0 h-full" style={{ width: '18%', cursor: idx > 0 ? 'w-resize' : 'default', background: 'transparent' }} />
        <button aria-label="다음 장" onClick={() => go(1)} className="absolute right-0 top-0 h-full" style={{ width: '18%', cursor: idx < total - 1 ? 'e-resize' : 'default', background: 'transparent' }} />
      </div>

      {/* 아래 조작줄 */}
      <div className="flex items-center gap-2 mt-4 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
        <button onClick={() => go(-1)} disabled={idx === 0} className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-30" title="이전 (←)"><ChevronLeft size={18} /></button>
        <span className="tabular-nums min-w-[52px] text-center">{idx + 1} / {total}</span>
        <button onClick={() => go(1)} disabled={idx >= total - 1} className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-30" title="다음 (→)"><ChevronRight size={18} /></button>
        <span className="mx-2 opacity-40">|</span>
        <button onClick={toggleFull} className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10" title="전체화면 (F)">
          {isFull ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{isFull ? '창 크기' : '전체화면'}
        </button>
        <button onClick={close} className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10" title="닫기 (Esc)">
          <X size={14} />닫기
        </button>
        <span className="ml-3 opacity-40 hidden md:inline">← → 넘기기 · F 전체화면 · Esc 닫기</span>
      </div>
    </div>
  )
}
