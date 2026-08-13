import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const externalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);
// Escape hatch para descompasso entre o manifesto e os browsers baixados.
// `playwright-core/browsers.json` fixa uma revisão do chromium (ex.: 1208); se o
// `playwright install` baixar outra (ex.: 1234), os testes falham todos com
// "Executable doesn't exist at .../chromium_headless_shell-<rev>" — o que parece
// suíte quebrada, mas é só o browser errado no disco.
//
// Diagnóstico rápido:
//   node -e "require('./node_modules/playwright-core/browsers.json').browsers
//     .filter(b=>b.name.startsWith('chromium')).forEach(b=>console.log(b.name,b.revision))"
//   ls ~/AppData/Local/ms-playwright   # (Windows)
//
// Contorno: aponte para um chrome.exe existente —
//   PLAYWRIGHT_EXECUTABLE_PATH=".../ms-playwright/chromium-<rev>/chrome-win64/chrome.exe"
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    // Em CI, o workflow já fez `npm run build` e baixou o dist/ como artifact;
    // usamos `vite preview` (serve dist/) com porta fixa, MUITO mais rápido
    // do que `npm run dev` que recompila tudo. Também evita o conflito de
    // porta com o `vite.config.ts` (que usa 8080 para o dev server).
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
