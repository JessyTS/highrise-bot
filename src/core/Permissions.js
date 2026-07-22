class Permissions {
  constructor(bot, store, config) {
    this.bot = bot
    this.store = store
    this.config = config
    this.moderatorCache = new Map()
  }

  isOwner(userId) {
    return this.bot.metadata?.room?.ownerId === userId
  }

  isBotAdmin(userId) {
    return this.config.adminIds.includes(userId) || this.store.getBotAdmins().includes(userId)
  }

  isAdmin(userId) {
    return this.isOwner(userId) || this.isBotAdmin(userId)
  }

  async isModerator(userId, refresh = false) {
    if (this.isOwner(userId) || this.isBotAdmin(userId)) return true
    if (this.bot.roles?.isModerator(userId)) return true

    if (!refresh) return false

    const cached = this.moderatorCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    try {
      const result = await this.bot.room.privilege.isModerator(userId)
      const value = Boolean(result?.value)
      this.moderatorCache.set(userId, { value, expiresAt: Date.now() + 60_000 })
      return value
    } catch {
      return false
    }
  }

  async check(userId, requiredPermission = "everyone") {
    if (requiredPermission === "everyone") return true
    if (requiredPermission === "moderator") return this.isModerator(userId, true)
    if (requiredPermission === "admin") return this.isAdmin(userId)
    if (requiredPermission === "owner") return this.isOwner(userId)
    return false
  }

  async canModerate(actorId, targetId) {
    if (actorId === targetId) {
      return { allowed: false, reason: "Tu ne peux pas appliquer cette action à toi-même." }
    }
    if (targetId === this.bot.metadata?.botId) {
      return { allowed: false, reason: "Cette action ne peut pas viser le bot." }
    }
    if (this.isOwner(targetId)) {
      return { allowed: false, reason: "Le propriétaire de la salle est protégé." }
    }

    const targetIsModerator = await this.isModerator(targetId, true)
    if (targetIsModerator && !this.isAdmin(actorId)) {
      return {
        allowed: false,
        reason: "Seul le propriétaire peut agir sur un membre de la modération.",
      }
    }

    return { allowed: true, reason: null }
  }
}

module.exports = Permissions
