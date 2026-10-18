// Niveaux. Format de la carte : voir parseLevel dans rules.js.
// best : nombre maximal de cases au sec à la marée haute (3e étoile), vérifié par `node tools/solve.js`.
(function (root) {
  'use strict';
  const LEVELS = [
    {
      id: 'premier',
      name: 'Premier château',
      hint: 'Glisse du sable d’une case vers le drapeau. Il doit dépasser la marée haute.',
      tideEvery: 3, tideMax: 2, best: 1,
      map: [
        '. 1 1',
        '. F1',
        '. 1 1',
      ],
    },
    {
      id: 'sentier',
      name: 'Le sentier',
      hint: 'Tu portes le sable à pied : une case devenue de l’eau coupe le chemin.',
      tideEvery: 3, tideMax: 2, best: 1,
      map: [
        '1 1 1 F1',
      ],
    },
    {
      id: 'dunes',
      name: 'Les dunes',
      hint: 'La marée noie d’abord le sable bas. Utilise-le avant qu’il disparaisse.',
      tideEvery: 2, tideMax: 2, best: 2,
      map: [
        '. 1 1 2',
        '1 F1 1 .',
        '. 1 2 .',
      ],
    },
    {
      id: 'rocher',
      name: 'Le rocher',
      hint: 'Un rocher ne se noie jamais : on peut marcher dessus pour porter le sable.',
      tideEvery: 2, tideMax: 2, best: 2,
      map: [
        '. 1 . .',
        '2 2 R F1',
        '. 1 . .',
      ],
    },
    {
      id: 'remblai',
      name: 'Le remblai',
      hint: 'Verse du sable dans l’eau pour refaire un chemin.',
      tideEvery: 3, tideMax: 2, best: 1,
      map: [
        '2 2 0 F1 1',
      ],
    },
    {
      id: 'presquile',
      name: 'La presqu’île',
      hint: 'Commence par le bout le plus loin.',
      tideEvery: 2, tideMax: 2, best: 2,
      map: [
        '2 1 1 . .',
        '. 1 . . .',
        '. 1 1 F1 .',
        '. . . 2 1',
      ],
    },
    {
      id: 'cuvette',
      name: 'La cuvette',
      hint: 'L’eau entre par la côte. Une case basse entourée de sable haut reste au sec.',
      tideEvery: 2, tideMax: 2, best: 7,
      map: [
        '. 3 3 .',
        '3 F1 2 1',
        '. 3 3 1',
      ],
    },
    {
      id: 'jumeaux',
      name: 'Les jumeaux',
      hint: 'Deux drapeaux, un seul tas de sable. Partage bien.',
      tideEvery: 3, tideMax: 2, best: 2,
      map: [
        '. 1 1 1',
        'F1 1 2 F1',
        '. 1 1 1',
      ],
    },
    {
      id: 'grande',
      name: 'Grande marée',
      hint: 'Cette fois, la mer monte jusqu’au niveau 3.',
      tideEvery: 3, tideMax: 3, best: 2,
      map: [
        '. 2 1 .',
        '1 F2 2 1',
        '. 1 2 .',
      ],
    },
    {
      id: 'port',
      name: 'Le port',
      hint: 'Une digue peut protéger deux drapeaux à la fois.',
      tideEvery: 2, tideMax: 2, best: 10,
      map: [
        '. 3 3 3',
        '3 F1 F1 2',
        '. 3 2 3',
        '1 1 . .',
      ],
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.LEVELS = LEVELS;
})(typeof self !== 'undefined' ? self : this);
