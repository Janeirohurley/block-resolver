// Apprentissage par démonstration — Block Puzzle 8×8
// Le joueur joue en mode apprentissage, l'IA enregistre chaque coup.
// Plus tard, elle retrouve des situations similaires et suggère les coups qui ont marché.

import type { BlockInstance, Grid } from '@/types/types';
import { gridFingerprint, memoryFingerprint } from '@/lib/aiCache';

const GRID_SIZE = 8;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DemonstratedMove {
  /** Empreinte compacte de la grille AVANT le coup */
  gridFingerprint: string;
  /** IDs des blocs dans la main (séparés par des virgules, 'null' pour vide) */
  handIds: string;
  /** Bloc utilisé */
  blockId: string;
  rotation: number;
  flipped: boolean;
  row: number;
  col: number;
  /** Résultat */
  linesCleared: number;
  colsCleared: number;
  scoreGained: number;
  /** Méta-données */
  timestamp: number;
}

export interface MatchResult {
  move: DemonstratedMove;
  similarity: number; // 0-1
}

// ─── Gestionnaire de démonstrations ────────────────────────────────────────

export class DemonstrationDB {
  private moves: DemonstratedMove[] = [];

  constructor(existing?: DemonstratedMove[]) {
    if (existing) this.moves = existing;
  }

  add(move: DemonstratedMove): void {
    this.moves.push(move);
  }

  getAll(): DemonstratedMove[] {
    return [...this.moves];
  }

  count(): number {
    return this.moves.length;
  }

  clear(): void {
    this.moves = [];
  }

  serialize(): string {
    return JSON.stringify(this.moves);
  }

  static deserialize(json: string): DemonstrationDB {
    return new DemonstrationDB(JSON.parse(json));
  }
}

// ─── Extraction de signature d'état ────────────────────────────────────────

export interface StateSignature {
  density: number;       // 0-1
  holes: number;         // 0-20+
  nearCompleteLines: number; // 0-16
  filledPerRow: number[]; // 8 values
  filledPerCol: number[]; // 8 values
}

function gridToBool(grid: Grid): boolean[][] {
  return grid.map(row => row.map(c => c.occupied));
}

function countHoles(grid: boolean[][]): number {
  const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  const stack: [number, number][] = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    if (!grid[0][c]) { visited[0][c] = true; stack.push([0, c]); }
    if (!grid[GRID_SIZE - 1][c]) { visited[GRID_SIZE - 1][c] = true; stack.push([GRID_SIZE - 1, c]); }
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    if (!grid[r][0]) { visited[r][0] = true; stack.push([r, 0]); }
    if (!grid[r][GRID_SIZE - 1]) { visited[r][GRID_SIZE - 1] = true; stack.push([r, GRID_SIZE - 1]); }
  }
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && !visited[nr][nc] && !grid[nr][nc]) {
        visited[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  let holes = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (!grid[r][c] && !visited[r][c]) holes++;
  return holes;
}

function countNearCompleteLines(grid: boolean[][]): number {
  let count = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    if (grid[i].filter(Boolean).length >= 6) count++;
    if (grid.reduce((acc, row) => acc + (row[i] ? 1 : 0), 0) >= 6) count++;
  }
  return count;
}

export function extractSignature(grid: Grid): StateSignature {
  const boolGrid = gridToBool(grid);
  const flat = boolGrid.flat();
  const density = flat.filter(Boolean).length / 64;
  const holes = countHoles(boolGrid);
  const nearCompleteLines = countNearCompleteLines(boolGrid);
  const filledPerRow = boolGrid.map(row => row.filter(Boolean).length);
  const filledPerCol = Array.from({ length: GRID_SIZE }, (_, c) =>
    boolGrid.reduce((acc, row) => acc + (row[c] ? 1 : 0), 0)
  );
  return { density, holes, nearCompleteLines, filledPerRow, filledPerCol };
}

// ─── Similarité entre deux états ──────────────────────────────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function similarityScore(a: StateSignature, b: StateSignature): number {
  // Densité : différence absolue
  const densityDiff = Math.abs(a.density - b.density);
  const densitySim = 1 - densityDiff;

  // Trous : différence relative
  const maxHoles = Math.max(a.holes, b.holes, 1);
  const holesDiff = Math.abs(a.holes - b.holes) / maxHoles;
  const holesSim = 1 - holesDiff;

  // Lignes presque complètes
  const ncDiff = Math.abs(a.nearCompleteLines - b.nearCompleteLines) / Math.max(a.nearCompleteLines, b.nearCompleteLines, 1);
  const ncSim = 1 - ncDiff;

  // Profil de remplissage des lignes (corrélation)
  let rowCorr = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    const diff = Math.abs(a.filledPerRow[i] - b.filledPerRow[i]);
    rowCorr += 1 - diff / 8;
  }
  const rowSim = rowCorr / GRID_SIZE;

  // Profil de remplissage des colonnes
  let colCorr = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    const diff = Math.abs(a.filledPerCol[i] - b.filledPerCol[i]);
    colCorr += 1 - diff / 8;
  }
  const colSim = colCorr / GRID_SIZE;

  // Ponderations
  return (
    densitySim * 0.25 +
    holesSim * 0.15 +
    ncSim * 0.15 +
    rowSim * 0.25 +
    colSim * 0.20
  );
}

// ─── Recherche de coups similaires ─────────────────────────────────────────

/**
 * Trouve les N démonstrations les plus similaires à l'état actuel.
 * Filtre aussi par blocs disponibles dans la main.
 */
export function findSimilarMoves(
  db: DemonstrationDB,
  grid: Grid,
  hand: Array<BlockInstance | null>,
  topN = 5
): MatchResult[] {
  const sig = extractSignature(grid);
  const handIds = hand.map(b => b?.definition.id ?? 'null').sort().join(',');

  const scored: MatchResult[] = [];

  for (const move of db.getAll()) {
    // Vérifier que le bloc utilisé dans la démo existe encore dans la main actuelle
    if (!hand.some(b => b?.definition.id === move.blockId)) continue;

    const sig2 = extractSignatureFromFingerprint(move.gridFingerprint);
    if (!sig2) continue;

    const sim = similarityScore(sig, sig2);
    scored.push({ move, similarity: sim });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

// ─── Reconstruction de signature depuis une empreinte (approximatif) ───────

function extractSignatureFromFingerprint(fp: string): StateSignature | null {
  // L'empreinte stocke chaque ligne comme un nombre 0-255 en base36
  // On peut reconstruire filledPerRow mais pas holes/nearComplete précisément
  try {
    const parts = fp.split(',');
    if (parts.length !== GRID_SIZE) return null;
    const filledPerRow = parts.map(p => {
      const n = parseInt(p, 36);
      if (isNaN(n)) return 0;
      let bits = 0;
      for (let i = 0; i < GRID_SIZE; i++) if (n & (1 << i)) bits++;
      return bits;
    });
    const density = filledPerRow.reduce((a, b) => a + b, 0) / 64;
    const filledPerCol = Array.from({ length: GRID_SIZE }, (_, c) => {
      let count = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        const n = parseInt(parts[r], 36);
        if (!isNaN(n) && (n & (1 << c))) count++;
      }
      return count;
    });
    // holes et nearCompleteLines ne peuvent pas être déduits exactement,
    // on utilise des valeurs par défaut (la similarité sera moins précise)
    return { density, holes: 0, nearCompleteLines: 0, filledPerRow, filledPerCol };
  } catch {
    return null;
  }
}

// ─── Fonction utilitaire d'enregistrement d'un coup joué ───────────────────

export function recordMove(
  db: DemonstrationDB,
  grid: Grid,
  hand: Array<BlockInstance | null>,
  placedBlock: BlockInstance,
  row: number,
  col: number,
  linesCleared: number,
  colsCleared: number,
  scoreGained: number
): void {
  const boolGrid = gridToBool(grid);
  const fp = gridFingerprint(boolGrid);
  const handIds = hand.map(b => b?.definition.id ?? 'null').join(',');

  db.add({
    gridFingerprint: fp,
    handIds,
    blockId: placedBlock.definition.id,
    rotation: placedBlock.rotation,
    flipped: placedBlock.flipped,
    row,
    col,
    linesCleared,
    colsCleared,
    scoreGained,
    timestamp: Date.now(),
  });
}
