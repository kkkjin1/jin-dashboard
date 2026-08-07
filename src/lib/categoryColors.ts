export const CATEGORY_PALETTE = {
  blue:    { solid: '#6B9BE0', bg: 'rgba(107,155,224,0.20)', text: '#A9C3EC', border: 'rgba(107,155,224,0.35)', on: '#12345C' },
  purple:  { solid: '#9B87DB', bg: 'rgba(155,135,219,0.20)', text: '#C3B4EC', border: 'rgba(155,135,219,0.35)', on: '#2E2358' },
  teal:    { solid: '#5FBFA3', bg: 'rgba(95,191,163,0.20)',  text: '#9BDCC7', border: 'rgba(95,191,163,0.35)',  on: '#0F3B2E' },
  amber:   { solid: '#E0A56B', bg: 'rgba(224,165,107,0.20)', text: '#ECC7A0', border: 'rgba(224,165,107,0.35)', on: '#4A3218' },
  pink:    { solid: '#D98B9E', bg: 'rgba(217,139,158,0.20)', text: '#ECB6C2', border: 'rgba(217,139,158,0.35)', on: '#4E2531' },
  green:   { solid: '#7FB069', bg: 'rgba(127,176,105,0.20)', text: '#B4D3A0', border: 'rgba(127,176,105,0.35)', on: '#28401A' },
  cyan:    { solid: '#6BB6C7', bg: 'rgba(107,182,199,0.20)', text: '#A6D5E0', border: 'rgba(107,182,199,0.35)', on: '#123A44' },
  lilac:   { solid: '#C99BD1', bg: 'rgba(201,155,209,0.20)', text: '#DEBEE3', border: 'rgba(201,155,209,0.35)', on: '#432648' },
  neutral: { solid: '#B0A98F', bg: 'rgba(176,169,143,0.20)', text: '#CFC9B4', border: 'rgba(176,169,143,0.35)', on: '#3A3626' },
} as const;

export type CategoryColorKey = keyof typeof CATEGORY_PALETTE;

// 이름→색 매핑. 팀명은 조직 설정(useOrgData)에서 동적으로 오므로 여기 넣지 않음 —
// 매칭 안 되는 이름은 colorKeyFromName()이 해시로 안정된 색을 배정함.
export const MEETING_CATEGORY: Record<string, CategoryColorKey> = {
  '경영진': 'teal', '타팀': 'amber',
  '본부장': 'pink', '목표관리': 'green', '개인': 'cyan', '기타': 'neutral',
};

// 회의 카테고리 선택지 중 실제 팀이 아닌 고정 태그 (조직 개편과 무관하게 유지)
export const FIXED_MEETING_TAGS = ['경영진', '타팀', '본부장', '목표관리', '개인', '기타'];

// 업무/팀원 파트 선택지 중 실제 팀이 아닌 고정 태그
export const FIXED_PART_TAGS = ['개인', '팀장'];

export const ARCHIVE_CATEGORY: Record<string, CategoryColorKey> = {
  'HR': 'blue', '경제': 'teal', '리더십': 'lilac', '평가보상': 'amber',
  '데이터': 'cyan', '조직문화': 'pink', '기획': 'green', '노무': 'neutral', '미분류': 'neutral',
};

export const MEMO_TAG: Record<string, CategoryColorKey> = {
  '공지': 'amber', '업무관련': 'blue', '회의관련': 'teal', '아이디어': 'lilac', '완료': 'neutral',
};

export const PART_COLOR: Record<string, CategoryColorKey> = {
  '팀장': 'neutral', '기본': 'neutral',
};

export const TEAM_COLOR: Record<string, CategoryColorKey> = {
  '총무': 'blue',
  '인프라': 'green',
  '품질관리': 'amber',
  'CX': 'lilac',
  '촬영': 'pink',
};

// 이름 매핑에 없는 값(신규 팀 등)은 문자열 해시로 안정 배정
export function colorKeyFromName(name: string): CategoryColorKey {
  const keys = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
}
