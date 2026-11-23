const express = require("express");
const { randomBytes, scryptSync, timingSafeEqual, createHash } = require("node:crypto");
const db = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    clave TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('admin', 'usuario'))
  );
  CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY, usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
`);

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}

function digest(token) {
  return createHash("sha256").update(token).digest("hex");
}

const validPassword = (password) =>
  typeof password === "string" && password.length >= 12 && password.length <= 128;
// La columna rol se conserva en SQLite por compatibilidad, pero ya no se usa ni se expone.
const fields = "id, nombre, email";
const validName = (nombre) => typeof nombre === "string" && nombre.trim() !== "" && nombre.length <= 100;
const validEmail = (email) =>
  typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const normalizeEmail = (email) => email.trim().toLowerCase();
const isDuplicate = (error) => error.code === "SQLITE_CONSTRAINT_UNIQUE";

if (process.env.ADMIN_EMAIL && validPassword(process.env.ADMIN_PASSWORD)) {
  // Cuenta inicial opcional: solo se crea si la base todavía no tiene ninguna cuenta.
  db.prepare(`INSERT INTO usuarios (nombre,email,clave,rol)
    SELECT 'Administrador', ?, ?, 'usuario'
    WHERE NOT EXISTS (SELECT 1 FROM usuarios)`)
    .run(normalizeEmail(process.env.ADMIN_EMAIL), hashPassword(process.env.ADMIN_PASSWORD));
}

const findUser = db.prepare(`SELECT ${fields} FROM usuarios WHERE id = ?`);
const auth = express.Router();
const users = express.Router();
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

auth.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || !validPassword(password)) {
    return res.status(401).json({ message: "Credenciales incorrectas" });
  }
  const user = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(normalizeEmail(email));
  const hash = user?.clave ?? dummyHash;
  const matches = timingSafeEqual(Buffer.from(hash), Buffer.from(hashPassword(password, hash.split(":")[0])));
  if (!user || !matches) return res.status(401).json({ message: "Credenciales incorrectas" });

  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sesiones WHERE expires <= ?").run(Date.now());
  db.prepare("INSERT INTO sesiones VALUES (?, ?, ?)").run(digest(token), user.id, Date.now() + 8 * 3600000);
  res.json({ token });
});

auth.post("/register", (req, res) => {
  const { nombre, email, password } = req.body ?? {};
  const errors = [];
  if (!validName(nombre)) errors.push("Escribe tu nombre (máximo 100 caracteres)");
  if (!validEmail(email)) errors.push("Escribe un correo válido");
  if (!validPassword(password)) errors.push("La contraseña debe tener entre 12 y 128 caracteres");
  if (errors.length) return res.status(400).json({ message: errors.join(". "), errors });

  try {
    const result = db.prepare("INSERT INTO usuarios (nombre,email,rol,clave) VALUES (?,?,'usuario',?)")
      .run(nombre.trim(), normalizeEmail(email), hashPassword(password));
    res.status(201).json(findUser.get(result.lastInsertRowid));
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    res.status(409).json({ message: "El correo ya está registrado" });
  }
});

function requireLogin(req, res, next) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.get("Authorization") ?? "")?.[1];
  if (token) {
    req.sessionToken = digest(token);
    req.user = db.prepare(`SELECT u.id, u.nombre, u.email FROM usuarios u
      JOIN sesiones s ON u.id = s.usuario WHERE s.token = ? AND s.expires > ?`)
      .get(req.sessionToken, Date.now());
  }
  if (!req.user) return res.status(401).json({ message: "Inicia sesión" });
  next();
}

auth.get("/me", requireLogin, (req, res) => res.json(req.user));
auth.post("/logout", requireLogin, (req, res) => {
  db.prepare("DELETE FROM sesiones WHERE token = ?").run(req.sessionToken);
  res.sendStatus(204);
});

users.get("/", (req, res) => res.json(db.prepare(`SELECT ${fields} FROM usuarios ORDER BY id`).all()));
users.get("/:id", (req, res) => {
  const user = findUser.get(req.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  res.json(user);
});

function saveUser(req, res) {
  const id = req.params.id;
  const existing = id ? findUser.get(id) : null;
  if (id && !existing) return res.status(404).json({ message: "Usuario no encontrado" });

  const { nombre, email, password } = req.body ?? {};
  if (!validName(nombre) || !validEmail(email) ||
      ((!existing || password !== undefined) && !validPassword(password))) {
    return res.status(400).json({ message: "Verifica el nombre, correo y contraseña (12 a 128 caracteres)" });
  }

  try {
    const values = [nombre.trim(), normalizeEmail(email)];
    if (existing) {
      db.transaction(() => {
        db.prepare("UPDATE usuarios SET nombre=?, email=?, clave=COALESCE(?, clave) WHERE id=?")
          .run(...values, password ? hashPassword(password) : null, id);
        if (password) db.prepare("DELETE FROM sesiones WHERE usuario=?").run(id);
      })();
      return res.json(findUser.get(id));
    }
    const result = db.prepare("INSERT INTO usuarios (nombre,email,rol,clave) VALUES (?,?,'usuario',?)")
      .run(...values, hashPassword(password));
    res.status(201).json(findUser.get(result.lastInsertRowid));
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    res.status(409).json({ message: "El correo ya está registrado" });
  }
}

users.post("/", saveUser);
users.put("/:id", saveUser);
users.delete("/:id", (req, res) => {
  if (req.user.id === Number(req.params.id)) {
    return res.status(409).json({ message: "No puedes eliminar tu propia cuenta" });
  }
  const result = db.prepare("DELETE FROM usuarios WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ message: "Usuario no encontrado" });
  res.sendStatus(204);
});

module.exports = { auth, users, requireLogin };
