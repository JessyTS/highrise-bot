const http = require("node:http")

function normalizeMode(value) {
  const mode = String(value || "planethoster").trim().toLowerCase()
  if (["planethoster", "passenger", "n0c"].includes(mode)) return "planethoster"
  if (["local", "port", "standalone"].includes(mode)) return "local"
  throw new Error(`HOSTING_MODE invalide : ${value}`)
}

function parsePort(value) {
  const normalized = String(value).trim().toLowerCase()
  if (normalized === "passenger") return "passenger"
  if (!/^\d+$/.test(normalized)) throw new Error(`Port web invalide : ${value}`)
  const port = Number.parseInt(normalized, 10)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Port web invalide : ${value}`)
  }
  return port
}

function resolveListener(hosting = {}, environment = process.env) {
  const mode = normalizeMode(hosting.mode ?? environment.HOSTING_MODE)
  const host = String(hosting.host || environment.WEB_HOST || "127.0.0.1").trim()
  const configuredPort = hosting.port ?? environment.WEB_PORT
  const explicitPort = configuredPort !== undefined && String(configuredPort).trim() !== ""
    ? configuredPort
    : mode === "local"
      ? environment.PORT
      : undefined

  if (!host) throw new Error("WEB_HOST ne peut pas être vide")

  if (explicitPort !== undefined && String(explicitPort).trim() !== "") {
    return { mode, host, target: parsePort(explicitPort) }
  }

  return {
    mode,
    host,
    target: mode === "planethoster" ? "passenger" : 3000,
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function statusPage(snapshot) {
  const online = snapshot.highrise === "online"
  const color = online ? "#22c55e" : snapshot.status === "error" ? "#ef4444" : "#f59e0b"
  const label = online
    ? "Connecté à Highrise"
    : snapshot.status === "error"
      ? "Configuration à vérifier"
      : "Connexion à Highrise en cours"

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(snapshot.service)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #09090b; color: #fafafa; }
    main { width: min(560px, calc(100% - 40px)); padding: 32px; border: 1px solid #27272a; border-radius: 18px; background: #18181b; box-shadow: 0 24px 80px #0008; }
    h1 { margin: 0 0 10px; font-size: clamp(1.6rem, 5vw, 2.3rem); }
    p { color: #a1a1aa; line-height: 1.6; }
    .status { display: flex; gap: 10px; align-items: center; margin-top: 24px; padding: 14px 16px; border-radius: 12px; background: #09090b; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: ${color}; box-shadow: 0 0 18px ${color}; }
    small { display: block; margin-top: 22px; color: #71717a; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(snapshot.service)}</h1>
    <p>Application Node.js compatible PlanetHoster N0C / Passenger.</p>
    <div class="status"><span class="dot"></span><strong>${label}</strong></div>
    <small>Version ${escapeHtml(snapshot.version)} · Service web opérationnel</small>
  </main>
</body>
</html>`
}

function applySecurityHeaders(response, contentType) {
  response.setHeader("Content-Type", contentType)
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("X-Frame-Options", "DENY")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("X-Robots-Tag", "noindex, nofollow")
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  )
}

function send(response, statusCode, body, contentType, method = "GET") {
  const payload = Buffer.from(body)
  response.statusCode = statusCode
  applySecurityHeaders(response, contentType)
  response.setHeader("Content-Length", payload.length)
  response.end(method === "HEAD" ? undefined : payload)
}

function createWebServer(status) {
  if (!status?.snapshot) throw new Error("Un fournisseur de statut est obligatoire")

  const server = http.createServer((request, response) => {
    const method = request.method || "GET"
    if (!['GET', 'HEAD'].includes(method)) {
      response.setHeader("Allow", "GET, HEAD")
      return send(response, 405, "Méthode non autorisée\n", "text/plain; charset=utf-8", method)
    }

    let pathname = "/"
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname.replace(/\/+$/, "") || "/"
    } catch {
      return send(response, 400, "Requête invalide\n", "text/plain; charset=utf-8", method)
    }

    const snapshot = status.snapshot()
    if (["/health", "/healthz"].includes(pathname)) {
      return send(
        response,
        200,
        `${JSON.stringify(snapshot)}\n`,
        "application/json; charset=utf-8",
        method,
      )
    }

    if (["/ready", "/readyz"].includes(pathname)) {
      return send(
        response,
        status.isReady() ? 200 : 503,
        `${JSON.stringify({ ready: status.isReady(), highrise: snapshot.highrise })}\n`,
        "application/json; charset=utf-8",
        method,
      )
    }

    if (pathname === "/") {
      return send(response, 200, statusPage(snapshot), "text/html; charset=utf-8", method)
    }

    return send(response, 404, "Introuvable\n", "text/plain; charset=utf-8", method)
  })

  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  return server
}

function startWebServer({ status, hosting = {}, environment = process.env } = {}) {
  const listener = resolveListener(hosting, environment)
  const server = createWebServer(status)

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error)
    server.once("error", onError)
    server.listen(listener.target, listener.host, () => {
      server.removeListener("error", onError)
      resolve({ server, listener })
    })
  })
}

function closeWebServer(server) {
  if (!server?.listening) return Promise.resolve()
  return new Promise((resolve) => server.close(() => resolve()))
}

module.exports = {
  closeWebServer,
  createWebServer,
  resolveListener,
  startWebServer,
  statusPage,
}
