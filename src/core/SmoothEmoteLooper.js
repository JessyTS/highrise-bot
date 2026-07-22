function clampInteger(value, fallback, minimum, maximum) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(maximum, Math.max(minimum, number))
}

function responseHasError(response) {
  if (!response) return true
  if (typeof response.hasError === "function") return response.hasError()
  return response.ok === false
}

function responseError(response, thrownError = null) {
  if (thrownError) return thrownError
  return response?.error || new Error("Réponse vide pendant le lancement de l’emote")
}

class SmoothEmoteLooper {
  constructor(playerApi, emotesManager, options = {}) {
    this.playerApi = playerApi
    this.emotesManager = emotesManager
    this.loops = new Map()

    this.getTransitionLeadMs = typeof options.getTransitionLeadMs === "function"
      ? options.getTransitionLeadMs
      : () => options.transitionLeadMs ?? 250
    this.getMinimumIntervalMs = typeof options.getMinimumIntervalMs === "function"
      ? options.getMinimumIntervalMs
      : () => options.minimumIntervalMs ?? 800
    this.getRetryDelayMs = typeof options.getRetryDelayMs === "function"
      ? options.getRetryDelayMs
      : () => options.retryDelayMs ?? 1200
    this.getMaxConsecutiveErrors = typeof options.getMaxConsecutiveErrors === "function"
      ? options.getMaxConsecutiveErrors
      : () => options.maxConsecutiveErrors ?? 3
    this.onError = typeof options.onError === "function" ? options.onError : null

    this.now = typeof options.now === "function" ? options.now : Date.now
    this.setTimeoutFn = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout
    this.clearTimeoutFn = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout
  }

  resolveEmote(identifier) {
    const value = String(identifier || "").trim()
    if (!value) return null

    return (
      this.emotesManager.getByName?.(value) ||
      this.emotesManager.getById?.(value) ||
      (/^\d+$/.test(value)
        ? this.emotesManager.getByIndex?.(Number(value) - 1)
        : null) ||
      null
    )
  }

  loopSettings(emote) {
    const durationMs = Math.max(500, Math.round(Number(emote.duration || 3) * 1000))
    const minimumIntervalMs = clampInteger(
      this.getMinimumIntervalMs(),
      800,
      250,
      5000,
    )
    const requestedLeadMs = clampInteger(
      this.getTransitionLeadMs(),
      250,
      0,
      2000,
    )
    const transitionLeadMs = Math.min(
      requestedLeadMs,
      Math.max(0, durationMs - minimumIntervalMs),
    )

    return {
      intervalMs: Math.max(minimumIntervalMs, durationMs - transitionLeadMs),
      retryDelayMs: clampInteger(this.getRetryDelayMs(), 1200, 250, 10_000),
      maxConsecutiveErrors: clampInteger(
        this.getMaxConsecutiveErrors(),
        3,
        1,
        10,
      ),
    }
  }

  isCurrent(state) {
    return this.loops.get(state.user.id)?.generation === state.generation
  }

  schedule(state, delayMs) {
    if (!this.isCurrent(state)) return

    state.timeoutId = this.setTimeoutFn(async () => {
      try {
        await this.tick(state)
      } catch (error) {
        if (!this.isCurrent(state)) return
        this.loops.delete(state.user.id)
        await this.reportError(state, error, true)
      }
    }, Math.max(0, Math.round(delayMs)))
    state.timeoutId?.unref?.()
  }

  async reportError(state, error, stopped) {
    if (!this.onError) return
    try {
      await this.onError({
        user: state.user,
        emote: state.emote,
        error,
        consecutiveErrors: state.consecutiveErrors,
        stopped,
      })
    } catch (reportingError) {
      console.warn(`[Boucle emote] Journalisation impossible : ${reportingError.message}`)
    }
  }

  async tick(state) {
    if (!this.isCurrent(state)) return

    state.timeoutId = null
    const launchedAt = this.now()
    let response = null
    let thrownError = null

    try {
      response = await this.playerApi.emote(state.emote.id, state.user.id)
    } catch (error) {
      thrownError = error
    }

    if (!this.isCurrent(state)) return

    const settings = this.loopSettings(state.emote)
    if (thrownError || responseHasError(response)) {
      state.consecutiveErrors += 1
      const stopped = state.consecutiveErrors >= settings.maxConsecutiveErrors
      const error = responseError(response, thrownError)

      if (stopped) this.loops.delete(state.user.id)
      else this.schedule(state, settings.retryDelayMs)

      await this.reportError(state, error, stopped)
      return
    }

    state.consecutiveErrors = 0
    state.iterations += 1

    // La prochaine échéance part de l'envoi précédent, pas de la réponse réseau.
    // La latence ne s'ajoute donc plus à chaque tour et la boucle ne dérive pas.
    const nextLaunchAt = launchedAt + settings.intervalMs
    this.schedule(state, Math.max(0, nextLaunchAt - this.now()))
  }

  async start(user, identifier) {
    if (!user?.id) return null
    const emote = this.resolveEmote(identifier)
    if (!emote) return null

    const existing = this.loops.get(user.id)
    if (existing?.emote.id === emote.id) return null

    this.stop(user.id)
    const state = {
      user: { id: user.id, username: user.username },
      emote,
      generation: Symbol("emote-loop"),
      timeoutId: null,
      consecutiveErrors: 0,
      iterations: 0,
    }

    this.loops.set(user.id, state)
    await this.tick(state)
    return this.isCurrent(state) ? emote : null
  }

  stop(userId) {
    const state = this.loops.get(userId)
    if (!state) return undefined

    if (state.timeoutId !== null) this.clearTimeoutFn(state.timeoutId)
    this.loops.delete(userId)
    return state.emote
  }

  isActive(userId, emoteId = null) {
    const state = this.loops.get(userId)
    if (!state) return false
    return emoteId ? state.emote.id === emoteId : true
  }

  getActiveEmote(userId) {
    return this.loops.get(userId)?.emote || null
  }

  destroy() {
    for (const state of this.loops.values()) {
      if (state.timeoutId !== null) this.clearTimeoutFn(state.timeoutId)
    }
    this.loops.clear()
  }

  get activeCount() {
    return this.loops.size
  }
}

module.exports = SmoothEmoteLooper
