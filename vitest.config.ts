import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 순수 함수·편집기 동작 테스트용 — 실제 DB/화면은 건드리지 않는다.
// jsdom: DOMParser·편집기(ProseMirror)가 브라우저 DOM을 필요로 해서 사용
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
