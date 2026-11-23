const { test, expect } = require("@playwright/test");
const { caso, iniciarSesion, tokenAPI } = require("./casos");

const modulos = [
  {
    modulo: "Productos",
    recurso: "productos",
    entidad: "producto",
    datos: (nombre) => ({ nombre, precio: 127.5, stock: 7, descripcion: "Pedido de prueba" }),
    campos: { nombre: "Nombre", precio: "Precio", stock: "Stock", descripcion: "Descripción" },
    resumen: "Stock 7",
    editable: ["nombre", "precio", "stock", "descripcion"],
    respuesta: "data",
  },
  {
    modulo: "Usuarios",
    recurso: "users",
    entidad: "usuario",
    datos: (nombre, id) => ({ nombre, email: id.toLowerCase() + "@example.test", password: "botones-qa-123" }),
    campos: { nombre: "Nombre", email: "Correo", password: "Contraseña" },
    resumen: "@example.test",
    editable: ["nombre", "email"],
  },
];

async function abrirModulo(page, config) {
  await iniciarSesion(page);
  await page.getByRole("button", { name: config.modulo, exact: true }).click();
  await expect(page.getByRole("heading", { name: config.modulo, exact: true })).toBeVisible();
  return page.locator("#editor");
}

async function llenar(editor, config, datos) {
  for (const [campo, valor] of Object.entries(datos)) {
    await editor.getByLabel(config.campos[campo], { exact: true }).fill(String(valor));
  }
}

function desempaquetar(config, body) {
  return config.respuesta ? body[config.respuesta] : body;
}

async function comprobarDatos(request, url, headers, config, datos) {
  const response = await request.get(url, { headers });
  expect(response.status()).toBe(200);
  const esperado = Object.fromEntries(config.editable.map((campo) => [campo, datos[campo]]));
  expect(desempaquetar(config, await response.json())).toMatchObject(esperado);
}

for (const config of modulos) {
  const { modulo, entidad, recurso } = config;
  const prefijo = recurso === "productos" ? "PRO" : "USR";
  const ruta = "/api/" + recurso;

  test.describe("Botones de " + modulo, () => {
    caso(prefijo + "-01", "Crear " + entidad,
      "Sesión iniciada y formulario de alta disponible.",
      "Completar los campos, pulsar Crear " + entidad + ", revisar la respuesta HTTP y recargar el módulo.",
      "La petición POST devuelve 201. El formulario se limpia y el registro persiste con los valores ingresados.",
      async ({ page, request }) => {
        const id = prefijo + "-01";
        const datos = config.datos("Alta " + id, id);
        const headers = await tokenAPI(request);
        const editor = await abrirModulo(page, config);
        await llenar(editor, config, datos);
        const respuesta = page.waitForResponse((r) => new URL(r.url()).pathname === ruta && r.request().method() === "POST");
        await editor.getByRole("button", { name: "Crear " + entidad, exact: true }).click();
        const response = await respuesta;
        expect(response.status()).toBe(201);
        const creado = desempaquetar(config, await response.json());
        try {
          await expect(page.getByRole("status")).toHaveText("Registro guardado");
          await expect(editor.getByLabel("Nombre")).toHaveValue("");
          await page.reload();
          await page.getByRole("button", { name: modulo, exact: true }).click();
          await expect(page.getByRole("listitem").filter({ hasText: datos.nombre })).toContainText(config.resumen);
          await comprobarDatos(request, ruta + "/" + creado.id, headers, config, datos);
        } finally {
          await request.delete(ruta + "/" + creado.id, { headers });
        }
      });

    for (const [numero, operacion] of [["02", "editar"], ["03", "eliminar"], ["04", "cancelar"]]) {
      const acciones = {
        editar: ["Editar y guardar", "Pulsar Editar, comprobar los campos precargados, cambiar el nombre y pulsar Guardar cambios.", "El formulario carga los valores existentes. La API devuelve 200 y la fila y la base de datos reflejan el cambio."],
        eliminar: ["Confirmar Eliminar", "Pulsar Eliminar, comprobar el nombre en la confirmación y aceptar.", "El listado retira la fila, se muestra el aviso de éxito y la consulta del registro devuelve 404."],
        cancelar: ["Cancelar una edición", "Pulsar Editar, cambiar el nombre y pulsar Cancelar.", "El formulario vuelve a modo de creación y la fila conserva el nombre original en el listado y en SQLite."],
      };
      const [nombreCaso, pasos, esperado] = acciones[operacion];
      const id = prefijo + "-" + numero;
      caso(id, nombreCaso + " · " + entidad, "Sesión iniciada y registro específico del caso almacenado.", pasos, esperado,
        async ({ page, request }) => {
          const datos = config.datos("Registro " + id, id);
          const headers = await tokenAPI(request);
          const response = await request.post(ruta, { headers, data: datos });
          expect(response.status()).toBe(201);
          const { id: registro } = desempaquetar(config, await response.json());
          const detalle = ruta + "/" + registro;
          const editor = await abrirModulo(page, config);
          const fila = page.getByRole("listitem").filter({ hasText: datos.nombre });

          try {
            if (operacion === "eliminar") {
              let mensaje;
              page.once("dialog", async (dialog) => {
                mensaje = dialog.message();
                await dialog.accept();
              });
              await fila.getByRole("button", { name: "Eliminar", exact: true }).click();
              await expect(page.getByRole("status")).toHaveText("Registro eliminado");
              expect(mensaje).toBe("¿Eliminar " + datos.nombre + "?");
              await expect(fila).toHaveCount(0);
              expect((await request.get(detalle, { headers })).status()).toBe(404);
              return;
            }

            await fila.getByRole("button", { name: "Editar", exact: true }).click();
            await expect(editor.getByRole("heading", { name: "Editar " + entidad })).toBeVisible();
            for (const campo of config.editable) {
              await expect(editor.getByLabel(config.campos[campo], { exact: true })).toHaveValue(String(datos[campo]));
            }
            const nombreNuevo = "Cambio " + id;
            await editor.getByLabel("Nombre").fill(nombreNuevo);
            if (operacion === "cancelar") {
              await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
              await expect(editor.getByRole("button", { name: "Crear " + entidad, exact: true })).toBeVisible();
              await expect(fila).toBeVisible();
              await comprobarDatos(request, detalle, headers, config, datos);
              return;
            }

            const actualización = page.waitForResponse((r) => new URL(r.url()).pathname === detalle && r.request().method() === "PUT");
            await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
            expect((await actualización).status()).toBe(200);
            await expect(page.getByRole("status")).toHaveText("Registro guardado");
            await expect(page.getByRole("listitem").filter({ hasText: nombreNuevo })).toBeVisible();
            await comprobarDatos(request, detalle, headers, config, { ...datos, nombre: nombreNuevo });
          } finally {
            if (operacion !== "eliminar") await request.delete(detalle, { headers });
          }
        });
    }
  });
}
