const test = require("node:test")
const assert = require("node:assert/strict")

const createHighriseCommands = require("../src/commands/highrise")
const createEmoteCommands = require("../src/commands/emotes")
const createConfigurationCommands = require("../src/commands/configuration")

function commandNamed(commands, name) {
  const command = commands.find((item) => item.name === name)
  assert.ok(command, `Commande ${name} introuvable`)
  return command
}

test("wallet affiche uniquement le portefeuille du bot en privé", async () => {
  const replies = []
  const wallet = commandNamed(createHighriseCommands(), "wallet")
  await wallet.execute({
    bot: {
      inventory: {
        wallet: {
          get: async () => ({ ok: true, gold: 1234, boostToken: 5, voiceToken: 2 }),
        },
      },
    },
    privateReply: async (message) => replies.push(message),
  })

  assert.match(replies[0], /1[\s\u202f]?234/)
  assert.match(replies[0], /Jetons boost : 5/)
  assert.match(replies[0], /Jetons vocal : 2/)
})

test("tp téléporte un utilisateur vers la position d’un autre", async () => {
  const calls = []
  const replies = []
  const users = {
    Bob: { id: "bob", username: "Bob", position: { x: 1, y: 0, z: 2, facing: "FrontRight" } },
    Alice: { id: "alice", username: "Alice", position: { x: 8, y: 1, z: 9, facing: "BackLeft" } },
  }
  const teleport = commandNamed(createHighriseCommands(), "teleport")

  await teleport.execute({
    args: ["@Bob", "@Alice"],
    user: { id: "moderator", username: "Moderator" },
    resolver: {
      resolve: async (identifier) => users[String(identifier).replace(/^@/, "")] || null,
    },
    permissions: { canModerate: async () => ({ allowed: true }) },
    store: { getPosition: () => null },
    bot: {
      metadata: { botId: "bot" },
      player: {
        teleport: async (...args) => {
          calls.push(args)
          return { ok: true }
        },
      },
    },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  })

  assert.deepEqual(calls, [["bob", 8, 1, 9, "BackLeft"]])
  assert.match(replies.at(-1), /@Bob.*@Alice/)
})

test("outfit inspecte la tenue d’un utilisateur présent", async () => {
  const replies = []
  const outfit = commandNamed(createHighriseCommands(), "outfit")
  await outfit.execute({
    args: ["@Bob"],
    user: { id: "moderator", username: "Moderator" },
    resolver: {
      resolve: async () => ({ id: "bob", username: "Bob" }),
    },
    bot: {
      metadata: { botId: "bot" },
      player: {
        outfit: {
          get: async () => ({
            ok: true,
            outfit: [{ id: "shirt-test", active_palette: 4 }],
          }),
        },
      },
      inventory: { outfit: { get: async () => ({ ok: true, outfit: [] }) } },
    },
    privateReply: async (message) => replies.push(message),
  })

  assert.match(replies[0], /Tenue de @Bob/)
  assert.match(replies[0], /shirt-test.*palette 4/)
})

test("botmove sauvegarde immédiatement la position permanente du bot", async () => {
  const saved = []
  const calls = []
  const replies = []
  const command = commandNamed(createHighriseCommands(), "botmove")

  await command.execute({
    args: ["12", "1", "8", "fl"],
    user: { id: "admin", username: "Admin" },
    store: {
      getPosition: () => null,
      setPersistentBotPosition: (...args) => saved.push(args),
    },
    bot: {
      metadata: { botId: "bot-1" },
      player: {
        teleport: async (...args) => {
          calls.push(args)
          return { ok: true }
        },
      },
    },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  })

  assert.deepEqual(calls, [["bot-1", 12, 1, 8, "FrontLeft"]])
  assert.equal(saved[0][0].type, "floor")
  assert.equal(saved[0][0].x, 12)
  assert.equal(saved[0][1].id, "admin")
  assert.match(replies[0], /sauvegardée/i)
})

test("sit sauvegarde aussi la position permanente sur une ancre", async () => {
  const saved = []
  const command = commandNamed(createHighriseCommands(), "sit")

  await command.execute({
    args: ["chair-42", "2"],
    user: { id: "admin", username: "Admin" },
    store: { setPersistentBotPosition: (position) => saved.push(position) },
    bot: { player: { sit: async () => ({ ok: true }) } },
    config: { prefix: "!" },
    privateReply: async () => {},
    reply: async () => {},
  })

  assert.deepEqual(saved, [{ type: "anchor", entityId: "chair-42", anchorIndex: 2 }])
})

test("botemote enregistre l’emote permanente et stop la supprime", async () => {
  const emote = { id: "emote-vibing", name: "Just Vibing", duration: 12.32 }
  const saved = []
  let cleared = 0
  const replies = []
  const command = commandNamed(createEmoteCommands(), "botemote")
  const base = {
    user: { id: "admin", username: "Admin" },
    bot: {
      metadata: { botId: "bot-1" },
      emotes: {
        getAll: () => [emote],
        getByIndex: () => emote,
      },
      looper: {
        start: async () => emote,
        stop: () => emote,
      },
    },
    store: {
      setPersistentBotEmote: (...args) => saved.push(args),
      clearPersistentBotEmote: () => { cleared += 1; return true },
    },
    config: { prefix: "!" },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  }

  await command.execute({ ...base, args: ["1"], rawArgs: "1" })
  await command.execute({ ...base, args: ["stop"], rawArgs: "stop" })

  assert.equal(saved[0][0].id, "emote-vibing")
  assert.equal(saved[0][1].id, "admin")
  assert.equal(cleared, 1)
  assert.match(replies[0], /même après redémarrage/)
})

test("la commande emote visant bot devient automatiquement permanente", async () => {
  const emote = { id: "emote-vibing", name: "Just Vibing", duration: 12.32 }
  const saved = []
  let oneShotCalls = 0
  const replies = []
  const command = commandNamed(createEmoteCommands(), "emote")

  await command.execute({
    args: ["1", "bot"],
    rawArgs: "1 bot",
    user: { id: "admin", username: "Admin" },
    permissions: { isAdmin: () => true },
    bot: {
      metadata: { botId: "bot-1" },
      emotes: {
        getAll: () => [emote],
        getByIndex: () => emote,
      },
      looper: { start: async () => emote },
      player: { emote: async () => { oneShotCalls += 1; return { ok: true } } },
    },
    store: { setPersistentBotEmote: (value) => saved.push(value) },
    resolver: { resolve: async () => null },
    config: { prefix: "!" },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  })

  assert.equal(saved[0].id, "emote-vibing")
  assert.equal(oneShotCalls, 0)
  assert.match(replies[0], /en permanence/)
})

test("config change le préfixe immédiatement et le sauvegarde", async () => {
  const replies = []
  const settings = {
    commands: { prefix: "!", directEmotes: true },
    welcome: { enabled: true, message: "Bienvenue" },
    antiSpam: { enabled: false, maxMessages: 7, windowMs: 8000, muteSeconds: 60 },
    wordFilter: { enabled: false, muteSeconds: 60, words: [] },
    warnLimit: 3,
  }
  const store = {
    settings,
    setSetting(section, key, value) {
      settings[section][key] = value
    },
    listPositions: () => [],
    listOutfitPresets: () => [],
  }
  const config = { prefix: "!" }
  const command = commandNamed(createConfigurationCommands(), "config")

  await command.execute({
    args: ["prefix", "?"],
    user: { id: "admin" },
    permissions: { isAdmin: () => true },
    store,
    config,
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  })

  assert.equal(config.prefix, "?")
  assert.equal(settings.commands.prefix, "?")
  assert.match(replies[0], /\?help/)
})

test("config protège les réglages sensibles des simples modérateurs", async () => {
  const replies = []
  const command = commandNamed(createConfigurationCommands(), "config")
  const config = { prefix: "!" }

  await command.execute({
    args: ["prefix", "?"],
    user: { id: "moderator" },
    permissions: { isAdmin: () => false },
    store: {},
    config,
    privateReply: async (message) => replies.push(message),
  })

  assert.equal(config.prefix, "!")
  assert.match(replies[0], /réservé/)
})

test("config ajuste le moteur de boucles d’emotes à chaud", async () => {
  const replies = []
  const command = commandNamed(createConfigurationCommands(), "config")
  const settings = {
    emoteLoops: {
      transitionLeadMs: 250,
      minimumIntervalMs: 800,
      retryDelayMs: 1200,
      maxConsecutiveErrors: 3,
    },
  }
  const store = {
    settings,
    setSetting(section, key, value) { settings[section][key] = value },
  }
  const base = {
    user: { id: "admin" },
    permissions: { isAdmin: () => true },
    store,
    bot: { looper: { activeCount: 2 } },
    config: { prefix: "!" },
    privateReply: async (message) => replies.push(message),
  }

  await command.execute({ ...base, args: ["emote-loop", "lead", "350"] })
  await command.execute({ ...base, args: ["emote-loop", "retry", "900"] })
  await command.execute({ ...base, args: ["emote-loop", "status"] })

  assert.equal(settings.emoteLoops.transitionLeadMs, 350)
  assert.equal(settings.emoteLoops.retryDelayMs, 900)
  assert.match(replies.at(-1), /Boucles actives : 2/)
})

test("config peut désactiver et personnaliser chaque commande", async () => {
  const replies = []
  const command = commandNamed(createConfigurationCommands(), "config")
  const ping = { name: "ping", category: "Général", permission: "everyone", cooldownMs: 1000 }
  const settings = {
    commands: {
      disabled: [],
      disabledCategories: [],
      cooldowns: {},
      cooldownScopes: {},
      replyModes: {},
      permissions: {},
      logModes: {},
    },
  }
  const store = {
    settings,
    setSetting(section, key, value) { settings[section][key] = value },
  }
  const router = {
    getCommand: (name) => name === "ping" ? ping : null,
    isCommandEnabled: (target) => !settings.commands.disabled.includes(target.name),
    getCooldown: (target) => settings.commands.cooldowns[target.name] ?? target.cooldownMs,
    getReplyMode: (target) => settings.commands.replyModes[target.name] || "auto",
  }
  const base = {
    user: { id: "admin" },
    permissions: { isAdmin: () => true },
    store,
    router,
    config: { prefix: "!" },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  }

  await command.execute({ ...base, args: ["command", "ping", "off"] })
  await command.execute({ ...base, args: ["command", "ping", "cooldown", "12"] })
  await command.execute({ ...base, args: ["command", "ping", "reply", "private"] })
  await command.execute({ ...base, args: ["command", "ping", "scope", "global"] })
  await command.execute({ ...base, args: ["command", "ping", "permission", "admin"] })
  await command.execute({ ...base, args: ["command", "ping", "log", "off"] })

  assert.deepEqual(settings.commands.disabled, ["ping"])
  assert.equal(settings.commands.cooldowns.ping, 12000)
  assert.equal(settings.commands.replyModes.ping, "private")
  assert.equal(settings.commands.cooldownScopes.ping, "global")
  assert.equal(settings.commands.permissions.ping, "admin")
  assert.equal(settings.commands.logModes.ping, false)
})

test("config refuse d’abaisser la permission native d’une commande sensible", async () => {
  const replies = []
  const command = commandNamed(createConfigurationCommands(), "config")
  const sensitive = { name: "wallet", category: "Économie HR", permission: "admin", cooldownMs: 1000 }
  const settings = { commands: { permissions: {} } }
  const store = {
    settings,
    setSetting(section, key, value) { settings[section][key] = value },
  }

  await command.execute({
    args: ["command", "wallet", "permission", "everyone"],
    user: { id: "admin" },
    permissions: { isAdmin: () => true },
    store,
    router: { getCommand: () => sensitive },
    config: { prefix: "!" },
    privateReply: async (message) => replies.push(message),
    reply: async (message) => replies.push(message),
  })

  assert.deepEqual(settings.commands.permissions, {})
  assert.match(replies[0], /permission minimale/)
})
