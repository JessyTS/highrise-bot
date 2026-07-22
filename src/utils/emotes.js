const { normalizeText } = require("./text")

function normalizeEmoteName(value) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function findEmotes(manager, query, limit = 20) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return manager.getAll().slice(0, limit)

  return manager
    .getAll()
    .filter((emote) => {
      return (
        normalizeText(emote.name).includes(normalizedQuery) ||
        normalizeText(emote.id).includes(normalizedQuery)
      )
    })
    .slice(0, limit)
}

function resolveEmote(manager, identifier) {
  const value = String(identifier || "").trim()
  if (!value) return { emote: null, matches: [] }

  if (/^\d+$/.test(value)) {
    const emote = manager.getByIndex(Number(value) - 1)
    return { emote, matches: emote ? [emote] : [] }
  }

  const normalized = normalizeText(value)
  const all = manager.getAll()
  const exact = all.find(
    (emote) =>
      normalizeText(emote.id) === normalized || normalizeText(emote.name) === normalized,
  )
  if (exact) return { emote: exact, matches: [exact] }

  const matches = findEmotes(manager, value, 10)
  if (matches.length === 1) return { emote: matches[0], matches }
  return { emote: null, matches }
}

function resolveDirectEmote(manager, input) {
  const value = String(input || "").trim()
  if (!value) return null

  if (/^\d+$/.test(value)) {
    return manager.getByIndex(Number(value) - 1)
  }

  const normalized = normalizeEmoteName(value)
  if (!normalized) return null

  return (
    manager
      .getAll()
      .find((emote) => normalizeEmoteName(emote.name) === normalized) || null
  )
}

module.exports = {
  findEmotes,
  resolveEmote,
  resolveDirectEmote,
  normalizeEmoteName,
}
