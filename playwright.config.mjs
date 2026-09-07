import { defineConfig } from '@playwright/test';

const productionURL = process.env.QA_BASE_URL;

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  reporter: [['list']],
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
