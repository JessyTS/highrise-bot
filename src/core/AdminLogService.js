const { truncate } = require("../utils/text")

const STATUS_LABELS = Object.freeze({
  completed: "terminée",
  denied: "refusée",
  error: "erreur",
  started: "démarrée",
  stopped: "arrêtée",
  success: "réussie",
  failed: "échouée",
})

function safeError(value) {
  return truncate(value?.message || value || "Erreur inconnue", 120)
}

class AdminLogService {
  constructor(bot, store, permissions, config) {
    this.bot = bot
    this.store = store
    this.permissions = permissions
    this.config = config
    this.deliveryQueue = Promise.resolve()
  }

  get settings() {
    return this.store.settings.adminLogs || {}
  }

  get recipientIds() {
    const ownerId = this.bot.metadata?.room?.ownerId
    return [...new Set([
      ownerId,
      ...(this.config.adminIds || []),
      ...(this.store.getBotAdmins?.() || []),
    ].filter(Boolean))].filter((userId) => this.permissions.isAdmin(userId))
  }

  shouldRecord(type, status = "completed", commandName = null) {
    if (this.settings.enabled === false) return false
    if (type === "command" && this.settings.commands === false) return false
    if (type === "direct-emote" && this.settings.directEmotes === false) return false
    if (type === "automatic" && this.settings.automaticActions === false) return false
    if (status === "denied" && this.settings.deniedAttempts === false) return false
    if (status === "error" && this.settings.errors === false) return false
    if (commandName && this.store.settings.commands?.logModes?.[commandName] === false) return false
    return true
  }

  sanitizeArguments(commandName, rawArgs) {
    if (this.settings.includeArguments === false) return ""
    const tokens = String(rawArgs || "").trim().split(/\s+/).filter(Boolean)
    if (!tokens.length) return ""

    if (commandName === "whisper") {
      return tokens[0] ? `${tokens[0]} [message masqué]` : "[message masqué]"
    }
    if (commandName === "tip" && ["confirm", "confirmer", "cancel", "annuler"].includes(tokens[0]?.toLowerCase())) {
      return `${tokens[0]} [code masqué]`
    }
    return truncate(tokens.join(" "), 150)
  }

  format(record) {
    const actor = record.actorUsername ? `@${record.actorUsername}` : record.actorId || "système"
    const status = STATUS_LABELS[record.status] || record.status || "terminée"

    if (record.type === "command") {
      const invocation = `${record.prefix || "!"}${record.command}${record.arguments ? ` ${record.arguments}` : ""}`
      const detail = record.details ? `\nDétail : ${truncate(record.details, 120)}` : ""
      return truncate(
        `🔒 LOG ADMIN · COMMANDE\n${actor} → ${invocation}\n` +
          `État : ${status} · ${record.source || "chat"} · ${record.durationMs || 0}ms${detail}`,
        500,
      )
    }

    if (record.type === "direct-emote") {
      return truncate(
        `🔒 LOG ADMIN · EMOTE\n${actor} · ${status}` +
          `${record.emoteName ? ` « ${record.emoteName} »` : ""} · ${record.source || "chat"}`,
        500,
      )
    }

    return truncate(
      `🔒 LOG ADMIN · ACTION AUTO\n${actor} · ${status}\n${record.details || "Action automatique du bot"}`,
      500,
    )
  }

  async deliver(message) {
    for (const userId of this.recipientIds) {
      try {
        const result = await this.bot.whisper.send(userId, message)
        if (result?.hasError?.()) {
          console.warn(`[AdminLog:${userId}] ${result.error}`)
        }
      } catch (error) {
        console.warn(`[AdminLog:${userId}] ${safeError(error)}`)
      }
    }
  }

  async record(entry, options = {}) {
    const force = options.force === true
    if (!force && !this.shouldRecord(entry.type, entry.status, entry.command)) return null

    const record = this.settings.storeHistory === false
      ? { createdAt: new Date().toISOString(), ...entry }
      : this.store.addActionLog(entry)
    const message = this.format(record)
    const operation = this.deliveryQueue.then(() => this.deliver(message))
    this.deliveryQueue = operation.catch(() => {})
    await operation
    return record
  }

  async recordCommand({ user, command, rawArgs, source, prefix, status, durationMs, details, error }, options = {}) {
    return this.record({
      type: "command",
      actorId: user?.id || null,
      actorUsername: user?.username || null,
      command: command.name,
      category: command.category,
      arguments: this.sanitizeArguments(command.name, rawArgs),
      source,
      prefix,
      status,
      durationMs,
      details: error ? safeError(error) : details ? truncate(details, 160) : null,
    }, options)
  }

  async recordDirectEmote({ user, source, action, emote }) {
    return this.record({
      type: "direct-emote",
      actorId: user?.id || null,
      actorUsername: user?.username || null,
      source,
      status: action === "stop" ? "stopped" : "started",
      emoteId: emote?.id || null,
      emoteName: emote?.name || null,
    })
  }

  async recordAutomatic({ actor = null, status = "completed", details }) {
    return this.record({
      type: "automatic",
      actorId: actor?.id || "system",
      actorUsername: actor?.username || "Protection automatique",
      status,
      details: truncate(details, 300),
    })
  }

  async flush() {
    await this.deliveryQueue
  }
}

module.exports = AdminLogService
