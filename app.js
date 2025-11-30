require("dotenv").config()
const { Highrise, GoldBars } = require("highrise-js-sdk")
const { messageWelcome, byeMessage, summonBotToMe, removeSpace, startsWithAt, getPermission } = require("./function")
const userModels = require("./models/userModel")

const express = require('express')
const http = require('http')
const app = express()
const server = http.createServer(app)

const settings = {
    token: process.env.TOKEN,
    room: process.env.ROOM,
    events: ['ready', 'playerJoin', 'playerLeave', 'messages', 'tipReactionCreate'],
    reconnect: 5
}

const client = new Highrise({ events: settings.events }, settings.reconnect)

client.on('chatMessageCreate', async (user, message) => {
    if (removeSpace(message).toLowerCase() == "f1") {
        client.player.teleport(user.id, 12, 0, 0.5, "FrontRight")
    } else if (removeSpace(message).toLowerCase() == "f2") {
        client.player.teleport(user.id, 17.5, 10.25, 7.5, "FrontLeft")
    } else if (removeSpace(message).toLowerCase() == "f3") {
        client.player.teleport(user.id, 13.5, 15.75, 0.5, "FrontRight")
    } else if (removeSpace(message).toLowerCase() == "vip") {
        const getUser = await userModels.getData("vip-tips", "id", user.id)
        if (getUser.error) return client.message.send("Une erreur est survenue.")
        if (getUser.result[0].isvip == "true") {
            client.player.teleport(user.id, 1.5, 5.25, 0.5, "FrontRight")
        } else {
            client.whisper.send(user.id, "100g pour acceder à la zone VIP ❄️💎")
        }
    }
    if (!message.startsWith("!")) return;
    const args = message.slice(1).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    if (command === "help") {
        client.message.send("Vous avez besoin d'aide ? Voici toutes les commandes disponible.")
        client.message.send(`
1. !help: Pour afficher les commandes disponible

2. !heart @username [nombre]: Pour envoyer des coeurs à un utilisateur dans la salle

3. !heart all [nombre]: Pour envoyer des coeurs à tout le monde dans la salle
        `)
        client.message.send(`
4. !summon @username: Pour téléporter un joueur vers soi meme

5. !addvip @username: Pour donner l'accès au VIP à un joueur

6. !removevip @username: Pour rétirer l'accès au VIP à un joueur
        `)
        client.message.send(`
7. !vipsolde: Pour voir combien il vous reste à payer pour avoir accès au VIP
        `)
    } else if (command === "emote") {
        client.player.emote(user.id, "idle-floorsleeping2")
    } else if (command == "heart") {
        const arg1 = args[0]
        const arg2 = args[1] || 1
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        if (arg1 != 'all') {
            const number = Number(arg2)
            const isInteger = Number.isInteger(number)
            if (!startsWithAt(arg1)) return
            const userId = await client.room.players.getId(arg1.replace(/^./, ""))
            if (!userId) return client.whisper.send(user.id, "Le joueur n'a pas été trouvé.")
            if (!isInteger) return client.whisper.send(user.id, "Le nombre doit être un entier.\n\nExemple: !heart all 5")
            if (number > 10) return client.whisper.send(user.id, "Le nombre maximum pour les coeurs généraux est de 10.\n\nExemple: !heart all 1")
            for (let i = 0; i < number; i++) {
                const username = arg1.replace(/^./, "")
                client.player.react(userId, "heart")
                    .then(() => client.whisper.send(user.id, "Coeur envoyé à " + username))
                    .catch(e => client.whisper.send(user.id, "Une erreur est survenue: " + e))
            }
        } else {
            const number = Number(arg2)
            const isInteger = Number.isInteger(number)
            if (!isInteger) return client.whisper.send(user.id, "Le nombre doit être un entier.\n\nExemple: !heart all 5")
            if (number > 10) return client.whisper.send(user.id, "Le nombre maximum pour les coeurs généraux est de 10.\n\nExemple: !heart all 1")
            for (let i = 0; i < number; i++) {
                const users = await client.room.players.fetch()
                users.forEach(async useR => {
                    const userId = useR[0].id
                    const username = useR[0].username
                    client.player.react(userId, "heart")
                        .then(() => client.whisper.send(user.id, "Coeur envoyé à " + username))
                        .catch(e => client.whisper.send(user.id, "Une erreur est survenue: " + e))
                })
            }
        }
    } else if (command == "summon") {
        const arg1 = args[0]
        if (!startsWithAt(arg1)) return client.whisper.send(user.id, "La commande c'est !summon @username.")
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        const userId = await client.room.players.getId(arg1.replace(/^./, ""))
        const coords = await client.room.players.getPosition(user.id)
        if (!userId) return client.whisper.send(user.id, "Le joueur n'a pas été trouvé.")
        if (userId == "68e2f7e2e10a82e67506307a") return client.whisper.send(user.id, "Malheureusement, vous ne pouvez pas deplacer le Bot de la salle.")
        client.player.teleport(userId, coords.x, coords.y, coords.z, coords.facing)
    } else if (command == "addvip") {
        const arg1 = args[0]
        if (!startsWithAt(arg1)) return
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        const userId = await client.room.players.getId(arg1.replace(/^./, ""))
        if (!userId) return client.whisper.send(user.id, "Le joueur n'a pas été trouvé.")
        const getUser = await userModels.getData('vip-tips', 'id', userId)
        if (getUser.error) return client.message.send("Une erreur est survenue.")
        if (getUser.result.length == 1) {
            if (getUser.result[0].isvip == 'true') return client.message.send(`Le joueur @${getUser.result[0].username} est déjà VIP ❄️💎.`)
            const updateVip = await userModels.updateVip(userId, "true")
            if (updateVip.error) return client.message.send("Une erreur est survenue.")
            client.message.send(`Le joueur @${getUser.result[0].username} est maintenant VIP ❄️💎.`)
        } else {
            client.whisper.send(user.id, `Le joueur est introuvable dans la base de données, demandez lui de quitter puis de revenir dans la salle.`)
        }
    } else if (command == "removevip") {
        const arg1 = args[0]
        if (!startsWithAt(arg1)) return
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        const userId = await client.room.players.getId(arg1.replace(/^./, ""))
        if (!userId) return client.whisper.send(user.id, "Le joueur n'a pas été trouvé.")
        const getUser = await userModels.getData('vip-tips', 'id', userId)
        if (getUser.error) return client.message.send("Une erreur est survenue.")
        if (getUser.result.length == 1) {
            if (getUser.result[0].isvip == 'false') return client.message.send(`Le joueur @${getUser.result[0].username} n'est déjà plus VIP ❄️💎.`)
            const updateVip = await userModels.updateVip(userId, "false")
            if (updateVip.error) return client.message.send("Une erreur est survenue.")
            client.message.send(`Le joueur @${getUser.result[0].username} n'est maintenant plus VIP ❄️💎.`)
        } else {
            client.whisper.send(user.id, `Le joueur est introuvable dans la base de données, demandez lui de quitter puis de revenir dans la salle.`)
        }
    } else if (command == "isvip") {
        const arg1 = args[0]
        if (!startsWithAt(arg1)) return
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        const userId = await client.room.players.getId(arg1.replace(/^./, ""))
        if (!userId) return client.whisper.send(user.id, "Le joueur n'a pas été trouvé.")
        const getUser = await userModels.getData('vip-tips', 'id', userId)
        if (getUser.error) return client.message.send("Une erreur est survenue.")
        if (getUser.result.length == 1) {
            if (getUser.result[0].isvip == "true") {
                client.whisper.send(user.id, `Le joueur @${getUser.result[0].username} est VIP ❄️💎.`)
            } else if (getUser.result[0].isvip == "false") {
                client.whisper.send(user.id, `Le joueur @${getUser.result[0].username} n'est pas VIP ❄️💎.`)
            }
        } else {
            client.whisper.send(user.id, `Le joueur est introuvable dans la base de données, demandez lui de quitter puis de revenir dans la salle.`)
        }
    } else if (command == "vipsolde") {
        const getUser = await userModels.getData('vip-tips', 'id', user.id)
        if (getUser.error) return client.message.send("Une erreur est survenue.")
        if (getUser.result.length == 1) {
            if (getUser.result[0].isvip == "true") return client.whisper.send(user.id, "Vous êtes déjà VIP ❄️💎.")
            const amountNow = getUser.result[0].amount * 1
            client.whisper.send(user.id, `Il vous reste encore ${100 - amountNow}g à payer pour être VIP ❄️💎.`)
        } else {
            client.whisper.send(user.id, "Une erreur est survenue, veuillez quitter la salle puis revenir.")
        }
    } else if (command == "wallet") {
        const permission = await getPermission(user, client)
        if (!permission.moderator || (user.id == "68d4dc2cb1aa8850784ea70d")) return client.whisper.send(user.id, "Dommage, cette commande est reservé aux modérateurs de la salle.")
        const wallet = await client.wallet.fetch()
        client.whisper.send(user.id, `Le coffre du bot contient ${wallet[0].amount} Golds actuellement.`)
    } else if (command == "test") {
        console.log(await getPermission(user, client))
    } else {
        client.whisper.send(user.id, "Malheureusement, cette commande n'est pas reconnue par le bot.\n\nEssayez !help pour plus d'informations.")
    }
})



// Event emitted when an emote is created.
client.on('emoteCreate', (sender, receiver, emote) => {
    console.log(`${sender.username} sent ${emote} to ${receiver.username}`);
});


client.login(settings.token, settings.room)

client.on('playerJoin', async (user) => {
    const getUser = await userModels.getData('visiteurs', "id", user.id)
    if (getUser.error) return client.message.send("Une erreur est survenue au niveau de la base de données")
    if (getUser.result.length == 1) {
        await userModels.updateVisite(user.id)
    } else {
        await userModels.newVisite(user.id, user.username)
    }
    await userModels.registerStartTips(user.id, user.username)
    client.message.send(messageWelcome(user.username))
})

client.on('playerLeave', (user) => {
    client.message.send(byeMessage(user.username))
})

client.on("tipReactionCreate", async (sender, receiver, tip) => {
    const getUser = await userModels.getData('vip-tips', "id", sender.id)
    console.log(tip)
    if (getUser.error) return client.message.send("Une erreur est survenue au niveau de la base de données")
    if (getUser.result.length == 1) {
        if (receiver.id == "68e2f7e2e10a82e67506307a") {
            const amountNow = getUser.result[0].amount * 1
            const amountNew = amountNow + (tip.amount * 1)
            await userModels.registerTips(sender.id, amountNew)
            client.message.send(`Je viens de recevoir ${tip.amount}g de la part de @${sender.username}, merci !`)
            if (getUser.result[0].isvip == "true") return
            if (amountNew >= 100) {
                await userModels.updateVip(sender.id, "true")
                client.message.send(`Bravo à @${sender.username} qui est maintenant VIP ❄️💎.`)
            }
        } else {
            client.message.send(`@${sender.username} viens d'envoyer ${tip.amount}g à @${receiver.username}`)
        }
    } else {
        client.message.send(`Une erreur est survenue, veuillez quitter le salle puis revenir.`)
    }
})

client.on('error', (error) => {
    console.log("Une erreur est survenue:", error)
})

server.listen(process.env.PORT, async () => {
    client.on('ready', async (session) => {
        function loopEmote(session, targetUserId) {
            client.player.emote(session.user_id, "emote-ghost-idle")
            setTimeout(() => {
                loopEmote(session, targetUserId)
            }, 19.4 * 1000)
        }
        loopEmote(session, session.user_id)
        await client.move.walk(5.5, 0, 1.5, "FrontRight")
        setInterval(() => {
            client.message.send("100g pour accéder au VIP ❄️💎")
        }, 60000)
        console.log(`Bot is now online in ${session.room_info.room_name}.\nBot ID: ${session.user_id}\nOwner ID: ${session.room_info.owner_id}`)
    });
    console.log(`Serveur démarré !`)
})