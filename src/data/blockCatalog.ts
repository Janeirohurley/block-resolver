// Catalogue complet des blocs du jeu Block Puzzle
// Chaque forme est définie par ses cellules [row, col] relatives à l'origine (0,0)
// Basé sur les images du jeu: A-3, B-3, B-5, F-5, F-6.1, F-7.5, F-9,
//   I-1 à I-5, L-3 à L-7, N-5, N-6, O-4, O-6, O-8, O-9,
//   P-5, S-2, S-3, T-4, T-5, T-6, T-7, T-7.1, T-9,
//   U-5, V-5, V-6, V-7, V-9, W-5, W-6, Y-5, Y-6, Y-7,
//   Z-4, Z-5, Z-6, Z-7, Z-9

import type { BlockDefinition } from "@/types/types";

export const BLOCK_CATALOG: BlockDefinition[] = [
  // === Série A ===
  {
    id: "A-3",
    name: "A-3",
    series: "A",
    size: 3,
    shape: [
      [0, 1],
      [1, 0],
      [1, 2],
    ], // L simple 3 cases
  },

  // === Série B ===
  {
    id: "B-3",
    name: "B-3",
    series: "B",
    size: 3,
    shape: [
      [0, 1],
      [1, 1],
      [2, 2],
    ], // S-mini
  },
  {
    id: "B-5",
    name: "B-5",
    series: "B",
    size: 5,
    shape: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ], // S large
  },

  // === Série F ===
  {
    id: "F-5",
    name: "F-5",
    series: "F",
    size: 5,
    shape: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 1],
    ], // F pentomino
  },
  {
    id: "F-6.1",
    name: "F-6.1",
    series: "F",
    size: 6,
    shape: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  {
    id: "F-7.5",
    name: "F-7.5",
    series: "F",
    size: 7,
    shape: [
      [0, 1],
      [0, 2],
      [2, 2],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ],
  },
  {
    id: "F-9",
    name: "F-9",
    series: "F",
    size: 9,
    shape: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [1, -1],
      [2, 1],
      [3, 1],
      [4, 1],
    ], // carré 3x3
  },

  // === Série I ===
  {
    id: "I-1",
    name: "I-1",
    series: "I",
    size: 1,
    shape: [[0, 0]],
  },
  {
    id: "I-2",
    name: "I-2",
    series: "I",
    size: 2,
    shape: [
      [0, 0],
      [1, 0],
    ],
  },
  {
    id: "I-3",
    name: "I-3",
    series: "I",
    size: 3,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  },
  {
    id: "I-4",
    name: "I-4",
    series: "I",
    size: 4,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    id: "I-5",
    name: "I-5",
    series: "I",
    size: 5,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ],
  },

  // === Série L ===
  {
    id: "L-3",
    name: "L-3",
    series: "L",
    size: 3,
    shape: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "L-4",
    name: "L-4",
    series: "L",
    size: 4,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
  },
  {
    id: "L-5",
    name: "L-5",
    series: "L",
    size: 5,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
    ],
  },
  {
    id: "L-6",
    name: "L-6",
    series: "L",
    size: 6,
    shape: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 2],
    ],
  },
  {
    id: "L-7",
    name: "L-7",
    series: "L",
    size: 7,
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [4, 1],
      [4, 2],
    ],
  },

  // === Série N ===
  {
    id: "N-5",
    name: "N-5",
    series: "N",
    size: 5,
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [3, 0],
    ], // N pentomino
  },
  {
    id: "N-6",
    name: "N-6",
    series: "N",
    size: 6,
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [3, 0],
      [4, 0],
    ],
  },

  // === Série O ===
  {
    id: "O-4",
    name: "O-4",
    series: "O",
    size: 4,
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ], // carré 2x2
  },
  {
    id: "O-6",
    name: "O-6",
    series: "O",
    size: 6,
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ], // rectangle 3x2
  },
  {
    id: "O-8",
    name: "O-8",
    series: "O",
    size: 8,
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
      [3, 0],
      [3, 1],
    ], // rectangle 4x2
  },
  {
    id: "O-9",
    name: "O-9",
    series: "O",
    size: 9,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ], // carré 3x3
  },

  // === Série P ===
  {
    id: "P-5",
    name: "P-5",
    series: "P",
    size: 5,
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
    ], // P pentomino
  },

  // === Série S ===
  {
    id: "S-2",
    name: "S-2",
    series: "S",
    size: 2,
    shape: [
      [0, 2],
      [1, 1],
    ], // S minimal (diagonal)
  },
  {
    id: "S-3",
    name: "S-3",
    series: "S",
    size: 3,
    shape: [
      [0, 2],
      [1, 1],
      [2, 0],
    ], // S-3 basique
  },

  // === Série T ===
  {
    id: "T-4",
    name: "T-4",
    series: "T",
    size: 4,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ], // T mini
  },
  {
    id: "T-5",
    name: "T-5",
    series: "T",
    size: 5,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
    ], // T pentomino
  },
  {
    id: "T-6",
    name: "T-6",
    series: "T",
    size: 6,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  {
    id: "T-7",
    name: "T-7",
    series: "T",
    size: 7,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ], // T large
  },
  {
    id: "T-7.1",
    name: "T-7.1",
    series: "T",
    size: 7,
    shape: [
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
      [3, 2],
      [4, 2],
    ], // L+barre
  },
  {
    id: "T-9",
    name: "T-9",
    series: "T",
    size: 9,
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
    ], // grand T
  },
  // === Série U ===
  {
    id: "U-5",
    name: "U-5",
    series: "U",
    size: 5,
    shape: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ], // U pentomino
  },

  // === Série V ===
  {
    id: "V-5",
    name: "V-5",
    series: "V",
    size: 5,
    shape: [
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
    ], // V pentomino
  },
  {
    id: "V-6",
    name: "V-6",
    series: "V",
    size: 6,
    shape: [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 1],
      [3, 0],
    ], // V-6
  },
  {
    id: "V-7",
    name: "V-7",
    series: "V",
    size: 7,
    shape: [
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [4, 2],
      [4, 1],
      [4, 0],
    ], // V grand
  },
  {
    id: "V-9",
    name: "V-9",
    series: "V",
    size: 9,
    shape: [
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
    ], // complexe
  },

  // === Série W ===
  {
    id: "W-5",
    name: "W-5",
    series: "W",
    size: 5,
    shape: [
      [0, 2],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 1],
      [2, 0],
    ], // W pentomino
  },
  {
    id: "W-6",
    name: "W-6",
    series: "W",
    size: 6,
    shape: [
      [0, 2],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 0],
    ],
  },

  // === Série Y ===
  {
    id: "Y-5",
    name: "Y-5",
    series: "Y",
    size: 5,
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1],
      [3, 1],
    ], // Y pentomino
  },
  {
    id: "Y-6",
    name: "Y-6",
    series: "Y",
    size: 6,
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ],
  },
  {
    id: "Y-7",
    name: "Y-7",
    series: "Y",
    size: 7,
    shape: [
      [0, 2],
      [1, 2],
      [1, 1],
      [1, 0],
      [2, 2],
      [3, 2],
      [4, 2],
    ],
  },

  // === Série Z ===
  {
    id: "Z-4",
    name: "Z-4",
    series: "Z",
    size: 4,
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ], // Z mini
  },
  {
    id: "Z-5",
    name: "Z-5",
    series: "Z",
    size: 5,
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 2],
      [2, 1],
    ], // Z pentomino
  },
  {
    id: "Z-6",
    name: "Z-6",
    series: "Z",
    size: 6,
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 2],
      [3, 1],
    ],
  },
  {
    id: "Z-7",
    name: "Z-7",
    series: "Z",
    size: 7,
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [4, 1],
    ],
  },
  {
    id: "Z-9",
    name: "Z-9",
    series: "Z",
    size: 9,
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 2],
      [5, 1],
    ],
  },
];

// Groupement par série pour l'affichage catalogue
export const BLOCKS_BY_SERIES = BLOCK_CATALOG.reduce(
  (acc, block) => {
    if (!acc[block.series]) acc[block.series] = [];
    acc[block.series].push(block);
    return acc;
  },
  {} as Record<string, BlockDefinition[]>,
);

// Récupérer un bloc par id
export const getBlockById = (id: string): BlockDefinition | undefined =>
  BLOCK_CATALOG.find((b) => b.id === id);
