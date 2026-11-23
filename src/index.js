const app = require("./app");
const { startTcpServer } = require("./tcpServer");

const PORT = process.env.PORT || 3000;

app.listen(PORT, process.env.HOST || "0.0.0.0", () => {
  console.log(`Servidor de la pasteleria corriendo en el puerto ${PORT}`);
});

const TCP_PORT = process.env.TCP_PORT || 6061;

if (process.env.ENABLE_TCP === "true") startTcpServer(TCP_PORT);
