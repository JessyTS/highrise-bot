exports.messageWelcome = (user) => {
    return `
Hey toi !❄️ @${user}

Merci d'être passé(e) ! Ici, vibes positive et bonne humeur seulement. Profite de ton séjour au WINTER CLUB ❄️
, Si tu aimes n'hésite pas à le proposer à ton entourage en partageant la salle merci !
    `
}

exports.byeMessage = (user) => {
    return `
Bye bye @${user} !
À bientôt ❄️
    `
}

exports.teleportToF1 = async (client, user) => {
    const coords = await client.room.players.getPosition(user.id)
    // 12, 0, 0.5, FrontRight
    try {
        await client.move.walk(coords.x, coords.y, coords.z, coords.facing)
        client.whisper.send(user.id, `Le bot a été téléporté à la position (${coords.x}, ${coords.y}, ${coords.z}).`)
    } catch (error) {
        console.error("Erreur lors de la téléportation du bot:", error)
    }
}

exports.removeSpace = (input) => {
	return input.replace(/\s/g, '')
}

exports.startsWithAt = (str) => {
    return typeof str === 'string' && str.trim().startsWith('@');
}

exports.getPermission = async (user, client) => {
    try {
        const permission = await client.player.permissions.get(user.id)
        return permission;
    } catch (err) {
        console.error('Erreur getPermission:', err)
        throw err
    }
}
