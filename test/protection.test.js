const test = require("node:test")
const assert = require("node:assert/strict")

const Protection = require("../src/core/Protection")

test("le message d’accueil utilise le préfixe modifié en jeu", async () => {
  const messages = []
  const store = {
    settings: {
      commands: { prefix: "?" },
      welcome: {
        enabled: true,
        message: "Bienvenue @{user}, tape {prefix}help.",
      },
    },
    rememberUser() {},
  }
  const protection = new Protection(
    { message: { send: async (message) => messages.push(message) } },
    store,
    { isModerator: async () => false },
  )

  await protection.handleJoin({ id: "u1", username: "Jessy" })
  assert.deepEqual(messages, ["Bienvenue @Jessy, tape ?help."])
})

test("les sanctions automatiques notifient la cible et les admins sans message public", async () => {
  const publicMessages = []
  const whispers = []
  const adminEntries = []
  const moderationEntries = []
  const warnings = []
  const store = {
    settings: {
      wordFilter: { enabled: true, words: ["bloqué"], muteSeconds: 60 },
      antiSpam: { enabled: false },
      warnLimit: 3,
    },
    rememberUser() {},
    findBlockedWord: () => "bloqué",
    addWarning: (...args) => warnings.push(args),
    getWarnings: () => warnings,
    addModerationLog: (entry) => moderationEntries.push(entry),
  }
  const bot = {
    message: { send: async (message) => publicMessages.push(message) },
    whisper: { send: async (...args) => whispers.push(args) },
    player: { moderation: { mute: async () => ({ ok: true }) } },
  }
  const protection = new Protection(
    bot,
    store,
    { isModerator: async () => false },
    { recordAutomatic: async (entry) => adminEntries.push(entry) },
  )

  const blocked = await protection.handleMessage(
    { id: "u1", username: "User" },
    { content: "message bloqué" },
  )

  assert.equal(blocked, true)
  assert.equal(publicMessages.length, 0)
  assert.equal(whispers[0][0], "u1")
  assert.equal(adminEntries.length, 1)
  assert.equal(moderationEntries.length, 1)
})
