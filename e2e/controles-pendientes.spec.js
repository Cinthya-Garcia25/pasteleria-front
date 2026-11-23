const { expect } = require("@playwright/test");
const { escenario, iniciarSesion, tokenAPI } = require("./casos");

const modules = [
  { name: "Productos", resource: "productos", entity: "producto", fields: { Nombre: "Obligatorio QA", Precio: "25", Stock: "2" } },
  { name: "Usuarios", resource: "users", entity: "usuario", fields: { Nombre: "Obligatorio QA", Correo: "required-qa@example.test", Contraseña: "required-pass-123" } },
];

for (const module of modules) {
  for (const field of Object.keys(module.fields)) {
    escenario("REQ · " + module.name + " requiere " + field, async ({ page }) => {
      await iniciarSesion(page);
      await page.getByRole("button", { name: module.name, exact: true }).click();
      const form = page.locator("#editor");
      for (const [label, value] of Object.entries(module.fields)) {
        await form.getByLabel(label, { exact: true }).fill(label === field ? "" : value);
      }
      let requests = 0;
      page.on("request", r => {
        if (r.method() === "POST" && r.url().endsWith("/api/" + module.resource)) requests++;
      });
      await form.getByRole("button", { name: "Crear " + module.entity, exact: true }).click();
      const control = form.getByLabel(field, { exact: true });
      expect(await control.evaluate(el => el.validity.valueMissing)).toBe(true);
      await expect(control).toBeFocused();
      expect(requests).toBe(0);
    });
  }
}

async function withRecord(page, request, module, work) {
  const headers = await tokenAPI(request);
  const marker = "Control " + module.resource;
  const data = module.resource === "users"
    ? { nombre: marker, email: "control-editor@example.test", password: "original-control-123" }
    : { nombre: marker, precio: 25, stock: 2 };
  const response = await request.post("/api/" + module.resource, { headers, data });
  expect(response.status()).toBe(201);
  const body = await response.json();
  const id = (body.data ?? body).id;
  const url = "/api/" + module.resource + "/" + id;
  try {
    await iniciarSesion(page);
    await page.getByRole("button", { name: module.name, exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: marker });
    await expect(row).toBeVisible();
    await work({ row, url, headers, data });
  } finally {
    await request.delete(url, { headers });
  }
}

for (const editing of [false, true]) {
  escenario("PASS-TOGGLE · Mostrar y ocultar al " + (editing ? "editar" : "crear") + " usuario", async ({ page, request }) => {
    const verify = async () => {
      const form = page.locator("#editor");
      const field = form.getByLabel("Contraseña", { exact: true });
      await field.fill("toggle-editor-123");
      await form.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
      await expect(field).toHaveAttribute("type", "text");
      await expect(field).toHaveValue("toggle-editor-123");
      await form.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
      await expect(field).toHaveAttribute("type", "password");
      await expect(field).toHaveValue("toggle-editor-123");
    };
    if (editing) {
      await withRecord(page, request, modules[1], async ({ row }) => {
        await row.getByRole("button", { name: "Editar", exact: true }).click();
        await verify();
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      });
    } else {
      await iniciarSesion(page);
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      await verify();
    }
  });
}

for (const module of modules) {
  escenario("DUP-EDIT · Un solo envío al guardar " + module.entity, async ({ page, request }) => {
    await withRecord(page, request, module, async ({ row, url, headers }) => {
      await row.getByRole("button", { name: "Editar", exact: true }).click();
      const form = page.locator("#editor");
      await form.getByLabel("Nombre", { exact: true }).fill("Actualizado " + module.resource);
      let release;
      const held = new Promise(resolve => { release = resolve; });
      let count = 0;
      await page.route("**" + url, async route => {
        if (route.request().method() === "PUT") {
          count++;
          await held;
        }
        await route.continue();
      });
      const save = form.getByRole("button", { name: "Guardar cambios", exact: true });
      try {
        await save.dblclick();
        await expect(save).toBeDisabled();
        await form.evaluate(el => el.requestSubmit());
      } finally {
        release();
      }
      await expect(page.locator("#status")).toHaveText("Registro guardado");
      expect(count).toBe(1);
      const response = await request.get(url, { headers });
      const body = await response.json();
      expect((body.data ?? body).nombre).toBe("Actualizado " + module.resource);
    });
  });
}

escenario("CANCEL-USER · Cancelar eliminación conserva el usuario", async ({ page, request }) => {
  await withRecord(page, request, modules[1], async ({ row, url, headers, data }) => {
    let deletes = 0;
    page.on("request", r => { if (r.method() === "DELETE" && r.url().endsWith(url)) deletes++; });
    page.once("dialog", dialog => dialog.dismiss());
    await row.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(row).toBeVisible();
    const response = await request.get(url, { headers });
    expect(response.status()).toBe(200);
    expect((await response.json()).email).toBe(data.email);
    expect(deletes).toBe(0);
  });
});
