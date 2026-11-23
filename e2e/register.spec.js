const { expect } = require("@playwright/test");

const { caso } = require("./casos");

caso("FLU-02", "Registrar una cuenta nueva y completar los CRUD",
  "Navegador sin sesión y correo de prueba disponible.",
  "Enviar el registro con contraseñas distintas, corregirlo, iniciar sesión y completar ambos CRUD. Salir y volver a intentar el registro con el mismo correo en mayúsculas.",
  "Se detecta la confirmación incorrecta, el registro válido permite acceder a los dos CRUD sin roles y la API rechaza el correo duplicado.",
  async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    const form = page.locator("#register");
    await expect(form).toBeVisible();

    await form.getByLabel("Nombre").fill("Cliente Playwright");
    await form.getByLabel("Correo").fill("cliente-e2e@example.test");
    await form.getByLabel("Contraseña", { exact: true }).fill("registro-e2e-123");
    await form.getByLabel("Confirmar contraseña").fill("registro-e2e-999");
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toHaveText("Las contraseñas no coinciden");

    await form.getByLabel("Confirmar contraseña").fill("registro-e2e-123");
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toHaveText("Cuenta creada. Ya puedes iniciar sesión.");

    const login = page.locator("#login");
    await expect(login).toBeVisible();
    await expect(form).toBeHidden();
    await expect(login.getByLabel("Correo")).toHaveValue("cliente-e2e@example.test");
    await login.getByLabel("Contraseña").fill("registro-e2e-123");
    await login.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Módulos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();

    // CRUD de productos con la cuenta recién registrada
    const editor = page.locator("#editor");
    await editor.getByLabel("Nombre").fill("Pay de limón E2E");
    await editor.getByLabel("Precio").fill("150");
    await editor.getByLabel("Stock").fill("6");
    await page.getByRole("button", { name: "Crear producto" }).click();
    const product = page.getByRole("listitem").filter({ hasText: "Pay de limón E2E" });
    await expect(product).toContainText("$150");
    await product.getByRole("button", { name: "Editar" }).click();
    await editor.getByLabel("Stock").fill("9");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(product).toContainText("Stock 9");
    page.once("dialog", (dialog) => dialog.accept());
    await product.getByRole("button", { name: "Eliminar" }).click();
    await expect(product).toHaveCount(0);

    // CRUD de usuarios con la misma cuenta, sin selector de rol
    await page.getByRole("button", { name: "Usuarios" }).click();
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
    await expect(editor.getByLabel("Rol")).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: "cliente-e2e@example.test" })).toBeVisible();
    await editor.getByLabel("Nombre").fill("Compañera E2E");
    await editor.getByLabel("Correo").fill("companera-e2e@example.test");
    await editor.getByLabel("Contraseña").fill("companera-e2e-123");
    await editor.getByRole("button", { name: "Mostrar contraseña" }).click();
    await expect(editor.getByLabel("Contraseña")).toHaveAttribute("type", "text");
    await expect(editor.getByLabel("Contraseña")).toHaveValue("companera-e2e-123");
    await editor.getByRole("button", { name: "Ocultar contraseña" }).click();
    await expect(editor.getByLabel("Contraseña")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Crear usuario" }).click();
    const user = page.getByRole("listitem").filter({ hasText: "companera-e2e@example.test" });
    await expect(user).toContainText("Compañera E2E");
    await expect(user).toContainText("companera-e2e@example.test");
    await user.getByRole("button", { name: "Editar" }).click();
    await editor.getByLabel("Nombre").fill("Compañera editada");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(user).toContainText("Compañera editada");
    page.once("dialog", (dialog) => dialog.accept());
    await user.getByRole("button", { name: "Eliminar" }).click();
    await expect(user).toHaveCount(0);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await form.getByLabel("Nombre").fill("Otra persona");
    await form.getByLabel("Correo").fill("CLIENTE-E2E@example.test");
    await form.getByLabel("Contraseña", { exact: true }).fill("registro-e2e-456");
    await form.getByLabel("Confirmar contraseña").fill("registro-e2e-456");
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toHaveText("El correo ya está registrado");
  });
