const test = require("node:test")
const assert = require("node:assert/strict")

const PersistentBotState = require("../src/core/PersistentBotState")

test("la position au sol et l’emote permanentes sont restaurées au démarrage", async () => {
  const calls = []
  const logs = []
  const emote = { id: "emote-vibing", name: "Just Vibing", duration: 12.32 }
  const bot = {
    player: {
      teleport: async (...args) => {
        calls.push(["teleport", ...args])
        return { ok: true }
      },
    },
    emotes: { getById: (id) => id === emote.id ? emote : null },
    looper: {
      start: async (...args) => {
        calls.push(["emote", ...args])
        return emote
      },
    },
  }
  const store = {
    getPersistentBotPosition: () => ({
      type: "floor",
      x: 12,
      y: 1,
      z: 8,
      facing: "FrontLeft",
    }),
    getPersistentBotEmote: () => emote,
  }
  const service = new PersistentBotState(bot, store, {
    recordAutomatic: async (entry) => logs.push(entry),
  })

  const restored = await service.restore({ botId: "bot-1" })

  assert.equal(restored.position, "restored")
  assert.equal(restored.emote, "restored")
  assert.deepEqual(calls[0], ["teleport", "bot-1", 12, 1, 8, "FrontLeft"])
  assert.deepEqual(calls[1], ["emote", { id: "bot-1", username: "Bot" }, "emote-vibing"])
  assert.equal(logs[0].status, "success")
})

test("une position assise permanente est restaurée avec son ancre", async () => {
  const calls = []
  const service = new PersistentBotState(
    {
      player: {
        sit: async (...args) => {
          calls.push(args)
          return { ok: true }
        },
      },
      emotes: { getById: () => null },
      looper: { start: async () => null },
    },
    {
      getPersistentBotPosition: () => ({
        type: "anchor",
        entityId: "chair-42",
        anchorIndex: 2,
      }),
      getPersistentBotEmote: () => null,
    },
  )

  const restored = await service.restore({ botId: "bot-1" })

  assert.equal(restored.position, "restored")
  assert.deepEqual(calls, [["chair-42", 2]])
})

test("une restauration impossible reste enregistrée pour une prochaine reconnexion", async () => {
  const logs = []
  const service = new PersistentBotState(
    {
      player: { teleport: async () => ({ ok: false, error: "room indisponible" }) },
      emotes: { getById: () => null },
      looper: { start: async () => null },
    },
    {
      getPersistentBotPosition: () => ({
        type: "floor",
        x: 2,
        y: 0,
        z: 4,
        facing: "FrontRight",
      }),
      getPersistentBotEmote: () => ({ id: "missing", name: "Missing" }),
    },
    { recordAutomatic: async (entry) => logs.push(entry) },
  )

  const restored = await service.restore({ botId: "bot-1" })

  assert.equal(restored.position, "failed")
  assert.equal(restored.emote, "failed")
  assert.equal(restored.errors.length, 2)
  assert.equal(logs[0].status, "failed")
})
