
process.env.NODE_ENV = "test";

const fs = require("fs");
const path = require("path");
const request = require("supertest");
process.env.ADMIN_EMAIL = "admin@example.test";
process.env.ADMIN_PASSWORD = "test-password-123";
const app = require("../src/app");
let token;
beforeAll(async () => {
  const response = await request(app).post("/api/auth/login").send({
    email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
  });
  token = response.body.token;
  expect(response.status).toBe(200);
});
const admin = {
  get: (url) => request(app).get(url).set("Authorization", "Bearer " + token),
  post: (url) => request(app).post(url).set("Authorization", "Bearer " + token),
  put: (url) => request(app).put(url).set("Authorization", "Bearer " + token),
  delete: (url) => request(app).delete(url).set("Authorization", "Bearer " + token),
};

const CATEGORIA_PASTELES_ID = 1;
const PRODUCTO_CHOCOLATE_ID = 1;
const PRODUCTO_GALLETAS_ID = 2;
const ID_INEXISTENTE = 99999;

describe("GET /api/health", () => {
  it("debe responder 200 con el estado de la API", async () => {
    const res = await admin.get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      statusCode: 200,
      status: "ok",
      mensaje: "API correctamente",
    });
  });
});

describe("GET /api/categorias", () => {
  it("debe responder 200 con el arreglo de categorias", async () => {
    const res = await admin.get("/api/categorias");

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: CATEGORIA_PASTELES_ID, nombre: "Pasteles" }),
      ])
    );
  });
});

describe("POST /api/categorias", () => {
  it("debe crear una categoria y responder 201", async () => {
    const res = await admin.post("/api/categorias")
      .send({ nombre: "Panques", descripcion: "Panques caseros" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(Number),
      nombre: "Panques",
      descripcion: "Panques caseros",
    });
  });

  it("debe responder 400 si el body no trae nombre", async () => {
    const res = await admin.post("/api/categorias")
      .send({ descripcion: "Sin nombre" });

    expect(res.status).toBe(400);
    expect(res.body.data.message).toBe("El campo nombre es requerido");
  });
});

describe("DELETE /api/categorias/:id", () => {
  let categoriaId;

  beforeAll(async () => {
    const res = await admin.post("/api/categorias")
      .send({ nombre: "Categoria temporal" });
    categoriaId = res.body.data.id;
  });

  it("debe eliminar una categoria sin productos asociados", async () => {
    const res = await admin.delete(`/api/categorias/${categoriaId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Categoria eliminada correctamente");

    const lista = await admin.get("/api/categorias");
    expect(lista.body.data.map((c) => c.id)).not.toContain(categoriaId);
  });

  it("debe responder 404 si la categoria no existe", async () => {
    const res = await admin.delete(`/api/categorias/${ID_INEXISTENTE}`);

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Categoria no encontrada");
  });
});

describe("GET /api/productos", () => {
  it("debe responder 200 con el arreglo de productos", async () => {
    const res = await admin.get("/api/productos");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    res.body.data.forEach((producto) => {
      expect(producto.disponible).toBe(producto.stock > 0);
    });
  });
});

describe("GET /api/productos/categoria/:categoriaId", () => {
  it("debe devolver solo los productos de la categoria indicada", async () => {
    const res = await admin.get(
      `/api/productos/categoria/${CATEGORIA_PASTELES_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((producto) => {
      expect(producto.categoria_id).toBe(CATEGORIA_PASTELES_ID);
    });
  });

  it("debe responder 404 si la categoria no existe", async () => {
    const res = await admin.get(
      `/api/productos/categoria/${ID_INEXISTENTE}`
    );

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Categoria no encontrada");
  });
});

describe("GET /api/productos/:id", () => {
  it("debe devolver el producto si existe", async () => {
    const res = await admin.get(`/api/productos/${PRODUCTO_CHOCOLATE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: PRODUCTO_CHOCOLATE_ID,
      nombre: "Pastel de chocolate",
      precio: 350,
      stock: 10,
    });
    expect(res.body.data).toHaveProperty("disponible");
    expect(res.body.data.disponible).toBe(true);
  });

  it("debe marcar disponible en false si el stock es 0", async () => {
    const creado = await admin.post("/api/productos")
      .send({ nombre: "Producto agotado", precio: 20, stock: 0 });

    const res = await admin.get(`/api/productos/${creado.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.disponible).toBe(false);
  });

  it("debe responder 404 si el producto no existe", async () => {
    const res = await admin.get(`/api/productos/${ID_INEXISTENTE}`);

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Producto no encontrado");
  });
});

describe("POST /api/productos", () => {
  it("debe crear un producto valido y responder 201", async () => {
    const nuevo = {
      nombre: "Pastel de fresa",
      descripcion: "Con fresas naturales",
      precio: 380,
      stock: 5,
      categoriaId: CATEGORIA_PASTELES_ID,
    };

    const res = await admin.post("/api/productos").send(nuevo);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(Number),
      nombre: nuevo.nombre,
      precio: nuevo.precio,
      stock: nuevo.stock,
      categoria_id: CATEGORIA_PASTELES_ID,
    });
  });

  it("debe responder 400 si falta el nombre", async () => {
    const res = await admin.post("/api/productos").send({ precio: 100 });

    expect(res.status).toBe(400);
    expect(res.body.data.message).toBe(
      "Los campos nombre y precio son requeridos"
    );
  });

  it("debe responder 400 si falta el precio", async () => {
    const res = await admin.post("/api/productos")
      .send({ nombre: "Producto sin precio" });

    expect(res.status).toBe(400);
    expect(res.body.data.message).toBe(
      "Los campos nombre y precio son requeridos"
    );
  });

  it("debe responder 404 si la categoria no existe", async () => {
    const res = await admin.post("/api/productos").send({
      nombre: "Producto huerfano",
      precio: 50,
      categoriaId: ID_INEXISTENTE,
    });

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Categoria no encontrada");
  });
});

describe("PUT /api/productos/:id", () => {
  it("debe actualizar solo los campos enviados", async () => {
    const res = await admin.put(`/api/productos/${PRODUCTO_GALLETAS_ID}`)
      .send({ precio: 95, stock: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: PRODUCTO_GALLETAS_ID,
      nombre: "Galletas de avena",
      precio: 95,
      stock: 30,
    });
  });

  it("debe responder 404 si el producto no existe", async () => {
    const res = await admin.put(`/api/productos/${ID_INEXISTENTE}`)
      .send({ precio: 10 });

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Producto no encontrado");
  });

  it("debe responder 400 si el body viene vacio", async () => {
    const res = await admin.put(`/api/productos/${PRODUCTO_GALLETAS_ID}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.data.message).toBe("No hay datos para actualizar");
  });

  it("debe responder 404 si la categoria no existe", async () => {
    const res = await admin.put(`/api/productos/${PRODUCTO_GALLETAS_ID}`)
      .send({ categoriaId: ID_INEXISTENTE });

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Categoria no encontrada");
  });
});

describe("DELETE /api/productos/:id", () => {
  let productoId;

  beforeAll(async () => {
    const res = await admin.post("/api/productos")
      .send({ nombre: "Producto temporal", precio: 10 });
    productoId = res.body.data.id;
  });

  it("debe eliminar un producto existente", async () => {
    const res = await admin.delete(`/api/productos/${productoId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Producto eliminado correctamente");

    const consulta = await admin.get(`/api/productos/${productoId}`);
    expect(consulta.status).toBe(404);
  });

  it("debe responder 404 si el producto no existe", async () => {
    const res = await admin.delete(`/api/productos/${ID_INEXISTENTE}`);

    expect(res.status).toBe(404);
    expect(res.body.data.message).toBe("Producto no encontrado");
  });
});

describe("POST /api/productos/backup", () => {
  let backupPath;

  afterAll(() => {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });

  it("debe responder 200 y generar el archivo de respaldo", async () => {
    const res = await admin.post("/api/productos/backup");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatch(/^database_backup_\d{8}_\d{6}\.db$/);

    backupPath = path.join(__dirname, "..", "backups", res.body.data);
    expect(fs.existsSync(backupPath)).toBe(true);
  });
});

// se ejecuta al final porque borra todos los datos
describe("DELETE /api/productos/vaciar", () => {
  it("debe dejar las tablas de productos y categorias en 0 registros", async () => {
    const res = await admin.delete("/api/productos/vaciar");

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe(
      "Se eliminaron todos los productos y categorias"
    );

    const productos = await admin.get("/api/productos");
    const categorias = await admin.get("/api/categorias");
    expect(productos.body.data).toHaveLength(0);
    expect(categorias.body.data).toHaveLength(0);
  });
});

describe("Autenticación y usuarios", () => {
  it.each([
    ["GET", "/api/productos"], ["POST", "/api/productos"], ["PUT", "/api/productos/1"], ["DELETE", "/api/productos/1"],
    ["GET", "/api/users"], ["POST", "/api/users"], ["PUT", "/api/users/1"], ["DELETE", "/api/users/1"],
    ["GET", "/api/categorias"], ["GET", "/api/auth/me"], ["POST", "/api/auth/logout"],
  ])("%s %s responde 401 sin sesión", async (method, url) => {
    expect((await request(app)[method.toLowerCase()](url).send({})).status).toBe(401);
    const badToken = await request(app)[method.toLowerCase()](url).auth("f".repeat(64), { type: "bearer" });
    expect(badToken.status).toBe(401);
  });

  it("rechaza credenciales incorrectas", async () => {
    const invalid = await request(app).post("/api/auth/login").send({
      email: "admin@example.test", password: "invalid-password-123",
    });
    expect(invalid.status).toBe(401);
  });

  it("crea, consulta, modifica y elimina usuarios sin exponer claves ni roles", async () => {
    const data = { nombre: "Prueba", email: "jest@example.test", password: "another-test-123" };
    const created = await admin.post("/api/users").send({ ...data, rol: "admin" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(Number), nombre: "Prueba", email: "jest@example.test" });

    const url = "/api/users/" + created.body.id;
    expect((await admin.get(url)).body.nombre).toBe("Prueba");
    (await admin.get("/api/users")).body.forEach((user) => {
      expect(Object.keys(user).sort()).toEqual(["email", "id", "nombre"]);
    });

    const login = await request(app).post("/api/auth/login").send(data);
    expect(login.status).toBe(200);
    expect((await request(app).get("/api/users").auth(login.body.token, { type: "bearer" })).status).toBe(200);

    const updated = await admin.put(url).send({ nombre: "Modificado", email: data.email });
    expect(updated.body).toEqual({ id: created.body.id, nombre: "Modificado", email: "jest@example.test" });
    expect((await admin.delete(url)).status).toBe(204);
    expect((await admin.get(url)).status).toBe(404);
  });

  it("cierra la sesión y el token deja de funcionar", async () => {
    const data = { nombre: "Salida", email: "logout@example.test", password: "logout-clave-123" };
    await request(app).post("/api/auth/register").send(data);
    const { token: sessionToken } = (await request(app).post("/api/auth/login").send(data)).body;
    const bearer = { type: "bearer" };
    expect((await request(app).post("/api/auth/logout").auth(sessionToken, bearer)).status).toBe(204);
    expect((await request(app).get("/api/productos").auth(sessionToken, bearer)).status).toBe(401);
  });
});

describe("POST /api/auth/register", () => {
  const register = (data) => request(app).post("/api/auth/register").send(data);
  const nuevo = { nombre: "  Cliente Nuevo ", email: " Cliente@Example.TEST ", password: "registro-clave-123" };

  it("registra una cuenta que inicia sesión y usa los dos CRUD", async () => {
    const res = await register(nuevo);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), nombre: "Cliente Nuevo", email: "cliente@example.test" });

    const login = await request(app).post("/api/auth/login")
      .send({ email: "cliente@example.test", password: nuevo.password });
    expect(login.status).toBe(200);
    const as = (method, url) => request(app)[method](url).auth(login.body.token, { type: "bearer" });
    expect((await as("get", "/api/auth/me")).body).toEqual({ id: res.body.id, nombre: "Cliente Nuevo", email: "cliente@example.test" });

    const product = await as("post", "/api/productos")
      .send({ nombre: "Flan de cliente", precio: 90, stock: 3 });
    expect(product.status).toBe(201);
    const productUrl = "/api/productos/" + product.body.data.id;
    expect((await as("get", "/api/productos")).status).toBe(200);
    expect((await as("put", productUrl).send({ precio: 95 })).body.data.precio).toBe(95);
    expect((await as("delete", productUrl)).status).toBe(200);

    const user = await as("post", "/api/users").send({ nombre: "Colega", email: "colega@example.test", password: "colega-clave-123" });
    expect(user.status).toBe(201);
    const userUrl = "/api/users/" + user.body.id;
    expect((await as("get", "/api/users")).body.map((u) => u.email)).toContain("colega@example.test");
    expect((await as("put", userUrl).send({ nombre: "Colega editado", email: "colega@example.test" })).body.nombre)
      .toBe("Colega editado");
    expect((await as("delete", userUrl)).status).toBe(204);
    expect((await as("delete", "/api/users/" + res.body.id)).status).toBe(409);
  });

  it("responde 409 si el correo ya existe, sin importar mayúsculas ni espacios", async () => {
    const res = await register({ ...nuevo, email: "CLIENTE@example.test  " });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("El correo ya está registrado");
    expect((await register({ ...nuevo, email: "Admin@Example.test" })).status).toBe(409);
  });

  it.each([
    ["sin nombre", { email: "a@example.test", password: "registro-clave-123" }, "nombre"],
    ["nombre en blanco", { nombre: "   ", email: "a@example.test", password: "registro-clave-123" }, "nombre"],
    ["correo inválido", { nombre: "A", email: "no-es-correo", password: "registro-clave-123" }, "correo"],
    ["contraseña corta", { nombre: "A", email: "a@example.test", password: "corta" }, "contraseña"],
    ["contraseña larga", { nombre: "A", email: "a@example.test", password: "x".repeat(129) }, "contraseña"],
    ["contraseña no textual", { nombre: "A", email: "a@example.test", password: 123456789012 }, "contraseña"],
  ])("responde 400 con %s", async (_, data, campo) => {
    const res = await register(data);
    expect(res.status).toBe(400);
    expect(res.body.message.toLowerCase()).toContain(campo);
    const login = await request(app).post("/api/auth/login").send(data);
    expect(login.status).toBe(401);
  });

  it("ignora un rol enviado en la solicitud y no lo devuelve", async () => {
    const res = await register({ nombre: "Con rol", email: "conrol@example.test", password: "registro-clave-456", rol: "admin" });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("rol");
  });
});

describe("Sesiones inválidas y vencidas", () => {
  it.each(["token-malformado", "a".repeat(64)])("rechaza un token inválido (%s)", async (invalidToken) => {
    const response = await request(app).get("/api/auth/me").auth(invalidToken, { type: "bearer" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Inicia sesión");
  });

  it("rechaza un token vencido y permite iniciar una sesión nueva", async () => {
    const db = require("../src/db");
    const { createHash } = require("node:crypto");
    const credentials = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    const login = await request(app).post("/api/auth/login").send(credentials);
    expect(login.status).toBe(200);
    const expired = login.body.token;
    const digest = createHash("sha256").update(expired).digest("hex");
    expect(db.prepare("UPDATE sesiones SET expires=? WHERE token=?").run(Date.now() - 1000, digest).changes).toBe(1);
    expect((await request(app).get("/api/productos").auth(expired, { type: "bearer" })).status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send(credentials);
    expect(newLogin.status).toBe(200);
    expect((await request(app).get("/api/productos").auth(newLogin.body.token, { type: "bearer" })).status).toBe(200);
  });
});

describe("Límites de productos desde la API", () => {
  const base = { nombre: "Producto de límites", precio: 25.25, stock: 5, descripcion: "Prueba" };

  it.each([
    ["precio negativo", { precio: -0.01 }, "precio"],
    ["precio como texto", { precio: "25" }, "precio"],
    ["stock negativo", { stock: -1 }, "stock"],
    ["stock decimal", { stock: 1.5 }, "stock"],
    ["stock booleano", { stock: true }, "stock"],
    ["nombre en blanco", { nombre: "  " }, "nombre"],
    ["nombre con tipo incorrecto", { nombre: [] }, "nombre"],
    ["nombre de 101 caracteres", { nombre: "n".repeat(101) }, "nombre"],
    ["descripción de 501 caracteres", { descripcion: "d".repeat(501) }, "descripción"],
    ["descripción con tipo incorrecto", { descripcion: 100 }, "descripción"],
  ])("rechaza %s al crear y al editar, sin modificar el producto", async (_, datos, campo) => {
    const created = await admin.post("/api/productos").send(base);
    expect(created.status).toBe(201);
    const url = "/api/productos/" + created.body.data.id;
    try {
      const alta = await admin.post("/api/productos").send({ ...base, ...datos });
      expect(alta.status).toBe(400);
      expect(alta.body.data.message.toLowerCase()).toContain(campo);
      const cambio = await admin.put(url).send(datos);
      expect(cambio.status).toBe(400);
      expect(cambio.body.data.message.toLowerCase()).toContain(campo);
      expect((await admin.get(url)).body.data).toMatchObject(base);
    } finally {
      await admin.delete(url);
    }
  });

  it("acepta precio cero, stock cero, nombre de 100 y descripción de 500 caracteres", async () => {
    const datos = { nombre: "n".repeat(100), descripcion: "d".repeat(500), precio: 0, stock: 0 };
    const response = await admin.post("/api/productos").send(datos);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject(datos);
    await admin.delete("/api/productos/" + response.body.data.id);
  });
});

describe("Integridad y solicitudes simultáneas", () => {
  it("devuelve 409 al borrar una categoría con productos y conserva ambos registros", async () => {
    const categoria = await admin.post("/api/categorias").send({ nombre: "Categoría de integridad" });
    expect(categoria.status).toBe(201);
    const catId = categoria.body.data.id;
    const product = await admin.post("/api/productos").send({ nombre: "Producto relacionado", precio: 40, categoriaId: catId });
    expect(product.status).toBe(201);
    const productUrl = "/api/productos/" + product.body.data.id;
    try {
      const result = await admin.delete("/api/categorias/" + catId);
      expect(result.status).toBe(409);
      expect(result.body.data.message).toBe("La categoría tiene productos asociados");
      expect((await admin.get("/api/categorias")).body.data).toEqual(expect.arrayContaining([categoria.body.data]));
      expect((await admin.get(productUrl)).body.data).toMatchObject({ id: product.body.data.id, categoria_id: catId });
    } finally {
      await admin.delete(productUrl);
      await admin.delete("/api/categorias/" + catId);
    }
  });

  it("registra una sola cuenta para dos peticiones simultáneas con el mismo correo", async () => {
    const data = { nombre: "Alta simultánea", email: "alta-simultanea@example.test", password: "registro-duplicado-123" };
    const results = await Promise.all([data.email, data.email.toUpperCase()].map((email) =>
      request(app).post("/api/auth/register").send({ ...data, email })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const users = (await admin.get("/api/users")).body.filter((user) => user.email === data.email);
    expect(users).toHaveLength(1);
    await admin.delete("/api/users/" + users[0].id);
  });

  it("procesa dos envíos simultáneos con la misma clave de producto una sola vez", async () => {
    const data = { nombre: "Producto simultáneo", precio: 75, stock: 4 };
    const crear = (datos) => admin.post("/api/productos").set("Idempotency-Key", "test-misma-alta").send(datos);
    const results = await Promise.all([crear(data), crear(data)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect((await crear({ ...data, stock: 5 })).status).toBe(409);
    const productos = (await admin.get("/api/productos")).body.data.filter((product) => product.nombre === data.nombre);
    expect(productos).toHaveLength(1);
    expect(productos[0].stock).toBe(data.stock);
    await admin.delete("/api/productos/" + productos[0].id);
  });

  it("permite altas intencionales con datos idénticos si las claves son distintas", async () => {
    const data = { nombre: "Producto de dos altas independientes", precio: 10 };
    const resultados = await Promise.all(["test-alta-1", "test-alta-2"].map((clave) =>
      admin.post("/api/productos").set("Idempotency-Key", clave).send(data)));
    expect(resultados.map((r) => r.status)).toEqual([201, 201]);
    expect(resultados[0].body.data.id).not.toBe(resultados[1].body.data.id);
    for (const response of resultados) {
      await admin.delete("/api/productos/" + response.body.data.id);
    }
  });
});
