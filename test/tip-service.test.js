const test = require("node:test")
const assert = require("node:assert/strict")

const TipService = require("../src/core/TipService")

function createFixture(overrides = {}) {
  const calls = []
  const logs = []
  const settings = {
    enabled: true,
    maxPerTip: 100,
    dailyLimit: 500,
    perAdminDailyLimit: 500,
    perRecipientDailyLimit: 250,
    confirmationSeconds: 60,
    splitEnabled: true,
    bulkEnabled: false,
    bulkMaxRecipients: 20,
    sendDelayMs: 100,
    ...overrides,
  }
  const store = {
    settings: { tips: settings },
    getTippedAmountSince: () => overrides.spent || 0,
    addTipLog(entry) {
      const record = { createdAt: new Date().toISOString(), ...entry }
      logs.push(record)
      return record
    },
  }
  const bot = {
    metadata: { botId: "bot" },
    inventory: { wallet: { get: async () => ({ ok: true, gold: 1000 }) } },
    player: {
      tip: async (...args) => {
        calls.push(args)
        return { ok: true, result: "success" }
      },
    },
  }
  const service = new TipService(bot, store)
  return { service, calls, logs, settings }
}

test("un tip exige un code puis débite uniquement après confirmation", async () => {
  const { service, calls, logs } = createFixture()
  const actor = { id: "admin", username: "Admin" }
  const target = { id: "target", username: "Target" }

  const request = await service.request(actor, target, 50)
  assert.equal(request.ok, true)
  assert.equal(calls.length, 0)

  const confirmation = await service.confirm(actor, request.code)
  assert.equal(confirmation.ok, true)
  assert.deepEqual(calls, [["target", 50]])
  assert.equal(logs[0].amount, 50)
  assert.equal(logs[0].success, true)
})

test("les tips désactivés et les dépassements de plafond sont refusés", async () => {
  const disabled = createFixture({ enabled: false }).service
  const actor = { id: "admin", username: "Admin" }
  const target = { id: "target", username: "Target" }
  assert.equal((await disabled.request(actor, target, 10)).ok, false)

  const limited = createFixture({ maxPerTip: 10, dailyLimit: 20, spent: 15 }).service
  const result = await limited.request(actor, target, 10)
  assert.equal(result.ok, false)
  assert.match(result.error, /quotidien/)
})

test("seules les coupures Highrise valides sont acceptées", async () => {
  const { service } = createFixture()
  const result = await service.request(
    { id: "admin", username: "Admin" },
    { id: "target", username: "Target" },
    3,
  )
  assert.equal(result.ok, false)
  assert.match(result.error, /Montants acceptés/)
})

test("les confirmations simultanées respectent encore le plafond quotidien", async () => {
  let spent = 0
  const calls = []
  const store = {
    settings: {
      tips: { enabled: true, maxPerTip: 50, dailyLimit: 50, confirmationSeconds: 60 },
    },
    getTippedAmountSince: () => spent,
    addTipLog(entry) {
      if (entry.success) spent += entry.amount
      return { createdAt: new Date().toISOString(), ...entry }
    },
  }
  const bot = {
    metadata: { botId: "bot" },
    inventory: { wallet: { get: async () => ({ ok: true, gold: 1000 }) } },
    player: {
      tip: async (...args) => {
        calls.push(args)
        return { ok: true, result: "success" }
      },
    },
  }
  const service = new TipService(bot, store)
  const first = { id: "admin-1", username: "Admin1" }
  const second = { id: "admin-2", username: "Admin2" }
  const target = { id: "target", username: "Target" }
  const request1 = await service.request(first, target, 50)
  const request2 = await service.request(second, target, 50)

  const results = await Promise.all([
    service.confirm(first, request1.code),
    service.confirm(second, request2.code),
  ])

  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(calls.length, 1)
  assert.equal(spent, 50)
})

test("un tip fractionné envoie exactement les coupures nécessaires après confirmation", async () => {
  const { service, calls, logs } = createFixture({ maxPerTip: 100, sendDelayMs: 100 })
  const actor = { id: "admin", username: "Admin" }
  const target = { id: "target", username: "Target" }

  const request = await service.requestSplit(actor, target, 15)
  assert.equal(request.ok, true)
  const result = await service.confirm(actor, request.code)

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [["target", 10], ["target", 5]])
  assert.equal(logs[0].sentAmount, 15)
  assert.equal(logs[0].kind, "split")
})

test("un tip collectif reste désactivé par défaut puis respecte le maximum de destinataires", async () => {
  const actor = { id: "admin", username: "Admin" }
  const targets = [
    { id: "one", username: "One" },
    { id: "two", username: "Two" },
  ]
  const disabled = createFixture().service
  assert.equal((await disabled.requestBulk(actor, targets, 5)).ok, false)

  const { service, calls, logs } = createFixture({
    bulkEnabled: true,
    bulkMaxRecipients: 2,
    maxPerTip: 10,
    sendDelayMs: 100,
  })
  const request = await service.requestBulk(actor, targets, 5)
  assert.equal(request.ok, true)
  const result = await service.confirm(actor, request.code)

  assert.equal(result.ok, true)
  assert.equal(result.successCount, 2)
  assert.deepEqual(calls, [["one", 5], ["two", 5]])
  assert.equal(logs.length, 2)
})

test("les plafonds par admin et par destinataire sont contrôlés séparément", async () => {
  const settings = {
    enabled: true,
    maxPerTip: 100,
    dailyLimit: 1000,
    perAdminDailyLimit: 100,
    perRecipientDailyLimit: 50,
    confirmationSeconds: 60,
    splitEnabled: true,
    bulkEnabled: false,
    bulkMaxRecipients: 20,
    sendDelayMs: 100,
  }
  const store = {
    settings: { tips: settings },
    getTippedAmountSince(_timestamp, filters = {}) {
      if (filters.actorId === "limited-admin") return 90
      if (filters.targetId === "limited-target") return 45
      return 90
    },
    addTipLog: (entry) => entry,
  }
  const bot = {
    metadata: { botId: "bot" },
    inventory: { wallet: { get: async () => ({ ok: true, gold: 1000 }) } },
    player: { tip: async () => ({ ok: true, result: "success" }) },
  }
  const service = new TipService(bot, store)

  const actorLimited = await service.request(
    { id: "limited-admin", username: "Admin" },
    { id: "target", username: "Target" },
    50,
  )
  assert.equal(actorLimited.ok, false)
  assert.match(actorLimited.error, /administration/)

  const recipientLimited = await service.request(
    { id: "other-admin", username: "Other" },
    { id: "limited-target", username: "Limited" },
    10,
  )
  assert.equal(recipientLimited.ok, false)
  assert.match(recipientLimited.error, /@Limited/)
})
