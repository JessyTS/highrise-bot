const crypto = require("node:crypto")

const { sleep } = require("../utils/text")

const ALLOWED_AMOUNTS = Object.freeze([1, 5, 10, 50, 100, 500, 1000, 5000, 10000])

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function uniqueTargets(targets, botId) {
  const map = new Map()
  for (const target of targets || []) {
    if (!target?.id || target.id === botId) continue
    if (!map.has(target.id)) {
      map.set(target.id, { id: target.id, username: target.username || target.id })
    }
  }
  return [...map.values()]
}

class TipService {
  constructor(bot, store) {
    this.bot = bot
    this.store = store
    this.pending = new Map()
    this.confirmationQueue = Promise.resolve()
  }

  get settings() {
    return this.store.settings.tips
  }

  get dailySpent() {
    return this.store.getTippedAmountSince(startOfToday())
  }

  actorSpentToday(actorId) {
    return this.store.getTippedAmountSince(startOfToday(), { actorId })
  }

  recipientReceivedToday(targetId) {
    return this.store.getTippedAmountSince(startOfToday(), { targetId })
  }

  splitAmount(value) {
    let remaining = Number(value)
    const bars = []
    for (const amount of [...ALLOWED_AMOUNTS].sort((a, b) => b - a)) {
      while (remaining >= amount) {
        bars.push(amount)
        remaining -= amount
      }
    }
    return remaining === 0 ? bars : []
  }

  validateAmount(value, mode = "single") {
    const amount = Number(value)
    if (!Number.isInteger(amount) || amount <= 0) {
      return { error: "Le montant doit être un nombre entier positif." }
    }
    if (mode === "single" && !ALLOWED_AMOUNTS.includes(amount)) {
      return { error: `Montants acceptés : ${ALLOWED_AMOUNTS.join(", ")}. Utilise tip split pour un autre total.` }
    }
    if (mode === "split" && this.settings.splitEnabled === false) {
      return { error: "Les tips fractionnés sont désactivés." }
    }
    if (amount > Number(this.settings.maxPerTip || 0)) {
      return { error: `Le plafond par destinataire est de ${this.settings.maxPerTip} gold.` }
    }
    return { amount }
  }

  validateLimits(actorId, targets, amount) {
    const total = amount * targets.length
    const dailyLimit = Number(this.settings.dailyLimit || 0)
    const actorLimit = Number(this.settings.perAdminDailyLimit ?? dailyLimit)
    const recipientLimit = Number(this.settings.perRecipientDailyLimit ?? dailyLimit)

    if (this.dailySpent + total > dailyLimit) {
      return { error: `Le plafond quotidien global de ${dailyLimit} gold serait dépassé.` }
    }
    if (this.actorSpentToday(actorId) + total > actorLimit) {
      return { error: `Ton plafond quotidien d’administration est de ${actorLimit} gold.` }
    }
    const limitedTarget = targets.find(
      (target) => this.recipientReceivedToday(target.id) + amount > recipientLimit,
    )
    if (limitedTarget) {
      return {
        error: `Le plafond quotidien de ${recipientLimit} gold pour @${limitedTarget.username} serait dépassé.`,
      }
    }
    return { total }
  }

  async walletFor(total) {
    const wallet = await this.bot.inventory.wallet.get()
    if (!wallet?.ok) return { error: wallet?.error || "Portefeuille indisponible." }
    const gold = Number(wallet.gold || 0)
    if (gold < total) return { error: `Gold insuffisant : le bot possède ${gold}.` }
    return { wallet, gold }
  }

  async prepare(actor, targets, value, kind = "single") {
    if (!this.settings.enabled) {
      return { ok: false, error: "Les tips du bot sont désactivés. Un admin doit utiliser config tips on." }
    }

    const recipients = uniqueTargets(targets, this.bot.metadata?.botId)
    if (!actor?.id || !recipients.length) return { ok: false, error: "Destinataire invalide." }
    if (kind === "bulk") {
      if (this.settings.bulkEnabled !== true) return { ok: false, error: "Les tips collectifs sont désactivés." }
      const maximum = Number(this.settings.bulkMaxRecipients || 20)
      if (recipients.length > maximum) {
        return { ok: false, error: `Le maximum collectif est de ${maximum} destinataires.` }
      }
    }

    const mode = kind === "split" ? "split" : "single"
    const validation = this.validateAmount(value, mode)
    if (validation.error) return { ok: false, error: validation.error }
    const limits = this.validateLimits(actor.id, recipients, validation.amount)
    if (limits.error) return { ok: false, error: limits.error }
    const walletResult = await this.walletFor(limits.total)
    if (walletResult.error) return { ok: false, error: walletResult.error }

    const code = crypto.randomBytes(3).toString("hex").toUpperCase()
    const expiresAt = Date.now() + Number(this.settings.confirmationSeconds || 60) * 1000
    const pending = {
      code,
      kind,
      actor: { id: actor.id, username: actor.username },
      targets: recipients,
      target: recipients[0],
      amount: validation.amount,
      totalAmount: limits.total,
      expiresAt,
    }
    this.pending.set(actor.id, pending)
    return {
      ok: true,
      code,
      kind,
      amount: validation.amount,
      totalAmount: limits.total,
      targets: recipients,
      target: recipients[0],
      expiresAt,
      walletGold: walletResult.gold,
    }
  }

  request(actor, target, value) {
    return this.prepare(actor, [target], value, "single")
  }

  requestSplit(actor, target, value) {
    return this.prepare(actor, [target], value, "split")
  }

  requestBulk(actor, targets, value) {
    return this.prepare(actor, targets, value, "bulk")
  }

  getPending(actorId) {
    const pending = this.pending.get(actorId)
    return pending ? structuredClone(pending) : null
  }

  cancel(actorId, code = null) {
    const pending = this.pending.get(actorId)
    if (!pending) return { ok: false, error: "Aucun tip en attente." }
    if (code && pending.code !== String(code).toUpperCase()) {
      return { ok: false, error: "Code de confirmation invalide." }
    }
    this.pending.delete(actorId)
    return { ok: true, pending }
  }

  async confirm(actor, code) {
    const operation = this.confirmationQueue.then(() => this.confirmUnlocked(actor, code))
    this.confirmationQueue = operation.catch(() => {})
    return operation
  }

  async sendOne(target, amount) {
    try {
      const response = await this.bot.player.tip(target.id, amount)
      const success = Boolean(response?.ok) && response?.result !== "insufficient_funds"
      return { success, response }
    } catch (error) {
      return { success: false, response: { ok: false, error: error.message } }
    }
  }

  addRecord(pending, target, values) {
    return this.store.addTipLog({
      kind: pending.kind,
      actorId: pending.actor.id,
      actorUsername: pending.actor.username,
      targetId: target.id,
      targetUsername: target.username,
      amount: pending.amount,
      sentAmount: values.sentAmount,
      success: values.success,
      partial: values.sentAmount > 0 && !values.success,
      result: values.result || null,
    })
  }

  async executeSingle(pending) {
    const target = pending.targets[0]
    const sent = await this.sendOne(target, pending.amount)
    const sentAmount = sent.success ? pending.amount : 0
    const record = this.addRecord(pending, target, {
      sentAmount,
      success: sent.success,
      result: sent.response?.result || sent.response?.error,
    })
    return {
      ok: sent.success,
      sentAmount,
      successCount: sent.success ? 1 : 0,
      failedCount: sent.success ? 0 : 1,
      records: [record],
      error: sent.success ? null : sent.response?.error || sent.response?.result || "Tip refusé.",
    }
  }

  async executeSplit(pending) {
    const target = pending.targets[0]
    const bars = this.splitAmount(pending.amount)
    const delay = Math.max(100, Number(this.settings.sendDelayMs || 400))
    let sentAmount = 0
    let failure = null

    for (let index = 0; index < bars.length; index += 1) {
      const sent = await this.sendOne(target, bars[index])
      if (!sent.success) {
        failure = sent.response?.error || sent.response?.result || "Tip fractionné refusé."
        break
      }
      sentAmount += bars[index]
      if (index < bars.length - 1) await sleep(delay)
    }

    const success = sentAmount === pending.amount
    const record = this.addRecord(pending, target, {
      sentAmount,
      success,
      result: success ? `success:${bars.length}` : failure,
    })
    return {
      ok: success,
      partial: sentAmount > 0 && !success,
      sentAmount,
      successCount: success ? 1 : 0,
      failedCount: success ? 0 : 1,
      records: [record],
      error: success ? null : failure || `Envoi partiel : ${sentAmount}/${pending.amount} gold.`,
    }
  }

  async executeBulk(pending) {
    const delay = Math.max(100, Number(this.settings.sendDelayMs || 400))
    const records = []
    let sentAmount = 0
    let successCount = 0

    for (let index = 0; index < pending.targets.length; index += 1) {
      const target = pending.targets[index]
      const sent = await this.sendOne(target, pending.amount)
      if (sent.success) {
        sentAmount += pending.amount
        successCount += 1
      }
      records.push(this.addRecord(pending, target, {
        sentAmount: sent.success ? pending.amount : 0,
        success: sent.success,
        result: sent.response?.result || sent.response?.error,
      }))
      if (index < pending.targets.length - 1) await sleep(delay)
    }

    const failedCount = pending.targets.length - successCount
    return {
      ok: failedCount === 0,
      partial: successCount > 0 && failedCount > 0,
      sentAmount,
      successCount,
      failedCount,
      records,
      error: failedCount ? `${failedCount} tip(s) sur ${pending.targets.length} ont échoué.` : null,
    }
  }

  async confirmUnlocked(actor, code) {
    const pending = this.pending.get(actor.id)
    if (!pending) return { ok: false, error: "Aucun tip en attente." }
    if (pending.code !== String(code || "").toUpperCase()) {
      return { ok: false, error: "Code de confirmation invalide." }
    }
    if (pending.expiresAt < Date.now()) {
      this.pending.delete(actor.id)
      return { ok: false, error: "La confirmation a expiré. Recommence la commande tip." }
    }
    if (!this.settings.enabled) {
      this.pending.delete(actor.id)
      return { ok: false, error: "Les tips ont été désactivés." }
    }
    if (pending.kind === "bulk" && this.settings.bulkEnabled !== true) {
      this.pending.delete(actor.id)
      return { ok: false, error: "Les tips collectifs ont été désactivés." }
    }
    if (
      pending.kind === "bulk"
      && pending.targets.length > Number(this.settings.bulkMaxRecipients || 20)
    ) {
      this.pending.delete(actor.id)
      return { ok: false, error: "La limite de destinataires collectifs a été abaissée." }
    }

    const mode = pending.kind === "split" ? "split" : "single"
    const validation = this.validateAmount(pending.amount, mode)
    const limits = validation.error
      ? validation
      : this.validateLimits(actor.id, pending.targets, pending.amount)
    if (limits.error) {
      this.pending.delete(actor.id)
      return { ok: false, error: limits.error }
    }
    const walletResult = await this.walletFor(pending.totalAmount)
    if (walletResult.error) {
      this.pending.delete(actor.id)
      return { ok: false, error: walletResult.error }
    }

    this.pending.delete(actor.id)
    const result = pending.kind === "bulk"
      ? await this.executeBulk(pending)
      : pending.kind === "split"
        ? await this.executeSplit(pending)
        : await this.executeSingle(pending)
    return { ...result, pending }
  }

  clearUser(userId) {
    this.pending.delete(userId)
  }
}

TipService.ALLOWED_AMOUNTS = ALLOWED_AMOUNTS

module.exports = TipService
