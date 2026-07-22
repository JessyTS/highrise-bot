const { parseDuration, formatDuration } = require("../utils/duration")
const { pageItems, truncate } = require("../utils/text")

async function resolveModerationTarget(ctx, identifier, options = {}) {
  if (!identifier) {
    await ctx.privateReply("Tu dois indiquer un utilisateur.")
    return null
  }

  const target = await ctx.resolver.resolve(identifier, options)
  if (!target) {
    await ctx.privateReply(
      options.inRoom ? "Cet utilisateur n’est pas présent dans la salle." : "Utilisateur introuvable.",
    )
    return null
  }

  const permission = await ctx.permissions.canModerate(ctx.user.id, target.id)
  if (!permission.allowed) {
    await ctx.privateReply(permission.reason)
    return null
  }

  return target
}

function logAction(ctx, action, target, details = {}) {
  ctx.store.addModerationLog({
    action,
    targetId: target.id,
    targetUsername: target.username,
    moderatorId: ctx.user.id,
    moderatorUsername: ctx.user.username,
    ...details,
  })
}

function formatLogEntry(entry) {
  const date = new Date(entry.createdAt).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  })
  const duration = entry.duration ? ` (${formatDuration(entry.duration)})` : ""
  const status = entry.success === false ? " [échec]" : ""
  return `${date} — ${entry.action}${duration} par @${entry.moderatorUsername || "?"}${status} : ${truncate(entry.reason || "Aucune raison", 70)}`
}

function createModerationCommands() {
  return [
    {
      name: "warn",
      aliases: ["avertir", "avertissement"],
      category: "Modération",
      permission: "moderator",
      description: "Ajoute un avertissement à un utilisateur.",
      usage: "@utilisateur [raison]",
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0])
        if (!target) return
        const reason = truncate(ctx.args.slice(1).join(" ") || "Aucune raison indiquée", 140)
        ctx.store.addWarning(target, ctx.user, reason)
        const count = ctx.store.getWarnings(target.id).length
        logAction(ctx, "warn", target, { reason, success: true })

        await ctx.reply(
          `⚠️ @${target.username} reçoit un avertissement (${count}/${ctx.store.settings.warnLimit}). Raison : ${reason}`,
        )

        if (count >= ctx.store.settings.warnLimit) {
          const result = await ctx.bot.player.moderation.kick(target.id)
          logAction(ctx, "kick", target, {
            reason: "Limite d’avertissements atteinte",
            success: Boolean(result?.ok),
          })
          await ctx.reply(
            result?.ok
              ? `🚪 @${target.username} a été expulsé après ${count} avertissements.`
              : `La limite est atteinte, mais l’expulsion a échoué : ${result?.error || "erreur inconnue"}`,
          )
        }
      },
    },
    {
      name: "warnings",
      aliases: ["warns", "avertissements"],
      category: "Modération",
      description: "Affiche tes avertissements ou ceux d’un utilisateur pour le staff.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        const identifier = ctx.args[0]
        let target = ctx.user

        if (identifier) {
          if (!(await ctx.permissions.isModerator(ctx.user.id))) {
            return ctx.privateReply("Seul le staff peut consulter les avertissements d’une autre personne.")
          }
          target = await ctx.resolver.resolve(identifier)
          if (!target) return ctx.privateReply("Utilisateur introuvable.")
        }

        const warnings = ctx.store.getWarnings(target.id)
        if (!warnings.length) return ctx.privateReply(`@${target.username} n’a aucun avertissement.`)

        await ctx.privateReply(
          `⚠️ Avertissements de @${target.username} (${warnings.length})\n` +
            warnings
              .slice(-10)
              .map(
                (warning, index) =>
                  `${index + 1}. ${truncate(warning.reason, 80)} — @${warning.moderatorUsername}`,
              )
              .join("\n"),
        )
      },
    },
    {
      name: "clearwarnings",
      aliases: ["clearwarns"],
      category: "Modération",
      permission: "moderator",
      description: "Supprime les avertissements d’un utilisateur.",
      usage: "@utilisateur",
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0])
        if (!target) return
        const count = ctx.store.clearWarnings(target.id)
        logAction(ctx, "clearwarnings", target, {
          reason: `${count} avertissement(s) supprimé(s)`,
          success: true,
        })
        await ctx.reply(`✅ ${count} avertissement(s) supprimé(s) pour @${target.username}.`)
      },
    },
    {
      name: "kick",
      aliases: ["expulser"],
      category: "Modération",
      permission: "moderator",
      description: "Expulse un utilisateur de la salle.",
      usage: "@utilisateur [raison]",
      cooldownMs: 3000,
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0], { inRoom: true })
        if (!target) return
        const reason = truncate(ctx.args.slice(1).join(" ") || "Aucune raison indiquée", 140)
        const result = await ctx.bot.player.moderation.kick(target.id)
        logAction(ctx, "kick", target, { reason, success: Boolean(result?.ok) })

        await ctx.reply(
          result?.ok
            ? `🚪 @${target.username} a été expulsé. Raison : ${reason}`
            : `Échec de l’expulsion : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "mute",
      aliases: ["silence"],
      category: "Modération",
      permission: "moderator",
      description: "Rend un utilisateur muet pendant une durée.",
      usage: "@utilisateur <durée> [raison]",
      cooldownMs: 3000,
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0], { inRoom: true })
        if (!target) return
        const duration = parseDuration(ctx.args[1], {
          minimum: 60,
          maximum: ctx.config.maxModerationDurationSeconds,
        })
        if (!duration) {
          return ctx.privateReply("Durée invalide. Exemples : 60s, 10m, 2h, 7j.")
        }
        const reason = truncate(ctx.args.slice(2).join(" ") || "Aucune raison indiquée", 140)
        const result = await ctx.bot.player.moderation.mute(target.id, duration)
        logAction(ctx, "mute", target, { duration, reason, success: Boolean(result?.ok) })

        await ctx.reply(
          result?.ok
            ? `🔇 @${target.username} est muet pendant ${formatDuration(duration)}. Raison : ${reason}`
            : `Échec de la mise en sourdine : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "unmute",
      aliases: ["unsilence"],
      category: "Modération",
      permission: "moderator",
      description: "Retire la mise en sourdine d’un utilisateur.",
      usage: "@utilisateur",
      cooldownMs: 3000,
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0])
        if (!target) return
        const result = await ctx.bot.player.moderation.unmute(target.id)
        logAction(ctx, "unmute", target, {
          reason: "Mise en sourdine retirée",
          success: Boolean(result?.ok),
        })
        await ctx.reply(
          result?.ok
            ? `🔊 @${target.username} peut de nouveau parler.`
            : `Échec : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "ban",
      aliases: ["bannir"],
      category: "Modération",
      permission: "moderator",
      description: "Bannit un utilisateur pendant une durée.",
      usage: "@utilisateur <durée> [raison]",
      cooldownMs: 5000,
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0])
        if (!target) return
        const duration = parseDuration(ctx.args[1], {
          minimum: 60,
          maximum: ctx.config.maxModerationDurationSeconds,
        })
        if (!duration) {
          return ctx.privateReply("Durée invalide. Exemples : 10m, 2h, 7j, 4semaines.")
        }
        const reason = truncate(ctx.args.slice(2).join(" ") || "Aucune raison indiquée", 140)
        const result = await ctx.bot.player.moderation.ban(target.id, duration)
        logAction(ctx, "ban", target, { duration, reason, success: Boolean(result?.ok) })

        await ctx.reply(
          result?.ok
            ? `⛔ @${target.username} est banni pendant ${formatDuration(duration)}. Raison : ${reason}`
            : `Échec du bannissement : ${result?.error || "erreur inconnue"}`,
        )
      },
    },
    {
      name: "unban",
      aliases: ["débannir", "debannir"],
      category: "Modération",
      permission: "moderator",
      description: "Débannit un utilisateur avec son nom ou son ID.",
      usage: "<utilisateur|ID>",
      cooldownMs: 5000,
      async execute(ctx) {
        const target = await resolveModerationTarget(ctx, ctx.args[0])
        if (!target) return
        const result = await ctx.bot.player.moderation.unban(target.id)
        logAction(ctx, "unban", target, {
          reason: "Bannissement retiré",
          success: Boolean(result?.ok),
        })
        await ctx.reply(
          result?.ok
            ? `✅ @${target.username} a été débanni.`
            : `Échec du débannissement : ${result?.error || "le bot doit appartenir au propriétaire"}`,
        )
      },
    },
    {
      name: "history",
      aliases: ["historique"],
      category: "Modération",
      permission: "moderator",
      description: "Affiche l’historique de modération d’un utilisateur.",
      usage: "@utilisateur [page]",
      async execute(ctx) {
        const target = await ctx.resolver.resolve(ctx.args[0])
        if (!target) return ctx.privateReply("Utilisateur introuvable.")
        const entries = ctx.store.getModerationLog(target.id)
        if (!entries.length) return ctx.privateReply(`Aucun historique pour @${target.username}.`)

        const page = pageItems(entries, ctx.args[1], 8)
        await ctx.privateReply(
          `📋 Historique de @${target.username} — page ${page.page}/${page.totalPages}\n` +
            page.items.map(formatLogEntry).join("\n"),
        )
      },
    },
    {
      name: "modlog",
      aliases: ["journalmod"],
      category: "Modération",
      permission: "moderator",
      description: "Affiche le journal récent de modération.",
      usage: "[page]",
      async execute(ctx) {
        const entries = ctx.store.getModerationLog()
        if (!entries.length) return ctx.privateReply("Le journal de modération est vide.")
        const page = pageItems(entries, ctx.args[0], 8)
        await ctx.privateReply(
          `📋 Journal de modération — page ${page.page}/${page.totalPages}\n` +
            page.items
              .map((entry) => `@${entry.targetUsername || entry.targetId} — ${formatLogEntry(entry)}`)
              .join("\n"),
        )
      },
    },
  ]
}

module.exports = createModerationCommands
