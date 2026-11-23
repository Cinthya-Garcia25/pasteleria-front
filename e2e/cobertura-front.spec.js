const { expect } = require("@playwright/test");
const { escenario, iniciarSesion, tokenAPI } = require("./casos");

for (const [name, modifiers] of [["tab", ["ControlOrMeta"]], ["window", ["Shift"]]]) {
  escenario("LINK-" + name + " · Abrir registro en otro contexto de navegación", async ({ page, context }) => {
    await page.goto("/");
    const original = page.url();
    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: "Crear cuenta", exact: true }).click({ modifiers });
    const child = await opened;
    try {
      await expect(child.locator("#register")).toBeVisible();
      await expect(child).toHaveURL(/#registro$/);
      await expect(page).toHaveURL(original);
    } finally {
      await child.close();
    }
  });
}

escenario("LINK-03 · Enlaces y recursos sin destinos rotos", async ({ page, request }) => {
  await page.goto("/");
  const destinations = await page.locator("a[href],link[rel=stylesheet],script[src]").evaluateAll(
    nodes => nodes.map(node => node.href || node.src));
  expect(destinations.length).toBeGreaterThanOrEqual(4);
  for (const url of [...new Set(destinations)]) {
    const response = await request.get(url);
    expect(response.ok(), url).toBe(true);
  }
  await expect(page.locator("#login")).toBeVisible();
});

escenario("LINK-04 · Enlace dummy vuelve al inicio de sesión", async ({ page }) => {
  await page.goto("/#registro");
  const link = page.getByRole("link", { name: "Iniciar sesión", exact: true });
  await expect(link).toHaveAttribute("href", "#");
  await link.click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#register")).toBeHidden();
});

escenario("STATE-01 · Lista vacía y primer producto", async ({ page }) => {
  let created = false;
  await iniciarSesion(page);
  await page.route("**/api/productos", async route => {
    if (route.request().method() === "POST") {
      created = true;
      return route.fulfill({ status: 201, json: { data: { id: 98765 } } });
    }
    return route.fulfill({ json: { data: created ? [{ id: 98765, nombre: "Primero QA", precio: 12, stock: 1 }] : [] } });
  });
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await expect(page.locator("#items")).toHaveText("Todavía no hay productos.");
  const form = page.locator("#editor");
  await form.getByLabel("Nombre").fill("Primero QA");
  await form.getByLabel("Precio").fill("12");
  await form.getByLabel("Stock").fill("1");
  await form.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.locator("#items")).toContainText("Primero QA");
  await expect(page.locator("#items .empty")).toHaveCount(0);
});

escenario("STATE-02 · Respuesta lenta no sobrescribe Usuarios", async ({ page }) => {
  await iniciarSesion(page);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let intercepted;
  const arrived = new Promise(resolve => { intercepted = resolve; });
  await page.route("**/api/productos", async route => {
    intercepted();
    await held;
    await route.fulfill({ json: { data: [{ id: 98765, nombre: "Respuesta anterior QA", precio: 1, stock: 1 }] } });
  });
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await arrived;
  try {
    await page.getByRole("button", { name: "Usuarios", exact: true }).click();
    await expect(page.locator("#items")).toContainText("admin@example.test");
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/productos");
    release();
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator("#title")).toHaveText("Usuarios");
    await expect(page.locator("#items")).not.toContainText("Respuesta anterior QA");
    await expect(page.getByRole("button", { name: "Crear usuario", exact: true })).toBeVisible();
  } finally {
    release();
  }
});

for (const [label, value, validity] of [
  ["Stock", "-1", "rangeUnderflow"],
  ["Stock", "1.5", "stepMismatch"],
  ["Precio", "1.234", "stepMismatch"],
]) {
  escenario("LIMIT · " + label + " rechaza " + value, async ({ page }) => {
    await iniciarSesion(page);
    const form = page.locator("#editor");
    await form.getByLabel("Nombre").fill("Límite QA");
    await form.getByLabel("Precio").fill("1");
    await form.getByLabel("Stock").fill("1");
    const field = form.getByLabel(label);
    await field.fill(value);
    let sent = 0;
    page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/api/productos")) sent++; });
    await form.getByRole("button", { name: "Crear producto" }).click();
    expect(await field.evaluate((el, key) => el.validity[key], validity)).toBe(true);
    expect(sent).toBe(0);
  });
}

for (const [label, maximum] of [["Nombre", 100], ["Descripción", 500]]) {
  escenario("LIMIT · Longitud máxima de " + label, async ({ page }) => {
    await iniciarSesion(page);
    const field = page.locator("#editor").getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute("maxlength", String(maximum));
    await field.fill("a".repeat(maximum + 1));
    expect((await field.inputValue()).length).toBe(maximum);
  });
}

escenario("LIMIT · Nombre compuesto por espacios", async ({ page }) => {
  await iniciarSesion(page);
  const form = page.locator("#editor");
  await form.getByLabel("Nombre").fill("   ");
  await form.getByLabel("Precio").fill("1");
  await form.getByLabel("Stock").fill("1");
  const result = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/productos"));
  await form.getByRole("button", { name: "Crear producto" }).click();
  expect((await result).status()).toBe(400);
  await expect(page.locator("#status")).not.toHaveText("");
  await expect(form.getByLabel("Nombre")).toHaveValue("   ");
});

for (const change of [false, true]) {
  escenario("PASS · " + (change ? "Cambiar contraseña" : "Conservar contraseña vacía"), async ({ page, request }) => {
    const headers = await tokenAPI(request);
    const email = "password-" + change + "@example.test";
    const oldPassword = "original-pass-123";
    const newPassword = "modified-pass-123";
    const created = await request.post("/api/users", { headers, data: { nombre: "Password QA", email, password: oldPassword } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    try {
      await iniciarSesion(page);
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      await page.getByRole("listitem").filter({ hasText: email }).getByRole("button", { name: "Editar", exact: true }).click();
      const form = page.locator("#editor");
      await expect(form.getByLabel("Contraseña", { exact: true })).toHaveValue("");
      if (change) await form.getByLabel("Contraseña", { exact: true }).fill(newPassword);
      await form.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.locator("#status")).toHaveText("Registro guardado");
      const login = password => request.post("/api/auth/login", { data: { email, password } });
      expect((await login(change ? newPassword : oldPassword)).status()).toBe(200);
      if (change) expect((await login(oldPassword)).status()).toBe(401);
    } finally {
      await request.delete("/api/users/" + id, { headers });
    }
  });
}
