import { describe, it, expect } from 'vitest'
import { extractVoiceOccurrences, htmlToPlainText, type VoiceRawData } from './executiveVoices'

function raw(p: Partial<VoiceRawData>): VoiceRawData {
  return { meetingNotes: [], meetings: {}, meetingAgendas: {}, agendaItems: [], subTaskNotes: [], subTasks: {}, retros: [], adhocReports: [], errors: [], ...p }
}

describe('경영진 의견(Alt+3/4) 모으기', () => {
  it('회의록에 표시한 줄은 회의 날짜를 발언일로 모인다', () => {
    const occ = extractVoiceOccurrences(raw({
      meetingNotes: [{ id: 'n1', meeting_id: 'm1', title: '노트', content: '<p>일반 줄</p><p data-voice="CEO" data-voice-id="v1" data-voice-at="2026-10-20">보상 재검토</p>' }],
      meetings: { m1: { id: 'm1', title: '경영회의', meeting_date: '2026-10-15', category: '경영진' } },
    }))
    expect(occ).toHaveLength(1)
    expect(occ[0]).toMatchObject({ voice: 'CEO', voiceId: 'v1', text: '보상 재검토' })
    expect(occ[0].source).toMatchObject({ type: 'meeting', date: '2026-10-15', dateKind: 'spoken' })
  })

  it('회의 날짜가 없으면 표시한 날짜로', () => {
    const occ = extractVoiceOccurrences(raw({
      meetingNotes: [{ id: 'n1', meeting_id: 'm1', title: null, content: '<p data-voice="CSO" data-voice-at="2026-10-20">의견</p>' }],
      meetings: { m1: { id: 'm1', title: '회의', meeting_date: null, category: null } },
    }))
    expect(occ[0].source).toMatchObject({ date: '2026-10-20', dateKind: 'marked' })
  })

  it('표시 없는 글, 모르는 발언자 값은 모으지 않는다', () => {
    const occ = extractVoiceOccurrences(raw({
      meetingNotes: [{ id: 'n1', meeting_id: 'm1', title: null, content: '<p>그냥</p><p data-voice="XYZ">이상한 값</p>' }],
    }))
    expect(occ).toHaveLength(0)
  })
})

describe('htmlToPlainText', () => {
  it('예전 순수 텍스트는 그대로', () => {
    expect(htmlToPlainText('  평문  ')).toBe('평문')
  })
  it('문단은 줄로 나뉜다', () => {
    expect(htmlToPlainText('<p>가</p><p>나</p>')).toBe('가\n나')
  })
})
