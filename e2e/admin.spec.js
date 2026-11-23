const { expect } = require("@playwright/test");

const { caso, verificarBotonEntrar } = require("./casos");

caso("FLU-01", "Completar los CRUD con una cuenta existente",
  "Cuenta base en SQLite de pruebas y navegador sin sesión.",
  "Consultar productos sin sesión, intentar acceder con contraseña incorrecta, entrar con la correcta y crear, editar y eliminar un producto y un usuario.",
  "La API bloquea el acceso anónimo, el login muestra el error al fallar y los cambios de ambos CRUD se reflejan en las listas.",
  async ({ page, request }) => {
    expect((await request.get("/api/productos")).status()).toBe(401);
    await page.goto("/");
    const login = page.locator("#login");
    const editor = page.locator("#editor");
    await login.getByLabel("Correo").fill("admin@example.test");
    await login.getByLabel("Contraseña").fill("clave-incorrecta");
    await (await verificarBotonEntrar(login)).click();
    await expect(page.getByRole("status")).toHaveText("Credenciales incorrectas");
    await login.getByLabel("Contraseña").fill("test-password-123");
    await (await verificarBotonEntrar(login)).click();

    await editor.getByLabel("Nombre").fill("Tarta Playwright");
    await editor.getByLabel("Precio").fill("120");
    await editor.getByLabel("Stock").fill("4");
    await page.getByRole("button", { name: "Crear producto" }).click();
    let product = page.getByRole("listitem").filter({ hasText: "Tarta Playwright" });
    await expect(product).toContainText("$120");
    await product.getByRole("button", { name: "Editar" }).click();
    await editor.getByLabel("Precio").fill("130");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(product).toContainText("$130");
    page.once("dialog", (dialog) => dialog.accept());
    await product.getByRole("button", { name: "Eliminar" }).click();
    await expect(product).toHaveCount(0);

    await page.getByRole("button", { name: "Usuarios" }).click();
    await editor.getByLabel("Nombre").fill("Cuenta de pruebas");
    await editor.getByLabel("Correo").fill("cuenta@example.test");
    await editor.getByLabel("Contraseña").fill("test-password-456");
    await page.getByRole("button", { name: "Crear usuario" }).click();
    const user = page.getByRole("listitem").filter({ hasText: "cuenta@example.test" });
    await expect(user).toContainText("Cuenta de pruebas");
    await user.getByRole("button", { name: "Editar" }).click();
    await editor.getByLabel("Nombre").fill("Cuenta actualizada");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(user).toContainText("Cuenta actualizada");
    page.once("dialog", (dialog) => dialog.accept());
    await user.getByRole("button", { name: "Eliminar" }).click();
    await expect(user).toHaveCount(0);
  });
