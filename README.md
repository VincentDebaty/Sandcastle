# Marée Haute

Prototype de jeu mobile : **trace des murs de sable pour protéger le château, puis lance la marée.**

Ouvre `index.html` dans un navigateur (sur téléphone ou en vue mobile). Aucune installation n'est nécessaire.

## Comment on joue

1. Glisse le doigt sur la plage pour construire un mur de sable. Chaque trait vide un peu le seau.
2. Les **pointillés** montrent jusqu'où la mer va monter. Le sable doré est inondable, les dunes vertes restent à l'abri.
3. Appuie sur **Marée !** et regarde l'eau monter. Elle passe partout où il n'y a ni mur, ni dune, ni rocher.
4. Si l'eau atteint le château, le jeu **trace le chemin qu'elle a pris**. « Réparer » garde tes murs : il suffit de boucher la brèche.
5. Moins tu utilises de sable, plus tu gagnes d'étoiles (repères ★★ et ★★★ sur la jauge).

## Niveaux

| # | Niveau | Ce qu'on apprend |
|---|---|---|
| 1 | La crique | Le geste : un trait en travers d'un passage (tutoriel animé) |
| 2 | Deux chenaux | L'eau prend tous les passages |
| 3 | Plage ouverte | S'appuyer sur la dune |
| 4 | Près ou loin | Entourer le château coûte moins cher que fermer la baie |
| 5 | Les rochers | Relier les rochers |
| 6 | Le ruisseau | L'eau peut arriver par derrière : lire les pointillés |
| 7 | Les jumeaux | Deux châteaux, un seul seau |
| 8 | Grande marée | La mer monte très haut |

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page du jeu (styles et structure) |
| `src/sim.js` | Simulation pure : terrain, murs, montée de l'eau |
| `src/levels.js` | Cartes des niveaux |
| `src/app.js` | Rendu canvas, dessin au doigt, marée animée, écrans |
| `tools/check.js` | Vérifie chaque niveau (faisable, pas trivial) et calcule la coupe minimale pour régler le seau et les étoiles |
| `tools/smoke.js` | Test dans Chromium : victoire au niveau 1, défaite expliquée puis réparation au niveau 2 |
| `prototypes/v1-hexagones/` | Premier prototype (tour par tour sur hexagones), conservé pour mémoire |

```sh
node tools/check.js
NODE_PATH=$(npm root -g) node tools/smoke.js
```

## Écrire un niveau

Une carte fait 15 × 22 caractères, et chaque caractère couvre 4 × 4 cellules.

- `~` : mer profonde
- `,` : mer peu profonde
- `.` : sable mouillé
- `1`…`9` : hauteur du sable
- `R` : rocher

`tideMax` fixe la hauteur atteinte par la mer, `bucket` le sable disponible et `par` l'objectif pour 3 étoiles. `node tools/check.js` signale un niveau impossible, un niveau trop facile ou un réglage incohérent.
