const { normalizeText, pageItems, truncate } = require("../utils/text")

const PROTECTED_COMMANDS = new Set(["config", "help", "stop"])
const EVENT_TYPES = ["join", "leave", "emote", "tip", "moderation"]
const PERMISSION_RANK = Object.freeze({ everyone: 0, moderator: 1, admin: 2, owner: 3 })

function parseToggle(value) {
  const normalized = normalizeText(value)
  if (["on", "true", "1", "oui", "activer", "active", "enabled"].includes(normalized)) {
    return true
  }
  if (["off", "false", "0", "non", "desactiver", "inactive", "disabled"].includes(normalized)) {
    return false
  }
  return null
}

function parseInteger(value, minimum, maximum) {
  const number = Number.parseInt(value, 10)
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null
}

function onOff(value) {
  return value ? "on" : "off"
}

function permissionValue(value) {
  const normalized = normalizeText(value)
  const aliases = {
    tous: "everyone",
    everyone: "everyone",
    joueur: "everyone",
    moderator: "moderator",
    moderateur: "moderator",
    mod: "moderator",
    admin: "admin",
    owner: "owner",
    proprietaire: "owner",
  }
  return aliases[normalized] || null
}

async function requireAdmin(ctx) {
  if (ctx.permissions.isAdmin(ctx.user.id)) return true
  await ctx.privateReply("⛔ Ce réglage est réservé au propriétaire et aux admins du bot.")
  return false
}

function configurationStatus(ctx) {
  const settings = ctx.store.settings
  const commands = settings.commands || {}
  const emoteLoops = settings.emoteLoops || {}
  const adminLogs = settings.adminLogs || {}
  const tips = settings.tips || {}
  const permanentPosition = ctx.store.getPersistentBotPosition?.()
  const permanentEmote = ctx.store.getPersistentBotEmote?.()
  return (
    `⚙️ Configuration en jeu\n` +
    `Préfixe : ${ctx.config.prefix}\n` +
    `Maintenance : ${onOff(commands.maintenance)} | Emotes directes : ${onOff(commands.directEmotes !== false)} (${(commands.directEmoteCooldownMs ?? 800) / 1000}s)\n` +
    `Boucles emotes : avance ${emoteLoops.transitionLeadMs ?? 250}ms | minimum ${emoteLoops.minimumIntervalMs ?? 800}ms | reprise ${emoteLoops.retryDelayMs ?? 1200}ms/${emoteLoops.maxConsecutiveErrors ?? 3} erreur(s)\n` +
    `Commandes désactivées : ${(commands.disabled || []).length} | Catégories désactivées : ${(commands.disabledCategories || []).length}\n` +
    `Politiques : ${Object.keys(commands.cooldowns || {}).length} cooldown(s), ${Object.keys(commands.permissions || {}).length} permission(s), ${Object.keys(commands.replyModes || {}).length} réponse(s)\n` +
    `Accueil : ${onOff(settings.welcome.enabled)} — ${truncate(settings.welcome.message, 70)}\n` +
    `Anti-spam : ${onOff(settings.antiSpam.enabled)} — ${settings.antiSpam.maxMessages} msg/` +
      `${settings.antiSpam.windowMs / 1000}s, mute ${settings.antiSpam.muteSeconds}s\n` +
    `Filtre : ${onOff(settings.wordFilter.enabled)} — ${settings.wordFilter.words.length} mot(s), ` +
      `mute ${settings.wordFilter.muteSeconds}s\n` +
    `Limite d’avertissements : ${settings.warnLimit}\n` +
    `Tips : ${onOff(tips.enabled)} — max ${tips.maxPerTip}, jour ${tips.dailyLimit}, collectif ${onOff(tips.bulkEnabled)}\n` +
    `Logs admins privés : ${onOff(adminLogs.enabled)} — historique ${ctx.store.getActionLog?.().length || 0}\n` +
    `Événements : ${onOff(settings.events.enabled)} — public ${onOff(settings.events.public)}, whisper ${onOff(settings.events.whisper)}\n` +
    `Points TP : ${ctx.store.listPositions().length} | Tenues sauvegardées : ${ctx.store.listOutfitPresets().length}\n` +
    `Bot permanent : position ${permanentPosition ? "oui" : "non"} | emote ${permanentEmote?.name || "aucune"}`
  )
}

function configurationHelp(prefix) {
  return (
    `🛠️ Configuration depuis Highrise\n` +
    `${prefix}config — état complet\n` +
    `${prefix}config commands [page]\n` +
    `${prefix}config command <nom> <status|on|off|cooldown sec|scope user/global|reply auto/private/public|permission rôle|log on/off|reset>\n` +
    `${prefix}config category <list|status|on|off> [catégorie]\n` +
    `${prefix}config welcome <on|off>\n` +
    `${prefix}config welcome-message <texte avec {user} et {prefix}>\n` +
    `${prefix}config antispam <on|off>\n` +
    `${prefix}config spam-limit <3-50>\n` +
    `${prefix}config spam-window <2-120 secondes>\n` +
    `${prefix}config spam-mute <60-86400 secondes>\n` +
    `${prefix}config filter <on|off>\n` +
    `${prefix}config filter-mute <60-86400 secondes>\n` +
    `${prefix}word <add|remove|list> [mot ou expression]\n` +
    `${prefix}config warn-limit <1-20>\n` +
    `${prefix}config maintenance <on|off> | maintenance-message <texte> — admin\n` +
    `${prefix}config direct-emotes <on|off> | direct-emote-cooldown <0-30s> — admin\n` +
    `${prefix}config emote-loop <status|lead 0-1500|minimum 500-5000|retry 250-10000|errors 1-10> — admin\n` +
    `${prefix}config admin-cooldown-bypass <on|off> — admin\n` +
    `${prefix}config tips <status|on|off> — admin\n` +
    `${prefix}config tip-max <1-50000> | tip-daily <1-100000> — admin\n` +
    `${prefix}config tip-admin-daily <montant> | tip-recipient-daily <montant>\n` +
    `${prefix}config tip-split <on|off> | tip-bulk <on|off> | tip-bulk-max <2-50>\n` +
    `${prefix}config tip-delay <100-5000ms> | tip-confirm <15-300s>\n` +
    `${prefix}config adminlogs <status|on|off> | adminlog <commands|direct-emotes|automatic|denied|errors|arguments|history> <on|off>\n` +
    `${prefix}config adminlog-max <100-10000>\n` +
    `${prefix}config bulk-limit <1-200> | bulk-delay <100-5000ms>\n` +
    `${prefix}config events <status|on|off|full> — admin\n` +
    `${prefix}config event <join|leave|emote|tip|moderation> <on|off>\n` +
    `${prefix}config event-public <on|off> | event-whisper <on|off>\n` +
    `${prefix}config emote-cooldown <5-300 secondes>\n` +
    `${prefix}config prefix <symbole> — admin\n` +
    `${prefix}config recommended confirm — admin\n` +
    `${prefix}config reset <welcome|antispam|filter|commands|emoteloops|tips|adminlogs|actions|events|all> confirm — admin`
  )
}

function createConfigurationCommands() {
  return [
    {
      name: "config",
      aliases: ["settings", "réglages", "reglages", "setup"],
      category: "Configuration",
      permission: "moderator",
      description: "Affiche et modifie la configuration du bot directement en jeu.",
      usage: "[help|réglage valeur]",
      cooldownMs: 1200,
      async execute(ctx) {
        const action = normalizeText(ctx.args[0] || "status")

        if (["status", "etat", "état", "show", "voir"].includes(action)) {
          return ctx.privateReply(configurationStatus(ctx))
        }
        if (["help", "aide", "menu"].includes(action)) {
          return ctx.privateReply(configurationHelp(ctx.config.prefix))
        }

        if (["commands", "commandes"].includes(action)) {
          const commands = [...ctx.router.commands.values()].sort((a, b) => a.name.localeCompare(b.name))
          const page = pageItems(commands, ctx.args[1], 10)
          return ctx.privateReply(
            `⌨️ Configuration des commandes — page ${page.page}/${page.totalPages}\n` +
              page.items.map((command) => {
                const enabled = ctx.router.isCommandEnabled(command)
                const cooldown = ctx.router.getCooldown(command) / 1000
                const scope = ctx.router.getCooldownScope(command)
                const reply = ctx.router.getReplyMode(command)
                const permission = ctx.router.getEffectivePermission(command)
                const logged = ctx.router.isCommandLogged(command)
                return `${enabled ? "✅" : "⛔"} ${command.name} · ${permission} · ${cooldown}s/${scope} · ${reply} · log:${onOff(logged)}`
              }).join("\n"),
          )
        }

        if (["command", "commande"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const command = ctx.router.getCommand(ctx.args[1])
          if (!command) return ctx.privateReply("Commande introuvable.")
          const operation = normalizeText(ctx.args[2] || "status")
          const settings = ctx.store.settings.commands

          if (["status", "etat", "voir"].includes(operation)) {
            return ctx.privateReply(
              `⚙️ ${command.name}\n` +
                `État : ${ctx.router.isCommandEnabled(command) ? "on" : "off"}\n` +
                `Catégorie : ${command.category}\n` +
                `Permission minimale : ${command.permission}\n` +
                `Permission active : ${ctx.router.getEffectivePermission(command)}\n` +
                `Cooldown : ${ctx.router.getCooldown(command) / 1000}s\n` +
                `Portée cooldown : ${ctx.router.getCooldownScope(command)}\n` +
                `Réponse : ${ctx.router.getReplyMode(command)}\n` +
                `Log privé admins : ${onOff(ctx.router.isCommandLogged(command))}`,
            )
          }

          if (["on", "off"].includes(operation)) {
            if (PROTECTED_COMMANDS.has(command.name) && operation === "off") {
              return ctx.privateReply("Cette commande essentielle ne peut pas être désactivée.")
            }
            const disabled = new Set(settings.disabled || [])
            if (operation === "on") disabled.delete(command.name)
            else disabled.add(command.name)
            ctx.store.setSetting("commands", "disabled", [...disabled].sort())
            return ctx.reply(`✅ Commande ${command.name} ${operation === "on" ? "activée" : "désactivée"}.`)
          }

          if (["cooldown", "delai", "délai"].includes(operation)) {
            const seconds = parseInteger(ctx.args[3], 0, 3600)
            if (seconds === null) return ctx.privateReply("Choisis un cooldown de 0 à 3600 secondes.")
            const cooldowns = { ...(settings.cooldowns || {}), [command.name]: seconds * 1000 }
            ctx.store.setSetting("commands", "cooldowns", cooldowns)
            return ctx.reply(`✅ Cooldown de ${command.name} : ${seconds}s.`)
          }

          if (["reply", "reponse", "réponse"].includes(operation)) {
            const mode = normalizeText(ctx.args[3])
            if (!["auto", "private", "prive", "privé", "public"].includes(mode)) {
              return ctx.privateReply("Modes acceptés : auto, private, public.")
            }
            const replyModes = { ...(settings.replyModes || {}) }
            if (mode === "auto") delete replyModes[command.name]
            else replyModes[command.name] = mode === "public" ? "public" : "private"
            ctx.store.setSetting("commands", "replyModes", replyModes)
            return ctx.reply(`✅ Réponses de ${command.name} : ${mode === "prive" || mode === "privé" ? "private" : mode}.`)
          }

          if (["scope", "portee", "portée", "cooldown-scope"].includes(operation)) {
            const scope = normalizeText(ctx.args[3])
            if (!["user", "utilisateur", "global", "default", "defaut", "défaut"].includes(scope)) {
              return ctx.privateReply("Portées acceptées : user, global, default.")
            }
            const scopes = { ...(settings.cooldownScopes || {}) }
            if (["default", "defaut", "défaut"].includes(scope)) delete scopes[command.name]
            else scopes[command.name] = scope === "global" ? "global" : "user"
            ctx.store.setSetting("commands", "cooldownScopes", scopes)
            return ctx.reply(`✅ Portée du cooldown de ${command.name} : ${scopes[command.name] || "user"}.`)
          }

          if (["permission", "role", "rôle"].includes(operation)) {
            const requested = normalizeText(ctx.args[3])
            const permissions = { ...(settings.permissions || {}) }
            if (["default", "defaut", "défaut"].includes(requested)) {
              delete permissions[command.name]
            } else {
              const permission = permissionValue(requested)
              if (!permission) return ctx.privateReply("Permissions : everyone, moderator, admin, owner, default.")
              if (PERMISSION_RANK[permission] < PERMISSION_RANK[command.permission]) {
                return ctx.privateReply(`Impossible de descendre sous la permission minimale « ${command.permission} ».`)
              }
              permissions[command.name] = permission
            }
            ctx.store.setSetting("commands", "permissions", permissions)
            return ctx.reply(`✅ Permission de ${command.name} : ${permissions[command.name] || command.permission}.`)
          }

          if (["log", "journal"].includes(operation)) {
            const value = normalizeText(ctx.args[3])
            const logModes = { ...(settings.logModes || {}) }
            if (["default", "defaut", "défaut"].includes(value)) {
              delete logModes[command.name]
            } else {
              const enabled = parseToggle(value)
              if (enabled === null) return ctx.privateReply("Valeurs : on, off, default.")
              logModes[command.name] = enabled
            }
            ctx.store.setSetting("commands", "logModes", logModes)
            return ctx.reply(`✅ Log privé de ${command.name} : ${onOff(logModes[command.name] !== false)}.`)
          }

          if (["reset", "defaut", "défaut"].includes(operation)) {
            const disabled = new Set(settings.disabled || [])
            disabled.delete(command.name)
            const cooldowns = { ...(settings.cooldowns || {}) }
            const cooldownScopes = { ...(settings.cooldownScopes || {}) }
            const replyModes = { ...(settings.replyModes || {}) }
            const permissions = { ...(settings.permissions || {}) }
            const logModes = { ...(settings.logModes || {}) }
            delete cooldowns[command.name]
            delete cooldownScopes[command.name]
            delete replyModes[command.name]
            delete permissions[command.name]
            delete logModes[command.name]
            ctx.store.setSetting("commands", "disabled", [...disabled].sort())
            ctx.store.setSetting("commands", "cooldowns", cooldowns)
            ctx.store.setSetting("commands", "cooldownScopes", cooldownScopes)
            ctx.store.setSetting("commands", "replyModes", replyModes)
            ctx.store.setSetting("commands", "permissions", permissions)
            ctx.store.setSetting("commands", "logModes", logModes)
            return ctx.reply(`✅ Configuration de ${command.name} réinitialisée.`)
          }

          return ctx.privateReply("Actions : status, on, off, cooldown, scope, reply, permission, log, reset.")
        }

        if (["category", "categorie", "catégorie"].includes(action)) {
          const operation = normalizeText(ctx.args[1] || "list")
          const categories = [...new Set([...ctx.router.commands.values()].map((command) => command.category))]
            .sort((a, b) => a.localeCompare(b, "fr"))
          const disabled = new Set(ctx.store.settings.commands.disabledCategories || [])
          if (["list", "liste"].includes(operation)) {
            return ctx.privateReply(
              `📚 Catégories\n` + categories.map((category) =>
                `${disabled.has(normalizeText(category)) ? "⛔" : "✅"} ${category}`).join("\n"),
            )
          }
          if (!(await requireAdmin(ctx))) return
          const requested = ctx.args.slice(2).join(" ").trim()
          const category = categories.find((value) => normalizeText(value) === normalizeText(requested))
          if (!category) return ctx.privateReply(`Catégorie introuvable. Utilise ${ctx.config.prefix}config category list.`)
          const key = normalizeText(category)
          if (["status", "etat", "voir"].includes(operation)) {
            return ctx.privateReply(`${category} : ${disabled.has(key) ? "off" : "on"}.`)
          }
          if (!["on", "off"].includes(operation)) return ctx.privateReply("Actions : list, status, on, off.")
          if (key === normalizeText("Configuration") && operation === "off") {
            return ctx.privateReply("La catégorie Configuration ne peut pas être désactivée.")
          }
          if (operation === "on") disabled.delete(key)
          else disabled.add(key)
          ctx.store.setSetting("commands", "disabledCategories", [...disabled].sort())
          return ctx.reply(`✅ Catégorie ${category} ${operation === "on" ? "activée" : "désactivée"}.`)
        }

        if (["welcome", "accueil"].includes(action)) {
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("welcome", "enabled", enabled)
          return ctx.reply(`✅ Accueil ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["welcome-message", "welcome-text", "message-accueil"].includes(action)) {
          const message = ctx.args.slice(1).join(" ").trim()
          if (!message) {
            return ctx.privateReply(
              `Exemple : ${ctx.config.prefix}config welcome-message Bienvenue @{user} ! Tape {prefix}help.`,
            )
          }
          ctx.store.setSetting("welcome", "message", truncate(message, 500))
          return ctx.reply("✅ Message d’accueil enregistré.")
        }

        if (["antispam", "anti-spam"].includes(action)) {
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("antiSpam", "enabled", enabled)
          return ctx.reply(`✅ Anti-spam ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["spam-limit", "limite-spam"].includes(action)) {
          const value = parseInteger(ctx.args[1], 3, 50)
          if (value === null) return ctx.privateReply("Choisis un nombre de 3 à 50.")
          ctx.store.setSetting("antiSpam", "maxMessages", value)
          return ctx.reply(`✅ Limite anti-spam : ${value} messages.`)
        }

        if (["spam-window", "fenetre-spam"].includes(action)) {
          const value = parseInteger(ctx.args[1], 2, 120)
          if (value === null) return ctx.privateReply("Choisis une durée de 2 à 120 secondes.")
          ctx.store.setSetting("antiSpam", "windowMs", value * 1000)
          return ctx.reply(`✅ Fenêtre anti-spam : ${value} secondes.`)
        }

        if (["spam-mute", "mute-spam"].includes(action)) {
          const value = parseInteger(ctx.args[1], 60, 86_400)
          if (value === null) return ctx.privateReply("Choisis une durée de 60 à 86400 secondes.")
          ctx.store.setSetting("antiSpam", "muteSeconds", value)
          return ctx.reply(`✅ Durée du mute anti-spam : ${value} secondes.`)
        }

        if (["filter", "filtre"].includes(action)) {
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("wordFilter", "enabled", enabled)
          return ctx.reply(`✅ Filtre de mots ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["filter-mute", "mute-filtre"].includes(action)) {
          const value = parseInteger(ctx.args[1], 60, 86_400)
          if (value === null) return ctx.privateReply("Choisis une durée de 60 à 86400 secondes.")
          ctx.store.setSetting("wordFilter", "muteSeconds", value)
          return ctx.reply(`✅ Durée du mute du filtre : ${value} secondes.`)
        }

        if (["warn-limit", "limite-warn", "limite-avertissements"].includes(action)) {
          const value = parseInteger(ctx.args[1], 1, 20)
          if (value === null) return ctx.privateReply("Choisis un nombre de 1 à 20.")
          ctx.store.setRootSetting("warnLimit", value)
          return ctx.reply(`✅ Limite d’avertissements : ${value}.`)
        }

        if (["maintenance", "pause"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("commands", "maintenance", enabled)
          return ctx.privateReply(`✅ Mode maintenance ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["maintenance-message", "message-maintenance"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const message = ctx.args.slice(1).join(" ").trim()
          if (!message) return ctx.privateReply("Indique le message affiché pendant la maintenance.")
          ctx.store.setSetting("commands", "maintenanceMessage", truncate(message, 300))
          return ctx.privateReply("✅ Message de maintenance enregistré.")
        }

        if (["admin-cooldown-bypass", "bypass-cooldown"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("commands", "adminBypassCooldown", enabled)
          return ctx.privateReply(`✅ Contournement des cooldowns par les admins : ${onOff(enabled)}.`)
        }

        if (["direct-emotes", "emotes-directes", "directemotes"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("commands", "directEmotes", enabled)
          if (!enabled) {
            ctx.bot.looper?.destroy()
            const saved = ctx.store.getPersistentBotEmote?.()
            const emote = saved ? ctx.bot.emotes.getById?.(saved.id) : null
            if (emote && ctx.bot.metadata?.botId) {
              await ctx.bot.looper.start(
                { id: ctx.bot.metadata.botId, username: "Bot" },
                emote.id,
              )
            }
          }
          return ctx.reply(`✅ Emotes directes ${enabled ? "activées" : "désactivées"}.`)
        }

        if (["direct-emote-cooldown", "cooldown-emote-directe"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const seconds = parseInteger(ctx.args[1], 0, 30)
          if (seconds === null) return ctx.privateReply("Choisis un délai de 0 à 30 secondes.")
          ctx.store.setSetting("commands", "directEmoteCooldownMs", seconds * 1000)
          return ctx.privateReply(`✅ Cooldown des emotes directes : ${seconds}s.`)
        }

        if (["emote-loop", "loop-emote", "boucle-emote", "boucles-emotes"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const operation = normalizeText(ctx.args[1] || "status")
          const settings = ctx.store.settings.emoteLoops

          if (["status", "etat", "état", "voir"].includes(operation)) {
            return ctx.privateReply(
              `🔁 Moteur de boucles fluides\n` +
                `Relance anticipée : ${settings.transitionLeadMs}ms\n` +
                `Intervalle minimum : ${settings.minimumIntervalMs}ms\n` +
                `Nouvelle tentative : ${settings.retryDelayMs}ms\n` +
                `Arrêt après : ${settings.maxConsecutiveErrors} erreur(s) consécutive(s)\n` +
                `Boucles actives : ${ctx.bot.looper?.activeCount ?? "indisponible"}`,
            )
          }

          const definitions = {
            lead: {
              key: "transitionLeadMs",
              minimum: 0,
              maximum: 1500,
              label: "Relance anticipée",
            },
            avance: {
              key: "transitionLeadMs",
              minimum: 0,
              maximum: 1500,
              label: "Relance anticipée",
            },
            minimum: {
              key: "minimumIntervalMs",
              minimum: 500,
              maximum: 5000,
              label: "Intervalle minimum",
            },
            min: {
              key: "minimumIntervalMs",
              minimum: 500,
              maximum: 5000,
              label: "Intervalle minimum",
            },
            retry: {
              key: "retryDelayMs",
              minimum: 250,
              maximum: 10_000,
              label: "Délai de reprise",
            },
            reprise: {
              key: "retryDelayMs",
              minimum: 250,
              maximum: 10_000,
              label: "Délai de reprise",
            },
            errors: {
              key: "maxConsecutiveErrors",
              minimum: 1,
              maximum: 10,
              label: "Erreurs consécutives maximales",
            },
            erreurs: {
              key: "maxConsecutiveErrors",
              minimum: 1,
              maximum: 10,
              label: "Erreurs consécutives maximales",
            },
          }
          const definition = definitions[operation]
          if (!definition) {
            return ctx.privateReply("Actions : status, lead, minimum, retry, errors.")
          }

          const value = parseInteger(ctx.args[2], definition.minimum, definition.maximum)
          if (value === null) {
            return ctx.privateReply(
              `Choisis une valeur de ${definition.minimum} à ${definition.maximum}.`,
            )
          }
          ctx.store.setSetting("emoteLoops", definition.key, value)
          return ctx.privateReply(`✅ ${definition.label} : ${value}${operation.includes("error") || operation === "erreurs" ? "" : "ms"}.`)
        }

        if (["bulk-limit", "limite-groupe"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 1, 200)
          if (value === null) return ctx.privateReply("Choisis une limite de 1 à 200 utilisateurs.")
          ctx.store.setSetting("actions", "bulkMaxUsers", value)
          return ctx.privateReply(`✅ Limite des actions groupées : ${value}.`)
        }

        if (["bulk-delay", "delai-groupe", "délai-groupe"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 100, 5000)
          if (value === null) return ctx.privateReply("Choisis un délai de 100 à 5000 millisecondes.")
          ctx.store.setSetting("actions", "bulkDelayMs", value)
          return ctx.privateReply(`✅ Délai des actions groupées : ${value}ms.`)
        }

        if (["tips", "tip"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const operation = normalizeText(ctx.args[1] || "status")
          const settings = ctx.store.settings.tips
          if (["status", "etat", "voir"].includes(operation)) {
            return ctx.privateReply(
              `💸 Tips : ${onOff(settings.enabled)}\n` +
                `Maximum par destinataire : ${settings.maxPerTip}\n` +
                `Global/jour : ${settings.dailyLimit} | par admin : ${settings.perAdminDailyLimit}\n` +
                `Par destinataire/jour : ${settings.perRecipientDailyLimit}\n` +
                `Fractionnés : ${onOff(settings.splitEnabled)} | collectifs : ${onOff(settings.bulkEnabled)} (${settings.bulkMaxRecipients} max)\n` +
                `Délai : ${settings.sendDelayMs}ms | confirmation obligatoire : ${settings.confirmationSeconds}s`,
            )
          }
          const enabled = parseToggle(operation)
          if (enabled === null) return ctx.privateReply("Actions tips : status, on, off.")
          ctx.store.setSetting("tips", "enabled", enabled)
          if (!enabled) ctx.tips?.pending.clear()
          return ctx.reply(`✅ Tips ${enabled ? "activés" : "désactivés"}.`)
        }

        if (["tip-max", "max-tip"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 1, 50_000)
          if (value === null) return ctx.privateReply("Choisis un plafond de 1 à 50000 gold.")
          if (value > ctx.store.settings.tips.dailyLimit) {
            return ctx.privateReply("Le plafond par tip ne peut pas dépasser le plafond quotidien.")
          }
          if (value > ctx.store.settings.tips.perAdminDailyLimit) {
            return ctx.privateReply("Le plafond par tip ne peut pas dépasser le plafond quotidien par admin.")
          }
          if (value > ctx.store.settings.tips.perRecipientDailyLimit) {
            return ctx.privateReply("Le plafond par tip ne peut pas dépasser le plafond quotidien par destinataire.")
          }
          ctx.store.setSetting("tips", "maxPerTip", value)
          return ctx.reply(`✅ Plafond par tip : ${value} gold.`)
        }

        if (["tip-daily", "tip-jour", "daily-tip"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 1, 100_000)
          if (value === null) return ctx.privateReply("Choisis un plafond quotidien de 1 à 100000 gold.")
          if (value < ctx.store.settings.tips.maxPerTip) {
            return ctx.privateReply("Le plafond quotidien ne peut pas être inférieur au plafond par tip.")
          }
          ctx.store.setSetting("tips", "dailyLimit", value)
          return ctx.reply(`✅ Plafond quotidien des tips : ${value} gold.`)
        }

        if (["tip-admin-daily", "tip-admin-jour"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 1, 100_000)
          if (value === null) return ctx.privateReply("Choisis un plafond de 1 à 100000 gold.")
          if (value > ctx.store.settings.tips.dailyLimit) {
            return ctx.privateReply("Le plafond par admin ne peut pas dépasser le plafond global.")
          }
          if (value < ctx.store.settings.tips.maxPerTip) {
            return ctx.privateReply("Le plafond par admin ne peut pas être inférieur au plafond par tip.")
          }
          ctx.store.setSetting("tips", "perAdminDailyLimit", value)
          return ctx.privateReply(`✅ Plafond quotidien par admin : ${value} gold.`)
        }

        if (["tip-recipient-daily", "tip-destinataire-jour"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 1, 100_000)
          if (value === null) return ctx.privateReply("Choisis un plafond de 1 à 100000 gold.")
          if (value > ctx.store.settings.tips.dailyLimit) {
            return ctx.privateReply("Le plafond par destinataire ne peut pas dépasser le plafond global.")
          }
          if (value < ctx.store.settings.tips.maxPerTip) {
            return ctx.privateReply("Le plafond par destinataire ne peut pas être inférieur au plafond par tip.")
          }
          ctx.store.setSetting("tips", "perRecipientDailyLimit", value)
          return ctx.privateReply(`✅ Plafond quotidien par destinataire : ${value} gold.`)
        }

        if (["tip-split", "tips-split"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("tips", "splitEnabled", enabled)
          return ctx.privateReply(`✅ Tips fractionnés : ${onOff(enabled)}.`)
        }

        if (["tip-bulk", "tipall", "tips-collectifs"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("tips", "bulkEnabled", enabled)
          return ctx.privateReply(`✅ Tips collectifs : ${onOff(enabled)}.`)
        }

        if (["tip-bulk-max", "tipall-max"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 2, 50)
          if (value === null) return ctx.privateReply("Choisis une limite de 2 à 50 destinataires.")
          ctx.store.setSetting("tips", "bulkMaxRecipients", value)
          return ctx.privateReply(`✅ Maximum collectif : ${value} destinataires.`)
        }

        if (["tip-delay", "delai-tip", "délai-tip"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 100, 5000)
          if (value === null) return ctx.privateReply("Choisis un délai de 100 à 5000 millisecondes.")
          ctx.store.setSetting("tips", "sendDelayMs", value)
          return ctx.privateReply(`✅ Délai entre les tips : ${value}ms.`)
        }

        if (["tip-confirm", "tip-confirmation", "confirmation-tip"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 15, 300)
          if (value === null) return ctx.privateReply("Choisis une durée de 15 à 300 secondes.")
          ctx.store.setSetting("tips", "confirmationSeconds", value)
          return ctx.reply(`✅ Délai de confirmation des tips : ${value}s.`)
        }

        if (["adminlogs", "logs-admins", "journaux-admins"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const operation = normalizeText(ctx.args[1] || "status")
          const settings = ctx.store.settings.adminLogs
          if (["status", "etat", "voir"].includes(operation)) {
            return ctx.privateReply(
              `🔒 Logs exclusivement privés aux admins : ${onOff(settings.enabled)}\n` +
                `Commandes : ${onOff(settings.commands)} | emotes directes : ${onOff(settings.directEmotes)}\n` +
                `Actions automatiques : ${onOff(settings.automaticActions)} | refus : ${onOff(settings.deniedAttempts)}\n` +
                `Erreurs : ${onOff(settings.errors)} | arguments : ${onOff(settings.includeArguments)}\n` +
                `Historique : ${onOff(settings.storeHistory)} (${ctx.store.getActionLog().length}/${settings.maxHistory})`,
            )
          }
          const enabled = parseToggle(operation)
          if (enabled === null) return ctx.privateReply("Actions : status, on, off.")
          ctx.store.setSetting("adminLogs", "enabled", enabled)
          return ctx.privateReply(`✅ Logs privés admins : ${onOff(enabled)}.`)
        }

        if (["adminlog", "log-admin"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const option = normalizeText(ctx.args[1])
          const keyByOption = {
            commands: "commands",
            commandes: "commands",
            "direct-emotes": "directEmotes",
            emotes: "directEmotes",
            automatic: "automaticActions",
            automatique: "automaticActions",
            denied: "deniedAttempts",
            refus: "deniedAttempts",
            errors: "errors",
            erreurs: "errors",
            arguments: "includeArguments",
            historique: "storeHistory",
            history: "storeHistory",
          }
          const key = keyByOption[option]
          if (!key) {
            return ctx.privateReply("Options : commands, direct-emotes, automatic, denied, errors, arguments, history.")
          }
          const enabled = parseToggle(ctx.args[2])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("adminLogs", key, enabled)
          return ctx.privateReply(`✅ Log ${option} : ${onOff(enabled)}.`)
        }

        if (["adminlog-max", "log-history-max"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const value = parseInteger(ctx.args[1], 100, 10_000)
          if (value === null) return ctx.privateReply("Choisis une taille de 100 à 10000 entrées.")
          ctx.store.setSetting("adminLogs", "maxHistory", value)
          return ctx.privateReply(`✅ Taille maximale du journal : ${value}.`)
        }

        if (["events", "evenements", "événements"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const operation = normalizeText(ctx.args[1] || "status")
          const settings = ctx.store.settings.events
          if (["status", "etat", "voir"].includes(operation)) {
            const states = EVENT_TYPES.map((type) => `${type}:${onOff(settings.types[type] !== false)}`).join(", ")
            return ctx.privateReply(
              `📡 Événements : ${onOff(settings.enabled)}\n` +
                `Messages publics : ${onOff(settings.public)} | Whispers : ${onOff(settings.whisper)}\n` +
                `${states}\n` +
                `Cooldown emote : ${settings.emoteCooldownMs / 1000}s`,
            )
          }
          if (["full", "complet"].includes(operation)) {
            if (normalizeText(ctx.args[2]) !== "confirm") {
              return ctx.privateReply(`Le mode complet peut être très bavard. Confirme avec ${ctx.config.prefix}config events full confirm.`)
            }
            ctx.store.setSetting("events", "enabled", true)
            ctx.store.setSetting("events", "public", true)
            ctx.store.setSetting("events", "whisper", true)
            ctx.store.setSetting("events", "types", Object.fromEntries(EVENT_TYPES.map((type) => [type, true])))
            return ctx.reply("✅ Relais complet des événements activé avec anti-spam.")
          }
          const enabled = parseToggle(operation)
          if (enabled === null) return ctx.privateReply("Actions events : status, on, off, full.")
          ctx.store.setSetting("events", "enabled", enabled)
          return ctx.reply(`✅ Relais des événements ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["event", "evenement", "événement"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const type = normalizeText(ctx.args[1])
          if (!EVENT_TYPES.includes(type)) return ctx.privateReply(`Événements : ${EVENT_TYPES.join(", ")}.`)
          const enabled = parseToggle(ctx.args[2])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          const types = { ...ctx.store.settings.events.types, [type]: enabled }
          ctx.store.setSetting("events", "types", types)
          return ctx.reply(`✅ Événement ${type} ${enabled ? "activé" : "désactivé"}.`)
        }

        if (["event-public", "events-public"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("events", "public", enabled)
          return ctx.reply(`✅ Messages publics des événements ${enabled ? "activés" : "désactivés"}.`)
        }

        if (["event-whisper", "events-whisper"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const enabled = parseToggle(ctx.args[1])
          if (enabled === null) return ctx.privateReply("Valeur attendue : on ou off.")
          ctx.store.setSetting("events", "whisper", enabled)
          return ctx.reply(`✅ Whispers des événements ${enabled ? "activés" : "désactivés"}.`)
        }

        if (["emote-cooldown", "cooldown-emote"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const seconds = parseInteger(ctx.args[1], 5, 300)
          if (seconds === null) return ctx.privateReply("Choisis une durée de 5 à 300 secondes.")
          ctx.store.setSetting("events", "emoteCooldownMs", seconds * 1000)
          return ctx.reply(`✅ Cooldown des événements emote : ${seconds}s.`)
        }

        if (action === "prefix" || action === "préfixe" || action === "prefixe") {
          if (!(await requireAdmin(ctx))) return
          const nextPrefix = String(ctx.args[1] || "").trim()
          if (!/^[^\p{L}\p{N}\s]{1,3}$/u.test(nextPrefix)) {
            return ctx.privateReply("Le préfixe doit contenir 1 à 3 symboles, sans lettre, chiffre ni espace.")
          }
          const oldPrefix = ctx.config.prefix
          ctx.store.setSetting("commands", "prefix", nextPrefix)
          ctx.config.prefix = nextPrefix
          return ctx.privateReply(
            `✅ Préfixe changé de « ${oldPrefix} » à « ${nextPrefix} ». Essaie ${nextPrefix}help.`,
          )
        }

        if (["recommended", "recommande", "recommandé"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          if (normalizeText(ctx.args[1]) !== "confirm") {
            return ctx.privateReply(
              `Cette configuration active l’accueil, l’anti-spam, les emotes directes et les événements. ` +
              `Confirme avec ${ctx.config.prefix}config recommended confirm.`,
            )
          }
          ctx.store.setSetting("welcome", "enabled", true)
          ctx.store.setSetting("antiSpam", "enabled", true)
          ctx.store.setSetting("antiSpam", "maxMessages", 7)
          ctx.store.setSetting("antiSpam", "windowMs", 8000)
          ctx.store.setSetting("antiSpam", "muteSeconds", 60)
          ctx.store.setSetting("wordFilter", "enabled", false)
          ctx.store.setRootSetting("warnLimit", 3)
          ctx.store.setSetting("commands", "directEmotes", true)
          ctx.store.setSetting("commands", "adminBypassCooldown", true)
          ctx.store.resetSetting("emoteLoops")
          ctx.store.setSetting("adminLogs", "enabled", true)
          ctx.store.setSetting("adminLogs", "commands", true)
          ctx.store.setSetting("adminLogs", "directEmotes", true)
          ctx.store.setSetting("adminLogs", "automaticActions", true)
          ctx.store.setSetting("adminLogs", "deniedAttempts", true)
          ctx.store.setSetting("events", "enabled", true)
          ctx.store.setSetting("events", "public", true)
          ctx.store.setSetting("events", "whisper", true)
          ctx.store.setSetting("events", "types", Object.fromEntries(EVENT_TYPES.map((type) => [type, true])))
          return ctx.reply("✅ Configuration recommandée appliquée et sauvegardée.")
        }

        if (["reset", "reinitialiser", "réinitialiser"].includes(action)) {
          if (!(await requireAdmin(ctx))) return
          const section = normalizeText(ctx.args[1])
          if (normalizeText(ctx.args[2]) !== "confirm") {
            return ctx.privateReply(
              `Confirme avec ${ctx.config.prefix}config reset <welcome|antispam|filter|commands|emoteloops|tips|adminlogs|actions|events|all> confirm.`,
            )
          }

          const sections = {
            welcome: "welcome",
            accueil: "welcome",
            antispam: "antiSpam",
            "anti-spam": "antiSpam",
            filter: "wordFilter",
            filtre: "wordFilter",
            commands: "commands",
            commandes: "commands",
            emoteloops: "emoteLoops",
            "emote-loops": "emoteLoops",
            boucles: "emoteLoops",
            tips: "tips",
            adminlogs: "adminLogs",
            logs: "adminLogs",
            actions: "actions",
            events: "events",
            evenements: "events",
          }
          if (section === "all" || section === "tout") {
            ctx.store.resetAllSettings()
          } else if (!sections[section] || !ctx.store.resetSetting(sections[section])) {
            return ctx.privateReply("Section inconnue.")
          }
          ctx.config.prefix = ctx.store.settings.commands?.prefix || ctx.config.prefix
          if (!ctx.store.settings.tips?.enabled) ctx.tips?.pending.clear()
          return ctx.reply("✅ Réglage réinitialisé avec les valeurs de démarrage.")
        }

        if (["save", "sauver"].includes(action)) {
          ctx.store.save()
          return ctx.privateReply("✅ Configuration sauvegardée immédiatement.")
        }

        await ctx.privateReply(`Réglage inconnu. Tape ${ctx.config.prefix}config help.`)
      },
    },
  ]
}

module.exports = createConfigurationCommands
