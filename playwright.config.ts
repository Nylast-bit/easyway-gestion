import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /capturas\.spec\.ts/ },
    // Revisión visual en móvil, tablet, laptop y PC: npm run test:capturas (capturas/ ignorado por Git).
    { name: 'capturas', use: { ...devices['Desktop Chrome'] }, testMatch: /capturas\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev --workspace=@easyway/web -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
