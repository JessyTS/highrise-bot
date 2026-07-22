class HostingStatus {
  constructor({ name = "Highrise Complete Bot", version = "0.0.0", now = Date.now } = {}) {
    this.name = name
    this.version = version
    this.now = now
    this.startedAt = this.now()
    this.readyAt = null
    this.bot = null
    this.phase = "starting"
    this.errorType = null
  }

  attachBot(bot) {
    this.bot = bot || null
    this.phase = "connecting"
    this.errorType = null
  }

  markReady() {
    this.readyAt = this.now()
    this.phase = "online"
    this.errorType = null
  }

  markError(type = "runtime") {
    this.phase = "error"
    this.errorType = type === "configuration" ? "configuration" : "runtime"
  }

  markStopping() {
    this.phase = "stopping"
  }

  markStopped() {
    this.phase = "stopped"
  }

  isReady() {
    return this.phase !== "stopping"
      && this.phase !== "stopped"
      && this.bot?.status === "Online"
      && Boolean(this.bot?.metadata)
  }

  snapshot() {
    const sdkStatus = this.bot?.status || null
    const connected = this.isReady()
    let status = this.phase

    if (!["error", "stopping", "stopped"].includes(status)) {
      status = connected ? "online" : "connecting"
    }

    return {
      service: this.name,
      version: this.version,
      status,
      web: "online",
      highrise: connected ? "online" : "offline",
      sdkStatus,
      uptimeSeconds: Math.max(0, Math.floor((this.now() - this.startedAt) / 1000)),
      readyAt: this.readyAt ? new Date(this.readyAt).toISOString() : null,
      errorType: this.errorType,
    }
  }
}

module.exports = HostingStatus
