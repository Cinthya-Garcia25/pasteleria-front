if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
  const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");

  const sdk = new NodeSDK({
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });
  sdk.start();
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => sdk.shutdown().finally(() => process.exit(0)));
  }
}
