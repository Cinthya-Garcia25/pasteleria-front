const { test, expect } = require("@playwright/test");
const { caso, cuenta, iniciarSesion, tokenAPI } = require("./casos");

test.describe("Validaciones de registro", () => {
  caso("REG-01", "Rechazar el formulario sin nombre", "Formulario de registro abierto.",
    "Dejar Nombre vacío, completar correo y contraseñas, y pulsar Crear cuenta.",
    "Nombre recibe el foco y se marca como obligatorio. El formulario permanece abierto.",
    async ({ page }) => {
      await page.goto("/#registro");
      const form = page.locator("#register");
      await form.getByLabel("Correo").fill("registro-sin-nombre@example.test");
      await form.getByLabel("Contraseña", { exact: true }).fill("registro-prueba-123");
      await form.getByLabel("Confirmar contraseña").fill("registro-prueba-123");
      await form.getByRole("button", { name: "Crear cuenta" }).click();
      const name = form.getByLabel("Nombre");
      await expect(name).toBeFocused();
      expect(await name.evaluate((field) => field.validity.valueMissing)).toBe(true);
      await expect(form).toBeVisible();
    });

  caso("REG-02", "Rechazar contraseña corta desde la API", "Cliente HTTP sin sesión.",
    "Enviar POST /api/auth/register con nombre, correo válido y una contraseña de 5 caracteres.",
    "La API responde 400 y explica el requisito de 12 a 128 caracteres.",
    async ({ request }) => {
      const response = await request.post("/api/auth/register", {
        data: { nombre: "Prueba", email: "registro-corto@example.test", password: "corta" },
      });
      expect(response.status()).toBe(400);
      expect((await response.json()).errors).toContain("La contraseña debe tener entre 12 y 128 caracteres");
    });

  caso("REG-03", "Volver al login desde el registro", "Navegador sin sesión.",
    "Abrir Crear cuenta desde el login y pulsar el enlace Iniciar sesión.",
    "Vuelve el formulario de acceso y el formulario de registro queda oculto.",
    async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Crear cuenta" }).click();
      await expect(page.locator("#register")).toBeVisible();
      await page.getByRole("link", { name: "Iniciar sesión" }).click();
      await expect(page.locator("#login")).toBeVisible();
      await expect(page.locator("#register")).toBeHidden();
    });
});

test.describe("Formularios y persistencia", () => {
  caso("CRUD-01", "Cancelar la edición de un producto", "Sesión iniciada y un producto creado para este caso.",
    "Abrir Editar, escribir otro nombre, pulsar Cancelar y consultar el producto por API.",
    "Vuelve el formulario de alta. El nombre almacenado en SQLite permanece igual.",
    async ({ page, request }) => {
      const headers = await tokenAPI(request);
      const response = await request.post("/api/productos", {
        headers, data: { nombre: "Pastel cancelación QA", precio: 50, stock: 2 },
      });
      expect(response.status()).toBe(201);
      const { id, nombre } = (await response.json()).data;
      try {
        await iniciarSesion(page);
        const row = page.getByRole("listitem").filter({ hasText: nombre });
        await row.getByRole("button", { name: "Editar" }).click();
        await page.locator("#editor").getByLabel("Nombre").fill("Cambio descartado");
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(page.getByRole("button", { name: "Crear producto" })).toBeVisible();
        await expect(row).toBeVisible();
        const stored = await request.get("/api/productos/" + id, { headers });
        expect((await stored.json()).data.nombre).toBe(nombre);
      } finally {
        await request.delete("/api/productos/" + id, { headers });
      }
    });

  caso("CRUD-02", "Cancelar la eliminación de un producto", "Sesión iniciada y un producto creado para este caso.",
    "Pulsar Eliminar en la fila del producto y cancelar el diálogo de confirmación.",
    "El producto sigue visible y GET /api/productos/:id responde 200.",
    async ({ page, request }) => {
      const headers = await tokenAPI(request);
      const response = await request.post("/api/productos", {
        headers, data: { nombre: "Tarta conservar QA", precio: 65, stock: 3 },
      });
      expect(response.status()).toBe(201);
      const { id, nombre } = (await response.json()).data;
      try {
        await iniciarSesion(page);
        const row = page.getByRole("listitem").filter({ hasText: nombre });
        page.once("dialog", (dialog) => dialog.dismiss());
        await row.getByRole("button", { name: "Eliminar" }).click();
        await expect(row).toBeVisible();
        expect((await request.get("/api/productos/" + id, { headers })).status()).toBe(200);
      } finally {
        await request.delete("/api/productos/" + id, { headers });
      }
    });

  caso("CRUD-03", "Validar precio negativo en el formulario", "Sesión iniciada y formulario de productos abierto.",
    "Escribir un nombre, un stock de 1 y un precio de -1. Intentar guardar.",
    "El campo Precio marca el límite inferior y el producto no aparece en la lista.",
    async ({ page }) => {
      await iniciarSesion(page);
      const editor = page.locator("#editor");
      const precio = editor.getByLabel("Precio");
      await editor.getByLabel("Nombre").fill("Precio negativo QA");
      await precio.fill("-1");
      await editor.getByLabel("Stock").fill("1");
      await editor.getByRole("button", { name: "Crear producto" }).click();
      await expect(precio).toBeFocused();
      expect(await precio.evaluate((field) => field.validity.rangeUnderflow)).toBe(true);
      await expect(page.getByRole("listitem").filter({ hasText: "Precio negativo QA" })).toHaveCount(0);
    });

  caso("CRUD-04", "Rechazar un correo duplicado desde el módulo Usuarios", "Sesión iniciada y cuenta base existente.",
    "Abrir Usuarios y enviar el alta con el mismo correo de la cuenta base y distinto nombre.",
    "Se muestra «El correo ya está registrado» y el listado conserva una sola fila con ese correo.",
    async ({ page }) => {
      await iniciarSesion(page);
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      const editor = page.locator("#editor");
      await editor.getByLabel("Nombre").fill("Usuario duplicado QA");
      await editor.getByLabel("Correo").fill(cuenta.email);
      await editor.getByLabel("Contraseña").fill("duplicado-qa-123");
      await editor.getByRole("button", { name: "Crear usuario" }).click();
      await expect(page.getByRole("status")).toHaveText("El correo ya está registrado");
      await expect(page.getByRole("listitem").filter({ hasText: cuenta.email })).toHaveCount(1);
    });

  caso("CRUD-05", "Impedir que la cuenta activa se elimine a sí misma", "Sesión iniciada con la cuenta base.",
    "Abrir Usuarios y confirmar Eliminar en la fila que tiene el correo de la sesión activa.",
    "Aparece «No puedes eliminar tu propia cuenta» y la fila permanece visible.",
    async ({ page }) => {
      await iniciarSesion(page);
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      const row = page.getByRole("listitem").filter({ hasText: cuenta.email });
      page.once("dialog", (dialog) => dialog.accept());
      await row.getByRole("button", { name: "Eliminar" }).click();
      await expect(page.getByRole("status")).toHaveText("No puedes eliminar tu propia cuenta");
      await expect(row).toBeVisible();
    });
});
