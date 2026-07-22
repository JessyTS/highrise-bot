const { findEmotes, normalizeEmoteName, resolveEmote } = require("../utils/emotes")
const { pageItems, sleep } = require("../utils/text")

async function parseEmoteTarget(ctx, args) {
  const copiedArgs = [...args]
  const botIndex = copiedArgs.findIndex(isBotReference)
  const mentionIndex = copiedArgs.findIndex((argument) => argument.startsWith("@"))
  let target = { ...ctx.user, inRoom: true }

  if (botIndex !== -1) {
    target = botTarget(ctx)
    copiedArgs.splice(botIndex, 1)
  } else if (mentionIndex !== -1) {
    target = await ctx.resolver.resolve(copiedArgs[mentionIndex], { inRoom: true })
    copiedArgs.splice(mentionIndex, 1)
  }

  return { target, identifier: copiedArgs.join(" ").trim() }
}

function isBotReference(value) {
  return normalizeEmoteName(String(value || "").replace(/^@/, "")) === "bot"
}

function botTarget(ctx) {
  return {
    id: ctx.bot.metadata?.botId,
    username: "Bot",
    inRoom: true,
  }
}

function targetIsBot(ctx, target) {
  return Boolean(target?.id && target.id === ctx.bot.metadata?.botId)
}

async function requireBotAdmin(ctx) {
  if (ctx.permissions.isAdmin?.(ctx.user.id)) return true
  await ctx.privateReply("Seuls le propriétaire et les admins du bot peuvent modifier son emote permanente.")
  return false
}

async function startPersistentBotEmote(ctx, emote) {
  const target = botTarget(ctx)
  const started = await ctx.bot.looper.start(target, emote.id)
  const active = Boolean(started || ctx.bot.looper.isActive?.(target.id, emote.id))
  if (!active) return null
  ctx.store.setPersistentBotEmote?.(emote, ctx.user)
  return started || emote
}

async function resolveOptionalTarget(ctx, args) {
  const reference = args.find((argument) => argument.startsWith("@") || isBotReference(argument))
  if (!reference) return { ...ctx.user, inRoom: true }
  if (isBotReference(reference)) return botTarget(ctx)
  return ctx.resolver.resolve(reference, { inRoom: true })
}

function emoteNotFoundMessage(ctx, matches) {
  if (!matches.length) {
    return `Emote introuvable. Utilise ${ctx.config.prefix}findemote <nom>.`
  }
  return `Plusieurs emotes correspondent : ${matches.map((emote) => emote.name).join(", ")}`
}

async function requireLoopPermission(ctx, target) {
  if (target.id === ctx.user.id) return true
  if (await ctx.permissions.isModerator(ctx.user.id)) return true
  await ctx.privateReply("Seuls les modérateurs peuvent lancer ou arrêter une boucle sur quelqu’un d’autre.")
  return false
}

function createEmoteCommands() {
  return [
    {
      name: "emotes",
      aliases: ["allemotes", "emotelist"],
      category: "Emotes",
      description: "Liste les 260 emotes intégrées ou recherche un nom.",
      usage: "[page|recherche]",
      cooldownMs: 1500,
      async execute(ctx) {
        const query = ctx.args.join(" ").trim()
        const isPage = !query || /^\d+$/.test(query)

        if (!isPage) {
          const matches = findEmotes(ctx.bot.emotes, query, 20)
          if (!matches.length) return ctx.privateReply("Aucune emote trouvée.")
          return ctx.privateReply(
            `🔎 Résultats pour « ${query} »\n` +
              matches.map((emote) => `${emote.name} — ${emote.id}`).join("\n"),
          )
        }

        const emotes = ctx.bot.emotes.getAll()
        const page = pageItems(emotes, query || 1, 12)
        await ctx.privateReply(
          `🎭 Emotes (${page.totalItems}) — page ${page.page}/${page.totalPages}\n` +
            page.items
              .map((emote, index) => `${page.start + index + 1}. ${emote.name}`)
              .join("\n") +
            "\nÉcris simplement le numéro ou le nom pour lancer la boucle. Écris stop pour l’arrêter.",
        )
      },
    },
    {
      name: "findemote",
      aliases: ["searchemote", "chercheemote"],
      category: "Emotes",
      description: "Recherche une emote par son nom ou son identifiant.",
      usage: "<recherche>",
      async execute(ctx) {
        if (!ctx.rawArgs) return ctx.privateReply(`Usage : ${ctx.config.prefix}findemote <nom>`)
        const matches = findEmotes(ctx.bot.emotes, ctx.rawArgs, 20)
        if (!matches.length) return ctx.privateReply("Aucune emote trouvée.")
        await ctx.privateReply(
          matches.map((emote) => `${emote.name} — ${emote.id} (${emote.duration}s)`).join("\n"),
        )
      },
    },
    {
      name: "emoteinfo",
      aliases: ["einfo"],
      category: "Emotes",
      description: "Affiche l’identifiant et la durée d’une emote.",
      usage: "<nom|ID|numéro>",
      async execute(ctx) {
        const resolved = resolveEmote(ctx.bot.emotes, ctx.rawArgs)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))
        const index = ctx.bot.emotes.getAll().findIndex((item) => item.id === resolved.emote.id) + 1
        await ctx.privateReply(
          `🎭 ${resolved.emote.name}\nNuméro : ${index}\nID : ${resolved.emote.id}\nDurée : ${resolved.emote.duration}s`,
        )
      },
    },
    {
      name: "emote",
      aliases: ["e", "dance"],
      category: "Emotes",
      description: "Lance une emote sur toi ou un utilisateur présent.",
      usage: "<nom|ID|numéro> [@utilisateur]",
      cooldownMs: 3000,
      async execute(ctx) {
        const { target, identifier } = await parseEmoteTarget(ctx, ctx.args)
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        if (!identifier) return ctx.privateReply(`Usage : ${ctx.config.prefix}emote <nom> [@utilisateur]`)

        const resolved = resolveEmote(ctx.bot.emotes, identifier)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))

        if (targetIsBot(ctx, target)) {
          if (!(await requireBotAdmin(ctx))) return
          const started = await startPersistentBotEmote(ctx, resolved.emote)
          if (!started) return ctx.privateReply("Impossible de lancer la boucle permanente sur le bot.")
          return ctx.reply(
            `🤖🎭 ${resolved.emote.name} tourne maintenant en permanence sur le bot, même après redémarrage.`,
          )
        }

        const result = await ctx.bot.player.emote(resolved.emote.id, target.id)
        if (!result?.ok) return ctx.privateReply(`Échec de l’emote : ${result?.error || "erreur inconnue"}`)
        await ctx.reply(`🎭 ${resolved.emote.name} lancée sur @${target.username}.`)
      },
    },
    {
      name: "randomemote",
      aliases: ["random", "erandom"],
      category: "Emotes",
      description: "Lance une emote choisie au hasard.",
      usage: "[@utilisateur]",
      cooldownMs: 3000,
      async execute(ctx) {
        const target = await resolveOptionalTarget(ctx, ctx.args)
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")

        const all = ctx.bot.emotes.getAll()
        const emote = all[Math.floor(Math.random() * all.length)]
        if (targetIsBot(ctx, target)) {
          if (!(await requireBotAdmin(ctx))) return
          const started = await startPersistentBotEmote(ctx, emote)
          if (!started) return ctx.privateReply("Impossible de lancer la boucle permanente sur le bot.")
          return ctx.reply(`🤖🎲 ${emote.name} est devenue l’emote permanente du bot.`)
        }
        const result = await ctx.bot.player.emote(emote.id, target.id)
        if (!result?.ok) return ctx.privateReply(`Échec de l’emote : ${result?.error || "erreur inconnue"}`)
        await ctx.reply(`🎲 ${emote.name} lancée sur @${target.username}.`)
      },
    },
    {
      name: "loop",
      aliases: ["emoteloop", "boucle"],
      category: "Emotes",
      description: "Répète une emote jusqu’à la commande stop.",
      usage: "<nom|ID|numéro> [@utilisateur]",
      cooldownMs: 3000,
      async execute(ctx) {
        const { target, identifier } = await parseEmoteTarget(ctx, ctx.args)
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        if (!identifier) return ctx.privateReply(`Usage : ${ctx.config.prefix}loop <emote> [@utilisateur]`)
        if (targetIsBot(ctx, target)) {
          if (!(await requireBotAdmin(ctx))) return
        } else if (!(await requireLoopPermission(ctx, target))) return

        const resolved = resolveEmote(ctx.bot.emotes, identifier)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))
        const started = targetIsBot(ctx, target)
          ? await startPersistentBotEmote(ctx, resolved.emote)
          : await ctx.bot.looper.start(target, resolved.emote.id)
        if (!started) return ctx.privateReply("Cette boucle est déjà active ou l’emote est invalide.")
        await ctx.reply(
          targetIsBot(ctx, target)
            ? `🤖🔁 ${started.name} tourne en permanence sur le bot, même après redémarrage.`
            : `🔁 ${started.name} tourne maintenant en boucle sur @${target.username}.`,
        )
      },
    },
    {
      name: "stop",
      aliases: ["stopemote", "stoploop"],
      category: "Emotes",
      description: "Arrête une boucle d’emote.",
      usage: "[@utilisateur]",
      cooldownMs: 1500,
      async execute(ctx) {
        const target = await resolveOptionalTarget(ctx, ctx.args)
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        if (targetIsBot(ctx, target)) {
          if (!(await requireBotAdmin(ctx))) return
        } else if (!(await requireLoopPermission(ctx, target))) return

        const stopped = ctx.bot.looper.stop(target.id)
        const cleared = targetIsBot(ctx, target)
          ? ctx.store.clearPersistentBotEmote?.()
          : false
        await ctx.reply(
          targetIsBot(ctx, target)
            ? stopped || cleared
              ? "⏹️ Emote permanente du bot arrêtée et supprimée des redémarrages."
              : "Aucune emote permanente n’est configurée sur le bot."
            : stopped
              ? `⏹️ Boucle ${stopped.name} arrêtée pour @${target.username}.`
              : `Aucune boucle active pour @${target.username}.`,
        )
      },
    },
    {
      name: "botemote",
      aliases: ["emotebot", "botdance"],
      category: "Emotes",
      permission: "admin",
      description: "Configure l’emote permanente du bot, restaurée après redémarrage.",
      usage: "<nom|ID|numéro|status|stop>",
      cooldownMs: 2500,
      async execute(ctx) {
        const action = normalizeEmoteName(ctx.rawArgs)
        if (["status", "etat", "voir"].includes(action)) {
          const saved = ctx.store.getPersistentBotEmote?.()
          return ctx.privateReply(
            saved
              ? `🤖 Emote permanente : ${saved.name} (${saved.id})`
              : "Aucune emote permanente n’est configurée sur le bot.",
          )
        }
        if (["stop", "off", "arreter", "supprimer"].includes(action)) {
          const stopped = ctx.bot.looper.stop(ctx.bot.metadata?.botId)
          const cleared = ctx.store.clearPersistentBotEmote?.()
          return ctx.reply(
            stopped || cleared
              ? "⏹️ Emote permanente du bot arrêtée et supprimée."
              : "Aucune emote permanente n’était configurée.",
          )
        }
        if (!ctx.rawArgs) {
          return ctx.privateReply(`Usage : ${ctx.config.prefix}botemote <emote|status|stop>`)
        }

        const resolved = resolveEmote(ctx.bot.emotes, ctx.rawArgs)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))
        const started = await startPersistentBotEmote(ctx, resolved.emote)
        if (!started) return ctx.privateReply("Impossible de lancer cette emote permanente sur le bot.")
        await ctx.reply(
          `🤖🎭 ${started.name} est maintenant l’emote permanente du bot, même après redémarrage.`,
        )
      },
    },
    {
      name: "reaction",
      aliases: ["react"],
      category: "Emotes",
      description: "Envoie une réaction Highrise.",
      usage: "<clap|heart|thumbs|wave|wink> [@utilisateur]",
      cooldownMs: 3000,
      async execute(ctx) {
        const allowed = ["clap", "heart", "thumbs", "wave", "wink"]
        const reaction = String(ctx.args[0] || "").toLowerCase()
        if (!allowed.includes(reaction)) {
          return ctx.privateReply(`Réactions : ${allowed.join(", ")}`)
        }

        const mention = ctx.args.find((argument) => argument.startsWith("@"))
        const target = mention
          ? await ctx.resolver.resolve(mention, { inRoom: true })
          : { ...ctx.user, inRoom: true }
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")

        const result = await ctx.bot.player.react(target.id, reaction)
        if (!result?.ok) return ctx.privateReply(`Échec de la réaction : ${result?.error || "erreur inconnue"}`)
        await ctx.reply(`✨ Réaction ${reaction} envoyée à @${target.username}.`)
      },
    },
    {
      name: "emoteall",
      aliases: ["eall"],
      category: "Emotes",
      permission: "moderator",
      description: "Lance une emote une fois sur toute la salle.",
      usage: "<nom|ID|numéro>",
      cooldownMs: 10_000,
      async execute(ctx) {
        const resolved = resolveEmote(ctx.bot.emotes, ctx.rawArgs)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))
        const response = await ctx.bot.room.users.get()
        if (!response?.ok) return ctx.privateReply("Impossible de récupérer les utilisateurs.")

        const bulkSettings = ctx.store.settings.actions || {}
        const users = response.users.slice(0, bulkSettings.bulkMaxUsers || ctx.config.bulkMaxUsers)
        await ctx.reply(`🎭 Lancement de ${resolved.emote.name} sur ${users.length} utilisateur(s)…`)
        let success = 0
        for (const entry of users) {
          const result = await ctx.bot.player.emote(resolved.emote.id, entry.user.id)
          if (result?.ok) success += 1
          await sleep(bulkSettings.bulkDelayMs || ctx.config.bulkActionDelayMs)
        }
        await ctx.reply(`✅ Emote terminée : ${success}/${users.length} réussite(s).`)
      },
    },
    {
      name: "danceparty",
      aliases: ["loopall", "party"],
      category: "Emotes",
      permission: "moderator",
      description: "Lance une boucle d’emote sur toute la salle.",
      usage: "<nom|ID|numéro>",
      cooldownMs: 10_000,
      async execute(ctx) {
        const resolved = resolveEmote(ctx.bot.emotes, ctx.rawArgs)
        if (!resolved.emote) return ctx.privateReply(emoteNotFoundMessage(ctx, resolved.matches))
        const response = await ctx.bot.room.users.get()
        if (!response?.ok) return ctx.privateReply("Impossible de récupérer les utilisateurs.")

        const bulkSettings = ctx.store.settings.actions || {}
        const users = response.users.slice(0, bulkSettings.bulkMaxUsers || ctx.config.bulkMaxUsers)
        await ctx.reply(`🪩 Dance party ${resolved.emote.name} pour ${users.length} utilisateur(s)…`)
        let success = 0
        for (const entry of users) {
          const started = await ctx.bot.looper.start(entry.user, resolved.emote.id)
          if (started) success += 1
          await sleep(bulkSettings.bulkDelayMs || ctx.config.bulkActionDelayMs)
        }
        await ctx.reply(`✅ Dance party active pour ${success}/${users.length} utilisateur(s).`)
      },
    },
    {
      name: "stopall",
      aliases: ["stopparty"],
      category: "Emotes",
      permission: "moderator",
      description: "Arrête toutes les boucles d’emotes.",
      cooldownMs: 3000,
      async execute(ctx) {
        ctx.bot.looper.destroy()
        ctx.store.clearPersistentBotEmote?.()
        await ctx.reply("⏹️ Toutes les boucles d’emotes ont été arrêtées.")
      },
    },
  ]
}

module.exports = createEmoteCommands
