const env = process.env;

async function send() {
  const endpoint = new URL(env.OPENOBSERVE_ENDPOINT);
  if (endpoint.protocol !== "https:") throw new Error("La ingesta del CI requiere HTTPS");
  const url = endpoint.href.replace(/\/$/, "") + "/pasteleria_cicd/_json";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: env.OPENOBSERVE_AUTH, "Content-Type": "application/json" },
    body: JSON.stringify([{
      event: env.EVENT_NAME,
      result: env.EVENT_RESULT,
      jest: env.JEST_RESULT,
      playwright: env.PLAYWRIGHT_RESULT,
      commit: env.GITHUB_SHA,
      branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
      actor: env.GITHUB_ACTOR,
      run_id: env.GITHUB_RUN_ID,
      timestamp: new Date().toISOString(),
    }]),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("OpenObserve respondió HTTP " + response.status);
  const body = await response.json();
  if (body.code !== 200 || body.status?.some((stream) => stream.failed > 0)) {
    throw new Error("OpenObserve rechazó el registro");
  }
}

send().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
