const { truncate } = require("../utils/text")

class EventReporter {
  constructor(bot, store) {
    this.bot = bot
    this.store = store
    this.cooldowns = new Map()
    this.lastEmotes = new Map()
  }

  get settings() {
    return this.store.settings.events
  }

  userLabel(user) {
    if (user?.username) return `@${user.username}`
    const known = user?.id ? this.store.findKnownUser(user.id) : null
    return known?.username ? `@${known.username}` : user?.id || "utilisateur inconnu"
  }

  cooldownFor(type) {
    if (type === "emote") return Number(this.settings.emoteCooldownMs || 15_000)
    return 0
  }

  isCoolingDown(type, key) {
    const duration = this.cooldownFor(type)
    if (!duration || !key) return false
    const cooldownKey = `${type}:${key}`
    const expiresAt = this.cooldowns.get(cooldownKey) || 0
    if (expiresAt > Date.now()) return true
    this.cooldowns.set(cooldownKey, Date.now() + duration)
    return false
  }

  async sendPublic(message) {
    try {
      await this.bot.message.send(truncate(message, 500))
    } catch (error) {
      console.warn(`[EventReporter:public] ${error.message}`)
    }
  }

  async sendWhispers(users, message) {
    const botId = this.bot.metadata?.botId
    const userIds = [...new Set(users.map((user) => user?.id).filter((id) => id && id !== botId))]
    for (const userId of userIds) {
      try {
        await this.bot.whisper.send(userId, truncate(message, 500))
      } catch {
        // Un utilisateur parti ou banni ne peut plus recevoir le whisper.
      }
    }
  }

  async report(type, { publicMessage, privateMessage = publicMessage, users = [], key = null }) {
    if (!this.settings.enabled || this.settings.types?.[type] === false) return false
    if (this.isCoolingDown(type, key)) return false
    if (this.settings.public && publicMessage) await this.sendPublic(publicMessage)
    if (this.settings.whisper && privateMessage && users.length) {
      await this.sendWhispers(users, privateMessage)
    }
    return true
  }

  async handleJoin(user, position = null) {
    this.store.rememberUser(user)
    const coordinates = Number.isFinite(position?.x)
      ? ` (${position.x}, ${position.y}, ${position.z})`
      : ""
    return this.report("join", {
      publicMessage: `👋 ${this.userLabel(user)} a rejoint la salle${coordinates}.`,
      privateMessage: `👋 Bienvenue ${this.userLabel(user)}. Ton arrivée a bien été détectée.`,
      users: [user],
      key: user.id,
    })
  }

  async handleLeave(user) {
    this.store.rememberUser(user)
    return this.report("leave", {
      publicMessage: `🚪 ${this.userLabel(user)} a quitté la salle.`,
      users: [],
      key: user.id,
    })
  }

  async handleEmote(user, emoteId, receiver) {
    this.store.rememberUser(user)
    this.store.rememberUser(receiver)
    const emote = this.bot.emotes.getById?.(emoteId)
    const name = emote?.name || emoteId
    const previous = this.lastEmotes.get(user.id)
    if (previous?.emoteId === emoteId && Date.now() - previous.at < 5 * 60_000) return false
    this.lastEmotes.set(user.id, { emoteId, at: Date.now() })
    const receiverText = receiver?.id && receiver.id !== user.id
      ? ` sur ${this.userLabel(receiver)}`
      : ""
    return this.report("emote", {
      publicMessage: `🎭 ${this.userLabel(user)} a lancé « ${name} »${receiverText}.`,
      privateMessage: `🎭 Emote détectée : « ${name} »${receiverText}.`,
      users: [user, receiver],
      key: user.id,
    })
  }

  async handleTip(sender, receiver, item) {
    this.store.rememberUser(sender)
    this.store.rememberUser(receiver)
    const amount = Number(item?.amount || 0)
    const type = item?.type || "gold"
    const message = `💸 ${this.userLabel(sender)} a tip ${amount} ${type} à ${this.userLabel(receiver)}.`
    return this.report("tip", {
      publicMessage: message,
      privateMessage: message,
      users: [sender, receiver],
      key: `${sender?.id}:${receiver?.id}:${amount}`,
    })
  }

  async handleModeration(moderator, target, action) {
    this.store.rememberUser(moderator)
    this.store.rememberUser(target)
    const duration = action?.duration ? ` (${action.duration}s)` : ""
    const message = `🛡️ ${this.userLabel(moderator)} a appliqué ${action?.type || "une action"}${duration} à ${this.userLabel(target)}.`
    return this.report("moderation", {
      publicMessage: message,
      privateMessage: message,
      users: [moderator, target],
      key: `${target?.id}:${action?.type}`,
    })
  }

  clearUser(userId) {
    this.lastEmotes.delete(userId)
    for (const key of this.cooldowns.keys()) {
      if (key.endsWith(`:${userId}`)) this.cooldowns.delete(key)
    }
  }
}

module.exports = EventReporter
