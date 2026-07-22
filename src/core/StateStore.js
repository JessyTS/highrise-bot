const fs = require("node:fs")
const path = require("node:path")
const { cleanIdentifier, normalizeText } = require("../utils/text")

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function deepMerge(base, override) {
  const result = { ...base }

  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

function pruneUnknownSettings(settings, template) {
  if (!isPlainObject(settings) || !isPlainObject(template)) return
  for (const key of Object.keys(settings)) {
    if (!(key in template)) {
      delete settings[key]
      continue
    }
    if (
      isPlainObject(settings[key]) &&
      isPlainObject(template[key]) &&
      Object.keys(template[key]).length > 0
    ) {
      pruneUnknownSettings(settings[key], template[key])
    }
  }
}

function cleanEntryName(value, maximumLength = 40) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximumLength)
}

function entryKey(value) {
  return normalizeText(cleanEntryName(value))
}

class StateStore {
  constructor(filePath, defaultSettings) {
    this.filePath = filePath
    this.saveTimer = null
    this.defaults = {
      settings: structuredClone(defaultSettings),
      warnings: {},
      moderationLog: [],
      knownUsers: {},
      botAdmins: [],
      savedPositions: {},
      outfitPresets: {},
      tipLog: [],
      actionLog: [],
      botState: {
        position: null,
        emote: null,
      },
    }
    this.data = this.load()
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return structuredClone(this.defaults)
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      const merged = deepMerge(this.defaults, parsed)

      if (!isPlainObject(merged.settings)) merged.settings = structuredClone(this.defaults.settings)
      for (const section of [
        "commands",
        "emoteLoops",
        "tips",
        "adminLogs",
        "actions",
        "events",
        "welcome",
        "antiSpam",
        "wordFilter",
      ]) {
        if (this.defaults.settings[section] === undefined) continue
        if (!isPlainObject(merged.settings[section])) {
          merged.settings[section] = structuredClone(this.defaults.settings[section])
        }
      }
      if (!/^[^\p{L}\p{N}\s]{1,3}$/u.test(String(merged.settings.commands.prefix || ""))) {
        merged.settings.commands.prefix = this.defaults.settings.commands.prefix
      }
      if (typeof merged.settings.commands.directEmotes !== "boolean") {
        merged.settings.commands.directEmotes = this.defaults.settings.commands.directEmotes
      }
      if (!Array.isArray(merged.settings.commands.disabled)) merged.settings.commands.disabled = []
      if (!Array.isArray(merged.settings.commands.disabledCategories)) {
        merged.settings.commands.disabledCategories = []
      }
      if (!isPlainObject(merged.settings.commands.cooldowns)) merged.settings.commands.cooldowns = {}
      if (!isPlainObject(merged.settings.commands.cooldownScopes)) {
        merged.settings.commands.cooldownScopes = {}
      }
      if (!isPlainObject(merged.settings.commands.replyModes)) merged.settings.commands.replyModes = {}
      if (!isPlainObject(merged.settings.commands.permissions)) merged.settings.commands.permissions = {}
      if (!isPlainObject(merged.settings.commands.logModes)) merged.settings.commands.logModes = {}
      if (!isPlainObject(merged.settings.events.types)) {
        merged.settings.events.types = structuredClone(this.defaults.settings.events.types)
      }
      pruneUnknownSettings(merged.settings, this.defaults.settings)
      for (const key of Object.keys(merged)) {
        if (!(key in this.defaults)) delete merged[key]
      }
      if (!Number.isInteger(merged.settings.warnLimit) || merged.settings.warnLimit < 1) {
        merged.settings.warnLimit = this.defaults.settings.warnLimit
      }
      if (!Array.isArray(merged.moderationLog)) merged.moderationLog = []
      if (!Array.isArray(merged.tipLog)) merged.tipLog = []
      if (!Array.isArray(merged.actionLog)) merged.actionLog = []
      if (!Array.isArray(merged.botAdmins)) merged.botAdmins = []
      if (!isPlainObject(merged.warnings)) merged.warnings = {}
      if (!isPlainObject(merged.knownUsers)) merged.knownUsers = {}
      if (!isPlainObject(merged.savedPositions)) merged.savedPositions = {}
      if (!isPlainObject(merged.outfitPresets)) merged.outfitPresets = {}
      if (!isPlainObject(merged.botState)) {
        merged.botState = structuredClone(this.defaults.botState)
      }
      if (!isPlainObject(merged.botState.position)) merged.botState.position = null
      if (!isPlainObject(merged.botState.emote)) merged.botState.emote = null
      if (
        merged.botState.position
        && !["floor", "anchor"].includes(merged.botState.position.type)
      ) {
        merged.botState.position = null
      }
      if (merged.botState.emote && !String(merged.botState.emote.id || "").trim()) {
        merged.botState.emote = null
      }
      if (!Array.isArray(merged.settings.wordFilter.words)) {
        merged.settings.wordFilter.words = []
      }

      return merged
    } catch (error) {
      console.warn(`[StateStore] État illisible, valeurs par défaut utilisées : ${error.message}`)
      return structuredClone(this.defaults)
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), 300)
    this.saveTimer.unref?.()
  }

  save() {
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8")
    fs.renameSync(temporaryPath, this.filePath)
  }

  get settings() {
    return this.data.settings
  }

  setSetting(section, key, value) {
    if (!isPlainObject(this.data.settings[section])) this.data.settings[section] = {}
    this.data.settings[section][key] = value
    this.scheduleSave()
    return value
  }

  setRootSetting(key, value) {
    this.data.settings[key] = value
    this.scheduleSave()
    return value
  }

  resetSetting(section, key = null) {
    const defaultSection = this.defaults.settings[section]
    if (defaultSection === undefined) return false

    if (key === null) {
      this.data.settings[section] = structuredClone(defaultSection)
    } else {
      if (!isPlainObject(defaultSection) || !(key in defaultSection)) return false
      if (!isPlainObject(this.data.settings[section])) this.data.settings[section] = {}
      this.data.settings[section][key] = structuredClone(defaultSection[key])
    }

    this.scheduleSave()
    return true
  }

  resetAllSettings() {
    this.data.settings = structuredClone(this.defaults.settings)
    this.scheduleSave()
    return this.settings
  }

  rememberUser(user) {
    if (!user?.id || !user?.username) return
    const current = this.data.knownUsers[user.id]
    this.data.knownUsers[user.id] = {
      id: user.id,
      username: user.username,
      lastSeenAt: new Date().toISOString(),
    }

    if (!current || current.username !== user.username) this.scheduleSave()
  }

  findKnownUser(identifier) {
    const cleaned = cleanIdentifier(identifier)
    if (!cleaned) return null
    if (this.data.knownUsers[cleaned]) return this.data.knownUsers[cleaned]

    const normalized = normalizeText(cleaned)
    return (
      Object.values(this.data.knownUsers).find(
        (user) => normalizeText(user.username) === normalized,
      ) || null
    )
  }

  getWarnings(userId) {
    return [...(this.data.warnings[userId] || [])]
  }

  addWarning(target, moderator, reason) {
    if (!this.data.warnings[target.id]) this.data.warnings[target.id] = []
    const warning = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      targetId: target.id,
      targetUsername: target.username,
      moderatorId: moderator.id,
      moderatorUsername: moderator.username,
      reason,
      createdAt: new Date().toISOString(),
    }
    this.data.warnings[target.id].push(warning)
    this.scheduleSave()
    return warning
  }

  clearWarnings(userId) {
    const count = this.data.warnings[userId]?.length || 0
    delete this.data.warnings[userId]
    this.scheduleSave()
    return count
  }

  addModerationLog(entry) {
    this.data.moderationLog.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    })
    this.data.moderationLog = this.data.moderationLog.slice(-500)
    this.scheduleSave()
  }

  getModerationLog(userId = null) {
    const entries = userId
      ? this.data.moderationLog.filter((entry) => entry.targetId === userId)
      : this.data.moderationLog
    return [...entries].reverse()
  }

  addTipLog(entry) {
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    }
    this.data.tipLog.push(record)
    this.data.tipLog = this.data.tipLog.slice(-1000)
    this.scheduleSave()
    return structuredClone(record)
  }

  getTipLog() {
    return this.data.tipLog.map((entry) => structuredClone(entry)).reverse()
  }

  getTippedAmountSince(timestamp, filters = {}) {
    const minimum = Number(timestamp) || 0
    return this.data.tipLog
      .filter((entry) => {
        if (Date.parse(entry.createdAt) < minimum) return false
        if (filters.actorId && entry.actorId !== filters.actorId) return false
        if (filters.targetId && entry.targetId !== filters.targetId) return false
        return Number(entry.sentAmount ?? (entry.success ? entry.amount : 0)) > 0
      })
      .reduce(
        (total, entry) => total + Number(entry.sentAmount ?? (entry.success ? entry.amount : 0)),
        0,
      )
  }

  addActionLog(entry) {
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    }
    this.data.actionLog.push(record)
    const maximum = Math.max(100, Number(this.settings.adminLogs?.maxHistory || 2000))
    this.data.actionLog = this.data.actionLog.slice(-maximum)
    this.scheduleSave()
    return structuredClone(record)
  }

  getActionLog(filters = {}) {
    return this.data.actionLog
      .filter((entry) => {
        if (filters.actorId && entry.actorId !== filters.actorId) return false
        if (filters.type && entry.type !== filters.type) return false
        if (filters.status && entry.status !== filters.status) return false
        if (filters.command && entry.command !== filters.command) return false
        return true
      })
      .map((entry) => structuredClone(entry))
      .reverse()
  }

  clearActionLog() {
    const count = this.data.actionLog.length
    this.data.actionLog = []
    this.scheduleSave()
    return count
  }

  addBlockedWord(word) {
    const cleaned = normalizeText(word)
    if (!cleaned) return false
    const words = this.data.settings.wordFilter.words
    if (words.some((item) => normalizeText(item) === cleaned)) return false
    words.push(String(word).trim())
    this.scheduleSave()
    return true
  }

  removeBlockedWord(word) {
    const cleaned = normalizeText(word)
    const words = this.data.settings.wordFilter.words
    const index = words.findIndex((item) => normalizeText(item) === cleaned)
    if (index === -1) return false
    words.splice(index, 1)
    this.scheduleSave()
    return true
  }

  findBlockedWord(message) {
    const normalizedMessage = normalizeText(message)
    const tokens = normalizedMessage.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)

    return (
      this.data.settings.wordFilter.words.find((word) => {
        const normalizedWord = normalizeText(word)
        if (!normalizedWord) return false
        return normalizedWord.includes(" ")
          ? normalizedMessage.includes(normalizedWord)
          : tokens.includes(normalizedWord)
      }) || null
    )
  }

  getBotAdmins() {
    return [...this.data.botAdmins]
  }

  addBotAdmin(userId) {
    if (this.data.botAdmins.includes(userId)) return false
    this.data.botAdmins.push(userId)
    this.scheduleSave()
    return true
  }

  removeBotAdmin(userId) {
    const index = this.data.botAdmins.indexOf(userId)
    if (index === -1) return false
    this.data.botAdmins.splice(index, 1)
    this.scheduleSave()
    return true
  }

  savePosition(name, position, savedBy = null) {
    const displayName = cleanEntryName(name)
    const key = entryKey(displayName)
    const x = Number(position?.x)
    const y = Number(position?.y)
    const z = Number(position?.z)
    const facing = String(position?.facing || "FrontRight")
    if (!key || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null

    const entry = {
      name: displayName,
      x,
      y,
      z,
      facing,
      savedBy: savedBy?.id || null,
      savedByUsername: savedBy?.username || null,
      updatedAt: new Date().toISOString(),
    }
    this.data.savedPositions[key] = entry
    this.scheduleSave()
    return structuredClone(entry)
  }

  getPosition(name) {
    const value = this.data.savedPositions[entryKey(name)]
    return value ? structuredClone(value) : null
  }

  listPositions() {
    return Object.values(this.data.savedPositions)
      .map((entry) => structuredClone(entry))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  }

  removePosition(name) {
    const key = entryKey(name)
    if (!key || !this.data.savedPositions[key]) return false
    delete this.data.savedPositions[key]
    this.scheduleSave()
    return true
  }

  setPersistentBotPosition(position, savedBy = null) {
    let record = null
    if (position?.type === "anchor") {
      const entityId = String(position.entityId || "").trim()
      const anchorIndex = Number.parseInt(position.anchorIndex, 10)
      if (!entityId || !Number.isInteger(anchorIndex) || anchorIndex < 0) return null
      record = {
        type: "anchor",
        entityId,
        anchorIndex,
      }
    } else {
      const x = Number(position?.x)
      const y = Number(position?.y)
      const z = Number(position?.z)
      const facing = String(position?.facing || "FrontRight")
      if (![x, y, z].every(Number.isFinite) || x < 0 || z < 0) return null
      record = {
        type: "floor",
        x,
        y,
        z,
        facing,
      }
    }

    this.data.botState.position = {
      ...record,
      savedBy: savedBy?.id || null,
      savedByUsername: savedBy?.username || null,
      updatedAt: new Date().toISOString(),
    }
    this.save()
    return structuredClone(this.data.botState.position)
  }

  getPersistentBotPosition() {
    const position = this.data.botState.position
    return position ? structuredClone(position) : null
  }

  clearPersistentBotPosition() {
    const existed = Boolean(this.data.botState.position)
    this.data.botState.position = null
    this.save()
    return existed
  }

  setPersistentBotEmote(emote, savedBy = null) {
    const id = String(emote?.id || "").trim()
    if (!id) return null
    this.data.botState.emote = {
      id,
      name: String(emote?.name || id).trim(),
      duration: Number.isFinite(Number(emote?.duration)) ? Number(emote.duration) : null,
      savedBy: savedBy?.id || null,
      savedByUsername: savedBy?.username || null,
      updatedAt: new Date().toISOString(),
    }
    this.save()
    return structuredClone(this.data.botState.emote)
  }

  getPersistentBotEmote() {
    const emote = this.data.botState.emote
    return emote ? structuredClone(emote) : null
  }

  clearPersistentBotEmote() {
    const existed = Boolean(this.data.botState.emote)
    this.data.botState.emote = null
    this.save()
    return existed
  }

  saveOutfitPreset(name, outfit, savedBy = null) {
    const displayName = cleanEntryName(name, 30)
    const key = entryKey(displayName)
    if (!key || !Array.isArray(outfit) || !outfit.length) return null

    const items = outfit
      .filter((item) => item?.id)
      .map((item) => ({
        type: item.type || "clothing",
        amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 1,
        id: String(item.id),
        account_bound: Boolean(item.account_bound),
        active_palette: Number.isFinite(Number(item.active_palette))
          ? Number(item.active_palette)
          : 0,
      }))
    if (!items.length) return null

    const entry = {
      name: displayName,
      items,
      savedBy: savedBy?.id || null,
      savedByUsername: savedBy?.username || null,
      updatedAt: new Date().toISOString(),
    }
    this.data.outfitPresets[key] = entry
    this.scheduleSave()
    return structuredClone(entry)
  }

  getOutfitPreset(name) {
    const value = this.data.outfitPresets[entryKey(name)]
    return value ? structuredClone(value) : null
  }

  listOutfitPresets() {
    return Object.values(this.data.outfitPresets)
      .map((entry) => structuredClone(entry))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  }

  removeOutfitPreset(name) {
    const key = entryKey(name)
    if (!key || !this.data.outfitPresets[key]) return false
    delete this.data.outfitPresets[key]
    this.scheduleSave()
    return true
  }
}

module.exports = StateStore
