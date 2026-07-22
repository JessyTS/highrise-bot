const test = require("node:test")
const assert = require("node:assert/strict")

const SmoothEmoteLooper = require("../src/core/SmoothEmoteLooper")

function createScheduler() {
  let time = 0
  let nextId = 1
  const jobs = new Map()

  return {
    now: () => time,
    elapse(milliseconds) {
      time += milliseconds
    },
    setTimeout(callback, delay) {
      const id = nextId++
      jobs.set(id, { id, at: time + delay, callback })
      return id
    },
    clearTimeout(id) {
      jobs.delete(id)
    },
    async runNext() {
      const job = [...jobs.values()].sort((a, b) => a.at - b.at)[0]
      if (!job) return false
      jobs.delete(job.id)
      time = job.at
      await job.callback()
      return true
    },
    get pendingCount() {
      return jobs.size
    },
  }
}

function createManager() {
  const emotes = [
    { name: "Fluid Dance", id: "emote-fluid", duration: 2 },
    { name: "Second Dance", id: "emote-second", duration: 3 },
  ]
  return {
    getByName: (name) => emotes.find((emote) => emote.name === name) || null,
    getById: (id) => emotes.find((emote) => emote.id === id) || null,
    getByIndex: (index) => emotes[index] || null,
  }
}

function okResponse() {
  return { ok: true, hasError: () => false }
}

test("la latence réseau ne s’ajoute plus à chaque répétition", async () => {
  const scheduler = createScheduler()
  const launches = []
  const player = {
    async emote() {
      launches.push(scheduler.now())
      scheduler.elapse(180)
      return okResponse()
    },
  }
  const looper = new SmoothEmoteLooper(player, createManager(), {
    transitionLeadMs: 250,
    minimumIntervalMs: 800,
    now: scheduler.now,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  })

  await looper.start({ id: "user-1", username: "Jessy" }, "emote-fluid")
  await scheduler.runNext()
  await scheduler.runNext()

  assert.deepEqual(launches, [0, 1750, 3500])
  assert.equal(looper.activeCount, 1)
})

test("la relance anticipée et l’intervalle minimum restent configurables à chaud", async () => {
  const scheduler = createScheduler()
  const launches = []
  let lead = 100
  const player = {
    async emote() {
      launches.push(scheduler.now())
      return okResponse()
    },
  }
  const looper = new SmoothEmoteLooper(player, createManager(), {
    getTransitionLeadMs: () => lead,
    getMinimumIntervalMs: () => 800,
    now: scheduler.now,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  })

  await looper.start({ id: "user-1", username: "Jessy" }, "1")
  lead = 400
  await scheduler.runNext()
  await scheduler.runNext()

  assert.deepEqual(launches, [0, 1900, 3500])
})

test("une erreur temporaire déclenche une reprise au lieu de tuer la boucle", async () => {
  const scheduler = createScheduler()
  let attempts = 0
  const errors = []
  const player = {
    async emote() {
      attempts += 1
      if (attempts === 1) {
        return { ok: false, error: new Error("réseau"), hasError: () => true }
      }
      return okResponse()
    },
  }
  const looper = new SmoothEmoteLooper(player, createManager(), {
    retryDelayMs: 400,
    maxConsecutiveErrors: 3,
    now: scheduler.now,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    onError: (entry) => errors.push(entry),
  })

  const started = await looper.start({ id: "user-1", username: "Jessy" }, "1")
  assert.equal(started.id, "emote-fluid")
  assert.equal(looper.activeCount, 1)

  await scheduler.runNext()
  assert.equal(attempts, 2)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].stopped, false)
  assert.equal(looper.activeCount, 1)
})

test("la boucle s’arrête après le nombre d’erreurs configuré", async () => {
  const scheduler = createScheduler()
  const player = {
    async emote() {
      return { ok: false, error: new Error("indisponible"), hasError: () => true }
    },
  }
  const looper = new SmoothEmoteLooper(player, createManager(), {
    retryDelayMs: 250,
    maxConsecutiveErrors: 3,
    now: scheduler.now,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  })

  await looper.start({ id: "user-1", username: "Jessy" }, "1")
  await scheduler.runNext()
  await scheduler.runNext()

  assert.equal(looper.activeCount, 0)
  assert.equal(scheduler.pendingCount, 0)
})

test("stop annule immédiatement la prochaine répétition", async () => {
  const scheduler = createScheduler()
  let launches = 0
  const looper = new SmoothEmoteLooper(
    { emote: async () => { launches += 1; return okResponse() } },
    createManager(),
    {
      now: scheduler.now,
      setTimeout: scheduler.setTimeout,
      clearTimeout: scheduler.clearTimeout,
    },
  )

  await looper.start({ id: "user-1", username: "Jessy" }, "1")
  const stopped = looper.stop("user-1")

  assert.equal(stopped.id, "emote-fluid")
  assert.equal(looper.activeCount, 0)
  assert.equal(scheduler.pendingCount, 0)
  assert.equal(await scheduler.runNext(), false)
  assert.equal(launches, 1)
})
