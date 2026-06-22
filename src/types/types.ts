// Types pour l'assistant Block Puzzle 8x8

export type CellState = {
  occupied: boolean;
  color: string | null; // couleur hex ou null si vide
};

export type Grid = CellState[][]; // 8x8

export type BlockShape = number[][]; // tableau de [row, col] relatifs

export interface BlockDefinition {
  id: string;       // ex: "L-4"
  name: string;     // ex: "L-4"
  series: string;   // ex: "L"
  size: number;     // nombre de cellules
  shape: BlockShape; // coordonnées [row, col] de base
}

export interface BlockInstance {
  definition: BlockDefinition;
  rotation: 0 | 90 | 180 | 270;
  flipped: boolean;
  color: string;
}

export interface PlacementPosition {
  row: number;
  col: number;
}

export interface Suggestion {
  id: string;
  blockInstance: BlockInstance;
  position: PlacementPosition;
  score: number;           // score total (immédiat + futur)
  linesCleared: number;
  colsCleared: number;
  cellsFreed: number;
  affectedCells: Array<[number, number]>; // cellules occupées par le bloc
  clearedLines: number[];  // indices des lignes libérées
  clearedCols: number[];   // indices des colonnes libérées
  futureComboLines?: number; // nombre de lignes/cols proches de la complétion après placement
  comboLabel?: string;       // étiquette lisible du potentiel combo
  reasoning?: {
    summary: string;
    details: { label: string; value: string; icon: string }[];
    scoreBreakdown: { label: string; value: number; icon: string }[];
  };
}

export interface HandBlock {
  slot: 0 | 1 | 2;
  blockInstance: BlockInstance | null;
}

export interface ThemeConfig {
  isDark: boolean;
  accentColor: string; // couleur hex pour l'accent principal
  blockColors: string[]; // palette de couleurs pour les blocs
  showCoordinates: boolean;
  gridSize: 'sm' | 'md' | 'lg';
}

export const DEFAULT_THEME: ThemeConfig = {
  isDark: true,
  accentColor: '#10b981',
  blockColors: [
    '#3b82f6', // bleu
    '#22c55e', // vert
    '#ef4444', // rouge
    '#f97316', // orange
    '#a855f7', // violet
    '#06b6d4', // cyan
    '#eab308', // jaune
    '#ec4899', // rose/magenta
  ],
  showCoordinates: false,
  gridSize: 'md',
};
