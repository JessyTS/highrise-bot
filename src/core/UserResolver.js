const { cleanIdentifier } = require("../utils/text")

class UserResolver {
  constructor(bot, store) {
    this.bot = bot
    this.store = store
  }

  async resolve(identifier, options = {}) {
    const cleaned = cleanIdentifier(identifier)
    if (!cleaned) return null

    try {
      const roomEntry = await this.bot.room.users.find(cleaned)
      if (roomEntry?.user) {
        this.store.rememberUser(roomEntry.user)
        return { ...roomEntry.user, position: roomEntry.position, inRoom: true }
      }
    } catch {
      // La recherche Web API ci-dessous sert de solution de repli.
    }

    if (options.inRoom) return null

    const knownUser = this.store.findKnownUser(cleaned)
    if (knownUser) return { ...knownUser, position: null, inRoom: false }

    try {
      const profile = await this.bot.webapi.users.get(cleaned)
      if (profile?.ok && profile.id) {
        const user = { id: profile.id, username: profile.username }
        this.store.rememberUser(user)
        return { ...user, position: null, inRoom: false, profile }
      }
    } catch {
      // Un identifiant brut reste accepté en dernier recours.
    }

    const looksLikeHighriseId =
      /^[a-f0-9]{16,32}$/i.test(cleaned) ||
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cleaned)

    if (looksLikeHighriseId) {
      return { id: cleaned, username: cleaned, position: null, inRoom: false }
    }

    return null
  }
}

module.exports = UserResolver
