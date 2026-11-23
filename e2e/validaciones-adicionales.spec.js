const { expect } = require("@playwright/test");
const { escenario, iniciarSesion, tokenAPI } = require("./casos");

for (const [label, limit] of [["Nombre", 100], ["Correo", 254], ["Contraseña", 128], ["Confirmar contraseña", 128]]) {
  escenario("REG-LIMIT · Registro limita " + label + " a " + limit + " caracteres", async ({ page }) => {
    await page.goto("/#registro");
    const field = page.locator("#register").getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute("maxlength", String(limit));
    await field.fill("a".repeat(limit + 1));
    expect((await field.inputValue()).length).toBe(limit);
  });
}

escenario("REG-MIN · Contraseña corta bloquea el registro en el navegador", async ({ page }) => {
  await page.goto("/#registro");
  const form = page.locator("#register");
  await form.getByLabel("Nombre", { exact: true }).fill("Registro mínimo QA");
  await form.getByLabel("Correo", { exact: true }).fill("registro-minimo@example.test");
  const password = form.getByLabel("Contraseña", { exact: true });
  // Escritura por teclado activa la validación nativa de minlength.
  await password.pressSequentially("corta");
  await form.getByLabel("Confirmar contraseña", { exact: true }).pressSequentially("corta");
  let requests = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/api/auth/register")) requests++;
  });
  await form.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(password).toBeFocused();
  expect(await password.evaluate(el => el.validity.tooShort)).toBe(true);
  expect(requests).toBe(0);
});

escenario("USR-EMAIL · Correo inválido bloquea la creación de usuario", async ({ page }) => {
  await iniciarSesion(page);
  await page.getByRole("button", { name: "Usuarios", exact: true }).click();
  const form = page.locator("#editor");
  await form.getByLabel("Nombre", { exact: true }).fill("Correo inválido QA");
  const email = form.getByLabel("Correo", { exact: true });
  await email.fill("correo-sin-dominio");
  await form.getByLabel("Contraseña", { exact: true }).fill("invalid-email-123");
  let requests = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/api/users")) requests++;
  });
  await form.getByRole("button", { name: "Crear usuario", exact: true }).click();
  await expect(email).toBeFocused();
  expect(await email.evaluate(el => el.validity.typeMismatch)).toBe(true);
  expect(requests).toBe(0);
});

escenario("USR-LIMIT · Nombre de usuario limita la longitud a 100 caracteres", async ({ page }) => {
  await iniciarSesion(page);
  await page.getByRole("button", { name: "Usuarios", exact: true }).click();
  const field = page.locator("#editor").getByLabel("Nombre", { exact: true });
  await expect(field).toHaveAttribute("maxlength", "100");
  await field.fill("a".repeat(101));
  expect((await field.inputValue()).length).toBe(100);
});

escenario("PRO-ZERO · Crear producto con precio y stock en cero", async ({ page, request }) => {
  const headers = await tokenAPI(request);
  let id;
  await iniciarSesion(page);
  const form = page.locator("#editor");
  try {
    await form.getByLabel("Nombre", { exact: true }).fill("Producto cero QA");
    await form.getByLabel("Precio", { exact: true }).fill("0");
    await form.getByLabel("Stock", { exact: true }).fill("0");
    const pending = page.waitForResponse(r => r.url().endsWith("/api/productos") && r.request().method() === "POST");
    await form.getByRole("button", { name: "Crear producto", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const body = await response.json();
    id = body.data.id;
    await expect(page.locator("#status")).toHaveText("Registro guardado");
    await expect(page.getByRole("listitem").filter({ hasText: "Producto cero QA" })).toContainText("Stock 0");
    const read = await request.get("/api/productos/" + id, { headers });
    expect((await read.json()).data).toMatchObject({ precio: 0, stock: 0, disponible: false });
  } finally {
    if (id) await request.delete("/api/productos/" + id, { headers });
  }
});

escenario("USR-EMPTY · Lista de usuarios vacía muestra el mensaje correspondiente", async ({ page }) => {
  await iniciarSesion(page);
  await page.route("**/api/users", route => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Usuarios", exact: true }).click();
  await expect(page.locator("#items")).toHaveText("Todavía no hay usuarios.");
  await expect(page.locator("#items").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear usuario", exact: true })).toBeVisible();
});
