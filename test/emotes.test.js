const test = require("node:test")
const assert = require("node:assert/strict")

const {
  findEmotes,
  resolveEmote,
  resolveDirectEmote,
} = require("../src/utils/emotes")

const emotes = [
  { name: "Rest", id: "sit-idle-cute", duration: 17.06 },
  { name: "Just Vibing!", id: "emote-vibing", duration: 12.32 },
  { name: "Vibing Slowly", id: "emote-vibing-slow", duration: 20 },
]

const manager = {
  getAll: () => emotes,
  getByIndex: (index) => emotes[index] || null,
}

test("resolveEmote accepte le numéro, le nom et l'ID", () => {
  assert.equal(resolveEmote(manager, "1").emote.id, "sit-idle-cute")
  assert.equal(resolveEmote(manager, "just vibing!").emote.id, "emote-vibing")
  assert.equal(resolveEmote(manager, "SIT-IDLE-CUTE").emote.name, "Rest")
})

test("resolveEmote ne choisit pas arbitrairement un résultat ambigu", () => {
  const result = resolveEmote(manager, "vibing")
  assert.equal(result.emote, null)
  assert.equal(result.matches.length, 2)
})

test("findEmotes cherche dans le nom et l'identifiant", () => {
  assert.equal(findEmotes(manager, "slow").length, 1)
  assert.equal(findEmotes(manager, "sit-idle")[0].name, "Rest")
})

test("resolveDirectEmote accepte un numéro ou le nom complet sans préfixe", () => {
  assert.equal(resolveDirectEmote(manager, "2").id, "emote-vibing")
  assert.equal(resolveDirectEmote(manager, "JUST VIBING").id, "emote-vibing")
  assert.equal(resolveDirectEmote(manager, "Just Vibing!").id, "emote-vibing")
})

test("resolveDirectEmote refuse les noms partiels et les numéros hors liste", () => {
  assert.equal(resolveDirectEmote(manager, "vibing"), null)
  assert.equal(resolveDirectEmote(manager, "999"), null)
})
