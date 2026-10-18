# Marée Haute

Prototype de jeu mobile de réflexion : une île de sable en cases hexagonales, une marée qui monte, et un drapeau à garder au sec.

Ouvre `index.html` dans un navigateur (sur téléphone ou en vue mobile). Aucune installation n'est nécessaire.

## Règles (v1)

1. Chaque case a une hauteur de sable. La mer part du niveau 0.
2. Une action consiste à déplacer **1 sable** d'une case à une autre (en glissant le doigt, ou en touchant la source puis la destination). **Attendre** compte aussi comme une action.
3. Le sable se porte **à pied** : la destination doit être reliée à la source par un chemin de cases au sec. Les rochers servent de passage.
4. La marée monte d'un niveau toutes les *X* actions. *X* dépend du niveau et s'affiche en haut de l'écran.
5. L'eau entre **par la côte** et se propage. Une case est noyée si sa hauteur est ≤ la marée **et** si l'eau peut l'atteindre. Une cuvette entourée de sable plus haut reste au sec : c'est le principe des digues.
6. On peut **verser du sable dans l'eau** (remblai) sur une case noyée qui touche la terre ferme.
7. Le niveau est perdu dès qu'un drapeau est noyé. Il est gagné quand la marée haute arrive et que tous les drapeaux sont au sec.

**Étoiles :** ★ drapeau(x) sauvé(s), ★ sans annuler, ★ nombre maximal de cases au sec à la marée haute.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page du jeu (styles et structure) |
| `src/rules.js` | Règles pures, sans affichage, partagées avec les outils |
| `src/levels.js` | Les 10 niveaux et leur meilleur score |
| `src/app.js` | Rendu canvas, gestes, marée, écrans |
| `tools/solve.js` | Solveur : vérifie que chaque niveau est faisable et calcule le meilleur score |
| `tools/smoke.js` | Test dans Chromium : joue le niveau 1 au doigt, vérifie la règle du chemin au niveau 2 |

```sh
node tools/solve.js            # tous les niveaux
node tools/solve.js cuvette    # un niveau, avec une solution
NODE_PATH=$(npm root -g) node tools/smoke.js
```

## Écrire un niveau

Une carte se décrit avec une chaîne par rangée. Les jetons sont séparés par des espaces et les rangées impaires sont décalées d'un demi-hexagone vers la droite.

- `.` : mer
- `1`…`9` : hauteur du sable
- `F2` : drapeau sur une case de hauteur 2
- `R` : rocher

Lance ensuite `node tools/solve.js <id>` et reporte le score `meilleur` dans le champ `best` du niveau.
