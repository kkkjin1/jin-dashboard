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

// 임시 실기기 진단 오버레이 — ?debug=theme 일 때만 동작, 프레임워크(React) 상태와
// 무관하게 바닐라 JS로 1초마다 실제 DOM/localStorage/computed style을 읽어 화면에
// 그대로 찍는다. 원인 파악 후 제거할 것.
const THEME_DEBUG_SCRIPT = `
(function () {
  try {
    if (location.search.indexOf('debug=theme') === -1) return;
    function render() {
      var html = document.documentElement;
      var body = document.body;
      var box = document.getElementById('__theme_debug_box__');
      if (!box) {
        box = document.createElement('div');
        box.id = '__theme_debug_box__';
        box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#000;color:#0f0;font:11px/1.5 monospace;padding:8px;white-space:pre-wrap;word-break:break-all;';
        document.body.appendChild(box);
      }
      var cs = getComputedStyle(html);
      var bodyCs = body ? getComputedStyle(body) : null;
      var lines = [
        'time: ' + new Date().toLocaleTimeString(),
        'html[data-theme]: ' + html.getAttribute('data-theme'),
        'html.style.colorScheme: ' + html.style.colorScheme,
        'localStorage.dashboard_theme: ' + (function(){ try { return localStorage.getItem('dashboard_theme') } catch(e){ return 'ERR:'+e } })(),
        '--bg-page (computed on html): ' + cs.getPropertyValue('--bg-page'),
        '--surface-secondary (computed on html): ' + cs.getPropertyValue('--surface-secondary'),
        'html computed background-color: ' + cs.backgroundColor,
        'body computed background-color: ' + (bodyCs ? bodyCs.backgroundColor : 'n/a'),
        'innerWidth: ' + window.innerWidth,
        'matchMedia(max-width:767px): ' + window.matchMedia('(max-width:767px)').matches,
        'matchMedia(prefers-color-scheme:dark): ' + window.matchMedia('(prefers-color-scheme:dark)').matches,
      ];
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
        <script dangerouslySetInnerHTML={{ __html: THEME_DEBUG_SCRIPT }} />
      </body>
    </html>
  );
}
