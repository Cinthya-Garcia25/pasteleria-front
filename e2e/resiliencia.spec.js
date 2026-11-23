const { test, expect } = require("@playwright/test");
const { caso, iniciarSesion, tokenAPI } = require("./casos");

const fallos = [
  { id: "RED", nombre: "error de red", mensaje: "No se pudo conectar. Vuelve a intentarlo.", aplicar: (route) => route.abort("failed") },
  { id: "HTTP", nombre: "HTTP 500", mensaje: "El servidor no pudo completar la operación. Vuelve a intentarlo.",
    aplicar: (route) => route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Error del servidor</h1>" }) },
];

async function fallarUnaVez(page, ruta, metodo, fallo) {
  let pendiente = true;
  await page.route((url) => url.pathname === ruta, async (route) => {
    if (!pendiente || route.request().method() !== metodo) return route.continue();
    pendiente = false;
    await fallo.aplicar(route);
  });
}

async function abrirModulo(page, modulo) {
  await page.getByRole("button", { name: modulo, exact: true }).click();
  await expect(page.getByRole("heading", { name: modulo, exact: true })).toBeVisible();
}

test.describe("Recuperación de sesión", () => {
  caso("SES-01", "Recuperar acceso al cargar con un token inválido",
    "El navegador tiene un token inválido guardado.",
    "Abrir la aplicación, comprobar el 401 de /api/auth/me, verificar que se limpia la sesión e iniciar sesión de nuevo.",
    "Aparece el login con un mensaje de sesión inválida y el siguiente login permite abrir Productos.",
    async ({ page }) => {
      await page.addInitScript(() => sessionStorage.setItem("sesion", "token-invalido"));
      const respuesta = page.waitForResponse((res) => res.url().endsWith("/api/auth/me"));
      await page.goto("/");
      expect((await respuesta).status()).toBe(401);
      await expect(page.getByRole("status")).toHaveText("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
      await expect(page.locator("#login")).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem("sesion"))).toBeNull();
      await iniciarSesion(page);
    });

  caso("SES-02", "Volver al login si la sesión deja de ser válida durante el uso",
    "Sesión iniciada; la API revoca el token mientras el panel está abierto.",
    "Revocar el token, pulsar Usuarios y comprobar el 401 del listado. Volver a iniciar sesión.",
    "Se oculta el panel, aparece el aviso y el nuevo inicio permite abrir Usuarios.",
    async ({ page, request }) => {
      await iniciarSesion(page);
      const token = await page.evaluate(() => sessionStorage.getItem("sesion"));
      const response = await request.post("/api/auth/logout", { headers: { Authorization: "Bearer " + token } });
      expect(response.status()).toBe(204);
      const listado = page.waitForResponse((res) => res.url().endsWith("/api/users"));
      await page.getByRole("button", { name: "Usuarios", exact: true }).click();
      expect((await listado).status()).toBe(401);
      await expect(page.getByRole("status")).toHaveText("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
      await expect(page.locator("#admin")).toBeHidden();
      await iniciarSesion(page);
      await abrirModulo(page, "Usuarios");
    });
});

const modulos = [
  { nombre: "Productos", recurso: "productos", entidad: "producto",
    datos: (id) => ({ nombre: id, precio: 95, stock: 3 }),
    campos: { nombre: "Nombre", precio: "Precio", stock: "Stock" },
    listar: (body) => body.data },
  { nombre: "Usuarios", recurso: "users", entidad: "usuario",
    datos: (id) => ({ nombre: id, email: id.toLowerCase() + "@example.test", password: "reintento-clave-123" }),
    campos: { nombre: "Nombre", email: "Correo", password: "Contraseña" },
    listar: (body) => body },
];

for (const modulo of modulos) {
  const ruta = "/api/" + modulo.recurso;
  test.describe("Reintentos en " + modulo.nombre, () => {
    for (const fallo of fallos) {
      const base = (modulo.recurso === "users" ? "USR" : "PRO") + "-" + fallo.id;

      caso(base + "-01", "Reintentar la carga tras " + fallo.nombre,
        "Sesión iniciada; se simula un solo fallo del listado.",
        "Pulsar el módulo, comprobar el aviso y volver a pulsar el mismo módulo.",
        "El aviso ofrece reintentar. En el segundo intento se muestran los registros y se limpia el mensaje.",
        async ({ page }) => {
          await iniciarSesion(page);
          await expect(page.locator("#items li[data-id]").first()).toBeVisible();
          await fallarUnaVez(page, ruta, "GET", fallo);
          await abrirModulo(page, modulo.nombre);
          await expect(page.getByRole("status")).toHaveText(fallo.mensaje);
          await abrirModulo(page, modulo.nombre);
          await expect(page.locator("#items li[data-id]").first()).toBeVisible();
          await expect(page.locator("#status")).toHaveText("");
        });

      caso(base + "-02", "Reintentar Crear tras " + fallo.nombre,
        "Sesión iniciada y formulario de alta abierto.",
        "Llenar todos los campos, simular un fallo en el primer POST y pulsar Crear. Volver a pulsar Crear con los mismos datos.",
        "El formulario conserva sus datos y permite reintentar. El siguiente envío crea una sola fila.",
        async ({ page, request }) => {
          const id = base + "-02";
          const datos = modulo.datos(id);
          const headers = await tokenAPI(request);
          await iniciarSesion(page);
          await abrirModulo(page, modulo.nombre);
          const editor = page.locator("#editor");
          for (const [campo, valor] of Object.entries(datos)) {
            await editor.getByLabel(modulo.campos[campo], { exact: true }).fill(String(valor));
          }
          const boton = editor.getByRole("button", { name: "Crear " + modulo.entidad, exact: true });
          await fallarUnaVez(page, ruta, "POST", fallo);
          await boton.click();
          await expect(page.getByRole("status")).toHaveText(fallo.mensaje);
          for (const [campo, valor] of Object.entries(datos)) {
            await expect(editor.getByLabel(modulo.campos[campo], { exact: true })).toHaveValue(String(valor));
          }
          await expect(boton).toBeEnabled();
          await boton.click();
          await expect(page.getByRole("status")).toHaveText("Registro guardado");
          const lista = modulo.listar(await (await request.get(ruta, { headers })).json());
          const registros = lista.filter((registro) => registro.nombre === id);
          expect(registros).toHaveLength(1);
          await request.delete(ruta + "/" + registros[0].id, { headers });
        });

      for (const [numero, metodo, nombre] of [["03", "PUT", "Guardar cambios"], ["04", "DELETE", "Eliminar"]]) {
        caso(base + "-" + numero, "Reintentar " + nombre + " tras " + fallo.nombre,
          "Sesión iniciada y registro de prueba disponible.",
          "Simular un fallo en el primer " + metodo + ", pulsar " + nombre + ", revisar el aviso y repetir la acción.",
          "El primer intento conserva la fila y permite reintentar. El segundo confirma la operación y actualiza la lista.",
          async ({ page, request }) => {
            const id = base + "-" + numero;
            const headers = await tokenAPI(request);
            const alta = await request.post(ruta, { headers, data: modulo.datos(id) });
            expect(alta.status()).toBe(201);
            const body = await alta.json();
            const detalle = ruta + "/" + (body.data ?? body).id;
            try {
              await iniciarSesion(page);
              await abrirModulo(page, modulo.nombre);
              const fila = page.getByRole("listitem").filter({ hasText: id });
              const editor = page.locator("#editor");
              const nuevoNombre = "Cambio " + id;
              if (metodo === "PUT") {
                await fila.getByRole("button", { name: "Editar", exact: true }).click();
                await editor.getByLabel("Nombre").fill(nuevoNombre);
              }
              const boton = (metodo === "PUT" ? editor : fila).getByRole("button", { name: nombre, exact: true });
              const pulsar = async () => {
                if (metodo === "DELETE") page.once("dialog", (dialog) => dialog.accept());
                await boton.click();
              };
              await fallarUnaVez(page, detalle, metodo, fallo);
              await pulsar();
              await expect(page.getByRole("status")).toHaveText(fallo.mensaje);
              await expect(fila).toBeVisible();
              if (metodo === "PUT") await expect(editor.getByLabel("Nombre")).toHaveValue(nuevoNombre);
              await expect(boton).toBeEnabled();
              await pulsar();
              await expect(page.getByRole("status")).toHaveText(metodo === "PUT" ? "Registro guardado" : "Registro eliminado");
              const lectura = await request.get(detalle, { headers });
              expect(lectura.status()).toBe(metodo === "PUT" ? 200 : 404);
              if (metodo === "PUT") {
                await expect(page.getByRole("listitem").filter({ hasText: nuevoNombre })).toBeVisible();
                const actualizado = await lectura.json();
                expect((actualizado.data ?? actualizado).nombre).toBe(nuevoNombre);
              } else {
                await expect(fila).toHaveCount(0);
              }
            } finally {
              await request.delete(detalle, { headers });
            }
          });
      }
    }
  });
}

test.describe("Envíos repetidos", () => {
  for (const [id, entidad, ruta] of [["DUP-01", "cuenta", "/api/auth/register"], ["DUP-02", "producto", "/api/productos"]]) {
    caso(id, "Ignorar doble clic al crear " + entidad,
      "Formulario de alta listo y respuesta del servidor retenida mientras se hacen dos clics.",
      "Completar el formulario, hacer doble clic en Crear e intentar enviar el formulario otra vez mientras sigue pendiente.",
      "El botón se deshabilita mientras trabaja. Solo sale un POST y se conserva una sola fila.",
      async ({ page, request }) => {
        const headers = await tokenAPI(request);
        const email = "doble-registro@example.test";
        let form;
        if (entidad === "cuenta") {
          await page.goto("/#registro");
          form = page.locator("#register");
          await form.getByLabel("Nombre").fill(id);
          await form.getByLabel("Correo").fill(email);
          await form.getByLabel("Contraseña", { exact: true }).fill("doble-registro-123");
          await form.getByLabel("Confirmar contraseña").fill("doble-registro-123");
        } else {
          await iniciarSesion(page);
          form = page.locator("#editor");
          await form.getByLabel("Nombre").fill(id);
          await form.getByLabel("Precio").fill("55");
          await form.getByLabel("Stock").fill("3");
        }

        let solicitudes = 0;
        let desbloquear;
        const pausa = new Promise((resolve) => { desbloquear = resolve; });
        await page.route((url) => url.pathname === ruta, async (route) => {
          if (route.request().method() === "POST") {
            solicitudes++;
            await pausa;
          }
          await route.continue();
        });
        const boton = form.getByRole("button", { name: "Crear " + entidad, exact: true });
        try {
          await boton.dblclick();
          await expect(boton).toBeDisabled();
          await form.evaluate((node) => node.requestSubmit());
        } finally {
          desbloquear();
        }

        await expect(page.getByRole("status")).toHaveText(
          entidad === "cuenta" ? "Cuenta creada. Ya puedes iniciar sesión." : "Registro guardado");
        expect(solicitudes).toBe(1);
        const listado = entidad === "cuenta" ? "/api/users" : ruta;
        const body = await (await request.get(listado, { headers })).json();
        const registros = (body.data ?? body).filter((registro) => registro.nombre === id);
        expect(registros).toHaveLength(1);
        await request.delete(listado + "/" + registros[0].id, { headers });
      });
  }

  caso("DUP-03", "Reintentar si se pierde la respuesta después de guardar",
    "Sesión iniciada y alta de producto preparada.",
    "Dejar que el servidor guarde el producto, cortar la respuesta y pulsar Crear otra vez.",
    "La interfaz informa el error de red y reusa la clave del envío al reintentar. La API devuelve el mismo producto y solo hay una fila.",
    async ({ page, request }) => {
      const headers = await tokenAPI(request);
      await iniciarSesion(page);
      const editor = page.locator("#editor");
      await editor.getByLabel("Nombre").fill("Producto de respuesta perdida");
      await editor.getByLabel("Precio").fill("45");
      await editor.getByLabel("Stock").fill("5");
      let primerEnvio;
      const claves = [];
      await page.route((url) => url.pathname === "/api/productos", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        claves.push(route.request().headers()["idempotency-key"]);
        if (claves.length > 1) return route.continue();
        const almacenado = await route.fetch();
        primerEnvio = { status: almacenado.status(), body: await almacenado.json() };
        await route.abort("failed");
      });

      const crear = editor.getByRole("button", { name: "Crear producto", exact: true });
      await crear.click();
      await expect(page.getByRole("status")).toHaveText(fallos[0].mensaje);
      expect(primerEnvio.status).toBe(201);
      const id = primerEnvio.body.data.id;
      try {
        const respuesta = page.waitForResponse((res) => res.url().endsWith("/api/productos") && res.request().method() === "POST");
        await crear.click();
        const reintento = await respuesta;
        expect(reintento.status()).toBe(200);
        expect((await reintento.json()).data.id).toBe(id);
        await expect(page.getByRole("status")).toHaveText("Registro guardado");
        expect(claves).toEqual([expect.any(String), claves[0]]);
        const registros = (await (await request.get("/api/productos", { headers })).json()).data;
        expect(registros.filter((p) => p.nombre === "Producto de respuesta perdida")).toHaveLength(1);
      } finally {
        await request.delete("/api/productos/" + id, { headers });
      }
    });
});
