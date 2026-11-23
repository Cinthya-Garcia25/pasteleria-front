const { test, expect } = require("@playwright/test");

const cuenta = { email: "admin@example.test", password: "test-password-123" };

function caso(id, nombre, precondicion, pasos, esperado, verificar) {
  test(id + " · " + nombre, {
    annotation: [{ type: "Descripción", description: nombre }],
  }, async ({ page, request, browser, baseURL }) => {
    await verificar({ page, request, browser, baseURL });
  });
}

async function iniciarSesion(page) {
  await page.goto("/");
  const login = page.locator("#login");
  await login.getByLabel("Correo").fill(cuenta.email);
  await login.getByLabel("Contraseña").fill(cuenta.password);
  await login.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
}

async function tokenAPI(request) {
  const response = await request.post("/api/auth/login", { data: cuenta });
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  return { Authorization: "Bearer " + token };
}

function escenario(nombre, verificar) {
  test(nombre, {
    annotation: [{ type: "Descripción", description: nombre }],
  }, async ({ page, request, context }, testInfo) => {
    await verificar({ page, request, context }, testInfo);
  });
}

module.exports = { caso, escenario, cuenta, iniciarSesion, tokenAPI };
