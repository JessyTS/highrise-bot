const { formatDuration } = require("../utils/duration")
const { normalizeText, pageItems, truncate } = require("../utils/text")

function createGeneralCommands() {
  return [
    {
      name: "help",
      aliases: ["aide", "commands", "commandes"],
      category: "Général",
      description: "Affiche les commandes disponibles.",
      usage: "[catégorie]",
      cooldownMs: 1500,
      async execute(ctx) {
        const visible = await ctx.router.getVisibleCommands(ctx.user.id)
        const requestedCategory = normalizeText(ctx.args.join(" "))

        if (requestedCategory) {
          const commands = visible.filter(
            (command) => normalizeText(command.category) === requestedCategory,
          )
          if (!commands.length) {
            const categories = [...new Set(visible.map((command) => command.category))]
            return ctx.privateReply(`Catégories : ${categories.join(", ")}`)
          }

          const lines = commands.map(
            (command) =>
              `${ctx.config.prefix}${command.name}${command.usage ? ` ${command.usage}` : ""} — ${command.description}`,
          )
          return ctx.privateReply(`📘 ${commands[0].category}\n${lines.join("\n")}`)
        }

        const grouped = new Map()
        for (const command of visible) {
          if (!grouped.has(command.category)) grouped.set(command.category, [])
          grouped.get(command.category).push(`${ctx.config.prefix}${command.name}`)
        }

        const lines = [...grouped.entries()].map(
          ([category, commands]) => `${category} : ${commands.join(", ")}`,
        )
        await ctx.privateReply(
          `🤖 Commandes disponibles\n${lines.join("\n")}\n\n` +
            `🎭 Emotes directes : écris un numéro de 1 à 260 ou le nom complet. Écris stop pour arrêter la boucle.\n` +
            `Détail : ${ctx.config.prefix}help <catégorie>`,
        )
      },
    },
    {
      name: "ping",
      category: "Général",
      description: "Vérifie si le bot répond.",
      cooldownMs: 1000,
      async execute(ctx) {
        const startedAt = Date.now()
        await ctx.reply(`🏓 Pong ! Bot en ligne (${Date.now() - startedAt} ms).`)
      },
    },
    {
      name: "uptime",
      aliases: ["online"],
      category: "Général",
      description: "Affiche le temps de connexion du bot.",
      async execute(ctx) {
        const seconds = Math.floor((Date.now() - (ctx.bot.connectTime || Date.now())) / 1000)
        await ctx.reply(`⏱️ En ligne depuis ${formatDuration(seconds)}.`)
      },
    },
    {
      name: "botinfo",
      aliases: ["bot"],
      category: "Général",
      description: "Affiche les informations principales du bot.",
      async execute(ctx) {
        const count = await ctx.bot.room.users.count()
        await ctx.privateReply(
          `🤖 ${ctx.bot.metadata?.room?.roomName || "Bot Highrise"}\n` +
            `Statut : ${ctx.bot.status}\n` +
            `Utilisateurs : ${count}\n` +
            `Commandes : ${ctx.router.commands.size}\n` +
            `Emotes disponibles : ${ctx.bot.emotes.size}\n` +
            `Préfixe : ${ctx.config.prefix}`,
        )
      },
    },
    {
      name: "room",
      aliases: ["salle"],
      category: "Général",
      description: "Affiche les informations de la salle.",
      async execute(ctx) {
        const count = await ctx.bot.room.users.count()
        await ctx.reply(
          `🏠 ${ctx.bot.metadata?.room?.roomName || "Salle Highrise"} — ${count} utilisateur(s).`,
        )
      },
    },
    {
      name: "users",
      aliases: ["membres", "list"],
      category: "Général",
      description: "Liste les utilisateurs présents.",
      usage: "[page]",
      async execute(ctx) {
        const response = await ctx.bot.room.users.get()
        if (!response?.ok) return ctx.privateReply("Impossible de récupérer la liste de la salle.")

        const users = response.users.map((entry) => entry.user.username).sort()
        const page = pageItems(users, ctx.args[0], 15)
        await ctx.privateReply(
          `👥 Utilisateurs (${page.totalItems}) — page ${page.page}/${page.totalPages}\n` +
            page.items.map((username, index) => `${page.start + index + 1}. @${username}`).join("\n"),
        )
      },
    },
    {
      name: "id",
      category: "Général",
      description: "Affiche ton identifiant ou celui d’un utilisateur.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        if (!ctx.args[0]) return ctx.privateReply(`Ton identifiant : ${ctx.user.id}`)
        const target = await ctx.resolver.resolve(ctx.args[0])
        if (!target) return ctx.privateReply("Utilisateur introuvable.")
        await ctx.privateReply(`@${target.username} : ${target.id}`)
      },
    },
    {
      name: "profile",
      aliases: ["profil", "whois"],
      category: "Général",
      description: "Affiche un résumé du profil Highrise.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        const identifier = ctx.args[0] || ctx.user.username
        const target = await ctx.resolver.resolve(identifier)
        if (!target) return ctx.privateReply("Utilisateur introuvable.")

        const profile = target.profile || (await ctx.bot.webapi.users.get(target.id))
        if (!profile?.ok) {
          return ctx.privateReply(`@${target.username} — ID : ${target.id}`)
        }

        await ctx.privateReply(
          `👤 @${profile.username}\n` +
            `ID : ${profile.id}\n` +
            `Abonnés : ${profile.followers} | Abonnements : ${profile.following}\n` +
            `Amis : ${profile.friends} | Crew : ${profile.crew?.name || "Aucun"}\n` +
            `Bio : ${truncate(profile.bio || "Aucune", 120)}`,
        )
      },
    },
    {
      name: "where",
      aliases: ["position", "pos"],
      category: "Général",
      description: "Affiche la position d’un utilisateur présent.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        const identifier = ctx.args[0] || ctx.user.username
        const target = await ctx.resolver.resolve(identifier, { inRoom: true })
        if (!target) return ctx.privateReply("Cet utilisateur n’est pas dans la salle.")

        const position = target.position
        if (Number.isFinite(position?.x)) {
          return ctx.privateReply(
            `📍 @${target.username} : x=${position.x}, y=${position.y}, z=${position.z}, ${position.facing}`,
          )
        }
        if (position?.entity_id) {
          return ctx.privateReply(
            `📍 @${target.username} est assis sur ${position.entity_id} (ancre ${position.anchor_ix}).`,
          )
        }
        await ctx.privateReply("Position indisponible.")
      },
    },
    {
      name: "staff",
      aliases: ["mods", "moderators"],
      category: "Général",
      description: "Affiche le staff présent dans la salle.",
      async execute(ctx) {
        const response = await ctx.bot.room.users.get()
        if (!response?.ok) return ctx.privateReply("Impossible de récupérer le staff.")

        const staff = []
        for (const entry of response.users) {
          if (await ctx.permissions.isModerator(entry.user.id)) {
            const role = ctx.permissions.isOwner(entry.user.id) ? "Propriétaire" : "Modérateur"
            staff.push(`@${entry.user.username} (${role})`)
          }
        }

        await ctx.privateReply(
          staff.length ? `🛡️ Staff présent :\n${staff.join("\n")}` : "Aucun membre du staff n’est présent.",
        )
      },
    },
  ]
}

module.exports = createGeneralCommands
