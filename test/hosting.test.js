const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")

const HostingStatus = require("../src/hosting/HostingStatus")
const {
  closeWebServer,
  resolveListener,
  startWebServer,
} = require("../src/hosting/WebServer")

function request(port, pathname, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: pathname, method },
      (response) => {
        const chunks = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => resolve({
          body: Buffer.concat(chunks).toString("utf8"),
          headers: response.headers,
          statusCode: response.statusCode,
        }))
      },
    )
    req.once("error", reject)
    req.end()
  })
}

test("PlanetHoster utilise automatiquement la cible Passenger", () => {
  assert.deepEqual(resolveListener({ mode: "planethoster" }, { PORT: "8080" }), {
    mode: "planethoster",
    host: "127.0.0.1",
    target: "passenger",
  })
})

test("le mode local accepte un port dynamique", () => {
  assert.deepEqual(resolveListener({ mode: "local", port: "0" }, {}), {
    mode: "local",
    host: "127.0.0.1",
    target: 0,
  })
  assert.equal(resolveListener({ mode: "local" }, { PORT: "8080" }).target, 8080)
  assert.throws(() => resolveListener({ mode: "local", port: "70000" }, {}))
  assert.throws(() => resolveListener({ mode: "local", port: "3000abc" }, {}))
})

test("les routes web restent publiques sans exposer la configuration secrète", async (t) => {
  let now = 1_000
  const status = new HostingStatus({ name: "Bot test", version: "5.0.0", now: () => now })
  const runtime = await startWebServer({
    status,
    hosting: { mode: "local", host: "127.0.0.1", port: "0" },
    environment: {},
  })
  t.after(() => closeWebServer(runtime.server))

  const port = runtime.server.address().port
  now = 6_100
  const health = await request(port, "/health")
  const healthBody = JSON.parse(health.body)

  assert.equal(health.statusCode, 200)
  assert.equal(healthBody.web, "online")
  assert.equal(healthBody.highrise, "offline")
  assert.equal(healthBody.uptimeSeconds, 5)
  assert.equal(health.body.includes("HIGHRISE_TOKEN"), false)
  assert.equal(health.headers["cache-control"], "no-store")

  const notReady = await request(port, "/ready")
  assert.equal(notReady.statusCode, 503)

  status.attachBot({ status: "Online", metadata: { botId: "secret-bot-id" } })
  status.markReady()
  const ready = await request(port, "/readyz")
  assert.equal(ready.statusCode, 200)
  assert.deepEqual(JSON.parse(ready.body), { ready: true, highrise: "online" })

  const home = await request(port, "/")
  assert.equal(home.statusCode, 200)
  assert.match(home.body, /Connecté à Highrise/)
  assert.equal(home.body.includes("secret-bot-id"), false)

  const missing = await request(port, "/inconnu")
  assert.equal(missing.statusCode, 404)
})
