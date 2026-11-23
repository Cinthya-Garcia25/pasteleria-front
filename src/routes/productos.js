const express = require("express");
const { createHash } = require("node:crypto");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { DB_PATH } = require("../dbConfig");
const { apiResponse } = require("../utils/apiResponse");

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS altas_productos (
    usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    huella TEXT NOT NULL,
    producto TEXT NOT NULL,
    PRIMARY KEY (usuario, clave)
  )
`);

function validarProducto(body, parcial = false) {
  const tiene = (campo) => Object.hasOwn(body, campo);
  if ((!parcial || tiene("nombre")) &&
      (typeof body.nombre !== "string" || !body.nombre.trim() || body.nombre.length > 100)) {
    return "Escribe un nombre de producto de 1 a 100 caracteres";
  }
  if ((!parcial || tiene("precio")) && (!Number.isFinite(body.precio) || body.precio < 0)) {
    return "El precio debe ser un número mayor o igual a cero";
  }
  if (tiene("stock") && (!Number.isSafeInteger(body.stock) || body.stock < 0)) {
    return "El stock debe ser un entero mayor o igual a cero";
  }
  if (tiene("descripcion") && body.descripcion !== null &&
      (typeof body.descripcion !== "string" || body.descripcion.length > 500)) {
    return "La descripción debe tener como máximo 500 caracteres";
  }
  if (tiene("categoriaId") && body.categoriaId !== null &&
      (!Number.isSafeInteger(body.categoriaId) || body.categoriaId < 1)) {
    return "La categoría debe ser un identificador entero positivo";
  }
}

const crearProducto = db.transaction((usuario, clave, datos) => {
  const huella = createHash("sha256").update(JSON.stringify(datos)).digest("hex");
  if (clave) {
    const anterior = db.prepare("SELECT huella, producto FROM altas_productos WHERE usuario = ? AND clave = ?")
      .get(usuario, clave);
    if (anterior) {
      return anterior.huella === huella
        ? { status: 200, data: JSON.parse(anterior.producto) }
        : { status: 409, data: { message: "La clave de envío ya se usó para otro producto" } };
    }
  }

  const [nombre, descripcion, precio, stock, categoriaId] = datos;
  if (categoriaId !== null && !db.prepare("SELECT id FROM categorias WHERE id = ?").get(categoriaId)) {
    return { status: 404, data: { message: "Categoria no encontrada" } };
  }
  const result = db.prepare("INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id) VALUES (?, ?, ?, ?, ?)")
    .run(nombre, descripcion, precio, stock, categoriaId);
  const data = db.prepare("SELECT * FROM productos WHERE id = ?").get(result.lastInsertRowid);
  if (clave) {
    db.prepare("INSERT INTO altas_productos (usuario, clave, huella, producto) VALUES (?, ?, ?, ?)")
      .run(usuario, clave, huella, JSON.stringify(data));
  }
  return { status: 201, data };
});

// agrega el campo calculado "disponible" (true si hay stock)
const conDisponible = (producto) => ({
  ...producto,
  disponible: producto.stock > 0,
});

// GET /api/productos -> lista todos los productos
router.get("/", (req, res) => {
  try {
    const productos = db.prepare("SELECT * FROM productos").all();
    res.status(200).json(apiResponse(200, productos.map(conDisponible)));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// GET /api/productos/categoria/:categoriaId -> productos de una categoria
router.get("/categoria/:categoriaId", (req, res) => {
  try {
    const { categoriaId } = req.params;

    const categoria = db
      .prepare("SELECT * FROM categorias WHERE id = ?")
      .get(categoriaId);

    if (!categoria) {
      return res
        .status(404)
        .json(apiResponse(404, { message: "Categoria no encontrada" }));
    }

    const productos = db
      .prepare("SELECT * FROM productos WHERE categoria_id = ?")
      .all(categoriaId);

    res.status(200).json(apiResponse(200, productos));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// POST /api/productos/backup -> respalda el archivo database.db
router.post("/backup", (req, res) => {
  try {
    const backupsDir = path.join(__dirname, "..", "..", "backups");

    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const backupFileName = `database_backup_${timestamp}.db`;
    const backupPath = path.join(backupsDir, backupFileName);

    fs.copyFileSync(DB_PATH, backupPath);

    res.status(200).json(apiResponse(200, backupFileName));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// DELETE /api/productos/vaciar -> elimina todos los productos y categorias
router.delete("/vaciar", (req, res) => {
  try {
    db.prepare("DELETE FROM productos").run();
    db.prepare("DELETE FROM categorias").run();

    res
      .status(200)
      .json(
        apiResponse(200, {
          message: "Se eliminaron todos los productos y categorias",
        })
      );
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// GET /api/productos/:id -> obtiene un producto por id
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;

    const producto = db
      .prepare("SELECT * FROM productos WHERE id = ?")
      .get(id);

    if (!producto) {
      return res
        .status(404)
        .json(apiResponse(404, { message: "Producto no encontrado" }));
    }

    res.status(200).json(apiResponse(200, conDisponible(producto)));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// POST /api/productos -> crea un producto
router.post("/", (req, res) => {
  try {
    const body = req.body ?? {};
    if (body.nombre == null || body.precio == null) {
      return res.status(400).json(apiResponse(400, { message: "Los campos nombre y precio son requeridos" }));
    }

    const error = validarProducto(body);
    if (error) return res.status(400).json(apiResponse(400, { message: error }));

    const clave = req.get("Idempotency-Key");
    if (clave !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(clave)) {
      return res.status(400).json(apiResponse(400, { message: "La clave de envío no es válida" }));
    }

    const datos = [body.nombre.trim(), body.descripcion ?? null, body.precio, body.stock ?? 0, body.categoriaId ?? null];
    const result = crearProducto.immediate(req.user.id, clave, datos);
    res.status(result.status).json(apiResponse(result.status, result.data));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// PUT /api/productos/:id -> actualiza los campos enviados de un producto
router.put("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};

    const producto = db
      .prepare("SELECT * FROM productos WHERE id = ?")
      .get(id);

    if (!producto) {
      return res
        .status(404)
        .json(apiResponse(404, { message: "Producto no encontrado" }));
    }

    // campo del body -> columna en la tabla
    const camposPermitidos = {
      nombre: "nombre",
      descripcion: "descripcion",
      precio: "precio",
      stock: "stock",
      categoriaId: "categoria_id",
    };

    const campos = Object.keys(camposPermitidos).filter((campo) =>
      Object.hasOwn(body, campo)
    );

    if (campos.length === 0) {
      return res
        .status(400)
        .json(apiResponse(400, { message: "No hay datos para actualizar" }));
    }

    const error = validarProducto(body, true);
    if (error) return res.status(400).json(apiResponse(400, { message: error }));

    if (body.categoriaId !== undefined && body.categoriaId !== null) {
      const categoria = db
        .prepare("SELECT * FROM categorias WHERE id = ?")
        .get(body.categoriaId);

      if (!categoria) {
        return res
          .status(404)
          .json(apiResponse(404, { message: "Categoria no encontrada" }));
      }
    }

    const setClause = campos
      .map((campo) => `${camposPermitidos[campo]} = ?`)
      .join(", ");
    const valores = campos.map((campo) => campo === "nombre" ? body.nombre.trim() : body[campo]);

    db.prepare(`UPDATE productos SET ${setClause} WHERE id = ?`).run(
      ...valores,
      id
    );

    const productoActualizado = db
      .prepare("SELECT * FROM productos WHERE id = ?")
      .get(id);

    res.status(200).json(apiResponse(200, productoActualizado));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

// DELETE /api/productos/:id -> elimina un producto por id
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;

    const producto = db
      .prepare("SELECT * FROM productos WHERE id = ?")
      .get(id);

    if (!producto) {
      return res
        .status(404)
        .json(apiResponse(404, { message: "Producto no encontrado" }));
    }

    db.prepare("DELETE FROM productos WHERE id = ?").run(id);

    res
      .status(200)
      .json(apiResponse(200, { message: "Producto eliminado correctamente" }));
  } catch (error) {
    res.status(500).json(apiResponse(500, { message: error.message }));
  }
});

module.exports = router;
