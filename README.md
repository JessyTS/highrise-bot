# Highrise Complete Bot — Node.js / PlanetHoster

Bot Highrise en JavaScript/CommonJS avec **65 commandes**, les **260 emotes** fournies par `highrise.bot` 2.7.6, une modération complète et une configuration pilotable directement depuis le jeu. La version 5.0.0 fonctionne comme application web PlanetHoster N0C/Passenger tout en conservant un mode terminal classique.

## Fonctions incluses

- Emotes directement par numéro ou par nom, sans préfixe.
- Boucles automatiques fluides sans dérive réseau, relance anticipée réglable, reprise après erreur, arrêt avec `stop`, emote sur toute la salle et dance party.
- Position et emote du bot sauvegardées immédiatement puis restaurées après chaque redémarrage ou reconnexion.
- Avertissements persistants, expulsion, mute, unmute, ban et unban.
- Historique par utilisateur et journal global de modération.
- Accueil personnalisable, anti-spam et filtre de mots.
- Profils, utilisateurs présents, positions, staff et informations de salle.
- Portefeuille et inventaire du bot consultables en privé par les admins.
- Tips directs, fractionnés et collectifs avec confirmation obligatoire, limites globales/par admin/par destinataire, statistiques et historique privé.
- Inspection des tenues et gestion complète de la tenue du bot avec presets et backup automatique.
- Téléportation par coordonnées, vers un joueur, le bot ou des points enregistrés.
- Déplacement du bot, marche, assise, transport inter-salles et gestion du vocal.
- Menu `!config`/`!setup` en jeu : état, permission renforcée, cooldown individuel/global, réponse publique/privée et log réglables pour chacune des 65 commandes.
- Journal d’actions envoyé exclusivement en whispers au propriétaire et aux admins : commandes, refus, erreurs, emotes directes et protections automatiques.
- Relais public et whispers ciblés pour les événements utiles, sans aucun message lors des déplacements des joueurs.
- Promotion/rétrogradation des modérateurs et designers par le propriétaire.
- Cooldowns, permissions, protection du propriétaire et sauvegarde JSON atomique.
- Mode maintenance, limites des actions groupées et configuration persistante sans modifier les fichiers.
- Reconnexion gérée par le SDK et arrêt propre du processus.
- Fichier de démarrage PlanetHoster `app.js`, écoute Passenger, page de statut sécurisée et routes `/health`/`/ready`.
- Redémarrage N0C sans perte de la configuration, de la position ou de l’emote permanente.

## Prérequis

- Node.js 22 ou plus récent.
- Un bot créé sur le [portail Highrise Create](https://create.highrise.game/).
- Le token API du bot et l’identifiant de la salle.
- Le bot doit disposer des droits **Designer** dans la salle. Les commandes de modération nécessitent aussi les privilèges adaptés.

## Installation

1. Décompresse le projet puis ouvre un terminal dans son dossier.
2. Installe les dépendances :

   ```bash
   npm install
   ```

3. Duplique `.env.example` sous le nom `.env`.

   Sous Windows :

   ```bat
   copy .env.example .env
   ```

   Sous Linux/macOS :

   ```bash
   cp .env.example .env
   ```

4. Complète au minimum ces deux valeurs dans `.env` :

   ```env
   HIGHRISE_TOKEN=ton_token_secret
   HIGHRISE_ROOM_ID=identifiant_de_la_salle
   ```

5. Pour tester l’application web localement, ajoute aussi :

   ```env
   HOSTING_MODE=local
   WEB_PORT=3000
   ```

6. Démarre le bot et sa page web :

   ```bash
   npm start
   ```

Pour lancer uniquement le bot sans serveur web, utilise `npm run start:bot`.

Dans Highrise, tape `!help` pour obtenir les commandes accessibles à ton rôle.

Pour configurer le bot sans modifier les fichiers, tape `!setup help` ou `!config help` dans la salle.

> Ne publie jamais ton fichier `.env` et ne partage jamais le token du bot. Si le token est exposé, régénère-le immédiatement depuis Highrise Create.

## Déploiement PlanetHoster N0C

Le projet est prêt à être importé dans **N0C → Langages → Node.js** avec les réglages suivants :

- version Node.js : 22 ou 24 ;
- fichier de démarrage : `app.js` ;
- mode : `Production` ;
- `HOSTING_MODE=planethoster` ;
- aucun port numérique à renseigner dans `.env` : le serveur écoute la cible Passenger attendue par N0C.

Le tutoriel détaillé, les contrôles après installation et les précautions de mise à jour sont dans [DEPLOIEMENT_PLANETHOSTER.md](DEPLOIEMENT_PLANETHOSTER.md).

## Obtenir les identifiants Highrise

- **Token :** Highrise Create → Dashboard → Bots & API Keys → crée le bot → Generate API Token.
- **Room ID :** ouvre la salle dans Highrise → informations de la salle → Share this Room. L’identifiant se trouve dans le lien partagé.

Documentation officielle : [Creating a Bot](https://create.highrise.game/learn/bots/guides/creating-a-bot).

## Commandes

Le préfixe par défaut est `!`. Il peut être changé avec `BOT_PREFIX` dans `.env`.

### Général

| Commande | Fonction |
| --- | --- |
| `!help [catégorie]` | Affiche les commandes accessibles. |
| `!ping`, `!uptime`, `!botinfo` | État et informations du bot. |
| `!room`, `!users [page]` | Informations et membres de la salle. |
| `!id [@user]`, `!profile [@user]` | Identifiant et profil Highrise. |
| `!where [@user]` | Position dans la salle. |
| `!staff` | Staff actuellement présent. |

### Emotes

Le moyen le plus rapide ne demande aucun préfixe. Écris simplement :

```text
1
Just Vibing
stop
```

- Un numéro de `1` à `260` lance l’emote correspondante en boucle.
- Le nom complet d’une emote lance également sa boucle, sans tenir compte des majuscules ni de la ponctuation finale.
- `stop` arrête immédiatement ta boucle.
- Écrire une autre emote remplace automatiquement la boucle en cours.
- La cadence est calculée depuis l’envoi précédent : la latence réseau ne rallonge plus chaque répétition.
- Une erreur temporaire est retentée automatiquement au lieu d’arrêter immédiatement la boucle.

| Commande | Fonction |
| --- | --- |
| `!emotes [page ou recherche]` | Parcourt les 260 emotes. |
| `!findemote <texte>` | Recherche par nom ou ID. |
| `!emoteinfo <nom, ID ou numéro>` | Affiche les détails d’une emote. |
| `!emote <emote> [@user]` | Lance une emote. |
| `!randomemote [@user]` | Emote aléatoire. |
| `!loop <emote> [@user]` | Répète une emote. |
| `!stop [@user]` | Arrête une boucle. |
| `!botemote <emote>` | Configure l’emote permanente du bot — admin. |
| `!botemote status`, `!botemote stop` | Affiche ou supprime l’emote permanente — admin. |
| `!reaction <type> [@user]` | Réactions : clap, heart, thumbs, wave, wink. |
| `!emoteall <emote>` | Emote unique sur toute la salle — staff. |
| `!danceparty <emote>` | Boucle sur toute la salle — staff. |
| `!stopall` | Arrête toutes les boucles — staff. |

Les noms contenant des espaces fonctionnent directement :

```text
!emote Just Vibing!
!loop "Silently Judging"
!emote 260
!botemote Just Vibing
!botemote stop
```

### Modération

| Commande | Fonction |
| --- | --- |
| `!warn @user [raison]` | Ajoute un avertissement. |
| `!warnings [@user]` | Affiche les avertissements. |
| `!clearwarnings @user` | Efface les avertissements. |
| `!kick @user [raison]` | Expulse de la salle. |
| `!mute @user <durée> [raison]` | Rend muet. Minimum : 60 secondes. |
| `!unmute @user` | Retire le mute. |
| `!ban @user <durée> [raison]` | Bannit temporairement. |
| `!unban <nom ou ID>` | Retire un bannissement. |
| `!history @user [page]` | Historique d’un utilisateur. |
| `!modlog [page]` | Journal global de modération. |

Durées acceptées : `60s`, `10m`, `2h`, `7j`, `2semaines`.

### Administration

| Commande | Fonction |
| --- | --- |
| `!announce <message>`, `!say <message>` | Communication du staff. |
| `!whisper @user <message>` | Message privé du staff. |
| `!welcome <on, off, status>` | Gère l’accueil. |
| `!setwelcome <message>` | Modifie l’accueil ; `{user}` insère le nom et `{prefix}` le préfixe actuel. |
| `!antispam <on, off, status>` | Gère l’anti-spam. |
| `!filter <on, off, status>` | Gère le filtre de mots. |
| `!word <add, remove, list> [mot]` | Modifie la liste du filtre. |
| `!voice <status, invite, remove> [@user]` | Gère le vocal. |
| `!actionlog [status, @user ou page]` | Consulte le journal des actions — exclusivement en privé aux admins. |
| `!actionlog clear confirm` | Vide l’historique — propriétaire uniquement ; l’opération elle-même reste journalisée. |

### Économie Highrise

| Commande | Fonction |
| --- | --- |
| `!wallet` | Affiche en privé le gold, les jetons boost et les jetons vocal du bot — admin. |
| `!inventory [page ou recherche]` | Liste et recherche les objets possédés par le bot — admin. |
| `!tip status` | Affiche les limites et le gold disponible — admin. |
| `!tip @user <montant>` | Prépare un tip depuis le portefeuille du bot — admin. |
| `!tip split @user <total>` | Décompose automatiquement un total en coupures Highrise — admin. |
| `!tip pending` | Affiche le tip en attente et sa durée restante — admin. |
| `!tip confirm <code>` | Confirme et envoie un tip préparé — admin. |
| `!tip cancel [code]` | Annule un tip en attente — admin. |
| `!tipall <montant>` | Prépare un tip collectif confirmé pour la salle — admin, désactivé par défaut. |
| `!tiphistory [@user] [page]` | Affiche en privé l’historique filtrable des tips — admin. |
| `!tipstats [@user]` | Affiche les totaux, réussites, envois partiels et échecs — admin. |

Les tips sont désactivés par défaut. Active-les avec `!config tips on`. Chaque envoi, y compris un tip collectif, demande un code de confirmation temporaire. Le bot contrôle de nouveau le portefeuille et tous les plafonds au moment de la confirmation afin de protéger les envois simultanés.

Les tips directs acceptent les coupures Highrise `1`, `5`, `10`, `50`, `100`, `500`, `1000`, `5000` et `10000`. `!tip split` accepte un total entier et le décompose en coupures. `!tipall` doit être activé séparément avec `!config tip-bulk on`.

Le Bot API permet de lire et d’utiliser le portefeuille du **bot uniquement**. Il ne donne pas accès au solde privé des autres joueurs.

### Tenues Highrise

| Commande | Fonction |
| --- | --- |
| `!outfit [@user ou bot] [page]` | Inspecte une tenue et affiche les IDs et palettes. |
| `!botoutfit list [page]` | Affiche la tenue actuelle du bot — admin. |
| `!botoutfit copy @user` | Copie sur le bot la tenue d’un joueur présent — admin. |
| `!botoutfit add <itemId> [palette]` | Ajoute un objet possédé par le bot — admin. |
| `!botoutfit remove <itemId>` | Retire un objet — admin. |
| `!botoutfit color <itemId> <palette>` | Change une palette — admin. |
| `!botoutfit save <nom>` | Enregistre la tenue actuelle — admin. |
| `!botoutfit load <nom>` | Charge une tenue enregistrée — admin. |
| `!botoutfit presets [page]` | Liste les tenues enregistrées — admin. |
| `!botoutfit delete <nom>` | Supprime une tenue enregistrée — admin. |
| `!botoutfit reset confirm` | Applique la tenue par défaut — admin. |

Avant chaque modification, la tenue précédente est enregistrée sous `backup`. Le bot ne peut porter que des objets autorisés par Highrise et présents dans son inventaire.

### Téléportation Highrise

| Commande | Fonction |
| --- | --- |
| `!tp @user x y z [direction]` | Téléporte vers des coordonnées. |
| `!tp @user @destination` | Téléporte un joueur vers un autre. |
| `!tp @user ici` | Téléporte le joueur vers le modérateur. |
| `!tp @user bot` | Téléporte le joueur vers le bot. |
| `!tp @user spot <nom>` | Téléporte vers un point enregistré. |
| `!bring @user` | Ramène un utilisateur vers toi. |
| `!goto <@user, coordonnées ou spot nom>` | Te téléporte vers une destination. |
| `!spot save <nom>` | Enregistre ta position actuelle. |
| `!spot list`, `!spot info <nom>` | Liste ou inspecte les points. |
| `!spot go <nom> [@user]` | Utilise un point enregistré. |
| `!spot remove <nom>` | Supprime un point. |
| `!botposition` | Affiche la position actuelle et la position permanente du bot. |
| `!botmove <ici, @user, spot ou coordonnées>` | Téléporte le bot et sauvegarde la position — admin. |
| `!botmove clear` | Oublie la position permanente sans déplacer le bot — admin. |
| `!walk x y z [direction]` | Fait marcher le bot et sauvegarde la destination — admin. |
| `!sit <entityId> [ancre]`, `!stand` | Sauvegarde aussi l’état assis ou debout — admin. |
| `!transport @user <roomId> confirm` | Envoie vers une autre salle avec confirmation — admin. |

Directions acceptées : `FrontRight`, `FrontLeft`, `BackRight`, `BackLeft`, ou les raccourcis `fr`, `fl`, `br`, `bl`.

La dernière position confirmée par `!botmove`, `!walk`, `!sit` ou `!stand` est écrite immédiatement. Au redémarrage, le bot retourne automatiquement au sol ou à l’ancre enregistrée. `!botmove clear` désactive cette restauration. L’emote configurée avec `!botemote` — ou en visant `bot` avec `!emote`/`!loop` — est ensuite relancée en boucle. Utilise `!botemote stop`, `!stop bot` ou `!stopall` pour empêcher son retour aux prochains démarrages.

### Configuration directement en jeu

`!setup` est un alias de `!config`. Tous les changements sont sauvegardés dans `data/state.json` et restent actifs après un redémarrage.

| Commande | Fonction |
| --- | --- |
| `!config` | Tableau de bord complet. |
| `!config help` | Affiche toutes les options disponibles. |
| `!config commands [page]` | Liste chaque commande avec état, permission, cooldown/portée, réponse et log. |
| `!config command <nom> status` | Affiche la politique complète d’une commande. |
| `!config command <nom> <on, off>` | Active ou désactive une commande — admin. |
| `!config command <nom> cooldown <0-3600>` | Personnalise son cooldown — admin. |
| `!config command <nom> scope <user, global, default>` | Applique le cooldown par joueur ou globalement — admin. |
| `!config command <nom> reply <auto, private, public>` | Choisit le canal de réponse — admin. |
| `!config command <nom> permission <rôle, default>` | Renforce l’accès à `moderator`, `admin` ou `owner` — admin. |
| `!config command <nom> log <on, off, default>` | Active ou désactive son log privé — admin. |
| `!config command <nom> reset` | Réinitialise la politique d’une commande — admin. |
| `!config category <list, status, on, off> [catégorie]` | Configure une catégorie complète — admin pour les modifications. |
| `!config welcome <on, off>` | Active ou désactive l’accueil. |
| `!config welcome-message <texte>` | Modifie l’accueil ; `{user}` insère le nom et `{prefix}` le préfixe actuel. |
| `!config antispam <on, off>` | Active ou désactive l’anti-spam. |
| `!config spam-limit <3-50>` | Nombre de messages accepté dans la fenêtre. |
| `!config spam-window <2-120>` | Fenêtre anti-spam en secondes. |
| `!config spam-mute <60-86400>` | Durée du mute automatique. |
| `!config filter <on, off>` | Active ou désactive le filtre de mots. |
| `!config filter-mute <60-86400>` | Durée du mute du filtre. |
| `!config warn-limit <1-20>` | Limite d’avertissements avant expulsion. |
| `!config direct-emotes <on, off>` | Active les numéros/noms sans préfixe — admin. |
| `!config direct-emote-cooldown <0-30>` | Cooldown des emotes directes en secondes — admin. |
| `!config emote-loop status` | Affiche la cadence, la reprise et le nombre de boucles actives — admin. |
| `!config emote-loop lead <0-1500>` | Relance l’emote un peu avant sa fin pour supprimer les blancs — admin. |
| `!config emote-loop minimum <500-5000>` | Fixe l’intervalle minimal entre deux envois — admin. |
| `!config emote-loop retry <250-10000>` | Fixe le délai avant une nouvelle tentative après erreur — admin. |
| `!config emote-loop errors <1-10>` | Fixe le nombre d’erreurs consécutives avant l’arrêt — admin. |
| `!config maintenance <on, off>` | Réserve temporairement le bot aux admins ; `stop` reste accessible. |
| `!config maintenance-message <texte>` | Personnalise le message de maintenance. |
| `!config admin-cooldown-bypass <on, off>` | Autorise ou non les admins à ignorer les cooldowns. |
| `!config bulk-limit <1-200>` | Limite les utilisateurs visés par les emotes groupées. |
| `!config bulk-delay <100-5000>` | Règle le délai entre actions groupées en millisecondes. |
| `!config tips <status, on, off>` | Configure l’envoi de tips — admin. |
| `!config tip-max <1-50000>` | Définit le plafond par destinataire/opération — admin. |
| `!config tip-daily <1-100000>` | Définit le plafond quotidien global — admin. |
| `!config tip-admin-daily <1-100000>` | Définit le plafond quotidien de chaque admin. |
| `!config tip-recipient-daily <1-100000>` | Définit le plafond quotidien reçu par joueur. |
| `!config tip-split <on, off>` | Active ou désactive les tips fractionnés. |
| `!config tip-bulk <on, off>` | Active séparément les tips collectifs. |
| `!config tip-bulk-max <2-50>` | Limite les destinataires d’un tip collectif. |
| `!config tip-delay <100-5000>` | Règle le délai entre plusieurs coupures/destinataires. |
| `!config tip-confirm <15-300>` | Règle la validité du code de confirmation — admin. |
| `!config adminlogs <status, on, off>` | Configure le journal privé des actions. |
| `!config adminlog <type> <on, off>` | Configure commandes, emotes directes, actions auto, refus, erreurs, arguments ou historique. |
| `!config adminlog-max <100-10000>` | Règle la taille maximale de l’historique. |
| `!config events <status, on, off>` | Configure le relais global des événements — admin. |
| `!config events full confirm` | Active tous les événements, le public et les whispers — admin. |
| `!config event <type> <on, off>` | Configure `join`, `leave`, `emote`, `tip` ou `moderation` — admin. |
| `!config event-public <on, off>` | Active les messages publics d’événements — admin. |
| `!config event-whisper <on, off>` | Active les whispers aux personnes concernées — admin. |
| `!config emote-cooldown <5-300>` | Règle l’anti-spam des emotes — admin. |
| `!config prefix <symbole>` | Change le préfixe immédiatement — admin. |
| `!config recommended confirm` | Applique une configuration de départ recommandée — admin. |
| `!config reset <section> confirm` | Réinitialise une section sans effacer les historiques de modération/tips/actions, points ou tenues — admin. |

Les commandes essentielles `help`, `config` et `stop` ne peuvent pas être désactivées. Une permission peut être renforcée mais jamais descendue sous le niveau défini dans le code : une commande `admin` ne peut donc pas devenir publique par erreur.

Exemples :

```text
!config command tp cooldown 5
!config command tp scope global
!config command wallet reply private
!config command wallet permission owner
!config command announce log off
!config category off Emotes
!config emote-loop lead 300
!config adminlogs on
!config tips on
!config tip-split on
!config tip-bulk on
```

### Événements de la salle

Le bot relaie les arrivées, départs, emotes, tips et modérations dans la salle et par whisper aux personnes concernées, selon la configuration choisie. Les emotes sont limitées pour ne pas inonder le chat.

L’événement `Movement` n’est pas écouté : lorsqu’un joueur marche, se téléporte ou s’assoit, le bot ne publie aucun message et n’envoie aucun whisper. La commande administrative `!walk` reste disponible pour déplacer le bot lui-même.

Les messages de chat et whispers sont écoutés uniquement pour reconnaître les commandes et les emotes directes. Le bot ne copie jamais une conversation complète dans le journal. Pour `!whisper`, le contenu envoyé est masqué ; pour `!tip confirm`, le code de confirmation est masqué.

### Logs privés réservés aux admins

Chaque commande traitée par le bot peut produire un log contenant l’auteur, la commande, son état, le canal, la durée et un résumé du résultat. Les refus de permission, erreurs, démarrages/arrêts d’emotes directes et sanctions automatiques sont également pris en charge.

Ces logs utilisent exclusivement `bot.whisper.send()` et ne sont adressés qu’au propriétaire de la salle, aux IDs de `BOT_ADMINS` et aux utilisateurs ajoutés avec `!botadmin add`. Les modérateurs Highrise ordinaires et les joueurs ne les reçoivent pas. Aucun fallback public n’existe si un admin est absent de la salle.

Les actions de modération et tips initiées par le bot ne sont pas republiées par le relais d’événements : elles restent dans le journal privé. Les événements déclenchés directement dans Highrise par les joueurs ou le staff restent configurables séparément.

### Propriétaire de la salle

| Commande | Fonction |
| --- | --- |
| `!promote @user <mod, designer>` | Accorde un privilège Highrise. |
| `!demote @user <mod, designer>` | Retire un privilège. |
| `!botadmin <add, remove, list> [@user]` | Gère les admins internes du bot. |

## Configuration `.env`

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `HOSTING_MODE` | `planethoster` | Utilise Passenger sur N0C ; choisir `local` hors PlanetHoster. |
| `WEB_HOST` | `127.0.0.1` | Adresse d’écoute interne du serveur web. |
| `WEB_PORT` | vide | Vide sur N0C ; port numérique comme `3000` en local. |
| `STATUS_PAGE_NAME` | `Highrise Complete Bot` | Nom public affiché sur la page de statut. |
| `BOT_PREFIX` | `!` | Préfixe des commandes. |
| `BOT_ADMINS` | vide | IDs séparés par des virgules, reconnus comme staff du bot. |
| `COMMAND_COOLDOWN_MS` | `2500` | Cooldown général. |
| `DIRECT_EMOTES_ENABLED` | `true` | Active les emotes directes au premier lancement. |
| `DIRECT_EMOTE_COOLDOWN_MS` | `800` | Délai initial entre deux emotes directes. |
| `EMOTE_LOOP_LEAD_MS` | `250` | Avance de relance initiale pour éviter les temps morts. |
| `EMOTE_LOOP_MIN_INTERVAL_MS` | `800` | Intervalle minimal initial entre deux envois d’emote. |
| `EMOTE_LOOP_RETRY_DELAY_MS` | `1200` | Délai initial avant reprise après une erreur temporaire. |
| `EMOTE_LOOP_MAX_ERRORS` | `3` | Erreurs consécutives avant l’arrêt automatique d’une boucle. |
| `WELCOME_ENABLED` | `true` | Active l’accueil au premier lancement. |
| `ANTI_SPAM_ENABLED` | `false` | Active l’anti-spam au premier lancement. |
| `WORD_FILTER_ENABLED` | `false` | Active le filtre au premier lancement. |
| `WARN_LIMIT` | `3` | Nombre d’avertissements avant expulsion automatique. |
| `MAX_MOD_DURATION_DAYS` | `365` | Durée maximale d’un mute/ban commandé. |
| `BULK_ACTION_DELAY_MS` | `400` | Délai entre les emotes de groupe. |
| `BULK_MAX_USERS` | `200` | Limite initiale des actions groupées. |
| `TIPS_ENABLED` | `false` | Autorise les tips depuis le portefeuille du bot au premier lancement. |
| `TIP_MAX_AMOUNT` | `100` | Plafond initial par tip. |
| `TIP_DAILY_LIMIT` | `500` | Plafond quotidien initial de tips. |
| `TIP_ADMIN_DAILY_LIMIT` | `500` | Plafond quotidien initial par admin. |
| `TIP_RECIPIENT_DAILY_LIMIT` | `250` | Plafond quotidien initial par destinataire. |
| `TIP_CONFIRM_SECONDS` | `60` | Durée de validité du code de confirmation d’un tip. |
| `TIP_SPLIT_ENABLED` | `true` | Autorise initialement les tips fractionnés. |
| `TIP_BULK_ENABLED` | `false` | Autorise initialement `!tipall`. |
| `TIP_BULK_MAX_RECIPIENTS` | `20` | Nombre maximal de destinataires collectifs. |
| `TIP_SEND_DELAY_MS` | `400` | Délai entre coupures et destinataires. |
| `ADMIN_LOGS_ENABLED` | `true` | Active les logs exclusivement en whispers aux admins. |
| `ADMIN_LOG_DENIED_ATTEMPTS` | `true` | Journalise les commandes refusées. |
| `ADMIN_LOG_INCLUDE_ARGUMENTS` | `true` | Inclut des arguments filtrés dans le log. |
| `ADMIN_LOG_MAX_HISTORY` | `2000` | Taille initiale de l’historique privé. |
| `EVENT_REPORTER_ENABLED` | `true` | Active le relais d’événements au premier lancement. |
| `EVENT_PUBLIC_MESSAGES` | `true` | Autorise les messages publics d’événements. |
| `EVENT_PRIVATE_MESSAGES` | `true` | Autorise les whispers aux personnes concernées. |
| `EVENT_EMOTE_COOLDOWN_SECONDS` | `15` | Délai minimal entre deux rapports d’emote par utilisateur. |

Le `.env` fournit les valeurs du premier démarrage. Les changements effectués en jeu, les politiques des 65 commandes, les limites de tips, le journal privé, les points TP, les tenues, ainsi que la position et l’emote permanentes du bot sont sauvegardés dans `data/state.json`. Les rôles détectés par le SDK sont conservés dans `data/roles.json`.

## Vérification et développement

```bash
npm test
npm run check
npm run dev
```

`npm test` vérifie les durées, emotes, wallet, tenues, TP, restauration de la position et de l’emote du bot, tips directs/fractionnés/collectifs, limites simultanées, événements, permissions, configuration en jeu, logs strictement privés, migrations, persistance et serveur web PlanetHoster. `npm run check` contrôle la syntaxe de tous les fichiers JavaScript.

## Autres hébergements 24/7

Sur un VPS avec PM2 :

```bash
npm install
npm install -g pm2
pm2 start app.js --name highrise-bot
pm2 save
```

Sur une plateforme qui fournit un port HTTP dans `PORT`, définis `HOSTING_MODE=local` : `app.js` utilisera automatiquement ce port. Le mode bot seul reste disponible avec `npm run start:bot`.

## Structure

```text
app.js            démarrage web PlanetHoster / Passenger
src/
  commands/       commandes par catégorie
  core/           routeur, permissions, protections et sauvegarde
  hosting/        page de statut, santé HTTP et cible Passenger
  utils/          durées, recherche d’emotes et texte
  index.js        moteur et événements Highrise
data/             état persistant et rôles
test/             tests automatiques
DEPLOIEMENT_PLANETHOSTER.md  guide N0C pas à pas
```

Le SDK `highrise.bot` est communautaire et non officiel ; le Bot API et le portail Highrise Create restent les sources officielles pour les identifiants et les permissions.
