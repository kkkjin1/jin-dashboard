// 백업 저장 폴더 기억하기 (크롬 File System Access API).
// 폴더 핸들은 IndexedDB에만 저장된다(localStorage는 핸들을 못 담음). 브라우저를 새로 열면
// 첫 저장 때 크롬이 "이 폴더에 저장 허용" 확인을 다시 묻는다 — 브라우저 보안 규칙이라 생략 불가.
// 지원 안 하는 브라우저·저장 실패 시 호출부가 일반 다운로드로 대신한다.

type PermissionMode = { mode: 'readwrite' }
export type DirHandle = {
  name: string
  queryPermission(d: PermissionMode): Promise<PermissionState>
  requestPermission(d: PermissionMode): Promise<PermissionState>
  getFileHandle(name: string, o: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }>
  }>
}

const DB = 'jin-backup'
const STORE = 'handles'
const KEY = 'backup-dir'

export function folderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadFolder(): Promise<DirHandle | null> {
  try {
    const db = await openDb()
    return await new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as DirHandle) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function saveFolder(handle: DirHandle): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(handle, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch { /* 기억 실패해도 이번 저장은 진행 */ }
}

export async function pickFolder(): Promise<DirHandle | null> {
  if (!folderPickerSupported()) return null
  try {
    const picker = (window as unknown as { showDirectoryPicker(o: PermissionMode & { id?: string }): Promise<DirHandle> }).showDirectoryPicker
    const handle = await picker({ mode: 'readwrite', id: 'jin-backup' })
    await saveFolder(handle)
    return handle
  } catch {
    return null // 사용자가 취소
  }
}

// 쓰기 권한 확보. requestPermission은 클릭 직후(사용자 동작 안)에만 허용되므로
// 백업 데이터를 받기 "전에" 버튼 클릭 핸들러 맨 앞에서 호출해야 한다.
export async function ensurePermission(handle: DirHandle): Promise<boolean> {
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' })
    return perm === 'granted'
  } catch {
    return false
  }
}

// 지정 폴더에 저장 (ensurePermission 통과 후 호출).
export async function writeToFolder(handle: DirHandle, fileName: string, blob: Blob): Promise<void> {
  const file = await handle.getFileHandle(fileName, { create: true })
  const w = await file.createWritable()
  await w.write(blob)
  await w.close()
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
