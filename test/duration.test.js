const test = require("node:test")
const assert = require("node:assert/strict")

const { parseDuration, formatDuration } = require("../src/utils/duration")

test("parseDuration comprend les unités françaises et courtes", () => {
  assert.equal(parseDuration("60s"), 60)
  assert.equal(parseDuration("10m"), 600)
  assert.equal(parseDuration("2h"), 7200)
  assert.equal(parseDuration("7j"), 604800)
  assert.equal(parseDuration("2 semaines"), 1209600)
})

test("parseDuration respecte les bornes", () => {
  assert.equal(parseDuration("30s", { minimum: 60 }), null)
  assert.equal(parseDuration("8j", { maximum: 604800 }), null)
  assert.equal(parseDuration("abc"), null)
  assert.equal(parseDuration("0m"), null)
})

test("formatDuration produit une durée compacte", () => {
  assert.equal(formatDuration(60), "1min")
  assert.equal(formatDuration(3660), "1h 1min")
  assert.equal(formatDuration(172805), "2j 5s")
})
