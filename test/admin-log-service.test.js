const test = require("node:test")
const assert = require("node:assert/strict")

const AdminLogService = require("../src/core/AdminLogService")

function createFixture() {
  const whispers = []
  const publicMessages = []
  const history = []
  const adminIds = new Set(["owner", "env-admin", "saved-admin"])
  const bot = {
    metadata: { room: { ownerId: "owner" } },
    whisper: {
      send: async (userId, message) => {
        whispers.push([userId, message])
        return { ok: true }
      },
    },
    message: { send: async (message) => publicMessages.push(message) },
  }
  const store = {
    settings: {
      adminLogs: {
        enabled: true,
        commands: true,
        directEmotes: true,
        automaticActions: true,
        deniedAttempts: true,
        errors: true,
        includeArguments: true,
        storeHistory: true,
      },
      commands: { logModes: {} },
    },
    getBotAdmins: () => ["saved-admin"],
    addActionLog(entry) {
      const record = { createdAt: new Date().toISOString(), ...entry }
      history.push(record)
      return record
    },
  }
  const service = new AdminLogService(
    bot,
    store,
    { isAdmin: (id) => adminIds.has(id) },
    { adminIds: ["env-admin", "ordinary-user"] },
  )
  return { service, whispers, publicMessages, history, store }
}

test("les logs partent uniquement au propriétaire et aux admins, toujours en whisper", async () => {
  const { service, whispers, publicMessages, history } = createFixture()
  await service.recordCommand({
    user: { id: "player", username: "Player" },
    command: { name: "teleport", category: "Highrise" },
    rawArgs: "@Bob @Alice",
    source: "chat",
    prefix: "!",
    status: "completed",
    durationMs: 12,
  })

  assert.deepEqual(whispers.map(([id]) => id).sort(), ["env-admin", "owner", "saved-admin"])
  assert.equal(publicMessages.length, 0)
  assert.equal(history.length, 1)
  assert.match(whispers[0][1], /LOG ADMIN · COMMANDE/)
})

test("les codes de confirmation des tips sont masqués dans les logs", async () => {
  const { service, history } = createFixture()
  await service.recordCommand({
    user: { id: "admin", username: "Admin" },
    command: { name: "tip", category: "Économie HR" },
    rawArgs: "confirm ABC123",
    source: "whisper",
    prefix: "!",
    status: "completed",
    durationMs: 5,
  })

  assert.equal(history[0].arguments, "confirm [code masqué]")
  assert.doesNotMatch(history[0].arguments, /ABC123/)
})

test("un log désactivé pour une commande n’est ni stocké ni envoyé", async () => {
  const { service, whispers, history, store } = createFixture()
  store.settings.commands.logModes.tip = false
  await service.recordCommand({
    user: { id: "admin", username: "Admin" },
    command: { name: "tip", category: "Économie HR" },
    rawArgs: "@Bob 5",
    source: "chat",
    prefix: "!",
    status: "completed",
    durationMs: 1,
  })

  assert.equal(history.length, 0)
  assert.equal(whispers.length, 0)
})
