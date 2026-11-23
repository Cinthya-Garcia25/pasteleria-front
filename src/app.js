const express = require("express");
const path = require("node:path");
const { auth, users, requireLogin } = require("./account");

require("./db");

const categoriasRoutes = require("./routes/categorias");
const productosRoutes = require("./routes/productos");
const healthRoutes = require("./routes/health");

const { observeRequest, observeRoute } = require("./telemetry");
const app = express();
app.use(observeRequest);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/auth", observeRoute("/api/auth"), auth);
app.use("/api/users", observeRoute("/api/users"), requireLogin, users);

app.use("/api/categorias", observeRoute("/api/categorias"), requireLogin, categoriasRoutes);
app.use("/api/productos", observeRoute("/api/productos"), requireLogin, productosRoutes);
app.use("/api/health", observeRoute("/api/health"), healthRoutes);

module.exports = app;
