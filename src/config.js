const path = require("node:path")
const ROOT_DIR = path.resolve(__dirname, "..")
require("dotenv").config({ path: path.join(ROOT_DIR, ".env"), quiet: true })

function booleanFromEnv(name, fallback) {
  const value = process.env[name]
  if (value === undefined || value === "") return fallback
  return ["1", "true", "yes", "on", "oui"].includes(value.toLowerCase())
}

function integerFromEnv(name, fallback, minimum = 0) {
  const value = Number.parseInt(process.env[name], 10)
  return Number.isFinite(value) && value >= minimum ? value : fallback
}

function listFromEnv(name) {
  return (process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

const prefix = (process.env.BOT_PREFIX || "!").trim() || "!"

module.exports = {
  token: (process.env.HIGHRISE_TOKEN || "").trim(),
  roomId: (process.env.HIGHRISE_ROOM_ID || "").trim(),
  prefix,
  adminIds: listFromEnv("BOT_ADMINS"),
  commandCooldownMs: integerFromEnv("COMMAND_COOLDOWN_MS", 2500),
  bulkActionDelayMs: integerFromEnv("BULK_ACTION_DELAY_MS", 400, 100),
  bulkMaxUsers: integerFromEnv("BULK_MAX_USERS", 200, 1),
  maxModerationDurationSeconds:
    integerFromEnv("MAX_MOD_DURATION_DAYS", 365, 1) * 24 * 60 * 60,
  logger: {
    level: ["debug", "info", "warn", "error"].includes(process.env.LOG_LEVEL)
      ? process.env.LOG_LEVEL
      : "info",
  },
  hosting: {
    mode: (process.env.HOSTING_MODE || "planethoster").trim(),
    host: (process.env.WEB_HOST || "127.0.0.1").trim(),
    port: (process.env.WEB_PORT || "").trim(),
    statusName: (process.env.STATUS_PAGE_NAME || "Highrise Complete Bot").trim(),
  },
  defaults: {
    commands: {
      prefix,
      directEmotes: booleanFromEnv("DIRECT_EMOTES_ENABLED", true),
      directEmoteCooldownMs:
        integerFromEnv("DIRECT_EMOTE_COOLDOWN_MS", 800, 0),
      maintenance: false,
      maintenanceMessage: "Le bot est temporairement en maintenance. Réessaie plus tard.",
      adminBypassCooldown: true,
      disabled: [],
      disabledCategories: [],
      cooldowns: {},
      cooldownScopes: {},
      replyModes: {},
      permissions: {},
      logModes: {},
    },
    emoteLoops: {
      transitionLeadMs: integerFromEnv("EMOTE_LOOP_LEAD_MS", 250, 0),
      minimumIntervalMs: integerFromEnv("EMOTE_LOOP_MIN_INTERVAL_MS", 800, 250),
      retryDelayMs: integerFromEnv("EMOTE_LOOP_RETRY_DELAY_MS", 1200, 250),
      maxConsecutiveErrors: integerFromEnv("EMOTE_LOOP_MAX_ERRORS", 3, 1),
    },
    tips: {
      enabled: booleanFromEnv("TIPS_ENABLED", false),
      maxPerTip: integerFromEnv("TIP_MAX_AMOUNT", 100, 1),
      dailyLimit: integerFromEnv("TIP_DAILY_LIMIT", 500, 1),
      perAdminDailyLimit: integerFromEnv("TIP_ADMIN_DAILY_LIMIT", 500, 1),
      perRecipientDailyLimit: integerFromEnv("TIP_RECIPIENT_DAILY_LIMIT", 250, 1),
      confirmationSeconds: integerFromEnv("TIP_CONFIRM_SECONDS", 60, 15),
      splitEnabled: booleanFromEnv("TIP_SPLIT_ENABLED", true),
      bulkEnabled: booleanFromEnv("TIP_BULK_ENABLED", false),
      bulkMaxRecipients: integerFromEnv("TIP_BULK_MAX_RECIPIENTS", 20, 2),
      sendDelayMs: integerFromEnv("TIP_SEND_DELAY_MS", 400, 100),
    },
    adminLogs: {
      enabled: booleanFromEnv("ADMIN_LOGS_ENABLED", true),
      commands: true,
      directEmotes: true,
      automaticActions: true,
      deniedAttempts: booleanFromEnv("ADMIN_LOG_DENIED_ATTEMPTS", true),
      errors: true,
      includeArguments: booleanFromEnv("ADMIN_LOG_INCLUDE_ARGUMENTS", true),
      storeHistory: true,
      maxHistory: integerFromEnv("ADMIN_LOG_MAX_HISTORY", 2000, 100),
    },
    actions: {
      bulkMaxUsers: integerFromEnv("BULK_MAX_USERS", 200, 1),
      bulkDelayMs: integerFromEnv("BULK_ACTION_DELAY_MS", 400, 100),
    },
    events: {
      enabled: booleanFromEnv("EVENT_REPORTER_ENABLED", true),
      public: booleanFromEnv("EVENT_PUBLIC_MESSAGES", true),
      whisper: booleanFromEnv("EVENT_PRIVATE_MESSAGES", true),
      emoteCooldownMs: integerFromEnv("EVENT_EMOTE_COOLDOWN_SECONDS", 15, 5) * 1000,
      types: {
        join: true,
        leave: true,
        emote: true,
        tip: true,
        moderation: true,
      },
    },
    welcome: {
      enabled: booleanFromEnv("WELCOME_ENABLED", true),
      message:
        process.env.WELCOME_MESSAGE ||
        "Bienvenue @{user} ! Tape {prefix}help pour voir les commandes.",
    },
    antiSpam: {
      enabled: booleanFromEnv("ANTI_SPAM_ENABLED", false),
      maxMessages: integerFromEnv("SPAM_MAX_MESSAGES", 7, 3),
      windowMs: integerFromEnv("SPAM_WINDOW_SECONDS", 8, 2) * 1000,
      muteSeconds: integerFromEnv("SPAM_MUTE_SECONDS", 60, 60),
    },
    wordFilter: {
      enabled: booleanFromEnv("WORD_FILTER_ENABLED", false),
      muteSeconds: integerFromEnv("FILTER_MUTE_SECONDS", 60, 60),
      words: [],
    },
    warnLimit: integerFromEnv("WARN_LIMIT", 3, 1),
  },
  paths: {
    state: path.join(ROOT_DIR, "data", "state.json"),
    roles: path.join(ROOT_DIR, "data", "roles.json"),
  },
}
