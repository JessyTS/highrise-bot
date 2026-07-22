const { Highrise } = require("highrise.bot")

const config = require("./config")
const StateStore = require("./core/StateStore")
const Permissions = require("./core/Permissions")
const UserResolver = require("./core/UserResolver")
const CommandRouter = require("./core/CommandRouter")
const Protection = require("./core/Protection")
const DirectEmoteController = require("./core/DirectEmoteController")
const SmoothEmoteLooper = require("./core/SmoothEmoteLooper")
const PersistentBotState = require("./core/PersistentBotState")
const TipService = require("./core/TipService")
const EventReporter = require("./core/EventReporter")
const AdminLogService = require("./core/AdminLogService")

const createGeneralCommands = require("./commands/general")
const createEmoteCommands = require("./commands/emotes")
const createModerationCommands = require("./commands/moderation")
const createAdminCommands = require("./commands/admin")
const createHighriseCommands = require("./commands/highrise")
const createConfigurationCommands = require("./commands/configuration")
const createEconomyCommands = require("./commands/economy")
const createLogCommands = require("./commands/logs")

function validateConfiguration() {
  const errors = []
  if (!config.token || config.token.includes("COLLE_ICI")) errors.push("HIGHRISE_TOKEN")
  if (!config.roomId || config.roomId.includes("COLLE_ICI")) errors.push("HIGHRISE_ROOM_ID")

  if (errors.length) {
    const error = new Error(
      `Configuration manquante : ${errors.join(", ")}. Copie .env.example vers .env puis complète ces valeurs.`,
    )
    error.code = "BOT_CONFIGURATION_ERROR"
    throw error
  }
}

async function startHighriseBot({ status = null } = {}) {
  validateConfiguration()

  const store = new StateStore(config.paths.state, config.defaults)
  config.prefix = store.settings.commands?.prefix || config.prefix
  const bot = new Highrise({
    roles: {
      persistPath: config.paths.roles,
      fileSaveInterval: 60_000,
      roomFetchInterval: 5 * 60_000,
    },
    logger: {
      prefix: "Highrise Complete Bot",
      level: config.logger.level,
    },
  })
  status?.attachBot?.(bot)

  const permissions = new Permissions(bot, store, config)
  const resolver = new UserResolver(bot, store)
  const tips = new TipService(bot, store)
  const reporter = new EventReporter(bot, store)
  const adminLogs = new AdminLogService(bot, store, permissions, config)
  const router = new CommandRouter(bot, config, permissions, {
    store,
    resolver,
    tips,
    adminLogs,
  })
  const protection = new Protection(bot, store, permissions, adminLogs)
  const persistentBotState = new PersistentBotState(bot, store, adminLogs)
  const directEmotes = new DirectEmoteController(bot, {
    getPrefix: () => config.prefix,
    isEnabled: () =>
      store.settings.commands?.directEmotes !== false
      && store.settings.commands?.maintenance !== true,
    getCooldownMs: () => store.settings.commands?.directEmoteCooldownMs ?? 800,
    onAction: (entry) => adminLogs.recordDirectEmote(entry),
  })

  const installSmoothLooper = () => {
    bot.looper?.destroy()
    bot.looper = new SmoothEmoteLooper(bot.player, bot.emotes, {
      getTransitionLeadMs: () => store.settings.emoteLoops.transitionLeadMs,
      getMinimumIntervalMs: () => store.settings.emoteLoops.minimumIntervalMs,
      getRetryDelayMs: () => store.settings.emoteLoops.retryDelayMs,
      getMaxConsecutiveErrors: () => store.settings.emoteLoops.maxConsecutiveErrors,
      onError: ({ user, emote, error, consecutiveErrors, stopped }) => {
        console.warn(
          `[Boucle emote] @${user.username || user.id} · ${emote.name} · ` +
          `erreur ${consecutiveErrors}${stopped ? " · boucle arrêtée" : " · nouvelle tentative"} : ` +
          `${error?.message || error}`,
        )
      },
    })
  }

  // Highrise recrée ses API à chaque reconnexion. Ce wrapper arrête donc
  // l’ancien moteur puis réinstalle automatiquement le looper fluide.
  const sdkLogin = bot.login.bind(bot)
  bot.login = (...credentials) => {
    bot.looper?.destroy()
    const result = sdkLogin(...credentials)
    installSmoothLooper()
    return result
  }

  router.registerMany([
    ...createGeneralCommands(),
    ...createEmoteCommands(),
    ...createModerationCommands(),
    ...createAdminCommands(),
    ...createHighriseCommands(),
    ...createConfigurationCommands(),
    ...createEconomyCommands(),
    ...createLogCommands(),
  ])

  bot.on("Ready", async (metadata) => {
    status?.markReady?.()
    try {
      const restored = await persistentBotState.restore(metadata)
      if (restored.position === "restored") console.log("📍 Position permanente du bot restaurée")
      if (restored.emote === "restored") console.log("🎭 Emote permanente du bot relancée")
      for (const error of restored.errors) console.warn(`[État permanent] ${error}`)
    } catch (error) {
      console.error("[État permanent du bot]", error)
    }
  })

  bot.once("Ready", async (metadata) => {
    console.log(`✅ Bot connecté dans « ${metadata.room.roomName} »`)
    console.log(`🤖 Bot ID : ${metadata.botId}`)
    console.log(`🎭 ${bot.emotes.size} emotes chargées`)
    console.log(
      store.settings.commands?.directEmotes === false
        ? "🔁 Emotes directes désactivées"
        : "🔁 Emotes directes en boucle : numéro, nom ou stop",
    )
    console.log(`⌨️ ${router.commands.size} commandes disponibles avec le préfixe ${config.prefix}`)
    console.log(`📡 Relais d’événements : ${store.settings.events.enabled ? "activé" : "désactivé"}`)
    console.log(`💸 Tips : ${store.settings.tips.enabled ? "activés" : "désactivés"}`)
    console.log(`🔒 Logs privés admins : ${store.settings.adminLogs.enabled ? "activés" : "désactivés"}`)
  })

  bot.on("Chat", async (user, message) => {
    try {
      if (user.id === bot.metadata?.botId) return
      const blocked = await protection.handleMessage(user, message)
      if (blocked) return
      if (await directEmotes.handle(user, message, "chat")) return
      await router.handle(user, message, "chat")
    } catch (error) {
      console.error("[Événement Chat]", error)
    }
  })

  bot.on("Whisper", async (user, message) => {
    try {
      if (user.id === bot.metadata?.botId) return
      store.rememberUser(user)
      if (await directEmotes.handle(user, message, "whisper")) return
      await router.handle(user, message, "whisper")
    } catch (error) {
      console.error("[Événement Whisper]", error)
    }
  })

  bot.on("UserJoined", async (user, position) => {
    try {
      await protection.handleJoin(user)
      await reporter.handleJoin(user, position)
    } catch (error) {
      console.error("[Événement UserJoined]", error)
    }
  })

  bot.on("UserLeft", async (user) => {
    try {
      await reporter.handleLeave(user)
      protection.handleLeave(user)
      bot.looper?.stop(user.id)
      directEmotes.clearUser(user.id)
      reporter.clearUser(user.id)
      tips.clearUser(user.id)
    } catch (error) {
      console.error("[Événement UserLeft]", error)
    }
  })

  bot.on("Moderation", async (moderator, target, action) => {
    try {
      store.rememberUser(moderator)
      store.rememberUser(target)

      // Les actions du bot sont journalisées uniquement par whisper aux admins.
      if (moderator.id === bot.metadata?.botId) return

      await reporter.handleModeration(moderator, target, action)

      store.addModerationLog({
        action: action.type,
        duration: action.duration || null,
        targetId: target.id,
        targetUsername: target.username,
        moderatorId: moderator.id,
        moderatorUsername: moderator.username,
        reason: "Action effectuée directement dans Highrise",
        success: true,
      })
    } catch (error) {
      console.error("[Événement Moderation]", error)
    }
  })

  bot.on("Emote", async (user, emoteId, receiver) => {
    try {
      await reporter.handleEmote(user, emoteId, receiver)
    } catch (error) {
      console.error("[Événement Emote]", error)
    }
  })

  bot.on("Tip", async (sender, receiver, item) => {
    try {
      // Un tip envoyé par le bot est déjà journalisé en privé par la commande.
      if (sender?.id === bot.metadata?.botId) return
      await reporter.handleTip(sender, receiver, item)
    } catch (error) {
      console.error("[Événement Tip]", error)
    }
  })

  let stopped = false
  const stop = async (signal = "shutdown") => {
    if (stopped) return
    stopped = true
    status?.markStopping?.()
    try {
      store.save()
      bot.destroy()
      status?.markStopped?.()
    } catch (error) {
      console.error("Erreur pendant l’arrêt :", error)
      status?.markError?.("runtime")
      throw error
    }
  }

  bot.login(config.token, config.roomId)
  return { bot, router, store, stop }
}

async function runStandalone() {
  let runtime
  try {
    runtime = await startHighriseBot()
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
    return
  }

  let shuttingDown = false
  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\nArrêt demandé (${signal})…`)
    try {
      await runtime.stop(signal)
    } catch {
      exitCode = 1
    }
    process.exitCode = exitCode
    setTimeout(() => process.exit(exitCode), 100)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
  process.on("uncaughtException", (error) => {
    console.error("Erreur non gérée :", error)
    shutdown("uncaughtException", 1)
  })
  process.on("unhandledRejection", (error) => {
    console.error("Promesse rejetée non gérée :", error)
  })
}

if (require.main === module) runStandalone()

module.exports = { runStandalone, startHighriseBot, validateConfiguration }
