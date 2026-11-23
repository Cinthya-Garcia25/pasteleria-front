const { test, expect } = require("@playwright/test");
const { caso, cuenta, iniciarSesion, tokenAPI } = require("./casos");

test.describe("Acceso, navegación y sesión", () => {
  caso("ACC-01", "Abrir la aplicación sin sesión", "Contexto nuevo de Chromium.",
    "Abrir la página principal y buscar el formulario y el menú de módulos.",
    "El formulario de inicio de sesión está visible y el menú de módulos está oculto.",
    async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
      await expect(page.locator("#admin")).toBeHidden();
    });

  for (const [id, nombre, email, password, invalido] of [
    ["02", "Enviar el formulario vacío con Enter", "", "", "Correo"],
    ["03", "Enviar solo el correo", cuenta.email, "", "Contraseña"],
    ["04", "Enviar un correo con formato inválido", "correo-invalido", cuenta.password, "Correo"],
  ]) {
    caso("ACC-" + id, nombre, "Formulario de login abierto, sin sesión.",
      "Escribir los datos del caso y pulsar Enter. Revisar el campo inválido y el panel.",
      "El navegador marca " + invalido + " como inválido y mantiene el panel oculto.",
      async ({ page }) => {
        await page.goto("/");
        const form = page.locator("#login");
        await form.getByLabel("Correo").fill(email);
        await form.getByLabel("Contraseña").fill(password);
        await form.getByLabel("Contraseña").press("Enter");
        await expect(form.getByLabel(invalido)).toBeFocused();
        expect(await form.getByLabel(invalido).evaluate((field) => field.validity.valid)).toBe(false);
        await expect(page.locator("#admin")).toBeHidden();
      });
  }

  for (const [id, nombre, email, password] of [
    ["05", "Rechazar contraseña incorrecta", cuenta.email, "clave-incorrecta"],
    ["06", "Rechazar correo inexistente", "inexistente@example.test", cuenta.password],
  ]) {
    caso("ACC-" + id, nombre, "Cuenta base creada en SQLite de pruebas.",
      "Enviar las credenciales del caso y revisar la respuesta HTTP y el mensaje.",
      "POST /api/auth/login responde 401, muestra «Credenciales incorrectas» y el panel queda oculto.",
      async ({ page }) => {
        await page.goto("/");
        const form = page.locator("#login");
        await form.getByLabel("Correo").fill(email);
        await form.getByLabel("Contraseña").fill(password);
        const response = page.waitForResponse((res) => res.url().endsWith("/api/auth/login"));
        await form.getByRole("button", { name: "Entrar" }).click();
        expect((await response).status()).toBe(401);
        await expect(page.getByRole("status")).toHaveText("Credenciales incorrectas");
        await expect(page.locator("#admin")).toBeHidden();
      });
  }

  caso("ACC-07", "Conservar la sesión al recargar", "Cuenta base con credenciales válidas.",
    "Iniciar sesión y recargar la página en la misma pestaña.",
    "El módulo Productos sigue disponible sin pedir las credenciales de nuevo.",
    async ({ page }) => {
      await iniciarSesion(page);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
      await expect(page.locator("#login")).toBeHidden();
    });

  caso("ACC-08", "Revocar la sesión al salir", "Sesión iniciada en la interfaz.",
    "Guardar el token de prueba, cerrar sesión desde la interfaz y consultar /api/auth/me con el token anterior.",
    "Vuelve el formulario de login y la API rechaza el token anterior con HTTP 401.",
    async ({ page, request }) => {
      await iniciarSesion(page);
      const token = await page.evaluate(() => sessionStorage.getItem("sesion"));
      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
      expect((await request.get("/api/auth/me", { headers: { Authorization: "Bearer " + token } })).status()).toBe(401);
    });

  caso("ACC-09", "Mostrar y volver a ocultar la contraseña", "Formulario de login abierto.",
    "Escribir la contraseña de prueba, pulsar Mostrar contraseña y luego Ocultar contraseña.",
    "El campo alterna entre texto y contraseña y conserva el valor escrito.",
    async ({ page }) => {
      await page.goto("/");
      const form = page.locator("#login");
      const input = form.getByLabel("Contraseña");
      await input.fill(cuenta.password);
      await form.getByRole("button", { name: "Mostrar contraseña" }).click();
      await expect(input).toHaveAttribute("type", "text");
      await form.getByRole("button", { name: "Ocultar contraseña" }).click();
      await expect(input).toHaveAttribute("type", "password");
      await expect(input).toHaveValue(cuenta.password);
    });

  caso("ACC-10", "Cambiar de módulo con el teclado", "Sesión iniciada y Productos visible.",
    "Enfocar el botón Usuarios y activarlo con Enter. Repetir con Productos.",
    "Cada activación muestra su formulario correspondiente y marca el módulo seleccionado.",
    async ({ page }) => {
      await iniciarSesion(page);
      for (const [nombre, accion] of [["Usuarios", "Crear usuario"], ["Productos", "Crear producto"]]) {
        const boton = page.getByRole("button", { name: nombre, exact: true });
        await boton.focus();
        await boton.press("Enter");
        await expect(boton).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: accion })).toBeVisible();
      }
    });

  caso("ACC-11", "Iniciar sesión con pantalla estrecha", "Viewport de 390 × 844.",
    "Abrir la aplicación en el viewport estrecho y enviar las credenciales válidas.",
    "El módulo Productos y el botón Cerrar sesión quedan accesibles.",
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await iniciarSesion(page);
      await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
});

test.describe("Contratos de la API", () => {
  for (const recurso of ["productos", "users"]) {
    caso("API-" + (recurso === "productos" ? "01" : "02"), "Proteger el listado de " + recurso,
      "Cliente HTTP sin token de sesión.",
      "Enviar GET a /api/" + recurso + ".",
      "La API responde 401 e indica «Inicia sesión».",
      async ({ request }) => {
        const response = await request.get("/api/" + recurso);
        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ message: "Inicia sesión" });
      });
  }

  caso("API-03", "Rechazar un producto sin precio", "Cliente con token válido.",
    "Enviar POST /api/productos con nombre y sin precio.",
    "La API responde 400 e indica que nombre y precio son requeridos.",
    async ({ request }) => {
      const headers = await tokenAPI(request);
      const response = await request.post("/api/productos", { headers, data: { nombre: "Sin precio" } });
      expect(response.status()).toBe(400);
      expect((await response.json()).data.message).toBe("Los campos nombre y precio son requeridos");
    });

  caso("API-04", "Consultar un producto inexistente", "Cliente con token válido y sin registro con ID 99999999.",
    "Enviar GET /api/productos/99999999.",
    "La API responde 404 con «Producto no encontrado».",
    async ({ request }) => {
      const headers = await tokenAPI(request);
      const response = await request.get("/api/productos/99999999", { headers });
      expect(response.status()).toBe(404);
      expect((await response.json()).data.message).toBe("Producto no encontrado");
    });

  caso("API-05", "Consultar el perfil de la sesión", "Cliente con token de la cuenta base.",
    "Enviar GET /api/auth/me e inspeccionar la estructura de la respuesta.",
    "Responde 200 con ID, nombre y correo. La respuesta carece de contraseña y rol.",
    async ({ request }) => {
      const headers = await tokenAPI(request);
      const response = await request.get("/api/auth/me", { headers });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ id: expect.any(Number), nombre: expect.any(String), email: cuenta.email });
    });
});
