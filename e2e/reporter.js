class Reporter {
  onBegin(_config, suite) {
    this.numbers = new Map(suite.allTests().map((test, index) => {
      const number = index + 1;
      test.annotations.push({ type: "Número de prueba", description: String(number) });
      return [test.id, number];
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
    console.log(
      "Prueba " + this.numbers.get(test.id) + " | " +
      test.parent.project().name + " | " + test.title + " | " + status
    );
  }

  onError(error) {
    console.error(error.message);
  }

  onEnd(result) {
    console.log("Ejecución terminada. Estado general: " + result.status);
  }
}

module.exports = Reporter;
