function hasFailed(response) {
  if (!response) return true
  if (typeof response.hasError === "function") return response.hasError()
  return response.ok === false
}

function errorMessage(response, fallback = "erreur inconnue") {
  return response?.error?.message || response?.error || fallback
}

class PersistentBotState {
  constructor(bot, store, adminLogs = null) {
    this.bot = bot
    this.store = store
    this.adminLogs = adminLogs
    this.restoring = null
  }

  async restore(metadata = this.bot.metadata) {
    if (this.restoring) return this.restoring

    this.restoring = this.restoreNow(metadata)
    try {
      return await this.restoring
    } finally {
      this.restoring = null
    }
  }

  async restoreNow(metadata) {
    const botId = metadata?.botId
    const position = this.store.getPersistentBotPosition?.()
    const emote = this.store.getPersistentBotEmote?.()
    const result = {
      position: position ? "pending" : "not-configured",
      emote: emote ? "pending" : "not-configured",
      errors: [],
    }

    if (!botId) {
      result.errors.push("Identifiant du bot indisponible")
      result.position = position ? "failed" : result.position
      result.emote = emote ? "failed" : result.emote
      return result
    }

    if (position) {
      try {
        const response = position.type === "anchor"
          ? await this.bot.player.sit(position.entityId, position.anchorIndex)
          : await this.bot.player.teleport(
            botId,
            position.x,
            position.y,
            position.z,
            position.facing,
          )

        if (hasFailed(response)) {
          result.position = "failed"
          result.errors.push(`Position : ${errorMessage(response)}`)
        } else {
          result.position = "restored"
        }
      } catch (error) {
        result.position = "failed"
        result.errors.push(`Position : ${error.message}`)
      }
    }

    if (emote) {
      try {
        const available = this.bot.emotes.getById?.(emote.id)
        if (!available) {
          result.emote = "failed"
          result.errors.push(`Emote introuvable : ${emote.id}`)
        } else {
          const started = await this.bot.looper.start(
            { id: botId, username: "Bot" },
            available.id,
          )
          result.emote = started ? "restored" : "failed"
          if (!started) result.errors.push(`Emote non relancée : ${emote.name || emote.id}`)
        }
      } catch (error) {
        result.emote = "failed"
        result.errors.push(`Emote : ${error.message}`)
      }
    }

    if (position || emote) {
      const restored = [result.position, result.emote].filter((status) => status === "restored").length
      await this.adminLogs?.recordAutomatic({
        status: result.errors.length ? "failed" : "success",
        details: result.errors.length
          ? `Restauration de l’état permanent du bot : ${result.errors.join(" | ")}`
          : `État permanent du bot restauré (${restored} élément(s)).`,
      })
    }

    return result
  }
}

module.exports = PersistentBotState
