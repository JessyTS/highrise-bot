# Déploiement sur PlanetHoster N0C

Cette version est conçue pour l’interface **N0C → Langages → Node.js**. Son fichier de démarrage est `app.js`. Il lance à la fois le serveur web attendu par Passenger et la connexion permanente du bot à Highrise.

## 1. Préparer l’application

1. Décompresse l’archive sur ton ordinateur.
2. Duplique `.env.example` sous le nom `.env`.
3. Complète au minimum :

   ```env
   HOSTING_MODE=planethoster
   HIGHRISE_TOKEN=ton_token_secret
   HIGHRISE_ROOM_ID=identifiant_de_la_salle
   ```

4. Ne publie jamais le token et ne place jamais `.env` dans un dépôt public.

## 2. Créer l’application dans N0C

Dans le panneau PlanetHoster :

1. Ouvre **Langages → Node.js**.
2. Clique sur **Créer**.
3. Choisis une version disponible de **Node.js 22 ou 24**.
4. Sélectionne le dossier où les fichiers du bot seront envoyés.
5. Choisis le domaine ou le chemin public de l’application.
6. Indique `app.js` comme **Boot file / Fichier de démarrage**.
7. Choisis le mode **Production**, puis crée l’application.

Le guide officiel N0C décrit ces mêmes champs dans [Comment gérer les applications Node.js](https://kb.n0c.com/knowledge-base/gestion-des-applications-node-js/).

## 3. Envoyer et installer les fichiers

1. Envoie tout le contenu du projet dans le dossier de l’application, y compris `.env`.
2. Vérifie que `package.json`, `package-lock.json`, `app.js`, `src/` et `data/` se trouvent directement à la racine choisie.
3. Dans la fiche Node.js de N0C, clique sur **Installer** pour installer les modules npm.
4. Clique ensuite sur **Redémarrer**.

Il ne faut pas démarrer `src/index.js` comme application web : ce fichier est uniquement le mode bot/terminal. PlanetHoster doit utiliser `app.js`.

## 4. Vérifier le fonctionnement

Ouvre l’URL choisie dans N0C : une page de statut doit apparaître.

- `/` : page de statut sans donnée secrète.
- `/health` ou `/healthz` : confirme que le processus web répond.
- `/ready` ou `/readyz` : renvoie HTTP 200 seulement lorsque le bot est connecté à Highrise, sinon HTTP 503.

La page et les routes de santé n’affichent jamais le token, le Room ID, les conversations ou les logs privés des admins.

## 5. Redémarrages et données persistantes

Passenger peut redémarrer le processus après une mise à jour, une erreur ou une opération dans N0C. À chaque démarrage, le bot :

- recharge `data/state.json` et `data/roles.json` ;
- se reconnecte à la salle ;
- retourne à sa position permanente ;
- relance son emote permanente ;
- conserve la configuration des commandes, sanctions, tips, tenues et points TP.

Lors d’une mise à jour, sauvegarde et conserve toujours `.env` ainsi que le dossier `data/`. Ne les remplace pas par les fichiers vides de la nouvelle archive.

## 6. Diagnostic

Si la page web fonctionne mais `/ready` renvoie 503 :

1. vérifie `HIGHRISE_TOKEN` et `HIGHRISE_ROOM_ID` dans `.env` ;
2. vérifie que le bot possède les droits nécessaires dans la salle ;
3. ouvre les journaux de l’application Node.js dans N0C ;
4. redémarre l’application après chaque modification de `.env` ou du code.

Si l’offre recycle les applications web inactives, une surveillance HTTPS raisonnable de `/health` peut réveiller ou vérifier le service. Pour une garantie stricte de processus WebSocket permanent, une offre PlanetHoster HybridCloud/dédiée est plus adaptée qu’un hébergement mutualisé.

La gestion des tâches planifiées est expliquée dans le guide officiel [Tâches Cron et courriel dans N0C](https://kb.n0c.com/knowledge-base/taches-cron-et-courriel-dans-n0c/). Respecte les limites et la fréquence recommandées par ton offre.

## Lancement hors PlanetHoster

Pour lancer l’application web localement, utilise dans `.env` :

```env
HOSTING_MODE=local
WEB_HOST=127.0.0.1
WEB_PORT=3000
```

Puis exécute `npm start`. Pour lancer uniquement le bot sans serveur web, utilise `npm run start:bot`.
