const test = require("node:test")
const assert = require("node:assert/strict")

const DirectEmoteController = require("../src/core/DirectEmoteController")

function createFixture(options = {}) {
  const emotes = [
    { name: "Rest", id: "sit-idle-cute", duration: 17.06 },
    { name: "Just Vibing!", id: "emote-vibing", duration: 12.32 },
  ]
  const calls = { start: [], stop: [], whispers: [] }
  const bot = {
    emotes: {
      getAll: () => emotes,
      getByIndex: (index) => emotes[index] || null,
    },
    looper: {
      start: async (user, emoteId) => {
        calls.start.push([user.id, emoteId])
        return emotes.find((emote) => emote.id === emoteId)
      },
      stop: (userId) => {
        calls.stop.push(userId)
        return emotes[0]
      },
    },
    whisper: {
      send: async (...args) => {
        calls.whispers.push(args)
        return { ok: true }
      },
    },
  }

  return {
    controller: new DirectEmoteController(bot, { prefix: "!", cooldownMs: 0, ...options }),
    calls,
  }
}

test("un numéro sans préfixe lance directement une boucle", async () => {
  const { controller, calls } = createFixture()
  const handled = await controller.handle(
    { id: "user-1", username: "Jessy" },
    { content: "2" },
  )

  assert.equal(handled, true)
  assert.deepEqual(calls.start, [["user-1", "emote-vibing"]])
  assert.equal(calls.whispers[0][0], "user-1")
})

test("les démarrages et arrêts d’emotes directes remontent au journal privé", async () => {
  const actions = []
  const { controller } = createFixture({ onAction: async (entry) => actions.push(entry) })
  const user = { id: "user-1", username: "Jessy" }

  await controller.handle(user, { content: "2" }, "chat")
  await controller.handle(user, { content: "stop" }, "whisper")

  assert.equal(actions.length, 2)
  assert.equal(actions[0].action, "start")
  assert.equal(actions[0].source, "chat")
  assert.equal(actions[1].action, "stop")
  assert.equal(actions[1].source, "whisper")
})

test("le nom complet sans préfixe lance une boucle", async () => {
  const { controller, calls } = createFixture()
  const handled = await controller.handle(
    { id: "user-1", username: "Jessy" },
    { content: "just vibing" },
  )

  assert.equal(handled, true)
  assert.deepEqual(calls.start, [["user-1", "emote-vibing"]])
})

test("stop arrête la boucle et les commandes préfixées restent au routeur", async () => {
  const { controller, calls } = createFixture()

  assert.equal(
    await controller.handle({ id: "user-1", username: "Jessy" }, { content: "stop" }),
    true,
  )
  assert.deepEqual(calls.stop, ["user-1"])

  assert.equal(
    await controller.handle({ id: "user-1", username: "Jessy" }, { content: "!stop" }),
    false,
  )
})

test("un message ordinaire n'est pas intercepté", async () => {
  const { controller, calls } = createFixture()
  const handled = await controller.handle(
    { id: "user-1", username: "Jessy" },
    { content: "Bonjour tout le monde" },
  )

  assert.equal(handled, false)
  assert.equal(calls.start.length, 0)
})

test("le préfixe et l’activation des emotes directes peuvent changer en jeu", async () => {
  const { calls } = createFixture()
  let prefix = "!"
  let enabled = false
  const emotes = [{ name: "Rest", id: "sit-idle-cute", duration: 17.06 }]
  const bot = {
    emotes: { getAll: () => emotes, getByIndex: (index) => emotes[index] || null },
    looper: {
      start: async (user, emoteId) => {
        calls.start.push([user.id, emoteId])
        return emotes[0]
      },
      stop: () => null,
    },
    whisper: { send: async () => ({ ok: true }) },
  }
  const controller = new DirectEmoteController(bot, {
    getPrefix: () => prefix,
    isEnabled: () => enabled,
    cooldownMs: 0,
  })
  const user = { id: "user-1", username: "Jessy" }

  assert.equal(await controller.handle(user, { content: "1" }), false)
  enabled = true
  prefix = "?"
  assert.equal(await controller.handle(user, { content: "?help" }), false)
  assert.equal(await controller.handle(user, { content: "1" }), true)
  assert.deepEqual(calls.start, [["user-1", "sit-idle-cute"]])
})

test("stop reste disponible même si les nouvelles emotes directes sont désactivées", async () => {
  const { calls } = createFixture()
  const emotes = [{ name: "Rest", id: "sit-idle-cute", duration: 17.06 }]
  const bot = {
    emotes: { getAll: () => emotes, getByIndex: () => emotes[0] },
    looper: {
      start: async () => null,
      stop: (userId) => {
        calls.stop.push(userId)
        return emotes[0]
      },
    },
    whisper: { send: async () => ({ ok: true }) },
  }
  const controller = new DirectEmoteController(bot, { isEnabled: () => false })

  assert.equal(
    await controller.handle({ id: "user-1", username: "Jessy" }, { content: "stop" }),
    true,
  )
  assert.deepEqual(calls.stop, ["user-1"])
})
