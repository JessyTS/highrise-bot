const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const EventReporter = require("../src/core/EventReporter")

function createFixture() {
  const publicMessages = []
  const whispers = []
  const settings = {
    enabled: true,
    public: true,
    whisper: true,
    emoteCooldownMs: 15000,
    types: { join: true, leave: true, emote: true, tip: true, moderation: true },
  }
  const store = {
    settings: { events: settings },
    rememberUser() {},
    findKnownUser: () => null,
  }
  const bot = {
    metadata: { botId: "bot" },
    message: { send: async (message) => publicMessages.push(message) },
    whisper: { send: async (id, message) => whispers.push([id, message]) },
    emotes: { getById: () => ({ name: "Dance" }) },
  }
  return {
    reporter: new EventReporter(bot, store),
    settings,
    publicMessages,
    whispers,
  }
}

test("les tips sont annoncés et chuchotés aux deux personnes concernées", async () => {
  const { reporter, publicMessages, whispers } = createFixture()
  await reporter.handleTip(
    { id: "sender", username: "Alice" },
    { id: "receiver", username: "Bob" },
    { amount: 50, type: "gold" },
  )

  assert.equal(publicMessages.length, 1)
  assert.match(publicMessages[0], /Alice.*50.*Bob/)
  assert.deepEqual(whispers.map(([id]) => id).sort(), ["receiver", "sender"])
})

test("le reporter ne traite plus les déplacements des joueurs", () => {
  const { reporter } = createFixture()
  assert.equal(reporter.handleMovement, undefined)

  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8")
  assert.doesNotMatch(source, /bot\.on\(["']Movement["']/)
})
