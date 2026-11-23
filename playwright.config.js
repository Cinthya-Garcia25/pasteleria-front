const { defineConfig } = require("@playwright/test");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

module.exports = defineConfig({
  testDir: "./e2e",
  reporter: [["./e2e/reporter.js"], ["html", { open: "never" }]],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", testMatch: "**/platform.spec.js", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3010" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3010/api/health",
    env: {
      PORT: "3010",
      DB_PATH: join(mkdtempSync(join(tmpdir(), "pasteleria-e2e-")), "database.db"),
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "test-password-123",
      ENABLE_TCP: "false",
    },
  },
});
