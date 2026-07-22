const UNITS = {
  s: 1,
  sec: 1,
  seconde: 1,
  secondes: 1,
  m: 60,
  min: 60,
  minute: 60,
  minutes: 60,
  h: 60 * 60,
  heure: 60 * 60,
  heures: 60 * 60,
  d: 24 * 60 * 60,
  j: 24 * 60 * 60,
  jour: 24 * 60 * 60,
  jours: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  semaine: 7 * 24 * 60 * 60,
  semaines: 7 * 24 * 60 * 60,
}

function parseDuration(input, options = {}) {
  if (typeof input !== "string") return null

  const value = input.trim().toLowerCase().replace(",", ".")
  const match = value.match(/^(\d+(?:\.\d+)?)\s*([a-zé]+)?$/i)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2] || "s"
  const multiplier = UNITS[unit]
  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) return null

  const seconds = Math.round(amount * multiplier)
  const minimum = options.minimum ?? 1
  const maximum = options.maximum ?? Number.POSITIVE_INFINITY

  if (seconds < minimum || seconds > maximum) return null
  return seconds
}

function formatDuration(totalSeconds) {
  let seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const parts = []
  const units = [
    ["j", 86400],
    ["h", 3600],
    ["min", 60],
    ["s", 1],
  ]

  for (const [label, size] of units) {
    const value = Math.floor(seconds / size)
    if (value > 0) {
      parts.push(`${value}${label}`)
      seconds %= size
    }
    if (parts.length === 2) break
  }

  return parts.join(" ") || "0s"
}

module.exports = { parseDuration, formatDuration }
