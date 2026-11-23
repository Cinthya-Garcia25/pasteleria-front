const { test, expect } = require("@playwright/test");
const { caso, cuenta, iniciarSesion, tokenAPI, verificarBotonEntrar } = require("./casos");

test.describe("Botones y enlaces de acceso", () => {
  caso("UI-01", "Entrar con el botón y credenciales válidas",
    "Formulario de inicio de sesión abierto y cuenta base disponible.",
    "Escribir el correo y la contraseña y pulsar Entrar. Comprobar la respuesta HTTP y el panel.",
    "El servidor responde 200. Aparecen Productos, Usuarios y Cerrar sesión, y se oculta el formulario.",
    async ({ page }) => {
      await page.goto("/");
      const form = page.locator("#login");
      await form.getByLabel("Correo").fill(cuenta.email);
      await form.getByLabel("Contraseña").fill(cuenta.password);
      const boton = await verificarBotonEntrar(form);
      const [respuesta] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/auth/login")),
        boton.click(),
      ]);
      expect(respuesta.status()).toBe(200);
      await expect(page.getByRole("button", { name: "Productos", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Usuarios", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
      await expect(form).toBeHidden();
    });

  caso("UI-02", "Entrar con teclado sin usar el mouse",
    "Formulario de inicio de sesión abierto con foco en el correo.",
    "Llenar el correo, avanzar con Tab, escribir la contraseña y pulsar Enter.",
    "Tab lleva el foco a Contraseña. Enter inicia sesión y abre Productos.",
    async ({ page }) => {
      await page.goto("/");
      const form = page.locator("#login");
      const email = form.getByLabel("Correo");
      const password = form.getByLabel("Contraseña");
      await email.fill(cuenta.email);
      await email.press("Tab");
      await expect(password).toBeFocused();
      await password.fill(cuenta.password);
      await password.press("Enter");
      await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
    });

  caso("UI-03", "Abrir el registro mediante el enlace del login",
    "Página principal abierta sin sesión.",
    "Pulsar el enlace Crear cuenta y revisar la dirección y los campos que quedan visibles.",
    "La dirección termina en #registro. Aparecen los cuatro campos de registro y se oculta el login.",
    async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Crear cuenta", exact: true }).click();
      await expect(page).toHaveURL(/#registro$/);
      const form = page.locator("#register");
      for (const campo of ["Nombre", "Correo", "Contraseña", "Confirmar contraseña"]) {
        await expect(form.getByLabel(campo, { exact: true })).toBeVisible();
      }
      await expect(page.locator("#login")).toBeHidden();
    });

  for (const [id, campo, posicion] of [["04", "Contraseña", 0], ["05", "Confirmar contraseña", 1]]) {
    caso("UI-" + id, "Mostrar y ocultar " + campo.toLowerCase() + " en el registro",
      "Formulario de registro abierto y ambos campos de contraseña ocultos.",
      "Escribir en " + campo + ", pulsar su botón Mostrar contraseña y volver a pulsar Ocultar contraseña.",
      "Solo cambia la visibilidad del campo seleccionado. El valor se conserva y el otro campo permanece oculto.",
      async ({ page }) => {
        await page.goto("/#registro");
        const form = page.locator("#register");
        const input = form.getByLabel(campo, { exact: true });
        const otro = form.getByLabel(posicion === 0 ? "Confirmar contraseña" : "Contraseña", { exact: true });
        await input.fill("registro-test-123");
        await form.getByRole("button", { name: "Mostrar contraseña", exact: true }).nth(posicion).click();
        await expect(input).toHaveAttribute("type", "text");
        await expect(otro).toHaveAttribute("type", "password");
        await form.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
        await expect(input).toHaveAttribute("type", "password");
        await expect(input).toHaveValue("registro-test-123");
      });
  }

  caso("UI-06", "Volver al login con el historial del navegador",
    "Página principal abierta sin sesión.",
    "Abrir Crear cuenta, pulsar Atrás en el navegador y luego pulsar Adelante.",
    "Atrás restaura el login. Adelante vuelve a mostrar el registro.",
    async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Crear cuenta", exact: true }).click();
      await expect(page.locator("#register")).toBeVisible();
      await page.goBack();
      await expect(page.locator("#login")).toBeVisible();
      await page.goForward();
      await expect(page.locator("#register")).toBeVisible();
    });

  caso("UI-07", "Crear cuenta con interacción táctil",
    "Contexto móvil con pantalla de 390 × 844 y correo disponible.",
    "Tocar Crear cuenta, llenar el formulario y tocar su botón de envío.",
    "El servidor responde 201, se muestra la confirmación y el login recupera el correo escrito.",
    async ({ browser, request, baseURL }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const email = "registro-tactil@example.test";
      try {
        await page.goto(baseURL);
        await page.getByRole("link", { name: "Crear cuenta", exact: true }).tap();
        const form = page.locator("#register");
        await form.getByLabel("Nombre", { exact: true }).fill("Registro táctil");
        await form.getByLabel("Correo", { exact: true }).fill(email);
        await form.getByLabel("Contraseña", { exact: true }).fill("registro-tactil-123");
        await form.getByLabel("Confirmar contraseña", { exact: true }).fill("registro-tactil-123");
        const respuesta = page.waitForResponse((r) => r.url().endsWith("/api/auth/register"));
        await form.getByRole("button", { name: "Crear cuenta", exact: true }).tap();
        const response = await respuesta;
        expect(response.status()).toBe(201);
        const { id } = await response.json();
        try {
          await expect(page.getByRole("status")).toHaveText("Cuenta creada. Ya puedes iniciar sesión.");
          await expect(page.locator("#login").getByLabel("Correo")).toHaveValue(email);
        } finally {
          const headers = await tokenAPI(request);
          await request.delete("/api/users/" + id, { headers });
        }
      } finally {
        await context.close();
      }
    });

  caso("UI-08", "Cerrar sesión desde el módulo Usuarios",
    "Sesión iniciada y módulo Usuarios visible.",
    "Pulsar Cerrar sesión, comprobar la respuesta del servidor y recargar.",
    "El servidor devuelve 204. Aparece el login y el módulo permanece oculto tras la recarga.",
    async ({ page }) => {
      await iniciarSesion(page);
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Usuarios", exact: true })).toBeVisible();
      const respuesta = page.waitForResponse((r) => r.url().endsWith("/api/auth/logout"));
      await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
      expect((await respuesta).status()).toBe(204);
      await expect(page.locator("#login")).toBeVisible();
      await page.reload();
      await expect(page.locator("#login")).toBeVisible();
      await expect(page.locator("#admin")).toBeHidden();
    });

  caso("UI-09", "Abrir la app en un contexto sin la sesión anterior",
    "Una pestaña tiene sesión activa. Se abre un contexto independiente.",
    "Abrir la misma aplicación en el contexto nuevo y comparar ambas pantallas.",
    "El contexto nuevo muestra el login. La sesión original sigue mostrando Productos.",
    async ({ page, browser }) => {
      await iniciarSesion(page);
      const contexto = await browser.newContext();
      try {
        const nueva = await contexto.newPage();
        await nueva.goto(page.url());
        await expect(nueva.locator("#login")).toBeVisible();
        await expect(nueva.locator("#admin")).toBeHidden();
        await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
      } finally {
        await contexto.close();
      }
    });
});
