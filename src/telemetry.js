const { context, metrics, trace, logs, SeverityNumber, SpanKind, SpanStatusCode } = require("@opentelemetry/api");

const meter = metrics.getMeter("pasteleria");
const logger = logs.getLogger("pasteleria");
const tracer = trace.getTracer("pasteleria");
const count = meter.createCounter("pasteleria.http.requests");
const duration = meter.createHistogram("pasteleria.http.duration", { unit: "ms" });

function observeRequest(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  const start = performance.now();
  const active = context.active();
  res.once("finish", () => {
    const attributes = {
      method: req.method,
      endpoint: req.route?.path && res.locals.apiPrefix
        ? res.locals.apiPrefix + (req.route.path === "/" ? "" : req.route.path)
        : "sin_ruta",
      statusCode: res.statusCode,
    };
    count.add(1, attributes);
    const durationMs = performance.now() - start;
    duration.record(durationMs, attributes);
    logger.emit({
      context: active,
      body: "Petición HTTP finalizada",
      attributes: { ...attributes, durationMs, timestamp: new Date().toISOString() },
      severityNumber: res.statusCode >= 500 ? SeverityNumber.ERROR : SeverityNumber.INFO,
    });
  });
  next();
}

function observeRoute(prefix) {
  return (req, res, next) => {
    res.locals.apiPrefix = prefix;
    next();
  };
}

function observeDatabase(db) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    const operation = sql.trim().split(/\s+/, 1)[0].toUpperCase();
    for (const method of ["get", "all", "run"]) {
      const execute = statement[method].bind(statement);
      statement[method] = (...args) => tracer.startActiveSpan("sqlite." + operation, {
        kind: SpanKind.CLIENT,
        attributes: { "db.system.name": "sqlite", "db.operation.name": operation },
      }, (span) => {
        try {
          return execute(...args);
        } catch (error) {
          span.recordException({ name: error.name, message: error.code || "Error de SQLite" });
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      });
    }
    return statement;
  };
}

module.exports = { observeRequest, observeRoute, observeDatabase };
