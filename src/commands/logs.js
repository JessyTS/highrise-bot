const { normalizeText, pageItems, truncate } = require("../utils/text")

function formatEntry(entry) {
  const date = new Date(entry.createdAt).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  })
  const actor = entry.actorUsername ? `@${entry.actorUsername}` : entry.actorId || "système"
  if (entry.type === "command") {
    return `${date} · ${entry.status === "error" ? "❌" : entry.status === "denied" ? "⛔" : "✅"} ` +
      `${actor} · ${entry.prefix || "!"}${entry.command}${entry.arguments ? ` ${truncate(entry.arguments, 60)}` : ""}`
  }
  if (entry.type === "direct-emote") {
    return `${date} · 🎭 ${actor} · ${entry.status} ${entry.emoteName || entry.emoteId || "emote"}`
  }
  return `${date} · 🛡️ ${actor} · ${truncate(entry.details || entry.status, 80)}`
}

function createLogCommands() {
  return [
    {
      name: "actionlog",
      aliases: ["botlog", "adminlog", "journalbot"],
      category: "Administration",
      permission: "admin",
      description: "Consulte le journal privé des actions exécutées via le bot.",
      usage: "[status|@utilisateur|page|clear confirm]",
      async execute(ctx) {
        const action = normalizeText(ctx.args[0] || "list")
        const settings = ctx.store.settings.adminLogs

        if (["status", "etat", "voir"].includes(action)) {
          const recipients = ctx.adminLogs?.recipientIds || []
          return ctx.privateReply(
            `🔒 Logs privés admins : ${settings.enabled ? "on" : "off"}\n` +
              `Commandes : ${settings.commands ? "on" : "off"} · emotes directes : ${settings.directEmotes ? "on" : "off"}\n` +
              `Actions auto : ${settings.automaticActions ? "on" : "off"} · refus : ${settings.deniedAttempts ? "on" : "off"}\n` +
              `Historique : ${settings.storeHistory ? "on" : "off"} · entrées ${ctx.store.getActionLog().length}\n` +
              `Destinataires admins : ${recipients.length}`,
          )
        }

        if (["clear", "vider", "effacer"].includes(action)) {
          if (!ctx.permissions.isOwner(ctx.user.id)) {
            return ctx.privateReply("⛔ Seul le propriétaire de la salle peut vider ce journal.")
          }
          if (normalizeText(ctx.args[1]) !== "confirm") {
            return ctx.privateReply(`Confirme avec ${ctx.config.prefix}actionlog clear confirm.`)
          }
          const count = ctx.store.clearActionLog()
          ctx.setLogDetails?.(`${count} entrée(s) du journal supprimée(s)`)
          return ctx.privateReply(`✅ ${count} entrée(s) supprimée(s).`)
        }

        let entries = ctx.store.getActionLog()
        let pageArgument = ctx.args[0]
        if (ctx.args[0] && !/^\d+$/.test(ctx.args[0])) {
          const target = await ctx.resolver.resolve(ctx.args[0])
          if (!target) return ctx.privateReply("Utilisateur introuvable.")
          entries = ctx.store.getActionLog({ actorId: target.id })
          pageArgument = ctx.args[1]
        }
        if (!entries.length) return ctx.privateReply("Le journal privé des actions est vide.")
        const page = pageItems(entries, pageArgument, 8)
        return ctx.privateReply(
          `🔒 Journal privé admins — page ${page.page}/${page.totalPages}\n` +
            page.items.map(formatEntry).join("\n"),
        )
      },
    },
  ]
}

module.exports = createLogCommands
