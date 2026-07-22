const packageInfo = require("./package.json")
const config = require("./src/config")
const HostingStatus = require("./src/hosting/HostingStatus")
const { closeWebServer, startWebServer } = require("./src/hosting/WebServer")
const { startHighriseBot } = require("./src/index")

const status = new HostingStatus({
  name: config.hosting.statusName,
  version: packageInfo.version,
})

let webRuntime = null
let botRuntime = null
let shuttingDown = false

async function boot() {
  webRuntime = await startWebServer({ status, hosting: config.hosting })
  const target = webRuntime.listener.target === "passenger"
    ? "Passenger"
    : `${webRuntime.listener.host}:${webRuntime.server.address().port}`
  console.log(`🌐 Service web démarré sur ${target}`)

  try {
    botRuntime = await startHighriseBot({ status })
  } catch (error) {
    const configurationError = error?.code === "BOT_CONFIGURATION_ERROR"
    status.markError(configurationError ? "configuration" : "runtime")
    console.error(`❌ ${error.message}`)
    console.error("Le service web reste actif pour permettre le diagnostic depuis PlanetHoster.")
  }
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  status.markStopping()
  console.log(`\nArrêt demandé (${signal})…`)

  const results = await Promise.allSettled([
    botRuntime?.stop?.(signal),
    closeWebServer(webRuntime?.server),
  ])
  if (results.some((result) => result.status === "rejected")) exitCode = 1

  status.markStopped()
  process.exitCode = exitCode
  setTimeout(() => process.exit(exitCode), 100)
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
process.on("uncaughtException", (error) => {
  console.error("Erreur non gérée :", error)
  status.markError("runtime")
  shutdown("uncaughtException", 1)
})
process.on("unhandledRejection", (error) => {
  console.error("Promesse rejetée non gérée :", error)
  status.markError("runtime")
})

const bootPromise = boot().catch((error) => {
  status.markError("runtime")
  console.error(`❌ Impossible de démarrer le service web : ${error.message}`)
  process.exitCode = 1
})

module.exports = { bootPromise, shutdown, status }
