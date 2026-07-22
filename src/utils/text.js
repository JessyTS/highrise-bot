function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function cleanIdentifier(value) {
  return String(value || "").trim().replace(/^@/, "")
}

function truncate(value, maxLength = 120) {
  const text = String(value || "").trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function pageItems(items, requestedPage = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(Number.parseInt(requestedPage, 10) || 1, 1), totalPages)
  const start = (page - 1) * pageSize
  return {
    page,
    totalPages,
    totalItems: items.length,
    start,
    items: items.slice(start, start + pageSize),
  }
}

function tokenize(input) {
  const tokens = []
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g
  let match

  while ((match = pattern.exec(String(input || ""))) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }

  return tokens
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = {
  normalizeText,
  cleanIdentifier,
  truncate,
  pageItems,
  tokenize,
  sleep,
}
