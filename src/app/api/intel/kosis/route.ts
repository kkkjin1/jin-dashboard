// KOSIS 통계청 API — 임금·고용 실수치
// 환경변수: KOSIS_API_KEY (https://kosis.kr/openapi/agree.do)
import type { NextRequest } from 'next/server'

export interface KosisIndicator {
  name: string
  value: string
  unit: string
  period: string
  tblId: string
}

// 주요 통계표 (보상설계에 직접 활용 가능한 지표)
const STAT_TABLES = [
  {
    id: 'wage',
    name: '월평균 임금총액',
    orgId: '101',
    tblId: 'DT_1DA7001S',
    itmId: 'T10',       // 임금총액
    prdSe: 'M',         // 월별
    unit: '천원',
  },
  {
    id: 'workhour',
    name: '월평균 근로시간',
    orgId: '101',
    tblId: 'DT_1DA7001S',
    itmId: 'T40',       // 근로시간
    prdSe: 'M',
    unit: '시간',
  },
  {
    id: 'employment',
    name: '취업자 수',
    orgId: '101',
    tblId: 'DT_1DA7002S',
    itmId: 'T10',
    prdSe: 'M',
    unit: '천명',
  },
]

async function fetchKosisTable(
  key: string,
  table: typeof STAT_TABLES[number]
): Promise<KosisIndicator | null> {
  const url = `https://kosis.kr/openapi/statisticsData.do` +
    `?method=getList&apiKey=${encodeURIComponent(key)}` +
    `&format=json&jsonVD=Y` +
    `&userStatsId=${table.id}` +
    `&statsId=${table.orgId}` +
    `&prdSe=${table.prdSe}` +
    `&startPrdDe=202401&endPrdDe=202412`

  const res = await fetch(url, { next: { revalidate: 14400 } }) // 4시간 캐시
  if (!res.ok) return null

  const data = await res.json()
  if (data.err) return null

  // 최신값 추출
  const rows: Record<string, string>[] = Array.isArray(data) ? data : []
  const latest = rows.sort((a, b) => (b.PRD_DE ?? '').localeCompare(a.PRD_DE ?? ''))[0]

  if (!latest) return null

  return {
    name: table.name,
    value: Number(latest.DT ?? 0).toLocaleString('ko-KR'),
    unit: table.unit,
    period: latest.PRD_DE ?? '',
    tblId: table.tblId,
  }
}

export async function GET(_request: NextRequest) {
  const key = process.env.KOSIS_API_KEY

  if (!key) {
    return Response.json({ status: 'key_required', keyName: 'KOSIS_API_KEY' })
  }

  try {
    const results = await Promise.all(STAT_TABLES.map(t => fetchKosisTable(key, t)))
    const indicators = results.filter((r): r is KosisIndicator => r !== null)

    return Response.json({ status: 'ok', indicators })
  } catch (e) {
    return Response.json({ status: 'error', error: String(e), indicators: [] })
  }
}
