const { expect } = require("@playwright/test");
const { escenario, iniciarSesion, tokenAPI } = require("./casos");

escenario("Platform · CRUD móvil de productos y usuarios", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = await tokenAPI(request);
  await iniciarSesion(page);
  for (const [module, resource, entity] of [["Productos", "productos", "producto"], ["Usuarios", "users", "usuario"]]) {
    const label = "Móvil " + testInfo.project.name + " " + entity;
    let id;
    await page.getByRole("button", { name: module, exact: true }).click();
    const form = page.locator("#editor");
    try {
      await form.getByLabel("Nombre").fill(label);
      if (resource === "productos") {
        await form.getByLabel("Precio").fill("23.50");
        await form.getByLabel("Stock").fill("2");
      } else {
        await form.getByLabel("Correo").fill("mobile-crud-" + testInfo.project.name + "@example.test");
        await form.getByLabel("Contraseña", { exact: true }).fill("mobile-crud-pass");
      }
      const response = page.waitForResponse(r => r.url().endsWith("/api/" + resource) && r.request().method() === "POST");
      await form.getByRole("button", { name: "Crear " + entity, exact: true }).click();
      const body = await (await response).json();
      id = (body.data ?? body).id;
      const row = page.getByRole("listitem").filter({ hasText: label });
      await row.getByRole("button", { name: "Editar", exact: true }).click();
      await form.getByLabel("Nombre").fill(label + " actualizado");
      await form.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(row).toContainText("actualizado");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      page.once("dialog", dialog => dialog.accept());
      await row.getByRole("button", { name: "Eliminar", exact: true }).click();
      await expect(row).toHaveCount(0);
    } finally {
      if (id) await request.delete("/api/" + resource + "/" + id, { headers });
    }
  }
});
