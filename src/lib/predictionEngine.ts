// Moteur de prédiction stratégique — Block Puzzle 8x8
// Philosophie : NE PAS se précipiter à effacer une seule ligne.
//   Construire des configurations permettant des destructions MULTIPLES simultanées.
//   L'IA connaît tout le catalogue et imagine les blocs futurs.
//   Le bloc du MILIEU (slot 1) est le "Boss" — le plus grand — on lui réserve sa zone.
import type { BlockInstance, Suggestion, Grid } from '@/types/types';
import {
  getUniqueTransforms,
  getInstanceShape,
  canPlace,
  gridToBool,
} from '@/lib/blockUtils';
import { BLOCK_CATALOG } from '@/data/blockCatalog';
import {
  bossCache,
  suggestionsCache,
  nextBlocksCache,
  placabilityCache,
  gridFingerprint,
  blockFingerprint,
  handGridKey,
  memoryFingerprint,
} from '@/lib/aiCache';
import type { UserHints } from '@/lib/aiNotes';
import { DEFAULT_HINTS } from '@/lib/aiNotes';

const GRID_SIZE = 8;

// ─── Constantes de scoring ────────────────────────────────────────────────────

const COMBO_BONUS = [0, 60, 200, 500, 1000, 1800, 3000];
const comboBonus = (n: number): number =>
  n <= 0 ? 0 : n < COMBO_BONUS.length ? COMBO_BONUS[n] : COMBO_BONUS[COMBO_BONUS.length - 1] * (n - 5);

const CROSS_CLEAR_BONUS = 150;
const NEAR_COMPLETE_WEIGHT = [0, 0, 0, 0, 0, 3, 12, 35, 0];
const FRAGMENTATION_PENALTY = 8;
const HOLE_PENALTY = 5;
const FUTURE_WEIGHT = 1.4;
const CATALOG_SAMPLE_SIZE = 18;

// Pénalité forte si un bloc NON-boss empiète sur la zone réservée du boss
const RESERVED_ZONE_PENALTY = 180;

// Bonus mémoire : si un placement complète une ligne/col déjà active (historique récent)
const MEMORY_BONUS = 25;

// ─── Types publics ────────────────────────────────────────────────────────────

/** Enregistrement d'une destruction récente pour la mémoire contextuelle. */
export interface ClearMemory {
  lines: number[];   // indices de lignes effacées
  cols: number[];    // indices de colonnes effacées
  turn: number;      // numéro du coup (pour expirer les vieux souvenirs)
}

/** Résultat du calcul de la zone réservée pour le boss. */
export interface BossReservation {
  cells: Array<[number, number]>; // cellules de la zone réservée
  row: number;
  col: number;
  bossBlock: BlockInstance;
  bossSlot: number;
}

// ─── Utilitaires grille ───────────────────────────────────────────────────────

/** Applique un placement et efface les lignes/cols complètes. Retourne la nouvelle grille + combos. */
function applyAndClear(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number
): { grid: boolean[][]; totalClears: number; linesCleared: number; colsCleared: number } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) g[row + dr][col + dc] = true;

  let linesCleared = 0;
  let colsCleared = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    if (g[r].every(Boolean)) {
      for (let c = 0; c < GRID_SIZE; c++) g[r][c] = false;
      linesCleared++;
    }
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    if (g.every(r => r[c])) {
      for (let r = 0; r < GRID_SIZE; r++) g[r][c] = false;
      colsCleared++;
    }
  }
  return { grid: g, totalClears: linesCleared + colsCleared, linesCleared, colsCleared };
}

/** Détecte les lignes/cols effacées AVANT clearance (pour construire les sets d'explosion). */
function getClears(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number
): { clearedLines: number[]; clearedCols: number[] } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) g[row + dr][col + dc] = true;
  const clearedLines: number[] = [];
  const clearedCols: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) if (g[r].every(Boolean)) clearedLines.push(r);
  for (let c = 0; c < GRID_SIZE; c++) if (g.every(r => r[c])) clearedCols.push(c);
  return { clearedLines, clearedCols };
}

// ─── Heuristiques de qualité de grille ────────────────────────────────────────

/**
 * Compte les trous isolés (cases vides très encerclées).
 * Pénalise fortement les configurations fragmentées.
 */
function countHoles(grid: boolean[][]): number {
  let holes = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c]) continue;
      const blocked = [
        r === 0 || grid[r - 1][c],
        r === GRID_SIZE - 1 || grid[r + 1][c],
        c === 0 || grid[r][c - 1],
        c === GRID_SIZE - 1 || grid[r][c + 1],
      ].filter(Boolean).length;
      if (blocked >= 3) holes += 2;
      else if (blocked === 2) holes += 1;
    }
  }
  return holes;
}

/**
 * Compte les régions vides connectées (flood-fill).
 * 1 seule grande région = parfait. Plusieurs petites = mauvais.
 */
function countVoidRegions(grid: boolean[][]): number {
  const visited = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(false));
  let regions = 0;
  const fill = (sr: number, sc: number) => {
    const stack = [[sr, sc]];
    while (stack.length) {
      const [r, c] = stack.pop()!;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      if (visited[r][c] || grid[r][c]) continue;
      visited[r][c] = true;
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
  };
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c] && !visited[r][c]) { regions++; fill(r, c); }
    }
  }
  return regions;
}

/**
 * Score des lignes/cols quasi-complètes — CŒUR de la stratégie setup.
 * Plus une ligne est proche de 8/8, plus elle vaut cher.
 * Bonus si PLUSIEURS lignes/cols sont simultanément quasi-complètes (potentiel multi-destroy).
 */
function setupScore(grid: boolean[][]): { score: number; nearCompleteCount: number } {
  let score = 0;
  let nearCompleteCount = 0; // lignes/cols à 6+ cases remplies

  for (let r = 0; r < GRID_SIZE; r++) {
    const filled = grid[r].filter(Boolean).length;
    score += NEAR_COMPLETE_WEIGHT[filled] ?? 0;
    if (filled >= 6) nearCompleteCount++;
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const filled = grid.filter(row => row[c]).length;
    score += NEAR_COMPLETE_WEIGHT[filled] ?? 0;
    if (filled >= 6) nearCompleteCount++;
  }

  // Bonus exponentiel si plusieurs lignes/cols quasi-complètes simultanément
  // (potentiel de tout effacer avec UN seul prochain bloc bien placé)
  if (nearCompleteCount >= 4) score += nearCompleteCount * 20;
  else if (nearCompleteCount >= 2) score += nearCompleteCount * 8;

  return { score, nearCompleteCount };
}

/**
 * Évaluation heuristique complète d'un état de grille.
 * Intègre: setup (lignes quasi-complètes), fragmentation, trous, densité.
 */
function evaluateGrid(grid: boolean[][]): number {
  const { score: setup } = setupScore(grid);
  const holes = countHoles(grid);
  const regions = countVoidRegions(grid);
  const totalFilled = grid.flat().filter(Boolean).length;
  const density = totalFilled / 64;
  // Légère préférence pour la moitié inférieure de remplissage (plus d'options)
  const densityPenalty = density > 0.6 ? (density - 0.6) * 30 : 0;

  return (
    setup
    - holes * HOLE_PENALTY
    - (regions - 1) * FRAGMENTATION_PENALTY
    - densityPenalty
  );
}

// ─── Échantillonnage représentatif du catalogue ──────────────────────────────

/**
 * Sélectionne un sous-ensemble représentatif et diversifié du catalogue
 * pour simuler les blocs futurs inconnus du joueur.
 * Couvre les différentes tailles et formes du catalogue.
 */
function sampleCatalog(): typeof BLOCK_CATALOG {
  if (BLOCK_CATALOG.length <= CATALOG_SAMPLE_SIZE) return BLOCK_CATALOG;

  // Grouper par taille
  const bySize: Record<number, typeof BLOCK_CATALOG> = {};
  for (const def of BLOCK_CATALOG) {
    if (!bySize[def.size]) bySize[def.size] = [];
    bySize[def.size].push(def);
  }

  const sample: typeof BLOCK_CATALOG = [];
  const sizes = Object.keys(bySize).map(Number).sort();

  // Proportionnel à la représentation dans le catalogue
  for (const size of sizes) {
    const group = bySize[size];
    const proportion = Math.max(1, Math.round((group.length / BLOCK_CATALOG.length) * CATALOG_SAMPLE_SIZE));
    // Prendre des éléments espacés régulièrement dans le groupe
    const step = Math.max(1, Math.floor(group.length / proportion));
    for (let i = 0; i < group.length && sample.length < CATALOG_SAMPLE_SIZE; i += step) {
      sample.push(group[i]);
    }
  }

  return sample;
}

// Cache de l'échantillon (stable pendant la session)
let _catalogSample: typeof BLOCK_CATALOG | null = null;
function getCatalogSample(): typeof BLOCK_CATALOG {
  if (!_catalogSample) _catalogSample = sampleCatalog();
  return _catalogSample;
}

// ─── Look-ahead futur via catalogue ──────────────────────────────────────────

/**
 * Estime l'espérance de gain futur en testant des blocs représentatifs du catalogue
 * sur la grille résultante d'un placement candidat.
 *
 * Pour chaque bloc futur échantillonné :
 *   - Trouve son MEILLEUR placement possible
 *   - Calcule le combo immédiat + la qualité de grille résultante
 *
 * Retourne la moyenne (espérance) sur tous les blocs testés.
 */
function futurePotential(
  gridAfter: boolean[][],
  color: string
): { expectedValue: number; bestFutureClears: number } {
  const sample = getCatalogSample();
  let totalScore = 0;
  let samplesUsed = 0;
  let bestFutureClears = 0;

  for (const def of sample) {
    const transforms = getUniqueTransforms(def, color);
    let bestForThisBlock = -Infinity;
    let bestClearsForThisBlock = 0;

    for (const t of transforms) {
      const shape = getInstanceShape(t);
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (!canPlace(gridAfter, shape, r, c)) continue;
          const { grid: g2, totalClears, linesCleared, colsCleared } =
            applyAndClear(gridAfter, shape, r, c);

          // Score de ce futur placement
          const immScore = comboBonus(totalClears)
            + (linesCleared > 0 && colsCleared > 0 ? CROSS_CLEAR_BONUS : 0);
          const stateScore = evaluateGrid(g2);
          const total = immScore + stateScore * 0.5;

          if (total > bestForThisBlock) {
            bestForThisBlock = total;
            bestClearsForThisBlock = totalClears;
          }
        }
      }
    }

    if (bestForThisBlock > -Infinity) {
      totalScore += bestForThisBlock;
      samplesUsed++;
      if (bestClearsForThisBlock > bestFutureClears)
        bestFutureClears = bestClearsForThisBlock;
    }
  }

  return {
    expectedValue: samplesUsed > 0 ? totalScore / samplesUsed : 0,
    bestFutureClears,
  };
}

// ─── Évaluation d'un placement candidat ─────────────────────────────────────

interface CandidateScore {
  immediateScore: number;
  setupScore_: number;
  futureScore: number;
  totalScore: number;
  linesCleared: number;
  colsCleared: number;
  clearedLines: number[];
  clearedCols: number[];
  nearCompleteCount: number;
  bestFutureClears: number;
}

/**
 * Score un placement candidat en tenant compte :
 * - Du combo immédiat (non-linéaire)
 * - Du setup futur (lignes quasi-complètes après placement)
 * - De l'espérance future via catalogue
 * - De la zone réservée boss (pénalité si empiètement)
 * - De la mémoire contextuelle (bonus si continuité stratégique)
 * - Des notes d'apprentissage utilisateur (hints)
 */
function scoreCandidate(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number,
  color: string,
  reservedCells: Set<string> = new Set(),
  memory: ClearMemory[] = [],
  isBossBlock = false,
  hints: UserHints = DEFAULT_HINTS
): CandidateScore {
  const { clearedLines, clearedCols } = getClears(grid, shape, row, col);
  const { grid: gridAfter, linesCleared, colsCleared } =
    applyAndClear(grid, shape, row, col);

  const totalClears = linesCleared + colsCleared;
  const hasCross = linesCleared > 0 && colsCleared > 0;

  // ① Score immédiat (combo non-linéaire)
  const immediateScore =
    comboBonus(totalClears)
    + (hasCross ? CROSS_CLEAR_BONUS : 0);

  // ② Score setup
  const { score: ss, nearCompleteCount } = setupScore(gridAfter);
  const holes = countHoles(gridAfter);
  const regions = countVoidRegions(gridAfter);
  const density = gridAfter.flat().filter(Boolean).length / 64;
  const densityPenalty = density > 0.6 ? (density - 0.6) * 30 : 0;
  const setupScore_ = ss - holes * HOLE_PENALTY - (regions - 1) * FRAGMENTATION_PENALTY - densityPenalty;

  // ③ Potentiel futur via catalogue
  const { expectedValue: futureScore, bestFutureClears } = futurePotential(gridAfter, color);

  // ④ Pénalité zone réservée boss (uniquement pour les blocs NON-boss)
  let reservedPenalty = 0;
  if (!isBossBlock && reservedCells.size > 0) {
    const overlap = shape.filter(([dr, dc]) => reservedCells.has(`${row + dr},${col + dc}`)).length;
    if (overlap > 0) reservedPenalty = RESERVED_ZONE_PENALTY * overlap;
  }

  // ⑤ Bonus mémoire contextuelle
  let memoryBonus = 0;
  if (memory.length > 0) {
    const recentLines = new Set(memory.flatMap(m => m.lines));
    const recentCols = new Set(memory.flatMap(m => m.cols));
    for (const l of clearedLines) if (recentLines.has(l)) memoryBonus += MEMORY_BONUS;
    for (const c of clearedCols) if (recentCols.has(c)) memoryBonus += MEMORY_BONUS;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (recentLines.has(r)) {
        const filledAfter = gridAfter[r].filter(Boolean).length;
        if (filledAfter >= 6) memoryBonus += 8;
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      if (recentCols.has(c)) {
        const filledAfter = gridAfter.filter(r2 => r2[c]).length;
        if (filledAfter >= 6) memoryBonus += 8;
      }
    }
  }

  // ⑥ Bonus notes d'apprentissage utilisateur
  let hintsBonus = 0;
  if (hints.hasCustomHints) {
    const cells = shape.map(([dr, dc]) => [row + dr, col + dc]);
    const maxIdx = GRID_SIZE - 1;

    if (hints.preferCorners || hints.preferEdges) {
      // Bonus pour chaque case posée sur un bord ou coin
      for (const [r, c] of cells) {
        const onEdge = r === 0 || r === maxIdx || c === 0 || c === maxIdx;
        const onCorner = (r === 0 || r === maxIdx) && (c === 0 || c === maxIdx);
        if (onCorner && hints.preferCorners) hintsBonus += 12 * hints.cornerBonusMultiplier;
        else if (onEdge && hints.preferEdges) hintsBonus += 6 * hints.cornerBonusMultiplier;
      }
    }

    if (hints.avoidCenter) {
      // Pénalité si le placement est centré (zone centrale 3x3)
      const center = [3, 4];
      const inCenter = cells.filter(([r, c]) => center.includes(r) && center.includes(c)).length;
      if (inCenter > 0) hintsBonus -= inCenter * 15;
    }

    if (hints.preferRows && linesCleared > 0) {
      hintsBonus += linesCleared * 30 * hints.rowBonusMultiplier;
    }
    if (hints.preferCols && colsCleared > 0) {
      hintsBonus += colsCleared * 30 * hints.colBonusMultiplier;
    }

    if (hints.preferDense || hints.avoidSparse) {
      // Bonus si le bloc est posé adjacent à d'autres blocs occupés
      let adjacentFilled = 0;
      for (const [r, c] of cells) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr; const nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc])
            adjacentFilled++;
        }
      }
      if (adjacentFilled > 0) hintsBonus += adjacentFilled * 5 * hints.densityBonusMultiplier;
    }
  }

  const totalScore =
    immediateScore * 1.0
    + setupScore_ * 2.5
    + futureScore * FUTURE_WEIGHT
    - reservedPenalty
    + memoryBonus
    + hintsBonus;

  return {
    immediateScore,
    setupScore_,
    futureScore,
    totalScore,
    linesCleared,
    colsCleared,
    clearedLines,
    clearedCols,
    nearCompleteCount,
    bestFutureClears,
  };
}

// ─── Génération des suggestions ─────────────────────────────────────────────

function suggestionsForBlock(
  block: BlockInstance,
  grid: boolean[][],
  maxSuggestions = 5,
  reservedCells: Set<string> = new Set(),
  memory: ClearMemory[] = [],
  isBossBlock = false,
  hints: UserHints = DEFAULT_HINTS
): Suggestion[] {
  const candidates: Suggestion[] = [];
  const transforms = getUniqueTransforms(block.definition, block.color);

  for (const transform of transforms) {
    const shape = getInstanceShape(transform);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (!canPlace(grid, shape, row, col)) continue;

        const s = scoreCandidate(grid, shape, row, col, block.color, reservedCells, memory, isBossBlock, hints);

        // Étiquette lisible du potentiel combo futur
        let comboLabel: string | undefined;
        const totalFutureLines = s.nearCompleteCount + s.bestFutureClears;
        if (s.linesCleared + s.colsCleared >= 3) {
          comboLabel = `💥 ${s.linesCleared + s.colsCleared} lignes/cols !`;
        } else if (s.linesCleared > 0 && s.colsCleared > 0) {
          comboLabel = `⚡ Croix (×${s.linesCleared + s.colsCleared})`;
        } else if (s.linesCleared + s.colsCleared === 2) {
          comboLabel = `⚡ Double`;
        } else if (s.nearCompleteCount >= 4) {
          comboLabel = `🎯 Setup ×${s.nearCompleteCount}`;
        } else if (s.nearCompleteCount >= 2) {
          comboLabel = `🎯 Setup ×${s.nearCompleteCount}`;
        } else if (s.bestFutureClears >= 2) {
          comboLabel = `🔮 Futur ×${s.bestFutureClears}`;
        } else if (totalFutureLines >= 3) {
          comboLabel = `📐 ${totalFutureLines} prêts`;
        }

        candidates.push({
          id: `${transform.definition.id}-${transform.rotation}-${transform.flipped}-${row}-${col}`,
          blockInstance: transform,
          position: { row, col },
          score: Math.round(s.totalScore),
          linesCleared: s.linesCleared,
          colsCleared: s.colsCleared,
          cellsFreed: (s.linesCleared + s.colsCleared) * GRID_SIZE,
          affectedCells: shape.map(([dr, dc]) => [row + dr, col + dc] as [number, number]),
          clearedLines: s.clearedLines,
          clearedCols: s.clearedCols,
          futureComboLines: s.nearCompleteCount,
          comboLabel,
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

// ─── Identification du Boss ───────────────────────────────────────────────────

/**
 * Identifie le slot "boss" : le plus grand bloc de la main QUI PEUT ÊTRE PLACÉ sur la grille.
 * Si aucun bloc n'est plaçable, retourne le slot du plus grand bloc (par défaut : 1).
 * Cela évite de couronner Boss un bloc qui n'a aucune place sur la grille.
 */
export function findBossSlot(hand: Array<BlockInstance | null>, grid?: Grid): number {
  const boolGrid = grid ? gridToBool(grid) : null;

  // Filtrer les blocs plaçables si on a la grille
  let candidates = hand.map((block, idx) => ({ block, idx })).filter(x => x.block !== null);

  if (boolGrid) {
    const placeable = candidates.filter(({ block }) => {
      if (!block) return false;
      const transforms = getUniqueTransforms(block.definition, block.color);
      for (const t of transforms) {
        const shape = getInstanceShape(t);
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (canPlace(boolGrid, shape, r, c)) return true;
          }
        }
      }
      return false;
    });
    // N'utiliser que les blocs plaçables pour choisir le boss
    if (placeable.length > 0) candidates = placeable;
  }

  if (candidates.length === 0) return 1; // main vide → défaut milieu

  // Parmi les candidats plaçables, choisir le plus grand
  let maxSize = -1;
  let bossIdx = 1;
  for (const { block, idx } of candidates) {
    if (block && block.definition.size > maxSize) {
      maxSize = block.definition.size;
      bossIdx = idx;
    }
  }
  return bossIdx;
}

/**
 * Calcule la meilleure zone réservée pour le bloc boss sur la grille actuelle.
 * Cherche la position qui maximise le potentiel de combo futur pour le boss.
 * Retourne null si aucune position valide n'existe.
 * Résultat mis en cache par empreinte grille + bloc boss.
 */
export function computeBossReservation(
  grid: Grid,
  bossBlock: BlockInstance,
  bossSlot: number,
  memory: ClearMemory[] = []
): BossReservation | null {
  const boolGrid = gridToBool(grid);

  // Clé de cache : empreinte grille + bloc + mémoire
  const fp = gridFingerprint(boolGrid);
  const bfp = blockFingerprint(bossBlock.definition.id, bossBlock.rotation, bossBlock.flipped, bossBlock.color);
  const mfp = memoryFingerprint(memory);
  const cacheKey = `boss:${fp}|${bfp}|slot${bossSlot}|${mfp}`;

  const cached = bossCache.get(cacheKey);
  if (cached !== undefined) return cached as BossReservation | null;

  const transforms = getUniqueTransforms(bossBlock.definition, bossBlock.color);

  let bestScore = -Infinity;
  let bestResult: BossReservation | null = null;

  for (const transform of transforms) {
    const shape = getInstanceShape(transform);
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (!canPlace(boolGrid, shape, row, col)) continue;
        // Pour le boss, on évalue sans pénalité de zone réservée (c'est lui le boss!)
        const s = scoreCandidate(boolGrid, shape, row, col, bossBlock.color, new Set(), memory, true);
        if (s.totalScore > bestScore) {
          bestScore = s.totalScore;
          bestResult = {
            cells: shape.map(([dr, dc]) => [row + dr, col + dc] as [number, number]),
            row,
            col,
            bossBlock: transform,
            bossSlot,
          };
        }
      }
    }
  }

  bossCache.set(cacheKey, bestResult);
  return bestResult;
}

/**
 * Convertit une BossReservation en Set<string> de clés "row,col" pour comparaison rapide.
 */
export function reservationToCellSet(reservation: BossReservation | null): Set<string> {
  if (!reservation) return new Set();
  return new Set(reservation.cells.map(([r, c]) => `${r},${c}`));
}

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Génère les meilleures suggestions pour les 3 blocs de la main.
 *
 * RÈGLE DU DERNIER RECOURS :
 *   Le Boss n'est suggéré que si AUCUN bloc non-boss n'a de placement disponible.
 *   Tant qu'au moins un bloc non-boss peut être posé, le Boss est supprimé des suggestions.
 *
 * Respecte la zone réservée du boss et intègre la mémoire contextuelle.
 * Résultat mis en cache par empreinte grille + main + mémoire.
 */
export function generateSuggestions(
  grid: Grid,
  hand: Array<BlockInstance | null>,
  maxPerBlock = 3,
  bossReservation: BossReservation | null = null,
  memory: ClearMemory[] = [],
  hints: UserHints = DEFAULT_HINTS
): Record<number, Suggestion[]> {
  const boolGrid = gridToBool(grid);
  const fp = gridFingerprint(boolGrid);
  const handIds = hand.map(b =>
    b ? blockFingerprint(b.definition.id, b.rotation, b.flipped, b.color) : null
  );
  const mfp = memoryFingerprint(memory);
  const bossFp = bossReservation
    ? `${bossReservation.row},${bossReservation.col},${bossReservation.bossSlot}`
    : 'none';
  // La clé de cache intègre les hints actifs pour ne pas servir un cache périmé
  const hintsFp = hints.hasCustomHints
    ? `h:${hints.cornerBonusMultiplier.toFixed(1)}|${hints.rowBonusMultiplier.toFixed(1)}|${hints.colBonusMultiplier.toFixed(1)}|${hints.densityBonusMultiplier.toFixed(1)}|${hints.avoidCenter?1:0}`
    : 'h:none';
  const cacheKey = handGridKey(fp, handIds, mfp) + `|boss:${bossFp}|max:${maxPerBlock}|${hintsFp}`;

  const cached = suggestionsCache.get(cacheKey);
  if (cached !== undefined) return cached as Record<number, Suggestion[]>;

  const result: Record<number, Suggestion[]> = {};
  const reservedCells = reservationToCellSet(bossReservation);
  const bossSlot = bossReservation?.bossSlot ?? findBossSlot(hand, grid);

  // ── Étape 1 : calculer les suggestions pour tous les blocs ─────────────────
  const rawResults: Record<number, Suggestion[]> = {};
  hand.forEach((block, slotIndex) => {
    if (!block) { rawResults[slotIndex] = []; return; }
    const isBoss = slotIndex === bossSlot;
    rawResults[slotIndex] = suggestionsForBlock(block, boolGrid, maxPerBlock, reservedCells, memory, isBoss, hints);
  });

  // ── Étape 2 : vérifier si au moins un bloc NON-boss a des suggestions ──────
  const nonBossHasPlacements = hand.some((block, slotIndex) => {
    if (!block || slotIndex === bossSlot) return false;
    return rawResults[slotIndex].length > 0;
  });

  // ── Étape 3 : appliquer la règle du dernier recours ────────────────────────
  hand.forEach((block, slotIndex) => {
    if (!block) { result[slotIndex] = []; return; }
    const isBoss = slotIndex === bossSlot;
    if (isBoss && nonBossHasPlacements) {
      result[slotIndex] = [];
    } else {
      result[slotIndex] = rawResults[slotIndex];
    }
  });

  suggestionsCache.set(cacheKey, result);
  return result;
}

/**
 * Vérifie si un bloc peut être placé quelque part sur la grille.
 * Résultat mis en cache.
 */
export function canBlockBePlaced(grid: Grid, block: BlockInstance): boolean {
  const boolGrid = gridToBool(grid);
  const fp = gridFingerprint(boolGrid);
  const bfp = blockFingerprint(block.definition.id, block.rotation, block.flipped, block.color);
  const cacheKey = `place:${fp}|${bfp}`;

  const cached = placabilityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const transforms = getUniqueTransforms(block.definition, block.color);
  for (const transform of transforms) {
    const shape = getInstanceShape(transform);
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (canPlace(boolGrid, shape, row, col)) {
          placabilityCache.set(cacheKey, true);
          return true;
        }
      }
    }
  }
  placabilityCache.set(cacheKey, false);
  return false;
}

/**
 * Suggère automatiquement 3 nouveaux blocs pour recharger la main.
 * GARANTIT que le slot 1 (milieu) reçoit le plus grand bloc (le nouveau boss).
 * Slots 0 et 2 reçoivent des blocs plus petits compatibles.
 * Résultat mis en cache par empreinte grille.
 */
export function suggestNextBlocks(
  grid: Grid,
  colors: string[],
  count = 3
): BlockInstance[] {
  const boolGrid = gridToBool(grid);
  const fp = gridFingerprint(boolGrid);
  const cacheKey = `next:${fp}|${colors.slice(0, 3).join(',')}|${count}`;

  const cached = nextBlocksCache.get(cacheKey);
  if (cached !== undefined) return cached as BlockInstance[];

  // Scorer chaque bloc du catalogue sur son MEILLEUR placement possible
  const scored = BLOCK_CATALOG.map((def, idx) => {
    const color = colors[idx % colors.length] || colors[0];
    const transforms = getUniqueTransforms(def, color);

    let bestTotalScore = -Infinity;
    let bestSetup = 0;

    for (const instance of transforms) {
      const shape = getInstanceShape(instance);
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (!canPlace(boolGrid, shape, row, col)) continue;
          const s = scoreCandidate(boolGrid, shape, row, col, color);
          if (s.totalScore > bestTotalScore) {
            bestTotalScore = s.totalScore;
            bestSetup = s.nearCompleteCount;
          }
        }
      }
    }

    if (bestTotalScore === -Infinity) return { def, color, totalScore: -1000, setup: 0 };
    return { def, color, totalScore: bestTotalScore + bestSetup * 5, setup: bestSetup };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Sélectionner `count` blocs diversifiés (taille et série variées)
  const selected: BlockInstance[] = [];
  const usedSeries = new Set<string>();
  const sizes: number[] = [];

  for (const { def, color } of scored) {
    if (selected.length >= count) break;
    const seriesSaturated = usedSeries.has(def.series) && selected.length < count - 1;
    const sizeSaturated = sizes.filter(s => s === def.size).length >= 2;
    if (seriesSaturated || sizeSaturated) continue;
    usedSeries.add(def.series);
    sizes.push(def.size);
    selected.push({ definition: def, rotation: 0, flipped: false, color });
  }

  // Compléter si pas assez
  if (selected.length < count) {
    for (const { def, color } of scored) {
      if (selected.length >= count) break;
      if (!selected.some(s => s.definition.id === def.id)) {
        selected.push({ definition: def, rotation: 0, flipped: false, color });
      }
    }
  }

  // ── RÈGLE DU BOSS ──
  // Garantir que le slot 1 (milieu) est toujours le plus GRAND bloc.
  // Trier selected par taille : [petit, grand, moyen] → mettre le plus grand au centre.
  if (selected.length === 3) {
    selected.sort((a, b) => a.definition.size - b.definition.size);
    // Après tri ascendant : [0]=petit, [1]=moyen, [2]=grand
    // On veut : [0]=petit, [1]=grand(boss), [2]=moyen
    const [small, medium, large] = selected;
    const result = [small, large, medium];
    nextBlocksCache.set(cacheKey, result);
    return result;
  }

  nextBlocksCache.set(cacheKey, selected);
  return selected;
}

/**
 * Suggère un seul nouveau bloc pour un slot non-boss (shuffle).
 * Compatible avec l'état de la grille et ne bloque pas la zone réservée du boss.
 */
export function suggestOneBlock(
  grid: Grid,
  colors: string[],
  excludeIds: string[] = [],
  bossReservation: BossReservation | null = null,
  memory: ClearMemory[] = []
): BlockInstance | null {
  const boolGrid = gridToBool(grid);
  const reservedCells = reservationToCellSet(bossReservation);

  const scored = BLOCK_CATALOG
    .filter(def => !excludeIds.includes(def.id))
    .map((def, idx) => {
      const color = colors[idx % colors.length] || colors[0];
      const transforms = getUniqueTransforms(def, color);

      let bestScore = -Infinity;
      for (const instance of transforms) {
        const shape = getInstanceShape(instance);
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            if (!canPlace(boolGrid, shape, row, col)) continue;
            const s = scoreCandidate(boolGrid, shape, row, col, color, reservedCells, memory, false);
            if (s.totalScore > bestScore) bestScore = s.totalScore;
          }
        }
      }

      if (bestScore === -Infinity) return null;
      return { def, color, score: bestScore };
    })
    .filter((x): x is { def: typeof BLOCK_CATALOG[0]; color: string; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const pick = scored[0];
  return { definition: pick.def, rotation: 0, flipped: false, color: pick.color };
}
