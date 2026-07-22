const TipService = require("../core/TipService")
const { pageItems } = require("../utils/text")

function sentAmount(entry) {
  return Number(entry.sentAmount ?? (entry.success ? entry.amount : 0))
}

function pendingDescription(pending) {
  if (pending.kind === "bulk") {
    return `${pending.amount} gold × ${pending.targets.length} destinataire(s) = ${pending.totalAmount} gold`
  }
  const label = pending.kind === "split" ? "Tip fractionné" : "Tip"
  return `${label} de ${pending.amount} gold vers @${pending.target.username}`
}

function confirmationMessage(result) {
  if (result.ok && result.pending.kind === "bulk") {
    return `✅ Tips collectifs terminés : ${result.successCount}/${result.pending.targets.length}, ${result.sentAmount} gold envoyés.`
  }
  if (result.ok) {
    return `✅ ${result.sentAmount} gold envoyés à @${result.pending.target.username}.`
  }
  if (result.partial) {
    return `⚠️ Envoi partiel : ${result.sentAmount} gold envoyés. ${result.error}`
  }
  return `Tip refusé : ${result.error}`
}

async function sendConfirmation(ctx, result) {
  const seconds = Math.max(1, Math.ceil((result.expiresAt - Date.now()) / 1000))
  ctx.setLogDetails?.(`Tip préparé : ${pendingDescription(result)}`)
  return ctx.privateReply(
    `⚠️ Confirmation obligatoire\n` +
      `${pendingDescription(result)}\n` +
      `Solde actuel : ${result.walletGold}\n` +
      `Confirme sous ${seconds}s avec : ${ctx.config.prefix}tip confirm ${result.code}\n` +
      `Annuler : ${ctx.config.prefix}tip cancel ${result.code}`,
  )
}

function createEconomyCommands() {
  return [
    {
      name: "tip",
      aliases: ["pourboire", "don"],
      category: "Économie HR",
      permission: "admin",
      description: "Prépare, fractionne, confirme ou annule un tip du bot.",
      usage: "<@user montant|split @user total|confirm code|cancel [code]|pending|status>",
      cooldownMs: 1500,
      async execute(ctx) {
        const action = String(ctx.args[0] || "status").toLowerCase()

        if (action === "status") {
          const settings = ctx.store.settings.tips
          const wallet = await ctx.bot.inventory.wallet.get()
          const availableGold = wallet?.ok ? Number(wallet.gold || 0) : "indisponible"
          return ctx.privateReply(
            `💸 Tips du bot : ${settings.enabled ? "activés" : "désactivés"}\n` +
              `Gold disponible : ${availableGold}\n` +
              `Plafond par destinataire : ${settings.maxPerTip}\n` +
              `Global/jour : ${settings.dailyLimit} · par admin : ${settings.perAdminDailyLimit}\n` +
              `Par destinataire/jour : ${settings.perRecipientDailyLimit}\n` +
              `Dépensé aujourd’hui : ${ctx.tips.dailySpent}\n` +
              `Fractionnés : ${settings.splitEnabled ? "on" : "off"} · collectifs : ${settings.bulkEnabled ? "on" : "off"}\n` +
              `Montants directs : ${TipService.ALLOWED_AMOUNTS.join(", ")}`,
          )
        }

        if (["pending", "attente"].includes(action)) {
          const pending = ctx.tips.getPending(ctx.user.id)
          if (!pending) return ctx.privateReply("Aucun tip en attente.")
          const seconds = Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000))
          return ctx.privateReply(
            `⏳ ${pendingDescription(pending)}\nExpire dans ${seconds}s.\n` +
              `${ctx.config.prefix}tip confirm ${pending.code}`,
          )
        }

        if (["confirm", "confirmer"].includes(action)) {
          const result = await ctx.tips.confirm(ctx.user, ctx.args[1])
          ctx.setLogDetails?.(
            result.pending
              ? `${pendingDescription(result.pending)} · envoyé ${result.sentAmount || 0}`
              : `Confirmation refusée : ${result.error}`,
          )
          return ctx.privateReply(confirmationMessage(result))
        }

        if (["cancel", "annuler"].includes(action)) {
          const result = ctx.tips.cancel(ctx.user.id, ctx.args[1])
          if (result.ok) ctx.setLogDetails?.(`Tip annulé : ${pendingDescription(result.pending)}`)
          return ctx.privateReply(result.ok ? "✅ Tip en attente annulé." : result.error)
        }

        if (["split", "fractionner", "fractionne"].includes(action)) {
          const target = await ctx.resolver.resolve(ctx.args[1], { inRoom: true })
          if (!target) return ctx.privateReply("Destinataire introuvable dans la salle.")
          const result = await ctx.tips.requestSplit(ctx.user, target, ctx.args[2])
          if (!result.ok) return ctx.privateReply(`Tip refusé : ${result.error}`)
          return sendConfirmation(ctx, result)
        }

        const target = await ctx.resolver.resolve(ctx.args[0], { inRoom: true })
        if (!target) return ctx.privateReply("Destinataire introuvable dans la salle.")
        const result = await ctx.tips.request(ctx.user, target, ctx.args[1])
        if (!result.ok) return ctx.privateReply(`Tip refusé : ${result.error}`)
        return sendConfirmation(ctx, result)
      },
    },
    {
      name: "tipall",
      aliases: ["tiproom", "pourboireall"],
      category: "Économie HR",
      permission: "admin",
      description: "Prépare un tip confirmé pour plusieurs joueurs de la salle.",
      usage: "<montant>",
      cooldownMs: 10_000,
      async execute(ctx) {
        const response = await ctx.bot.room.users.get()
        if (!response?.ok) return ctx.privateReply("Impossible de récupérer les joueurs de la salle.")
        const targets = response.users.map((entry) => entry.user)
        const result = await ctx.tips.requestBulk(ctx.user, targets, ctx.args[0])
        if (!result.ok) return ctx.privateReply(`Tips collectifs refusés : ${result.error}`)
        return sendConfirmation(ctx, result)
      },
    },
    {
      name: "tiphistory",
      aliases: ["tips", "pourboires"],
      category: "Économie HR",
      permission: "admin",
      description: "Affiche en privé l’historique des tips du bot.",
      usage: "[@utilisateur] [page]",
      async execute(ctx) {
        let entries = ctx.store.getTipLog()
        let pageArgument = ctx.args[0]
        if (ctx.args[0] && !/^\d+$/.test(ctx.args[0])) {
          const target = await ctx.resolver.resolve(ctx.args[0])
          if (!target) return ctx.privateReply("Utilisateur introuvable.")
          entries = entries.filter((entry) => entry.targetId === target.id)
          pageArgument = ctx.args[1]
        }
        if (!entries.length) return ctx.privateReply("Aucun tip ne correspond à cette recherche.")
        const page = pageItems(entries, pageArgument, 8)
        await ctx.privateReply(
          `💸 Historique des tips — page ${page.page}/${page.totalPages}\n` +
            page.items.map((entry) => {
              const date = new Date(entry.createdAt).toLocaleString("fr-FR")
              const icon = entry.success ? "✅" : sentAmount(entry) > 0 ? "⚠️" : "❌"
              return `${icon} ${date} · ${sentAmount(entry)}/${entry.amount} → @${entry.targetUsername || entry.targetId} · @${entry.actorUsername || entry.actorId}`
            }).join("\n"),
        )
      },
    },
    {
      name: "tipstats",
      aliases: ["statstips", "tipreport"],
      category: "Économie HR",
      permission: "admin",
      description: "Affiche les statistiques privées des tips sortants.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        let entries = ctx.store.getTipLog()
        let label = "tous les destinataires"
        if (ctx.args[0]) {
          const target = await ctx.resolver.resolve(ctx.args[0])
          if (!target) return ctx.privateReply("Utilisateur introuvable.")
          entries = entries.filter((entry) => entry.targetId === target.id)
          label = `@${target.username}`
        }
        const total = entries.reduce((sum, entry) => sum + sentAmount(entry), 0)
        const successes = entries.filter((entry) => entry.success).length
        const partials = entries.filter((entry) => !entry.success && sentAmount(entry) > 0).length
        const failures = entries.length - successes - partials
        return ctx.privateReply(
          `📊 Tips — ${label}\n` +
            `Gold envoyé : ${total}\n` +
            `Opérations : ${entries.length} · réussies ${successes} · partielles ${partials} · échouées ${failures}\n` +
            `Dépensé aujourd’hui : ${ctx.tips.dailySpent}`,
        )
      },
    },
  ]
}

module.exports = createEconomyCommands
