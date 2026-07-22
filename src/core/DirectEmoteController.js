const { normalizeEmoteName, resolveDirectEmote } = require("../utils/emotes")

class DirectEmoteController {
  constructor(bot, options = {}) {
    this.bot = bot
    this.getPrefix = typeof options.getPrefix === "function"
      ? options.getPrefix
      : () => options.prefix || "!"
    this.isEnabled = typeof options.isEnabled === "function"
      ? options.isEnabled
      : () => true
    this.getCooldownMs = typeof options.getCooldownMs === "function"
      ? options.getCooldownMs
      : () => options.cooldownMs ?? 800
    this.onAction = typeof options.onAction === "function" ? options.onAction : null
    this.cooldowns = new Map()
  }

  async sendPrivate(userId, message) {
    const result = await this.bot.whisper.send(userId, message)
    if (result?.hasError?.()) {
      console.warn(`[Emote directe] ${result.error}`)
    }
  }

  async handle(user, message, source = "chat") {
    const content = String(message?.content || message || "").trim()
    const prefix = this.getPrefix()
    if (!content || content.startsWith(prefix)) return false

    if (normalizeEmoteName(content) === "stop") {
      const stopped = this.bot.looper.stop(user.id)
      this.cooldowns.delete(user.id)
      await this.sendPrivate(
        user.id,
        stopped
          ? `⏹️ Boucle « ${stopped.name} » arrêtée.`
          : "Aucune boucle d’emote n’est active.",
      )
      if (stopped && this.onAction) {
        await this.onAction({ user, source, action: "stop", emote: stopped })
      }
      return true
    }

    if (!this.isEnabled()) return false

    const emote = resolveDirectEmote(this.bot.emotes, content)
    if (!emote) return false

    const cooldownEndsAt = this.cooldowns.get(user.id) || 0
    if (cooldownEndsAt > Date.now()) return true
    const cooldownMs = Math.max(0, Number(this.getCooldownMs()) || 0)
    this.cooldowns.set(user.id, Date.now() + cooldownMs)

    const started = await this.bot.looper.start(user, emote.id)
    if (started) {
      await this.sendPrivate(
        user.id,
        `🔁 Boucle « ${started.name} » lancée. Écris stop pour l’arrêter.`,
      )
      if (this.onAction) {
        await this.onAction({ user, source, action: "start", emote: started })
      }
    }
    return true
  }

  clearUser(userId) {
    this.cooldowns.delete(userId)
  }
}

module.exports = DirectEmoteController
