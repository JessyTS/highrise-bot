const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const StateStore = require("../src/core/StateStore")

const defaults = {
  commands: {
    prefix: "!",
    directEmotes: true,
    disabled: [],
    disabledCategories: [],
    cooldowns: {},
    cooldownScopes: {},
    replyModes: {},
    permissions: {},
    logModes: {},
  },
  emoteLoops: {
    transitionLeadMs: 250,
    minimumIntervalMs: 800,
    retryDelayMs: 1200,
    maxConsecutiveErrors: 3,
  },
  tips: {
    enabled: false,
    maxPerTip: 100,
    dailyLimit: 500,
    perAdminDailyLimit: 500,
    perRecipientDailyLimit: 250,
    confirmationSeconds: 60,
    splitEnabled: true,
    bulkEnabled: false,
    bulkMaxRecipients: 20,
    sendDelayMs: 400,
  },
  adminLogs: {
    enabled: true,
    commands: true,
    directEmotes: true,
    automaticActions: true,
    deniedAttempts: true,
    errors: true,
    includeArguments: true,
    storeHistory: true,
    maxHistory: 2000,
  },
  actions: { bulkMaxUsers: 200, bulkDelayMs: 400 },
  events: {
    enabled: true,
    public: true,
    whisper: true,
    emoteCooldownMs: 15000,
    types: { join: true, leave: true, emote: true, tip: true, moderation: true },
  },
  welcome: { enabled: true, message: "Bienvenue @{user}" },
  antiSpam: { enabled: false, maxMessages: 7, windowMs: 8000, muteSeconds: 60 },
  wordFilter: { enabled: false, muteSeconds: 60, words: [] },
  warnLimit: 3,
}

test("StateStore conserve les avertissements, réglages et admins", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-state-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    const target = { id: "user-12345678", username: "Target" }
    const moderator = { id: "mod-12345678", username: "Moderator" }

    store.addWarning(target, moderator, "Test")
    store.setSetting("welcome", "enabled", false)
    store.setSetting("commands", "cooldowns", { teleport: 5000 })
    store.setSetting("commands", "replyModes", { wallet: "private" })
    store.addBotAdmin(target.id)
    store.addBlockedWord("mot interdit")
    store.save()

    const reloaded = new StateStore(file, defaults)
    assert.equal(reloaded.getWarnings(target.id).length, 1)
    assert.equal(reloaded.settings.welcome.enabled, false)
    assert.equal(reloaded.settings.commands.cooldowns.teleport, 5000)
    assert.equal(reloaded.settings.commands.replyModes.wallet, "private")
    assert.deepEqual(reloaded.getBotAdmins(), [target.id])
    assert.equal(reloaded.findBlockedWord("Voici un mot interdit ici"), "mot interdit")
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("Le filtre n'assimile pas un fragment à un mot complet", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-filter-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    store.addBlockedWord("test")
    assert.equal(store.findBlockedWord("un test simple"), "test")
    assert.equal(store.findBlockedWord("testing"), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("StateStore conserve les points TP et les tenues enregistrées", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-presets-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    const actor = { id: "admin-1", username: "Admin" }
    store.savePosition("Zone VIP", { x: 12, y: 1.5, z: 8, facing: "FrontLeft" }, actor)
    store.saveOutfitPreset(
      "Rouge",
      [{ id: "shirt-test", type: "clothing", amount: 1, active_palette: 3 }],
      actor,
    )
    store.save()

    const reloaded = new StateStore(file, defaults)
    assert.equal(reloaded.getPosition("zone vip").x, 12)
    assert.equal(reloaded.listPositions()[0].name, "Zone VIP")
    assert.equal(reloaded.getOutfitPreset("rouge").items[0].active_palette, 3)
    assert.equal(reloaded.removePosition("Zone VIP"), true)
    assert.equal(reloaded.removeOutfitPreset("Rouge"), true)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("StateStore conserve la position et l’emote permanentes du bot après redémarrage", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-bot-state-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    const admin = { id: "admin-1", username: "Admin" }
    store.setPersistentBotPosition(
      { type: "floor", x: 10, y: 1, z: 5, facing: "BackLeft" },
      admin,
    )
    store.setPersistentBotEmote(
      { id: "emote-vibing", name: "Just Vibing", duration: 12.32 },
      admin,
    )

    const reloaded = new StateStore(file, defaults)
    assert.equal(reloaded.getPersistentBotPosition().x, 10)
    assert.equal(reloaded.getPersistentBotPosition().facing, "BackLeft")
    assert.equal(reloaded.getPersistentBotEmote().id, "emote-vibing")

    reloaded.setPersistentBotPosition(
      { type: "anchor", entityId: "chair-1", anchorIndex: 3 },
      admin,
    )
    assert.equal(reloaded.getPersistentBotPosition().type, "anchor")
    assert.equal(reloaded.clearPersistentBotEmote(), true)
    assert.equal(reloaded.getPersistentBotEmote(), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("StateStore réinitialise les réglages sans supprimer les données du bot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-settings-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    store.setSetting("commands", "prefix", "?")
    store.setRootSetting("warnLimit", 9)
    store.savePosition("Accueil", { x: 1, y: 0, z: 2, facing: "FrontRight" })

    assert.equal(store.resetSetting("commands"), true)
    assert.equal(store.settings.commands.prefix, "!")
    store.resetAllSettings()
    assert.equal(store.settings.warnLimit, 3)
    assert.equal(store.getPosition("Accueil").x, 1)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("StateStore conserve les tips et calcule uniquement les envois réussis", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-tips-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    store.addTipLog({ actorId: "admin", targetId: "user", amount: 50, success: true })
    store.addTipLog({ actorId: "admin", targetId: "user", amount: 100, success: false })
    store.save()

    const reloaded = new StateStore(file, defaults)
    assert.equal(reloaded.getTipLog().length, 2)
    assert.equal(reloaded.getTippedAmountSince(0), 50)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("StateStore conserve et filtre le journal privé des actions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "highrise-actions-"))
  const file = path.join(directory, "state.json")

  try {
    const store = new StateStore(file, defaults)
    store.addActionLog({ type: "command", command: "tip", actorId: "admin-1", status: "completed" })
    store.addActionLog({ type: "command", command: "teleport", actorId: "admin-2", status: "denied" })
    store.save()

    const reloaded = new StateStore(file, defaults)
    assert.equal(reloaded.getActionLog().length, 2)
    assert.equal(reloaded.getActionLog({ actorId: "admin-1" })[0].command, "tip")
    assert.equal(reloaded.clearActionLog(), 2)
    assert.equal(reloaded.getActionLog().length, 0)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
