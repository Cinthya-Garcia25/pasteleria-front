class Reporter {
  onBegin(_config, suite) {
    this.tests = new Map(suite.allTests().map((test, index) => {
      const number = index + 1;
      test.annotations.push({ type: "Número de prueba", description: String(number) });
      const label = "Prueba " + number + " | " + test.parent.project().name + " | " + test.title;
      return [test.id, { label, status: "NO EJECUTADA" }];
    }));
  }

  onTestEnd(test, result) {
    const labels = {
      passed: "PASÓ",
      failed: "FALLÓ",
      timedOut: "FALLÓ por tiempo de espera",
      skipped: "OMITIDA",
      interrupted: "INTERRUMPIDA",
    };
    const status = labels[result.status] || result.status;
    test.annotations.push({ type: "Resultado", description: status });
    const entry = this.tests.get(test.id);
    entry.status = status;
    console.log(entry.label + " | " + status);
    for (const error of result.errors) {
      console.error(error.message || error.stack || error.value);
    }
  }

  onError(error) {
    console.error(error.message);
  }

  onEnd(result) {
    console.log("\nResumen completo de Playwright (" + this.tests.size + " pruebas)");
    for (const { label, status } of this.tests.values()) {
      console.log(label + " | " + status);
    }
    console.log("Ejecución terminada. Estado general: " + result.status);
  }
}

module.exports = Reporter;
