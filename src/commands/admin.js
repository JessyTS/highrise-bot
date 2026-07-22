const { formatDuration } = require("../utils/duration")
const { cleanIdentifier, truncate } = require("../utils/text")

function parseToggle(value) {
  const normalized = String(value || "").toLowerCase()
  if (["on", "true", "1", "oui", "activer", "active"].includes(normalized)) return true
  if (["off", "false", "0", "non", "désactiver", "desactiver", "inactive"].includes(normalized)) {
    return false
  }
  return null
}

function createAdminCommands() {
  return [
    {
      name: "announce",
      aliases: ["annonce", "broadcast"],
      category: "Administration",
      permission: "moderator",
      description: "Publie une annonce clairement identifiée.",
      usage: "<message>",
      cooldownMs: 5000,
      async execute(ctx) {
        if (!ctx.rawArgs) return ctx.privateReply(`Usage : ${ctx.config.prefix}announce <message>`)
        await ctx.publicReply(`📢 ANNONCE DU STAFF : ${truncate(ctx.rawArgs, 500)}`)
      },
    },
    {
      name: "say",
      aliases: ["dire"],
      category: "Administration",
      permission: "moderator",
      description: "Fait publier un message au bot avec le nom du modérateur.",
      usage: "<message>",
      async execute(ctx) {
        if (!ctx.rawArgs) return ctx.privateReply(`Usage : ${ctx.config.prefix}say <message>`)
        await ctx.publicReply(`💬 Staff (@${ctx.user.username}) : ${truncate(ctx.rawArgs, 500)}`)
      },
    },
    {
      name: "whisper",
      aliases: ["mp", "chuchoter"],
      category: "Administration",
      permission: "moderator",
      description: "Envoie un message privé via le bot.",
      usage: "@utilisateur <message>",
      async execute(ctx) {
        const target = await ctx.resolver.resolve(ctx.args[0], { inRoom: true })
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        const text = ctx.args.slice(1).join(" ").trim()
        if (!text) return ctx.privateReply(`Usage : ${ctx.config.prefix}whisper @utilisateur <message>`)
        const result = await ctx.bot.whisper.send(
          target.id,
          `Message du staff (@${ctx.user.username}) : ${truncate(text, 500)}`,
        )
        await ctx.privateReply(
          result?.ok ? `✅ Message envoyé à @${target.username}.` : `Échec : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "welcome",
      aliases: ["accueil"],
      category: "Administration",
      permission: "moderator",
      description: "Active, désactive ou affiche le message d’accueil.",
      usage: "<on|off|status>",
      async execute(ctx) {
        if (!ctx.args[0] || ctx.args[0].toLowerCase() === "status") {
          const welcome = ctx.store.settings.welcome
          return ctx.privateReply(
            `Accueil : ${welcome.enabled ? "activé" : "désactivé"}\nMessage : ${welcome.message}`,
          )
        }
        const enabled = parseToggle(ctx.args[0])
        if (enabled === null) return ctx.privateReply("Utilise on, off ou status.")
        ctx.store.setSetting("welcome", "enabled", enabled)
        await ctx.reply(`✅ Message d’accueil ${enabled ? "activé" : "désactivé"}.`)
      },
    },
    {
      name: "setwelcome",
      aliases: ["setaccueil"],
      category: "Administration",
      permission: "moderator",
      description: "Modifie l’accueil. Utilise {user} et {prefix}.",
      usage: "<message>",
      async execute(ctx) {
        if (!ctx.rawArgs) {
          return ctx.privateReply(
            `Exemple : ${ctx.config.prefix}setwelcome Bienvenue @{user} ! Tape {prefix}help.`,
          )
        }
        ctx.store.setSetting("welcome", "message", truncate(ctx.rawArgs, 500))
        await ctx.reply("✅ Message d’accueil enregistré.")
      },
    },
    {
      name: "antispam",
      category: "Administration",
      permission: "moderator",
      description: "Active ou désactive la protection anti-spam.",
      usage: "<on|off|status>",
      async execute(ctx) {
        const antiSpam = ctx.store.settings.antiSpam
        if (!ctx.args[0] || ctx.args[0].toLowerCase() === "status") {
          return ctx.privateReply(
            `Anti-spam : ${antiSpam.enabled ? "activé" : "désactivé"}\n` +
              `${antiSpam.maxMessages} messages/${antiSpam.windowMs / 1000}s — mute ${formatDuration(antiSpam.muteSeconds)}`,
          )
        }
        const enabled = parseToggle(ctx.args[0])
        if (enabled === null) return ctx.privateReply("Utilise on, off ou status.")
        ctx.store.setSetting("antiSpam", "enabled", enabled)
        await ctx.reply(`✅ Anti-spam ${enabled ? "activé" : "désactivé"}.`)
      },
    },
    {
      name: "filter",
      aliases: ["filtre"],
      category: "Administration",
      permission: "moderator",
      description: "Active ou désactive le filtre de mots.",
      usage: "<on|off|status>",
      async execute(ctx) {
        const filter = ctx.store.settings.wordFilter
        if (!ctx.args[0] || ctx.args[0].toLowerCase() === "status") {
          return ctx.privateReply(
            `Filtre : ${filter.enabled ? "activé" : "désactivé"} — ${filter.words.length} mot(s).`,
          )
        }
        const enabled = parseToggle(ctx.args[0])
        if (enabled === null) return ctx.privateReply("Utilise on, off ou status.")
        ctx.store.setSetting("wordFilter", "enabled", enabled)
        await ctx.reply(`✅ Filtre de mots ${enabled ? "activé" : "désactivé"}.`)
      },
    },
    {
      name: "word",
      aliases: ["mot"],
      category: "Administration",
      permission: "moderator",
      description: "Ajoute, retire ou liste les mots du filtre.",
      usage: "<add|remove|list> [mot ou expression]",
      async execute(ctx) {
        const action = String(ctx.args[0] || "list").toLowerCase()
        const word = ctx.args.slice(1).join(" ").trim()

        if (action === "list") {
          const words = ctx.store.settings.wordFilter.words
          return ctx.privateReply(
            words.length ? `Mots bloqués : ${words.join(", ")}` : "La liste des mots bloqués est vide.",
          )
        }
        if (!word) return ctx.privateReply("Indique un mot ou une expression.")
        if (action === "add" || action === "ajouter") {
          const added = ctx.store.addBlockedWord(word)
          return ctx.privateReply(added ? `✅ « ${word} » ajouté.` : "Ce mot est déjà présent ou invalide.")
        }
        if (["remove", "delete", "retirer", "supprimer"].includes(action)) {
          const removed = ctx.store.removeBlockedWord(word)
          return ctx.privateReply(removed ? `✅ « ${word} » retiré.` : "Ce mot n’est pas dans la liste.")
        }
        await ctx.privateReply("Actions : add, remove, list.")
      },
    },
    {
      name: "voice",
      aliases: ["vocal"],
      category: "Administration",
      permission: "moderator",
      description: "Affiche le vocal, invite ou retire un intervenant.",
      usage: "<status|invite|remove> [@utilisateur]",
      cooldownMs: 3000,
      async execute(ctx) {
        const action = String(ctx.args[0] || "status").toLowerCase()
        if (action === "status") {
          const voice = await ctx.bot.room.voice.check()
          if (!voice?.ok) return ctx.privateReply(`Vocal indisponible : ${voice?.error || "erreur inconnue"}`)
          return ctx.privateReply(
            `🎙️ Temps restant : ${formatDuration(voice.secondsLeft)}\nIntervenants : ${voice.speakers?.length || 0}`,
          )
        }

        const target = await ctx.resolver.resolve(ctx.args[1], { inRoom: true })
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        const result = action === "invite"
          ? await ctx.bot.room.voice.invite(target.id)
          : ["remove", "retirer"].includes(action)
            ? await ctx.bot.room.voice.remove(target.id)
            : null
        if (!result) return ctx.privateReply("Actions vocales : status, invite, remove.")
        await ctx.reply(
          result?.ok
            ? `🎙️ Action vocale « ${action} » effectuée pour @${target.username}.`
            : `Échec : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "promote",
      aliases: ["promouvoir"],
      category: "Propriétaire",
      permission: "owner",
      description: "Accorde le rôle de modérateur ou designer.",
      usage: "@utilisateur <mod|designer>",
      cooldownMs: 5000,
      async execute(ctx) {
        const target = await ctx.resolver.resolve(ctx.args[0], { inRoom: true })
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        const role = String(ctx.args[1] || "").toLowerCase()
        const result = role === "mod" || role === "moderator"
          ? await ctx.bot.room.moderator.add(target.id)
          : role === "designer"
            ? await ctx.bot.room.designer.add(target.id)
            : null
        if (!result) return ctx.privateReply("Rôles acceptés : mod, designer.")
        await ctx.reply(
          result?.ok
            ? `✅ @${target.username} est maintenant ${role}.`
            : `Échec : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "demote",
      aliases: ["rétrograder", "retrograder"],
      category: "Propriétaire",
      permission: "owner",
      description: "Retire le rôle de modérateur ou designer.",
      usage: "@utilisateur <mod|designer>",
      cooldownMs: 5000,
      async execute(ctx) {
        const target = await ctx.resolver.resolve(ctx.args[0])
        if (!target) return ctx.privateReply("Utilisateur introuvable.")
        const role = String(ctx.args[1] || "").toLowerCase()
        const result = role === "mod" || role === "moderator"
          ? await ctx.bot.room.moderator.remove(target.id)
          : role === "designer"
            ? await ctx.bot.room.designer.remove(target.id)
            : null
        if (!result) return ctx.privateReply("Rôles acceptés : mod, designer.")
        await ctx.reply(
          result?.ok
            ? `✅ Rôle ${role} retiré à @${target.username}.`
            : `Échec : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "botadmin",
      aliases: ["adminbot"],
      category: "Propriétaire",
      permission: "owner",
      description: "Gère les administrateurs internes du bot.",
      usage: "<add|remove|list> [@utilisateur]",
      async execute(ctx) {
        const action = String(ctx.args[0] || "list").toLowerCase()
        if (action === "list") {
          const admins = [...new Set([...ctx.config.adminIds, ...ctx.store.getBotAdmins()])]
          const labels = admins.map((id) => {
            const user = ctx.store.findKnownUser(id)
            return user ? `@${user.username} (${id})` : id
          })
          return ctx.privateReply(labels.length ? `Admins du bot :\n${labels.join("\n")}` : "Aucun admin du bot.")
        }

        const identifier = cleanIdentifier(ctx.args[1])
        const target = await ctx.resolver.resolve(identifier)
        if (!target) return ctx.privateReply("Utilisateur introuvable.")
        if (action === "add" || action === "ajouter") {
          const added = ctx.store.addBotAdmin(target.id)
          return ctx.reply(added ? `✅ @${target.username} est admin du bot.` : "Cet utilisateur est déjà admin.")
        }
        if (["remove", "retirer", "supprimer"].includes(action)) {
          const removed = ctx.store.removeBotAdmin(target.id)
          return ctx.reply(removed ? `✅ @${target.username} n’est plus admin du bot.` : "Cet utilisateur n’était pas admin.")
        }
        await ctx.privateReply("Actions : add, remove, list.")
      },
    },
  ]
}

module.exports = createAdminCommands
