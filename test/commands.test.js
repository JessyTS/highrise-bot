const test = require("node:test")
const assert = require("node:assert/strict")

const CommandRouter = require("../src/core/CommandRouter")
const createGeneralCommands = require("../src/commands/general")
const createEmoteCommands = require("../src/commands/emotes")
const createModerationCommands = require("../src/commands/moderation")
const createAdminCommands = require("../src/commands/admin")
const createHighriseCommands = require("../src/commands/highrise")
const createConfigurationCommands = require("../src/commands/configuration")
const createEconomyCommands = require("../src/commands/economy")
const createLogCommands = require("../src/commands/logs")

test("toutes les commandes et aliases s'enregistrent sans collision", () => {
  const bot = {
    whisper: { send: async () => ({ ok: true }) },
    message: { send: async () => ({ ok: true }) },
  }
  const config = { prefix: "!", commandCooldownMs: 2500 }
  const permissions = { check: async () => true }
  const router = new CommandRouter(bot, config, permissions)

  router.registerMany([
    ...createGeneralCommands(),
    ...createEmoteCommands(),
    ...createModerationCommands(),
    ...createAdminCommands(),
    ...createHighriseCommands(),
    ...createConfigurationCommands(),
    ...createEconomyCommands(),
    ...createLogCommands(),
  ])

  assert.ok(router.commands.size >= 65)
  assert.equal(router.getCommand("aide").name, "help")
  assert.equal(router.getCommand("tp").name, "teleport")
  assert.equal(router.getCommand("eall").name, "emoteall")
  assert.equal(router.getCommand("portefeuille").name, "wallet")
  assert.equal(router.getCommand("tenue").name, "outfit")
  assert.equal(router.getCommand("setup").name, "config")
  assert.equal(router.getCommand("pourboire").name, "tip")
  assert.equal(router.getCommand("botlog").name, "actionlog")
  assert.equal(router.getCommand("emotebot").name, "botemote")
})

test("les politiques ne peuvent qu’augmenter la permission minimale", () => {
  const store = {
    settings: {
      commands: {
        permissions: { secure: "everyone", public: "admin" },
      },
    },
  }
  const router = new CommandRouter(
    { whisper: { send: async () => ({ ok: true }) }, message: { send: async () => ({ ok: true }) } },
    { prefix: "!", commandCooldownMs: 0 },
    { check: async () => true },
    { store },
  )
  router.register({ name: "secure", permission: "admin", execute() {} })
  router.register({ name: "public", permission: "everyone", execute() {} })

  assert.equal(router.getEffectivePermission(router.getCommand("secure")), "admin")
  assert.equal(router.getEffectivePermission(router.getCommand("public")), "admin")
})

test("les messages privés utilisent l'ordre userId puis message du SDK", async () => {
  const calls = []
  const bot = {
    whisper: {
      send: async (...args) => {
        calls.push(args)
        return { ok: true }
      },
    },
    message: { send: async () => ({ ok: true }) },
  }
  const router = new CommandRouter(
    bot,
    { prefix: "!", commandCooldownMs: 2500 },
    { check: async () => true },
  )

  await router.sendPrivate("user-id", "Bonjour")
  assert.deepEqual(calls, [["user-id", "Bonjour"]])
})

test("le routeur utilise immédiatement un préfixe modifié en jeu", async () => {
  const messages = []
  const config = { prefix: "!", commandCooldownMs: 0 }
  const bot = {
    whisper: { send: async () => ({ ok: true }) },
    message: {
      send: async (message) => {
        messages.push(message)
        return { ok: true }
      },
    },
  }
  const router = new CommandRouter(bot, config, { check: async () => true })
  router.register({
    name: "test",
    cooldownMs: 0,
    async execute(ctx) {
      await ctx.reply("ok")
    },
  })

  config.prefix = "?"
  assert.equal(await router.handle({ id: "u1" }, { content: "!test" }), false)
  assert.equal(await router.handle({ id: "u1" }, { content: "?test" }), true)
  assert.deepEqual(messages, ["ok"])
})

test("la configuration peut désactiver une commande sans toucher aux commandes essentielles", async () => {
  let executed = 0
  const whispers = []
  const store = {
    settings: {
      commands: {
        disabled: ["test"],
        disabledCategories: [],
        cooldowns: {},
        replyModes: {},
      },
    },
  }
  const bot = {
    whisper: { send: async (id, message) => { whispers.push([id, message]); return { ok: true } } },
    message: { send: async () => ({ ok: true }) },
  }
  const router = new CommandRouter(
    bot,
    { prefix: "!", commandCooldownMs: 0 },
    { check: async () => true },
    { store },
  )
  router.register({ name: "test", cooldownMs: 0, async execute() { executed += 1 } })
  router.register({ name: "help", cooldownMs: 0, async execute() { executed += 1 } })

  await router.handle({ id: "u1" }, { content: "!test" })
  await router.handle({ id: "u1" }, { content: "!help" })
  assert.equal(executed, 1)
  assert.match(whispers[0][1], /désactivée/)
})

test("le mode private s’applique automatiquement à une commande", async () => {
  const publicMessages = []
  const whispers = []
  const store = {
    settings: {
      commands: {
        disabled: [],
        disabledCategories: [],
        cooldowns: { test: 0 },
        replyModes: { test: "private" },
      },
    },
  }
  const bot = {
    whisper: { send: async (id, message) => { whispers.push([id, message]); return { ok: true } } },
    message: { send: async (message) => { publicMessages.push(message); return { ok: true } } },
  }
  const router = new CommandRouter(
    bot,
    { prefix: "!", commandCooldownMs: 2500 },
    { check: async () => true },
    { store },
  )
  router.register({ name: "test", async execute(ctx) { await ctx.reply("réponse") } })

  await router.handle({ id: "u1", username: "User" }, { content: "!test" })
  assert.equal(publicMessages.length, 0)
  assert.deepEqual(whispers, [["u1", "réponse"]])
})

test("le routeur journalise les commandes terminées et les refus", async () => {
  const logs = []
  const store = {
    settings: {
      commands: {
        disabled: [],
        disabledCategories: [],
        cooldowns: {},
        cooldownScopes: {},
        replyModes: {},
        permissions: {},
        logModes: {},
      },
    },
  }
  let allowed = true
  const router = new CommandRouter(
    {
      whisper: { send: async () => ({ ok: true }) },
      message: { send: async () => ({ ok: true }) },
    },
    { prefix: "!", commandCooldownMs: 0 },
    {
      check: async () => allowed,
      isAdmin: () => false,
    },
    {
      store,
      adminLogs: {
        shouldRecord: () => true,
        recordCommand: async (entry) => logs.push(entry),
      },
    },
  )
  router.register({
    name: "test",
    permission: "moderator",
    cooldownMs: 0,
    async execute(ctx) { await ctx.reply("Action réussie") },
  })

  await router.handle({ id: "u1", username: "User" }, { content: "!test ok" })
  allowed = false
  await router.handle({ id: "u2", username: "Other" }, { content: "!test" })

  assert.equal(logs[0].status, "completed")
  assert.equal(logs[0].details, "Action réussie")
  assert.equal(logs[1].status, "denied")
})
