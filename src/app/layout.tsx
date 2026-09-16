import type { Metadata, Viewport } from "next";
import "./globals.css";
import ArrowShortcutsProvider from "@/components/ArrowShortcutsProvider";

export const metadata: Metadata = {
  title: "인사기획 워크",
  description: "인사기획팀 업무 보드",
  manifest: "/manifest.json",
  icons: {
    icon: { url: '/favicon.ico', type: 'image/x-icon' },
    apple: { url: '/apple-icon', type: 'image/png', sizes: '180x180' },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "인사기획",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 실제 활성 테마는 클라이언트에서 <html data-theme>/style.colorScheme로 동적 결정된다.
  // 이 메타는 정적 SSR 값이라 "dark"로 고정하면 라이트 선택 시에도 브라우저에
  // "이 페이지는 dark만 지원"이라고 잘못된 신호를 준다 — 둘 다 지원한다고 선언.
  colorScheme: "light dark",
  themeColor: "#4C7FE0",
};

// 하이드레이션 전에 동기 실행 — localStorage의 저장된 테마를 즉시 <html>에
// 반영해 FOUC(다크↔라이트 깜빡임)를 막는다. 저장된 값이 없으면 dark(기존
// Production 기본값)를 유지한다.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('dashboard_theme');
    if (t !== 'light' && t !== 'dark') t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

// 임시 element-level 진단 오버레이 — ?debug=theme 일 때만 동작.
// 이전 라운드(html/body 레벨)는 이미 정상으로 확인됐으므로, 이번엔 실제로 어둡게
// 보인다고 지목된 개별 DOM 요소 자체의 getComputedStyle을 직접 찍는다 —
// "코드상 이래야 한다"가 아니라 브라우저가 실제로 계산한 값만 출력한다.
// 원인 확정 후 반드시 제거할 것.
const THEME_ELEMENT_DEBUG_SCRIPT = `
(function () {
  try {
    if (location.search.indexOf('debug=theme') === -1) return;

    function byHeadingText(text) {
      var hs = document.querySelectorAll('h2');
      for (var i = 0; i < hs.length; i++) {
        if (hs[i].textContent.indexOf(text) !== -1) return hs[i];
      }
      return null;
    }
    function ancestorWithClassPart(node, part) {
      var n = node;
      for (var i = 0; i < 6 && n; i++) {
        if (n.className && typeof n.className === 'string' && n.className.indexOf(part) !== -1) return n;
        n = n.parentElement;
      }
      return null;
    }
    function cardFor(headingText) {
      var h = byHeadingText(headingText);
      if (!h) return null;
      return ancestorWithClassPart(h, 'rounded-[20px]');
    }
    function firstRowIn(card) {
      if (!card) return null;
      return card.querySelector('[class*="py-2.5"]');
    }
    function memoSheet() {
      var h = Array.prototype.find.call(document.querySelectorAll('span,div'), function (n) {
        return n.textContent === '빠른 메모';
      });
      if (!h) return null;
      return ancestorWithClassPart(h, 'rounded-t-3xl');
    }
    function bottomNav() {
      return document.querySelector('nav[class*="bottom-0"]');
    }

    var VAR_CANDIDATES = ['--surface-primary', '--surface-secondary', '--surface-elevated', '--bg-sidebar', '--bg-page', '--border-default', '--border-strong', '--text-rgb', '--ink-rgb', '--text-primary', '--text-muted'];

    function describe(name, el) {
      if (!el) return [ 'ELEMENT: ' + name, '  NOT MOUNTED', '' ];
      var cs = getComputedStyle(el);
      var parent = el.parentElement;
      var parentCs = parent ? getComputedStyle(parent) : null;
      var rect = el.getBoundingClientRect();
      var cx = Math.round(rect.left + rect.width / 2);
      var cy = Math.round(rect.top + rect.height / 2);
      var vars = VAR_CANDIDATES.map(function (v) {
        var val = cs.getPropertyValue(v);
        return val ? (v + '=' + val.trim()) : null;
      }).filter(Boolean).join(', ');

      var stack = [];
      try {
        var els = document.elementsFromPoint(cx, cy) || [];
        stack = els.slice(0, 6).map(function (e, i) {
          var ecs = getComputedStyle(e);
          return '    [' + i + '] <' + e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? ' class="' + e.className.slice(0, 60) + '"' : '') + '> bg=' + ecs.backgroundColor + ' opacity=' + ecs.opacity + ' z=' + ecs.zIndex + ' pos=' + ecs.position;
        });
      } catch (e) {}

      return [
        'ELEMENT: ' + name,
        '  tag/class: ' + el.tagName.toLowerCase() + ' | ' + (typeof el.className === 'string' ? el.className.slice(0, 80) : '(non-string className)'),
        '  inline style: ' + (el.getAttribute('style') || '(none)'),
        '  computed backgroundColor: ' + cs.backgroundColor,
        '  computed color: ' + cs.color,
        '  computed borderTopColor: ' + cs.borderTopColor,
        '  computed opacity/filter/mixBlendMode: ' + cs.opacity + ' / ' + cs.filter + ' / ' + cs.mixBlendMode,
        '  computed color-scheme: ' + cs.colorScheme,
        '  parent computed backgroundColor: ' + (parentCs ? parentCs.backgroundColor : 'n/a'),
        '  relevant CSS vars at this node: ' + (vars || '(none matched)'),
        '  elementsFromPoint(center) top->bottom:',
      ].concat(stack).concat(['']);
    }

    function render() {
      var box = document.getElementById('__theme_elem_debug_box__');
      if (!box) {
        box = document.createElement('div');
        box.id = '__theme_elem_debug_box__';
        box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:38vh;overflow-y:auto;z-index:999999;background:rgba(0,0,0,0.92);color:#0f0;font:9px/1.4 monospace;padding:6px;white-space:pre-wrap;word-break:break-all;';
        document.body.appendChild(box);
      }
      var lines = [ '=== theme element debug @ ' + new Date().toLocaleTimeString() + ' ===', '' ];
      lines = lines.concat(describe('A. Home 오늘의 할 일 card', cardFor('오늘의 할 일')));
      var cardB = cardFor('진행 중 과업');
      lines = lines.concat(describe('B. Home 진행 중 과업 card', cardB));
      lines = lines.concat(describe('C. 진행 중 과업 card row', firstRowIn(cardB)));
      lines = lines.concat(describe('D. MobileMemoSheet outer sheet', memoSheet()));
      lines = lines.concat(describe('E. MobileMemoSheet input', document.querySelector('input[placeholder="메모 제목"]')));
      lines = lines.concat(describe('F. MobileMemoSheet textarea', document.querySelector('textarea[placeholder="내용 (선택)"]')));
      lines = lines.concat(describe('G. Bottom Navigation', bottomNav()));
      box.textContent = lines.join('\\n');
    }
    render();
    setInterval(render, 1000);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" style={{ colorScheme: 'dark' }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="bg-[#F1F5F9] text-gray-900 antialiased font-sans" suppressHydrationWarning>
        <ArrowShortcutsProvider />
        {children}
        <script dangerouslySetInnerHTML={{ __html: THEME_ELEMENT_DEBUG_SCRIPT }} />
      </body>
    </html>
  );
}
