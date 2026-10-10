import { defineConfig } from '@playwright/test';

const productionURL = process.env.QA_BASE_URL;

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  reporter: [['list']],
  // 로컬 정적 서버에서 여러 A4 문서 번들을 동시에 기동하면 확장 탭 등록이
  // 간헐적으로 늦어진다. 전체 회귀는 30초 안팎이므로 재현성을 우선한다.
  workers: 1,
  // 느린 로컬/CI 환경에서도 초기화 완료를 기다리도록 한다.
  expect: { timeout: 10_000 },
  use: {
    baseURL: productionURL || 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
  },
  webServer: productionURL ? undefined : {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
  },
});
