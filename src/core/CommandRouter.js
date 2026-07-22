const { normalizeText, tokenize } = require("../utils/text")

const PROTECTED_COMMANDS = new Set(["config", "help", "stop"])
const PERMISSION_RANK = Object.freeze({ everyone: 0, moderator: 1, admin: 2, owner: 3 })

class CommandRouter {
  constructor(bot, config, permissions, services = {}) {
    this.bot = bot
    this.config = config
    this.permissions = permissions
    this.services = services
    this.commands = new Map()
    this.aliases = new Map()
    this.cooldowns = new Map()
    this.running = new Set()
  }

  register(command) {
    const name = String(command.name || "").toLowerCase()
    if (!name) throw new Error("Une commande doit avoir un nom.")
    if (this.commands.has(name) || this.aliases.has(name)) {
      throw new Error(`Commande déjà enregistrée : ${name}`)
    }

    const normalized = {
      aliases: [],
      category: "Général",
      permission: "everyone",
      cooldownMs: this.config.commandCooldownMs,
      usage: "",
      description: "",
      ...command,
      name,
    }

    this.commands.set(name, normalized)
    for (const alias of normalized.aliases) {
      const normalizedAlias = alias.toLowerCase()
      if (this.commands.has(normalizedAlias) || this.aliases.has(normalizedAlias)) {
        throw new Error(`Alias déjà enregistré : ${normalizedAlias}`)
      }
      this.aliases.set(normalizedAlias, name)
    }
  }

  registerMany(commands) {
    for (const command of commands) this.register(command)
  }

  getCommand(name) {
    const normalized = String(name || "").toLowerCase()
    return this.commands.get(this.aliases.get(normalized) || normalized) || null
  }

  get policy() {
    return this.services.store?.settings?.commands || {}
  }

  isCommandEnabled(command) {
    if (PROTECTED_COMMANDS.has(command.name)) return true
    const disabled = this.policy.disabled || []
    const disabledCategories = this.policy.disabledCategories || []
    return !disabled.includes(command.name)
      && !disabledCategories.includes(normalizeText(command.category))
  }

  getCooldown(command) {
    const override = Number(this.policy.cooldowns?.[command.name])
    return Number.isFinite(override) && override >= 0 ? override : command.cooldownMs
  }

  getCooldownScope(command) {
    return this.policy.cooldownScopes?.[command.name] === "global" ? "global" : "user"
  }

  getReplyMode(command) {
    const mode = this.policy.replyModes?.[command.name]
    return ["private", "public"].includes(mode) ? mode : "auto"
  }

  getEffectivePermission(command) {
    const minimum = command.permission || "everyone"
    const requested = this.policy.permissions?.[command.name]
    if (!(requested in PERMISSION_RANK)) return minimum
    return PERMISSION_RANK[requested] >= PERMISSION_RANK[minimum] ? requested : minimum
  }

  isCommandLogged(command) {
    return this.policy.logModes?.[command.name] !== false
  }

  async getVisibleCommands(userId) {
    const commands = [...this.commands.values()]
    const isOwner = this.permissions.isOwner?.(userId) || false
    const isAdmin = isOwner || this.permissions.isAdmin?.(userId) || false
    const isModerator =
      isAdmin || (this.permissions.isModerator ? await this.permissions.isModerator(userId, true) : false)

    return commands.filter((command) => {
      if (!this.isCommandEnabled(command)) return false
      const permission = this.getEffectivePermission(command)
      if (permission === "everyone") return true
      if (permission === "moderator") return isModerator
      if (permission === "admin") return isAdmin
      if (permission === "owner") return isOwner
      return false
    })
  }

  async sendPrivate(userId, text) {
    const result = await this.bot.whisper.send(userId, String(text))
    if (result?.hasError?.()) console.warn(`[Whisper] ${result.error}`)
    return result
  }

  async sendPublic(text) {
    const result = await this.bot.message.send(String(text))
    if (result?.hasError?.()) console.warn(`[Chat] ${result.error}`)
    return result
  }

  async handle(user, message, source = "chat") {
    const content = String(message?.content || message || "").trim()
    if (!content.startsWith(this.config.prefix)) return false

    const tokens = tokenize(content.slice(this.config.prefix.length).trim())
    if (!tokens.length) return false

    const invokedName = tokens.shift().toLowerCase()
    const command = this.getCommand(invokedName)
    if (!command) {
      await this.sendPrivate(
        user.id,
        `Commande inconnue. Tape ${this.config.prefix}help pour afficher la liste.`,
      )
      return true
    }

    const rawArgs = tokens.join(" ")
    const adminLogs = this.services.adminLogs
    const logDenied = async (details) => {
      if (!adminLogs || !this.isCommandLogged(command)) return
      await adminLogs.recordCommand({
        user,
        command,
        rawArgs,
        source,
        prefix: this.config.prefix,
        status: "denied",
        durationMs: 0,
        details,
      })
    }

    const isAdmin = Boolean(this.permissions.isAdmin?.(user.id))
    if (this.policy.maintenance && !isAdmin && command.name !== "stop") {
      const maintenanceMessage = this.policy.maintenanceMessage
        || "Le bot est temporairement en maintenance. Réessaie plus tard."
      await this.sendPrivate(user.id, `🛠️ ${maintenanceMessage}`)
      await logDenied("Bot en maintenance")
      return true
    }

    if (!this.isCommandEnabled(command)) {
      await this.sendPrivate(user.id, "⛔ Cette commande est désactivée dans la configuration du bot.")
      await logDenied("Commande désactivée")
      return true
    }

    const effectivePermission = this.getEffectivePermission(command)
    if (!(await this.permissions.check(user.id, effectivePermission))) {
      await this.sendPrivate(user.id, "⛔ Tu n’as pas la permission d’utiliser cette commande.")
      await logDenied(`Permission requise : ${effectivePermission}`)
      return true
    }

    const cooldownScope = this.getCooldownScope(command)
    const cooldownKey = cooldownScope === "global" ? `${command.name}:global` : `${command.name}:${user.id}`
    const cooldownEndsAt = this.cooldowns.get(cooldownKey) || 0
    const bypassCooldown = this.policy.adminBypassCooldown !== false && isAdmin
    if (!bypassCooldown && cooldownEndsAt > Date.now()) {
      const seconds = Math.ceil((cooldownEndsAt - Date.now()) / 1000)
      await this.sendPrivate(user.id, `Patiente encore ${seconds}s avant de réutiliser cette commande.`)
      await logDenied(`Cooldown actif : ${seconds}s`)
      return true
    }

    const runningKey = `${user.id}:${command.name}`
    if (this.running.has(runningKey)) {
      await this.sendPrivate(user.id, "Cette commande est déjà en cours d’exécution.")
      await logDenied("Commande déjà en cours")
      return true
    }

    this.running.add(runningKey)
    this.cooldowns.set(cooldownKey, Date.now() + this.getCooldown(command))

    const replyMode = this.getReplyMode(command)
    const contextualReply = (text) => {
      if (replyMode === "private") return this.sendPrivate(user.id, text)
      if (replyMode === "public") return this.sendPublic(text)
      return source === "whisper" ? this.sendPrivate(user.id, text) : this.sendPublic(text)
    }

    let logDetails = null
    const rememberReply = (text) => {
      if (!logDetails) logDetails = String(text || "")
    }
    const logWasEnabled = Boolean(
      adminLogs
      && this.isCommandLogged(command)
      && (typeof adminLogs.shouldRecord !== "function"
        || adminLogs.shouldRecord("command", "completed", command.name)),
    )

    const context = {
      args: tokens,
      rawArgs,
      invokedName,
      user,
      message,
      source,
      command,
      bot: this.bot,
      config: this.config,
      permissions: this.permissions,
      router: this,
      ...this.services,
      reply: (text) => {
        rememberReply(text)
        return contextualReply(text)
      },
      privateReply: (text) => {
        rememberReply(text)
        return this.sendPrivate(user.id, text)
      },
      publicReply: (text) => {
        rememberReply(text)
        return replyMode === "private" ? this.sendPrivate(user.id, text) : this.sendPublic(text)
      },
      setLogDetails: (details) => {
        logDetails = typeof details === "string" ? details : JSON.stringify(details)
      },
    }

    const startedAt = Date.now()
    let status = "completed"
    let executionError = null
    try {
      await command.execute(context)
    } catch (error) {
      status = "error"
      executionError = error
      console.error(`[Commande:${command.name}]`, error)
      await this.sendPrivate(
        user.id,
        "Une erreur est survenue pendant l’exécution de la commande.",
      )
    } finally {
      this.running.delete(runningKey)
      if (adminLogs && (logWasEnabled || this.isCommandLogged(command))) {
        await adminLogs.recordCommand({
          user,
          command,
          rawArgs,
          source,
          prefix: this.config.prefix,
          status,
          durationMs: Date.now() - startedAt,
          details: logDetails,
          error: executionError,
        }, { force: logWasEnabled })
      }
    }

    return true
  }
}

module.exports = CommandRouter
