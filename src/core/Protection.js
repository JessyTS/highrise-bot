const { truncate } = require("../utils/text")

class Protection {
  constructor(bot, store, permissions, adminLogs = null) {
    this.bot = bot
    this.store = store
    this.permissions = permissions
    this.adminLogs = adminLogs
    this.messageHistory = new Map()
    this.actionCooldown = new Map()
  }

  async notifyTarget(userId, message) {
    try {
      await this.bot.whisper.send(userId, message)
    } catch {
      // La sanction reste appliquée même si le whisper ne peut pas être remis.
    }
  }

  isActionCoolingDown(userId) {
    const expiresAt = this.actionCooldown.get(userId) || 0
    if (expiresAt > Date.now()) return true
    this.actionCooldown.set(userId, Date.now() + 15_000)
    return false
  }

  async handleMessage(user, message) {
    this.store.rememberUser(user)
    if (await this.permissions.isModerator(user.id)) return false

    const content = String(message?.content || "")
    const filter = this.store.settings.wordFilter

    if (filter.enabled) {
      const blockedWord = this.store.findBlockedWord(content)
      if (blockedWord && !this.isActionCoolingDown(user.id)) {
        const systemUser = { id: "system", username: "Protection automatique" }
        this.store.addWarning(user, systemUser, "Mot bloqué détecté")
        const warningCount = this.store.getWarnings(user.id).length
        const warnLimit = this.store.settings.warnLimit

        let action = "mute"
        let result
        if (warningCount >= warnLimit) {
          action = "kick"
          result = await this.bot.player.moderation.kick(user.id)
        } else {
          result = await this.bot.player.moderation.mute(user.id, filter.muteSeconds)
        }

        this.store.addModerationLog({
          action,
          targetId: user.id,
          targetUsername: user.username,
          moderatorId: systemUser.id,
          moderatorUsername: systemUser.username,
          reason: `Filtre automatique (${truncate(blockedWord, 30)})`,
          success: Boolean(result?.ok),
        })
        const notification = result?.ok
          ? `🛡️ Une action ${action} a été appliquée par le filtre automatique (${warningCount}/${warnLimit}).`
          : "⚠️ Le filtre a détecté ton message, mais l’action automatique a échoué."
        await this.notifyTarget(user.id, notification)
        await this.adminLogs?.recordAutomatic({
          actor: user,
          status: result?.ok ? "success" : "failed",
          details: `Filtre automatique : ${action} sur @${user.username} (${warningCount}/${warnLimit}).`,
        })
        return true
      }
    }

    const antiSpam = this.store.settings.antiSpam
    if (!antiSpam.enabled) return false

    const now = Date.now()
    const timestamps = (this.messageHistory.get(user.id) || []).filter(
      (timestamp) => now - timestamp <= antiSpam.windowMs,
    )
    timestamps.push(now)
    this.messageHistory.set(user.id, timestamps)

    if (timestamps.length < antiSpam.maxMessages || this.isActionCoolingDown(user.id)) {
      return false
    }

    this.messageHistory.delete(user.id)
    const result = await this.bot.player.moderation.mute(user.id, antiSpam.muteSeconds)
    this.store.addModerationLog({
      action: "mute",
      targetId: user.id,
      targetUsername: user.username,
      moderatorId: "system",
      moderatorUsername: "Anti-spam",
      reason: "Spam détecté automatiquement",
      duration: antiSpam.muteSeconds,
      success: Boolean(result?.ok),
    })
    await this.notifyTarget(
      user.id,
      result?.ok
        ? `🛡️ Tu as été rendu muet pendant ${antiSpam.muteSeconds}s par l’anti-spam.`
        : "⚠️ Un spam a été détecté, mais l’action automatique a échoué.",
    )
    await this.adminLogs?.recordAutomatic({
      actor: user,
      status: result?.ok ? "success" : "failed",
      details: `Anti-spam : mute ${antiSpam.muteSeconds}s sur @${user.username}.`,
    })
    return true
  }

  async handleJoin(user) {
    this.store.rememberUser(user)
    const welcome = this.store.settings.welcome
    if (!welcome.enabled || !welcome.message) return

    const message = String(welcome.message)
      .replaceAll("{user}", user.username)
      .replaceAll("{prefix}", this.store.settings.commands?.prefix || "!")
    await this.bot.message.send(message)
  }

  handleLeave(user) {
    this.store.rememberUser(user)
    this.messageHistory.delete(user.id)
    this.bot.looper?.stop(user.id)
  }
}

module.exports = Protection
