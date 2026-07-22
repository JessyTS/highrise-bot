const { OutfitItem } = require("highrise.bot")

const { normalizeText, pageItems } = require("../utils/text")

const FACING_VALUES = ["FrontRight", "FrontLeft", "BackRight", "BackLeft"]
const FACING_ALIASES = new Map([
  ["fr", "FrontRight"],
  ["front right", "FrontRight"],
  ["front-right", "FrontRight"],
  ["fl", "FrontLeft"],
  ["front left", "FrontLeft"],
  ["front-left", "FrontLeft"],
  ["br", "BackRight"],
  ["back right", "BackRight"],
  ["back-right", "BackRight"],
  ["bl", "BackLeft"],
  ["back left", "BackLeft"],
  ["back-left", "BackLeft"],
])

function normalizeFacing(value, fallback = "FrontRight") {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = normalizeText(value)
  return FACING_VALUES.find((item) => normalizeText(item) === normalized)
    || FACING_ALIASES.get(normalized)
    || null
}

function isFloorPosition(position) {
  return Number.isFinite(Number(position?.x))
    && Number.isFinite(Number(position?.y))
    && Number.isFinite(Number(position?.z))
    && Number(position.x) >= 0
    && Number(position.z) >= 0
}

function copyPosition(position) {
  return {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z),
    facing: normalizeFacing(position.facing) || "FrontRight",
  }
}

function parseCoordinates(args) {
  if (args.length < 3) return { error: "Indique x, y et z." }
  const [x, y, z] = args.slice(0, 3).map(Number)
  if (![x, y, z].every(Number.isFinite) || x < 0 || z < 0) {
    return { error: "x et z doivent être positifs ou nuls ; y doit être un nombre." }
  }

  const facing = normalizeFacing(args[3])
  if (!facing) return { error: `Directions : ${FACING_VALUES.join(", ")}.` }
  return { position: { x, y, z, facing } }
}

function formatPosition(position) {
  return `x=${position.x}, y=${position.y}, z=${position.z}, ${position.facing}`
}

function formatPersistentPosition(position) {
  if (!position) return "aucune"
  if (position.type === "anchor") {
    return `assis sur ${position.entityId} (ancre ${position.anchorIndex})`
  }
  return formatPosition(position)
}

function resultError(result) {
  return result?.error || "erreur inconnue"
}

async function roomUser(ctx, identifier) {
  if (["me", "moi"].includes(normalizeText(identifier))) {
    identifier = ctx.user.id
  }
  return ctx.resolver.resolve(identifier, { inRoom: true })
}

async function movableTarget(ctx, identifier, options = {}) {
  const target = await roomUser(ctx, identifier)
  if (!target) {
    await ctx.privateReply("Utilisateur introuvable dans la salle.")
    return null
  }

  if (target.id === ctx.user.id && options.allowSelf !== false) return target
  const permission = await ctx.permissions.canModerate(ctx.user.id, target.id)
  if (!permission.allowed) {
    await ctx.privateReply(permission.reason)
    return null
  }
  return target
}

async function positionForUser(ctx, identifier) {
  const target = await roomUser(ctx, identifier)
  if (!target) return { error: "Utilisateur introuvable dans la salle." }
  if (!isFloorPosition(target.position)) {
    return { error: `La position de @${target.username} n’est pas une position au sol.` }
  }
  return { position: copyPosition(target.position), label: `@${target.username}` }
}

async function resolveDestination(ctx, args) {
  if (!args.length) return { error: "Destination manquante." }
  const first = normalizeText(args[0])

  if (["here", "ici", "moi", "me"].includes(first)) {
    return positionForUser(ctx, ctx.user.id)
  }
  if (first === "bot") {
    return positionForUser(ctx, ctx.bot.metadata?.botId)
  }
  if (args[0].startsWith("@")) {
    return positionForUser(ctx, args[0])
  }

  if (first === "spot" || first === "point" || first === "lieu") {
    const name = args.slice(1).join(" ").trim()
    const saved = ctx.store.getPosition(name)
    return saved
      ? { position: copyPosition(saved), label: `le point « ${saved.name} »` }
      : { error: `Point introuvable : « ${name || "?"} ».` }
  }

  const coordinates = parseCoordinates(args)
  if (!coordinates.error) return { ...coordinates, label: "les coordonnées indiquées" }

  const name = args.join(" ").trim()
  const saved = ctx.store.getPosition(name)
  if (saved) return { position: copyPosition(saved), label: `le point « ${saved.name} »` }

  if (args.length === 1) {
    const userDestination = await positionForUser(ctx, args[0])
    if (!userDestination.error) return userDestination
  }

  return {
    error: `Destination invalide. Utilise des coordonnées, @utilisateur, ici, bot ou spot <nom>.`,
  }
}

async function teleport(ctx, target, destination, successMessage) {
  const { x, y, z, facing } = destination
  const result = await ctx.bot.player.teleport(target.id, x, y, z, facing)
  if (!result?.ok) return ctx.privateReply(`Téléportation impossible : ${resultError(result)}`)
  if (target.id === ctx.bot.metadata?.botId) {
    ctx.store.setPersistentBotPosition?.(
      { type: "floor", x, y, z, facing },
      ctx.user,
    )
  }
  return ctx.reply(successMessage)
}

function outfitItemLabel(item, index) {
  const palette = Number.isFinite(Number(item?.active_palette)) ? Number(item.active_palette) : 0
  return `${index}. ${item?.id || "item-inconnu"} — palette ${palette}`
}

async function currentBotOutfit(ctx) {
  const response = await ctx.bot.inventory.outfit.get()
  if (!response?.ok || !Array.isArray(response.outfit)) {
    await ctx.privateReply(`Tenue du bot indisponible : ${resultError(response)}`)
    return null
  }
  return response.outfit
}

async function backupBotOutfit(ctx) {
  const outfit = await currentBotOutfit(ctx)
  if (!outfit) return null
  ctx.store.saveOutfitPreset("backup", outfit, ctx.user)
  return outfit
}

async function setBotOutfit(ctx, outfit, successMessage) {
  const result = await ctx.bot.inventory.outfit.set(outfit)
  if (!result?.ok) {
    return ctx.privateReply(
      `Modification refusée : ${resultError(result)}. Le bot doit posséder les objets utilisés.`,
    )
  }
  return ctx.reply(successMessage)
}

function createHighriseCommands() {
  return [
    {
      name: "wallet",
      aliases: ["portefeuille", "balance"],
      category: "Économie HR",
      permission: "admin",
      description: "Affiche le portefeuille du bot.",
      cooldownMs: 3000,
      async execute(ctx) {
        const wallet = await ctx.bot.inventory.wallet.get()
        if (!wallet?.ok) return ctx.privateReply(`Portefeuille indisponible : ${resultError(wallet)}`)
        await ctx.privateReply(
          `💰 Portefeuille du bot\n` +
            `Gold : ${Number(wallet.gold || 0).toLocaleString("fr-FR")}\n` +
            `Jetons boost : ${Number(wallet.boostToken || 0).toLocaleString("fr-FR")}\n` +
            `Jetons vocal : ${Number(wallet.voiceToken || 0).toLocaleString("fr-FR")}\n` +
            `Tips dépensés aujourd’hui : ${ctx.tips?.dailySpent || 0}`,
        )
      },
    },
    {
      name: "inventory",
      aliases: ["inventaire"],
      category: "Économie HR",
      permission: "admin",
      description: "Liste ou recherche les objets possédés par le bot.",
      usage: "[page|recherche]",
      cooldownMs: 3000,
      async execute(ctx) {
        const response = await ctx.bot.inventory.get()
        if (!response?.ok || !Array.isArray(response.inventory)) {
          return ctx.privateReply(`Inventaire indisponible : ${resultError(response)}`)
        }

        const query = /^\d+$/.test(ctx.args[0] || "") ? "" : normalizeText(ctx.args.join(" "))
        const items = query
          ? response.inventory.filter((item) => normalizeText(item.id || item.item_id).includes(query))
          : response.inventory
        const page = pageItems(items, query ? 1 : ctx.args[0], 10)
        const lines = page.items.map((item, index) => {
          const id = item.id || item.item_id || item.type || "item-inconnu"
          const amount = Number(item.amount || 1)
          return `${page.start + index + 1}. ${id}${amount > 1 ? ` ×${amount}` : ""}`
        })
        await ctx.privateReply(
          `🎒 Inventaire du bot (${items.length}/${response.inventory.length}) — page ${page.page}/${page.totalPages}\n` +
            (lines.join("\n") || "Aucun objet trouvé."),
        )
      },
    },
    {
      name: "outfit",
      aliases: ["tenue", "look"],
      category: "Tenues HR",
      description: "Inspecte ta tenue, celle d’un utilisateur ou celle du bot.",
      usage: "[@utilisateur|bot] [page]",
      cooldownMs: 2500,
      async execute(ctx) {
        const pageArg = ctx.args.find((arg) => /^\d+$/.test(arg)) || 1
        const identifier = ctx.args.find((arg) => !/^\d+$/.test(arg)) || ctx.user.id
        let target
        let response

        if (normalizeText(identifier) === "bot") {
          target = { id: ctx.bot.metadata?.botId, username: "Bot" }
          response = await ctx.bot.inventory.outfit.get()
        } else {
          target = await ctx.resolver.resolve(identifier, { inRoom: true })
          if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
          response = await ctx.bot.player.outfit.get(target.id)
        }

        if (!response?.ok || !Array.isArray(response.outfit)) {
          return ctx.privateReply(`Tenue indisponible : ${resultError(response)}`)
        }
        const page = pageItems(response.outfit, pageArg, 10)
        await ctx.privateReply(
          `👕 Tenue de @${target.username} (${response.outfit.length}) — page ${page.page}/${page.totalPages}\n` +
            page.items.map((item, index) => outfitItemLabel(item, page.start + index + 1)).join("\n"),
        )
      },
    },
    {
      name: "botoutfit",
      aliases: ["outfitbot", "tenuebot"],
      category: "Tenues HR",
      permission: "admin",
      description: "Gère la tenue et les tenues enregistrées du bot.",
      usage: "<list|copy|add|remove|color|save|load|delete|presets|reset>",
      cooldownMs: 3000,
      async execute(ctx) {
        const action = normalizeText(ctx.args[0] || "list")

        if (["list", "liste", "show", "voir"].includes(action)) {
          const outfit = await currentBotOutfit(ctx)
          if (!outfit) return
          const page = pageItems(outfit, ctx.args[1], 10)
          return ctx.privateReply(
            `👕 Tenue du bot (${outfit.length}) — page ${page.page}/${page.totalPages}\n` +
              page.items.map((item, index) => outfitItemLabel(item, page.start + index + 1)).join("\n"),
          )
        }

        if (["presets", "modeles", "modèles"].includes(action)) {
          const presets = ctx.store.listOutfitPresets()
          const page = pageItems(presets, ctx.args[1], 10)
          return ctx.privateReply(
            `🗂️ Tenues enregistrées (${presets.length}) — page ${page.page}/${page.totalPages}\n` +
              (page.items.map((preset) => `${preset.name} — ${preset.items.length} objet(s)`).join("\n")
                || "Aucune tenue enregistrée."),
          )
        }

        if (["save", "sauver", "enregistrer"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          if (!name) return ctx.privateReply(`Usage : ${ctx.config.prefix}botoutfit save <nom>`)
          const outfit = await currentBotOutfit(ctx)
          if (!outfit) return
          const saved = ctx.store.saveOutfitPreset(name, outfit, ctx.user)
          return ctx.privateReply(saved ? `✅ Tenue « ${saved.name} » enregistrée.` : "Nom ou tenue invalide.")
        }

        if (["delete", "remove-preset", "supprimer"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          if (!name) return ctx.privateReply(`Usage : ${ctx.config.prefix}botoutfit delete <nom>`)
          const removed = ctx.store.removeOutfitPreset(name)
          return ctx.privateReply(removed ? `✅ Tenue « ${name} » supprimée.` : "Tenue enregistrée introuvable.")
        }

        if (["load", "charger", "restore", "restaurer"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          const preset = ctx.store.getOutfitPreset(name)
          if (!preset) return ctx.privateReply("Tenue enregistrée introuvable.")
          if (normalizeText(name) !== "backup" && !(await backupBotOutfit(ctx))) return
          return setBotOutfit(ctx, preset.items, `✅ Tenue « ${preset.name} » appliquée au bot.`)
        }

        if (["copy", "copier"].includes(action)) {
          const target = await ctx.resolver.resolve(ctx.args[1], { inRoom: true })
          if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
          const source = await ctx.bot.player.outfit.get(target.id)
          if (!source?.ok || !Array.isArray(source.outfit)) {
            return ctx.privateReply(`Tenue source indisponible : ${resultError(source)}`)
          }
          if (!(await backupBotOutfit(ctx))) return
          return setBotOutfit(ctx, source.outfit, `✅ Le bot porte maintenant la tenue de @${target.username}.`)
        }

        if (["add", "ajouter"].includes(action)) {
          const itemId = String(ctx.args[1] || "").trim()
          const palette = Number.parseInt(ctx.args[2] || "0", 10)
          if (!itemId || !Number.isInteger(palette) || palette < 0 || palette > 255) {
            return ctx.privateReply(`Usage : ${ctx.config.prefix}botoutfit add <itemId> [palette 0-255]`)
          }
          if (!(await backupBotOutfit(ctx))) return
          const result = await ctx.bot.inventory.outfit.add(new OutfitItem(itemId, palette))
          return result?.ok
            ? ctx.reply(`✅ Objet ${itemId} ajouté à la tenue du bot.`)
            : ctx.privateReply(`Ajout impossible : ${resultError(result)}`)
        }

        if (["remove", "retirer"].includes(action)) {
          const itemId = String(ctx.args[1] || "").trim()
          if (!itemId) return ctx.privateReply(`Usage : ${ctx.config.prefix}botoutfit remove <itemId>`)
          if (!(await backupBotOutfit(ctx))) return
          const result = await ctx.bot.inventory.outfit.remove(itemId)
          return result?.ok
            ? ctx.reply(`✅ Objet ${itemId} retiré de la tenue du bot.`)
            : ctx.privateReply(`Retrait impossible : ${resultError(result)}`)
        }

        if (["color", "couleur", "palette"].includes(action)) {
          const itemId = String(ctx.args[1] || "").trim()
          const palette = Number.parseInt(ctx.args[2], 10)
          if (!itemId || !Number.isInteger(palette) || palette < 0 || palette > 255) {
            return ctx.privateReply(`Usage : ${ctx.config.prefix}botoutfit color <itemId> <palette 0-255>`)
          }
          if (!(await backupBotOutfit(ctx))) return
          const result = await ctx.bot.inventory.outfit.color(itemId, palette)
          return result?.ok
            ? ctx.reply(`✅ Palette ${palette} appliquée à ${itemId}.`)
            : ctx.privateReply(`Couleur impossible : ${resultError(result)}`)
        }

        if (["reset", "default", "defaut", "défaut"].includes(action)) {
          if (normalizeText(ctx.args[1]) !== "confirm") {
            return ctx.privateReply(`Confirme avec ${ctx.config.prefix}botoutfit reset confirm.`)
          }
          if (!(await backupBotOutfit(ctx))) return
          const result = await ctx.bot.inventory.outfit.set()
          return result?.ok
            ? ctx.reply("✅ Tenue par défaut appliquée. La tenue précédente est dans « backup ».")
            : ctx.privateReply(`Réinitialisation impossible : ${resultError(result)}`)
        }

        await ctx.privateReply(
          `Actions : list, copy @user, add, remove, color, save, load, delete, presets, reset.`,
        )
      },
    },
    {
      name: "teleport",
      aliases: ["tp"],
      category: "Téléportation HR",
      permission: "moderator",
      description: "Téléporte vers des coordonnées, un joueur, le bot ou un point enregistré.",
      usage: "@utilisateur <x y z [direction]|@destination|ici|bot|spot nom>",
      cooldownMs: 2500,
      async execute(ctx) {
        const target = await movableTarget(ctx, ctx.args[0])
        if (!target) return
        const destination = await resolveDestination(ctx, ctx.args.slice(1))
        if (destination.error) return ctx.privateReply(destination.error)
        return teleport(
          ctx,
          target,
          destination.position,
          `📍 @${target.username} téléporté vers ${destination.label}.`,
        )
      },
    },
    {
      name: "bring",
      aliases: ["ramener", "tphere"],
      category: "Téléportation HR",
      permission: "moderator",
      description: "Téléporte un utilisateur jusqu’à toi.",
      usage: "@utilisateur",
      cooldownMs: 2500,
      async execute(ctx) {
        const target = await movableTarget(ctx, ctx.args[0], { allowSelf: false })
        if (!target) return
        const destination = await positionForUser(ctx, ctx.user.id)
        if (destination.error) return ctx.privateReply(destination.error)
        return teleport(
          ctx,
          target,
          destination.position,
          `📍 @${target.username} a été ramené vers @${ctx.user.username}.`,
        )
      },
    },
    {
      name: "goto",
      aliases: ["aller", "rejoindre"],
      category: "Téléportation HR",
      permission: "moderator",
      description: "Te téléporte vers un joueur, des coordonnées ou un point.",
      usage: "<@utilisateur|x y z [direction]|spot nom>",
      cooldownMs: 2500,
      async execute(ctx) {
        const actor = await roomUser(ctx, ctx.user.id)
        if (!actor) return ctx.privateReply("Ta présence dans la salle est introuvable.")
        const destination = await resolveDestination(ctx, ctx.args)
        if (destination.error) return ctx.privateReply(destination.error)
        return teleport(ctx, actor, destination.position, `📍 Téléporté vers ${destination.label}.`)
      },
    },
    {
      name: "spot",
      aliases: ["point", "location", "lieu"],
      category: "Téléportation HR",
      permission: "moderator",
      description: "Enregistre et utilise des positions nommées.",
      usage: "<save|list|info|go|remove> [nom] [@utilisateur]",
      cooldownMs: 2000,
      async execute(ctx) {
        const action = normalizeText(ctx.args[0] || "list")
        if (["list", "liste"].includes(action)) {
          const positions = ctx.store.listPositions()
          const page = pageItems(positions, ctx.args[1], 10)
          return ctx.privateReply(
            `📌 Points enregistrés (${positions.length}) — page ${page.page}/${page.totalPages}\n` +
              (page.items.map((entry) => `${entry.name} — ${formatPosition(entry)}`).join("\n")
                || "Aucun point enregistré."),
          )
        }

        if (["save", "add", "enregistrer", "ajouter"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          if (!name) return ctx.privateReply(`Usage : ${ctx.config.prefix}spot save <nom>`)
          const actor = await roomUser(ctx, ctx.user.id)
          if (!actor || !isFloorPosition(actor.position)) {
            return ctx.privateReply("Place-toi au sol avant d’enregistrer ce point.")
          }
          const saved = ctx.store.savePosition(name, copyPosition(actor.position), ctx.user)
          return ctx.reply(saved ? `📌 Point « ${saved.name} » enregistré.` : "Position ou nom invalide.")
        }

        if (["remove", "delete", "retirer", "supprimer"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          if (!name) return ctx.privateReply(`Usage : ${ctx.config.prefix}spot remove <nom>`)
          const removed = ctx.store.removePosition(name)
          return ctx.reply(removed ? `✅ Point « ${name} » supprimé.` : "Point introuvable.")
        }

        if (["info", "show", "voir"].includes(action)) {
          const name = ctx.args.slice(1).join(" ").trim()
          const saved = ctx.store.getPosition(name)
          return ctx.privateReply(saved ? `📌 ${saved.name} : ${formatPosition(saved)}` : "Point introuvable.")
        }

        if (["go", "tp", "aller"].includes(action)) {
          const mentionIndex = ctx.args.findIndex((arg, index) => index > 0 && arg.startsWith("@"))
          const mention = mentionIndex === -1 ? null : ctx.args[mentionIndex]
          const nameParts = ctx.args.slice(1)
          if (mentionIndex !== -1) nameParts.splice(mentionIndex - 1, 1)
          const saved = ctx.store.getPosition(nameParts.join(" "))
          if (!saved) return ctx.privateReply("Point introuvable.")
          const target = mention
            ? await movableTarget(ctx, mention)
            : await roomUser(ctx, ctx.user.id)
          if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
          return teleport(
            ctx,
            target,
            copyPosition(saved),
            `📍 @${target.username} téléporté vers le point « ${saved.name} ».`,
          )
        }

        await ctx.privateReply("Actions : save, list, info, go, remove.")
      },
    },
    {
      name: "botposition",
      aliases: ["botpos", "positionbot"],
      category: "Téléportation HR",
      description: "Affiche la position actuelle du bot.",
      async execute(ctx) {
        const result = await positionForUser(ctx, ctx.bot.metadata?.botId)
        const saved = ctx.store.getPersistentBotPosition?.()
        await ctx.privateReply(
          `${result.error ? result.error : `🤖 Position actuelle : ${formatPosition(result.position)}`}\n` +
            `Position permanente : ${formatPersistentPosition(saved)}`,
        )
      },
    },
    {
      name: "botmove",
      aliases: ["movebot", "deplacerbot"],
      category: "Téléportation HR",
      permission: "admin",
      description: "Téléporte le bot vers toi, un joueur, un point ou des coordonnées.",
      usage: "<ici|@utilisateur|spot nom|x y z [direction]|clear>",
      cooldownMs: 2500,
      async execute(ctx) {
        if (["clear", "forget", "oublier", "effacer"].includes(normalizeText(ctx.args[0]))) {
          const cleared = ctx.store.clearPersistentBotPosition?.()
          return ctx.privateReply(
            cleared
              ? "✅ Position permanente supprimée. Le bot ne sera plus replacé au prochain démarrage."
              : "Aucune position permanente n’était enregistrée.",
          )
        }
        const destination = await resolveDestination(ctx, ctx.args)
        if (destination.error) return ctx.privateReply(destination.error)
        const botUser = { id: ctx.bot.metadata?.botId, username: "Bot" }
        return teleport(
          ctx,
          botUser,
          destination.position,
          `🤖 Bot déplacé vers ${destination.label}. Position sauvegardée pour les redémarrages.`,
        )
      },
    },
    {
      name: "walk",
      aliases: ["botwalk", "marcher"],
      category: "Téléportation HR",
      permission: "admin",
      description: "Fait marcher le bot vers des coordonnées.",
      usage: "<x> <y> <z> [direction]",
      cooldownMs: 2000,
      async execute(ctx) {
        const parsed = parseCoordinates(ctx.args)
        if (parsed.error) return ctx.privateReply(parsed.error)
        const { x, y, z, facing } = parsed.position
        const result = await ctx.bot.player.walk(x, y, z, facing)
        if (result?.ok) {
          ctx.store.setPersistentBotPosition?.(
            { type: "floor", x, y, z, facing },
            ctx.user,
          )
        }
        await ctx.reply(
          result?.ok
            ? `🚶 Le bot marche vers ${formatPosition(parsed.position)}. Position permanente sauvegardée.`
            : `Déplacement impossible : ${resultError(result)}`,
        )
      },
    },
    {
      name: "sit",
      aliases: ["botsit", "asseoirbot"],
      category: "Téléportation HR",
      permission: "admin",
      description: "Assoit le bot sur une entité de la salle.",
      usage: "<entityId> [anchorIndex]",
      cooldownMs: 2000,
      async execute(ctx) {
        const entityId = String(ctx.args[0] || "").trim()
        const anchorIndex = Number.parseInt(ctx.args[1] || "0", 10)
        if (!entityId || !Number.isInteger(anchorIndex) || anchorIndex < 0) {
          return ctx.privateReply(`Usage : ${ctx.config.prefix}sit <entityId> [anchorIndex]`)
        }
        const result = await ctx.bot.player.sit(entityId, anchorIndex)
        if (result?.ok) {
          ctx.store.setPersistentBotPosition?.(
            { type: "anchor", entityId, anchorIndex },
            ctx.user,
          )
        }
        await ctx.reply(
          result?.ok
            ? `🪑 Bot assis sur ${entityId} (ancre ${anchorIndex}). Position permanente sauvegardée.`
            : `Action impossible : ${resultError(result)}`,
        )
      },
    },
    {
      name: "stand",
      aliases: ["botstand", "leverbot"],
      category: "Téléportation HR",
      permission: "admin",
      description: "Relève le bot en le plaçant près de toi.",
      cooldownMs: 2000,
      async execute(ctx) {
        const destination = await positionForUser(ctx, ctx.user.id)
        if (destination.error) return ctx.privateReply(destination.error)
        const { x, y, z, facing } = destination.position
        const result = await ctx.bot.player.walk(x, y, z, facing)
        if (result?.ok) {
          ctx.store.setPersistentBotPosition?.(
            { type: "floor", x, y, z, facing },
            ctx.user,
          )
        }
        await ctx.reply(
          result?.ok
            ? "🧍 Le bot est debout près de toi. Position permanente sauvegardée."
            : `Action impossible : ${resultError(result)}`,
        )
      },
    },
    {
      name: "transport",
      aliases: ["sendroom", "changeroom"],
      category: "Téléportation HR",
      permission: "admin",
      description: "Envoie un utilisateur vers une autre salle avec confirmation.",
      usage: "@utilisateur <roomId> confirm",
      cooldownMs: 5000,
      async execute(ctx) {
        const target = await movableTarget(ctx, ctx.args[0], { allowSelf: false })
        if (!target) return
        const roomId = String(ctx.args[1] || "").trim()
        if (!roomId || normalizeText(ctx.args[2]) !== "confirm") {
          return ctx.privateReply(`Confirme avec ${ctx.config.prefix}transport @user <roomId> confirm.`)
        }
        const result = await ctx.bot.player.transport(target.id, roomId)
        await ctx.reply(
          result?.ok
            ? `🚪 @${target.username} a été envoyé vers la salle ${roomId}.`
            : `Transport impossible : ${resultError(result)}`,
        )
      },
    },
    {
      name: "privileges",
      aliases: ["hrperms", "privilegeshr"],
      category: "Highrise",
      description: "Affiche les privilèges Highrise d’un utilisateur présent.",
      usage: "[@utilisateur]",
      async execute(ctx) {
        const target = await roomUser(ctx, ctx.args[0] || ctx.user.id)
        if (!target) return ctx.privateReply("Utilisateur introuvable dans la salle.")
        const privileges = await ctx.bot.room.privilege.get(target.id)
        if (!privileges?.ok) return ctx.privateReply(`Privilèges indisponibles : ${resultError(privileges)}`)
        await ctx.privateReply(
          `🛡️ Privilèges de @${target.username}\n` +
            `Modérateur : ${privileges.moderator ? "oui" : "non"}\n` +
            `Designer : ${privileges.designer ? "oui" : "non"}`,
        )
      },
    },
  ]
}

module.exports = createHighriseCommands
