'use client'

// 설정 > 데이터 백업 칸. 암호 입력 → [지금 백업] → 지정 폴더(또는 다운로드)에 AES-256 zip 저장.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportBackup, type BackupProgress, type BackupResult } from '@/lib/backup/exportBackup'
import {
  downloadBlob, ensurePermission, folderPickerSupported, loadFolder, pickFolder, writeToFolder,
  type DirHandle,
} from '@/lib/backup/backupFolder'

const LAST_KEY = 'jin.backup.lastAt'
const MIN_PW = 8

const card: React.CSSProperties = {
  background: 'rgba(var(--ink-rgb),0.06)',
  border: '1px solid rgba(var(--ink-rgb),0.09)',
  borderRadius: 20,
  padding: '14px 16px',
}
const inp: React.CSSProperties = {
  background: 'rgba(var(--ink-rgb),0.06)',
  border: '1px solid rgba(var(--ink-rgb),0.09)',
  color: 'rgba(var(--text-rgb),1)',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  outline: 'none',
  minWidth: 0,
}
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  background: primary ? 'rgba(76,127,224,0.85)' : 'rgba(var(--ink-rgb),0.08)',
  color: primary ? 'white' : 'rgba(var(--text-rgb),0.8)',
  borderRadius: 8,
  padding: '7px 14px',
  fontSize: 13,
  opacity: disabled ? 0.45 : 1,
  cursor: disabled ? 'default' : 'pointer',
  whiteSpace: 'nowrap',
})
const muted = (a: number): React.CSSProperties => ({ color: `rgba(var(--text-rgb),${a})` })

function readLast(): string | null {
  try { return localStorage.getItem(LAST_KEY) } catch { return null }
}
function writeLast(v: string) {
  try { localStorage.setItem(LAST_KEY, v) } catch { /* 표시용일 뿐 */ }
}

export default function DataBackupSection() {
  const [folder, setFolder] = useState<DirHandle | null>(null)
  const [supported, setSupported] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result, setResult] = useState<(BackupResult & { savedTo: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAt, setLastAt] = useState<string | null>(null)

  // 브라우저 전용 값(폴더 핸들·지원 여부·마지막 백업)은 마운트 후 한 번에 읽는다 (SSR 불일치 방지)
  useEffect(() => {
    let alive = true
    loadFolder().then(h => {
      if (!alive) return
      setFolder(h)
      setSupported(folderPickerSupported())
      setLastAt(readLast())
    })
    return () => { alive = false }
  }, [])

  const pwError =
    pw.length > 0 && pw.length < MIN_PW ? `암호는 ${MIN_PW}자 이상` :
    pw2.length > 0 && pw !== pw2 ? '암호 확인이 다릅니다' : null
  const canRun = !running && pw.length >= MIN_PW && pw === pw2

  async function onPick() {
    const h = await pickFolder()
    if (h) setFolder(h)
  }

  async function onBackup() {
    if (!canRun) return
    setError(null)
    setResult(null)
    // 폴더 권한은 클릭 직후에만 요청 가능 → 데이터 받기 전에 먼저 확보
    let target: DirHandle | null = folder
    if (target && !(await ensurePermission(target))) target = null
    setRunning(true)
    try {
      const r = await exportBackup(createClient(), pw, setProgress)
      let savedTo = '다운로드 폴더'
      if (target) {
        try {
          await writeToFolder(target, r.fileName, r.blob)
          savedTo = `「${target.name}」 폴더`
        } catch {
          downloadBlob(r.fileName, r.blob)
          savedTo = '다운로드 폴더 (지정 폴더 저장 실패)'
        }
      } else {
        downloadBlob(r.fileName, r.blob)
      }
      const at = new Date().toLocaleString('ko-KR')
      if (r.failed.length === 0) { writeLast(at); setLastAt(at) }
      setResult({ ...r, savedTo })
      setPw(''); setPw2('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-1" style={muted(0.5)}>데이터 백업</h2>
      <p className="text-[10px] mb-3" style={muted(0.28)}>
        전체 테이블을 AES-256 암호 zip으로 저장 · 반디집·7-Zip에서 암호로 열기 · 암호는 저장되지 않으니 따로 보관
      </p>
      <div style={card} className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={muted(0.5)}>저장 폴더</span>
          <span className="text-sm flex-1 min-w-0 truncate" style={muted(folder ? 1 : 0.35)}>
            {supported ? (folder ? folder.name : '지정 안 됨 — 다운로드 폴더에 저장') : '이 브라우저는 폴더 지정 미지원 — 다운로드 폴더에 저장'}
          </span>
          {supported && (
            <button type="button" onClick={onPick} disabled={running} style={btn(false, running)}>
              {folder ? '폴더 변경' : '폴더 지정'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input type="password" autoComplete="new-password" placeholder={`암호 (${MIN_PW}자 이상)`}
            value={pw} onChange={e => setPw(e.target.value)} disabled={running} style={{ ...inp, flex: '1 1 140px' }} />
          <input type="password" autoComplete="new-password" placeholder="암호 확인"
            value={pw2} onChange={e => setPw2(e.target.value)} disabled={running}
            onKeyDown={e => { if (e.key === 'Enter') void onBackup() }}
            style={{ ...inp, flex: '1 1 140px' }} />
          <button type="button" onClick={() => void onBackup()} disabled={!canRun} style={btn(true, !canRun)}>
            {running ? '백업 중…' : '지금 백업'}
          </button>
        </div>
        {pwError && <p className="text-[11px]" style={{ color: 'rgb(220,90,80)' }}>{pwError}</p>}

        {progress && (
          <p className="text-xs" style={muted(0.6)}>
            테이블 {progress.done}/{progress.total} {progress.current && `· ${progress.current}`}
          </p>
        )}

        {error && <p className="text-xs" style={{ color: 'rgb(220,90,80)' }}>백업 실패: {error}</p>}

        {result && (
          <div className="text-xs flex flex-col gap-1">
            {result.failed.length === 0 ? (
              <p style={{ color: 'rgb(60,160,100)' }}>
                ✓ {result.tables.length}개 테이블 · {result.totalRows.toLocaleString()}행 + 표의 틀(schema.sql) 저장 → {result.savedTo}
              </p>
            ) : (
              <>
                <p style={{ color: 'rgb(220,90,80)' }}>
                  ⚠ {result.failed.length}개 테이블 실패 (테이블 {result.tables.filter(t => t.ok).length}/{result.tables.length}개는 저장됨 → {result.savedTo})
                </p>
                {result.failed.map(f => (
                  <p key={f.table} style={muted(0.6)}>· {f.table}: {f.error}</p>
                ))}
              </>
            )}
            {(() => {
              // 0행 테이블: 진짜 빈 테이블인지, 접근 규칙(RLS) 때문에 못 읽은 건지 DB 행 수와 대조할 때 쓰는 목록
              const empty = result.tables.filter(t => t.ok && t.rows === 0).map(t => t.table)
              return empty.length > 0 && (
                <p style={muted(0.4)}>0행 테이블 {empty.length}개: {empty.join(', ')}</p>
              )
            })()}
            <p style={muted(0.35)}>{result.fileName}</p>
          </div>
        )}

        <p className="text-[10px]" style={muted(0.28)}>마지막 성공 백업: {lastAt ?? '없음 (이 브라우저 기준)'}</p>
      </div>
    </section>
  )
}
