// Utilitaires pour les transformations de blocs (rotation, miroir)
import type { BlockShape, BlockInstance, BlockDefinition, Grid } from '@/types/types';

const GRID_SIZE = 8;

/**
 * Normalise une forme: translate pour que le min row/col soit 0
 */
export function normalizeShape(shape: BlockShape): BlockShape {
  const minRow = Math.min(...shape.map(([r]) => r));
  const minCol = Math.min(...shape.map(([, c]) => c));
  return shape.map(([r, c]) => [r - minRow, c - minCol]);
}

/**
 * Rotation de 90° dans le sens horaire
 */
export function rotateShape90(shape: BlockShape): BlockShape {
  const rotated: BlockShape = shape.map(([r, c]) => [c, -r]);
  return normalizeShape(rotated);
}

/**
 * Miroir horizontal (flip sur l'axe vertical)
 */
export function flipShapeH(shape: BlockShape): BlockShape {
  const maxCol = Math.max(...shape.map(([, c]) => c));
  return normalizeShape(shape.map(([r, c]) => [r, maxCol - c]));
}

/**
 * Applique rotation + flip à une forme de base
 */
export function applyTransform(
  shape: BlockShape,
  rotation: 0 | 90 | 180 | 270,
  flipped: boolean
): BlockShape {
  let result: BlockShape = shape.map(([r, c]) => [r, c]);
  
  // Appliquer le flip d'abord
  if (flipped) {
    result = flipShapeH(result);
  }
  
  // Appliquer les rotations
  const steps = rotation / 90;
  for (let i = 0; i < steps; i++) {
    result = rotateShape90(result);
  }
  
  return normalizeShape(result);
}

/**
 * Retourne toutes les transformations uniques d'un bloc
 */
export function getUniqueTransforms(
  definition: BlockDefinition,
  baseColor: string
): BlockInstance[] {
  const seen = new Set<string>();
  const result: BlockInstance[] = [];
  
  const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const flips = [false, true];
  
  for (const rotation of rotations) {
    for (const flipped of flips) {
      const shape = applyTransform(definition.shape, rotation, flipped);
      const key = shape.map(([r, c]) => `${r},${c}`).sort().join('|');
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          definition,
          rotation,
          flipped,
          color: baseColor,
        });
      }
    }
  }
  
  return result;
}

/**
 * Obtenir la forme transformée d'une instance de bloc
 */
export function getInstanceShape(instance: BlockInstance): BlockShape {
  return applyTransform(instance.definition.shape, instance.rotation, instance.flipped);
}

/**
 * Calculer les dimensions (rows, cols) d'une forme
 */
export function getShapeDimensions(shape: BlockShape): { rows: number; cols: number } {
  const maxRow = Math.max(...shape.map(([r]) => r));
  const maxCol = Math.max(...shape.map(([, c]) => c));
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

/**
 * Vérifie si un bloc peut être placé à une position donnée
 */
export function canPlace(
  grid: boolean[][],
  shape: BlockShape,
  row: number,
  col: number
): boolean {
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (grid[r][c]) return false;
  }
  return true;
}

/**
 * Calcule le score d'un placement (lignes + colonnes libérées)
 */
export function calculatePlacementScore(
  grid: boolean[][],
  shape: BlockShape,
  row: number,
  col: number
): {
  score: number;
  linesCleared: number;
  colsCleared: number;
  clearedLines: number[];
  clearedCols: number[];
} {
  // Copier la grille et appliquer le placement
  const newGrid = grid.map(r => [...r]);
  for (const [dr, dc] of shape) {
    newGrid[row + dr][col + dc] = true;
  }
  
  // Calculer les lignes complètes
  const clearedLines: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    if (newGrid[r].every(cell => cell)) {
      clearedLines.push(r);
    }
  }
  
  // Calculer les colonnes complètes
  const clearedCols: number[] = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    if (newGrid.every(r => r[c])) {
      clearedCols.push(c);
    }
  }
  
  const linesCleared = clearedLines.length;
  const colsCleared = clearedCols.length;
  const score = (linesCleared + colsCleared) * GRID_SIZE + shape.length;
  
  return { score, linesCleared, colsCleared, clearedLines, clearedCols };
}

/**
 * Convertit la grille CellState en grille booléenne
 */
export function gridToBool(grid: { occupied: boolean; color: string | null }[][]): boolean[][] {
  return grid.map(row => row.map(cell => cell.occupied));
}

/**
 * Résultat d'un placement avec effacement de lignes/colonnes
 */
export interface PlacementResult {
  newGrid: Grid;
  clearedLines: number[];   // indices de lignes effacées
  clearedCols: number[];    // indices de colonnes effacées
  scoreGained: number;      // points gagnés
  cellsFreed: number;       // cases libérées
}

/**
 * Applique un placement sur la grille CellState, efface les lignes/colonnes complètes,
 * et retourne la nouvelle grille avec les statistiques d'effacement.
 */
export function applyPlacementWithClears(
  grid: Grid,
  shape: BlockShape,
  anchorRow: number,
  anchorCol: number,
  color: string
): PlacementResult {
  // 1. Copie + peindre le bloc
  const next: Grid = grid.map(row => row.map(cell => ({ ...cell })));
  for (const [dr, dc] of shape) {
    next[anchorRow + dr][anchorCol + dc] = { occupied: true, color };
  }

  // 2. Détecter les lignes/colonnes complètes
  const clearedLines: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    if (next[r].every(cell => cell.occupied)) clearedLines.push(r);
  }
  const clearedCols: number[] = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    if (next.every(row => row[c].occupied)) clearedCols.push(c);
  }

  // 3. Effacer les lignes et colonnes complètes
  for (const r of clearedLines) {
    for (let c = 0; c < GRID_SIZE; c++) {
      next[r][c] = { occupied: false, color: null };
    }
  }
  for (const c of clearedCols) {
    for (let r = 0; r < GRID_SIZE; r++) {
      next[r][c] = { occupied: false, color: null };
    }
  }

  // 4. Calculer le score
  // Base: 10 pts × nb cases libérées, bonus ×2 si plusieurs lignes/cols en même coup
  const cellsFreed = clearedLines.length * GRID_SIZE + clearedCols.length * GRID_SIZE;
  const combos = clearedLines.length + clearedCols.length;
  const bonus = combos > 1 ? combos * 10 : 0;
  const scoreGained = cellsFreed * 10 + bonus;

  return { newGrid: next, clearedLines, clearedCols, scoreGained, cellsFreed };
}
