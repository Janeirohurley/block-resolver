// MCTS (Monte Carlo Tree Search) — Block Puzzle 8×8
// Explore des centaines de parties futures pour trouver le MEILLEUR placement.
// Philosophie : plutôt que de scorer avec une formule, on SIMULE le futur.
import type { BlockInstance, Grid, BlockDefinition, Suggestion } from '@/types/types';
import {
  getUniqueTransforms,
  getInstanceShape,
  canPlace,
  gridToBool,
} from '@/lib/blockUtils';
import { BLOCK_CATALOG } from '@/data/blockCatalog';
import type { UserHints } from '@/lib/aiNotes';
import type { SpaceProject } from '@/lib/spaceProjectEngine';
import { evaluateMove as spaceEvaluateMove } from '@/lib/spaceProjectEngine';

const GRID_SIZE = 8;
const MAX_SIM_DEPTH = 30;

function getFilledProfile(grid: boolean[][]): { rows: number[]; cols: number[] } {
  const rows = new Array(GRID_SIZE).fill(0);
  const cols = new Array(GRID_SIZE).fill(0);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c]) { rows[r]++; cols[c]++; }
    }
  }
  return { rows, cols };
}

const COMBO_BONUS = [0, 0, 0, 24, 64, 80, 96];
const comboBonus = (n: number): number =>
  n <= 0 ? 0 : n < COMBO_BONUS.length ? COMBO_BONUS[n] : COMBO_BONUS[COMBO_BONUS.length - 1] * (n - 4);

const CROSS_CLEAR_BONUS = 500;

// Configuration MCTS par défaut
const DEFAULT_CONFIG: MCTSConfig = {
  iterations: 300,
  timeBudget: 3000,
  explorationConstant: 1.8,
  rolloutEpsilon: 0.15,
};

// ─── Contexte global de l'analyse courante ───────────────────────────────────
// (module-level car on est dans un Worker — pas de concurrence)
let _reservedCells: Set<string> | undefined;
let _bossSlot: number | undefined;
let _spaceProject: SpaceProject | undefined;
let _catalog: BlockDefinition[] = BLOCK_CATALOG;

// ─── Types internes ──────────────────────────────────────────────────────────

export interface MCTSConfig {
  iterations: number;
  timeBudget: number;
  explorationConstant: number;
  rolloutEpsilon: number;
}

interface SimState {
  grid: boolean[][];
  hand: Array<BlockInstance | null>; // toujours 3 éléments (null = slot vide)
  score: number;
}

interface LegalPlacement {
  slotIndex: number;
  blockInstance: BlockInstance;
  shape: number[][];
  row: number;
  col: number;
  linesCleared: number;
  colsCleared: number;
}

interface PrecomputedTransform {
  shape: number[][];
  rotation: 0 | 90 | 180 | 270;
  flipped: boolean;
}

interface PrecomputedBlock {
  id: string;
  definition: BlockDefinition;
  transforms: PrecomputedTransform[];
}

// ─── Cache de transformations pré-calculées ─────────────────────────────────

const transformCache = new Map<string, PrecomputedBlock>();

function ensureTransforms(): void {
  if (transformCache.size > 0) return;
  transformCache.clear();
  for (const def of _catalog) {
    const instances = getUniqueTransforms(def, '#000000');
    const transforms = instances.map(inst => ({
      shape: getInstanceShape(inst),
      rotation: inst.rotation,
      flipped: inst.flipped,
    }));
    transformCache.set(def.id, { id: def.id, definition: def, transforms });
  }
}

function getPrecomputed(id: string): PrecomputedBlock | undefined {
  ensureTransforms();
  return transformCache.get(id);
}

// ─── Fonctions auxiliaires rapides (tout en booléen) ───────────────────────

function applyAndClearBool(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number
): { grid: boolean[][]; linesCleared: number; colsCleared: number } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) {
    if (row + dr >= 0 && row + dr < GRID_SIZE && col + dc >= 0 && col + dc < GRID_SIZE) {
      g[row + dr][col + dc] = true;
    }
  }

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

  return { grid: g, linesCleared, colsCleared };
}

function getClearsBool(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number
): { linesCleared: number; colsCleared: number } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) g[r][c] = true;
  }

  let linesCleared = 0;
  let colsCleared = 0;
  for (let r = 0; r < GRID_SIZE; r++) if (g[r].every(Boolean)) linesCleared++;
  for (let c = 0; c < GRID_SIZE; c++) if (g.every(r => r[c])) colsCleared++;
  return { linesCleared, colsCleared };
}

function countNearComplete(grid: boolean[][]): number {
  let count = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    const filled = grid[r].filter(Boolean).length;
    if (filled >= 6) count++;
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const filled = grid.filter(row => row[c]).length;
    if (filled >= 6) count++;
  }
  return count;
}

function evalGridFast(grid: boolean[][]): number {
  let setupScore = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    const filled = grid[r].filter(Boolean).length;
    if (filled >= 6) setupScore += filled * 3;
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const filled = grid.filter(row => row[c]).length;
    if (filled >= 6) setupScore += filled * 3;
  }
  return setupScore;
}

// ─── Génération de blocs aléatoires pour les simulations ─────────────────

function randomBlocks(count: number): BlockInstance[] {
  if (_catalog.length === 0) return [];
  const result: BlockInstance[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let pick: BlockDefinition;
    let attempts = 0;
    do {
      pick = _catalog[Math.floor(Math.random() * _catalog.length)];
      attempts++;
    } while (used.has(pick.id) && attempts < 20);
    used.add(pick.id);
    result.push({
      definition: pick,
      rotation: 0,
      flipped: false,
      color: '#888888',
    });
  }
  return result;
}

// ─── Recherche des placements légaux ──────────────────────────────────────

function getAllLegalPlacements(
  grid: boolean[][],
  hand: Array<BlockInstance | null>,
  reservedCells?: Set<string>,
  bossSlot?: number
): LegalPlacement[] {
  const placements: LegalPlacement[] = [];

  for (let slot = 0; slot < hand.length; slot++) {
    const block = hand[slot];
    if (!block) continue;

    const pre = getPrecomputed(block.definition.id);
    if (!pre) continue;

    for (const t of pre.transforms) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (!canPlace(grid, t.shape, row, col)) continue;

          // Zone réservée du boss : les blocs non-boss ne doivent pas empiéter
          if (reservedCells && reservedCells.size > 0 && bossSlot !== undefined && slot !== bossSlot) {
            const overlaps = t.shape.some(([dr, dc]) => reservedCells.has(`${row + dr},${col + dc}`));
            if (overlaps) continue;
          }

          const { linesCleared, colsCleared } = getClearsBool(grid, t.shape, row, col);

          placements.push({
            slotIndex: slot,
            blockInstance: {
              definition: block.definition,
              rotation: t.rotation,
              flipped: t.flipped,
              color: block.color,
            },
            shape: t.shape,
            row,
            col,
            linesCleared,
            colsCleared,
          });
        }
      }
    }
  }

  return placements;
}

/**
 * Calcule le score immédiat d'un placement (pour simulation rapide).
 */
function immediateScore(lines: number, cols: number): number {
  const total = lines + cols;
  const hasCross = lines > 0 && cols > 0;
  return comboBonus(total) + (hasCross ? CROSS_CLEAR_BONUS : 0);
}

/**
 * Évalue un placement avec une heuristique rapide (pour guider les rollouts).
 */
function heuristicScore(
  grid: boolean[][],
  shape: number[][],
  row: number,
  col: number,
  linesCleared: number,
  colsCleared: number
): number {
  const imm = immediateScore(linesCleared, colsCleared);
  const { grid: after } = applyAndClearBool(grid, shape, row, col);

  let h = 0;
  const totalFilled = after.flat().filter(Boolean).length;
  const density = totalFilled / 64;
  const densityPenalty = density > 0.6 ? (density - 0.6) * 50 : 0;

  h += evalGridFast(after);
  h -= densityPenalty;

  return imm * 1.5 + h;
}

// ─── Noeud MCTS ──────────────────────────────────────────────────────────

class MCTSNode {
  state: SimState;
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalScore: number;
  untriedPlacements: LegalPlacement[];
  placement: LegalPlacement | null;

  constructor(
    state: SimState,
    parent: MCTSNode | null = null,
    placement: LegalPlacement | null = null
  ) {
    this.state = state;
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.totalScore = 0;
    this.untriedPlacements = [];
    this.placement = placement;
  }

  get isFullyExpanded(): boolean {
    return this.untriedPlacements.length === 0;
  }

  get averageScore(): number {
    return this.visits > 0 ? this.totalScore / this.visits : 0;
  }

  /**
   * UCB1 : sélectionne l'enfant le plus prometteur.
   * balance = exploitation (avgScore) + exploration (sqrt(ln(N)/n)).
   */
  bestChild(c: number): MCTSNode {
    const parentLog = Math.log(this.visits);
    let best: MCTSNode | null = null;
    let bestVal = -Infinity;

    for (const child of this.children) {
      if (child.visits === 0) {
        // Enfant non visité → priorité maximale (exploration forcée)
        return child;
      }
      const exploitation = child.averageScore;
      const exploration = c * Math.sqrt(parentLog / child.visits);
      const val = exploitation + exploration;
      if (val > bestVal) {
        bestVal = val;
        best = child;
      }
    }

    return best!;
  }
}

/**
 * Retire un bloc de la main par son index, refill avec blocs aléatoires si la main est vide.
 * Garde la structure à 3 éléments (null = vide).
 */
function refillHand(hand: Array<BlockInstance | null>, slotIndex: number): Array<BlockInstance | null> {
  const result: Array<BlockInstance | null> = hand.map((b, i) => (i === slotIndex ? null : b));
  const hasAnyBlock = result.some(b => b !== null);
  if (!hasAnyBlock) {
    const fresh = randomBlocks(3);
    return fresh;
  }
  return result;
}

// ─── Rollout (simulation rapide) ─────────────────────────────────────────

function rolloutState(state: SimState, config: MCTSConfig, depth = 0): number {
  if (depth >= MAX_SIM_DEPTH) return state.score;

  const placements = getAllLegalPlacements(state.grid, state.hand, _reservedCells, _bossSlot);

  if (placements.length === 0) return state.score;

  // Choisir un placement : heuristique (majorité) ou aléatoire (exploration)
  let chosen: LegalPlacement;

  if (Math.random() < config.rolloutEpsilon) {
    chosen = placements[Math.floor(Math.random() * placements.length)];
  } else {
    // Choisir le meilleur placement selon heuristique (projet-aware si disponible)
    let bestScore = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      let h: number;
      if (_spaceProject) {
        const eval_ = spaceEvaluateMove(_spaceProject, state.grid, p.shape, p.row, p.col, _reservedCells);
        h = eval_.score;
      } else {
        h = heuristicScore(state.grid, p.shape, p.row, p.col, p.linesCleared, p.colsCleared);
      }
      if (h > bestScore) {
        bestScore = h;
        bestIdx = i;
      }
    }
    chosen = placements[bestIdx];
  }

  // Appliquer le placement
  const { grid: newGrid, linesCleared, colsCleared } = applyAndClearBool(
    state.grid, chosen.shape, chosen.row, chosen.col
  );

  const gained = immediateScore(linesCleared, colsCleared);

  // Mettre à jour la main : retirer le bloc placé + refill si vide
  const handAfterPlace = refillHand(state.hand, chosen.slotIndex);

  const nextState: SimState = {
    grid: newGrid,
    hand: handAfterPlace,
    score: state.score + gained,
  };

  return rolloutState(nextState, config, depth + 1);
}

// ─── Arbre MCTS ──────────────────────────────────────────────────────────

function mcts(rootState: SimState, config: MCTSConfig): MCTSNode {
  // Initialiser la racine
  const rootPlacements = getAllLegalPlacements(rootState.grid, rootState.hand, _reservedCells, _bossSlot);
  const root = new MCTSNode(rootState);
  root.untriedPlacements = rootPlacements;

  if (rootPlacements.length === 0) return root;

  const totalIterations = Math.max(config.iterations, rootPlacements.length);
  const deadline = performance.now() + config.timeBudget;

  for (let i = 0; i < totalIterations; i++) {
    if (config.timeBudget > 0 && performance.now() > deadline) break;
    // ── 1. SELECTION ──────────────────────────────────────────────────
    let node = root;
    while (node.isFullyExpanded && node.children.length > 0) {
      node = node.bestChild(config.explorationConstant);
    }

    // ── 2. EXPANSION ─────────────────────────────────────────────────
    if (node.untriedPlacements.length > 0) {
      const placement = node.untriedPlacements.pop()!;

      // Appliquer le placement pour obtenir le nouvel état
      const { grid: newGrid, linesCleared, colsCleared } = applyAndClearBool(
        node.state.grid, placement.shape, placement.row, placement.col
      );
      const gained = immediateScore(linesCleared, colsCleared);

      const childState: SimState = {
        grid: newGrid,
        hand: refillHand(node.state.hand, placement.slotIndex),
        score: node.state.score + gained,
      };

      const child = new MCTSNode(childState, node, placement);

      const childPlacements = getAllLegalPlacements(childState.grid, childState.hand, _reservedCells, _bossSlot);
      child.untriedPlacements = childPlacements;

      node.children.push(child);
      node = child;
    }

    // ── 3. SIMULATION (ROLLOUT) ─────────────────────────────────────
    const simScore = rolloutState(node.state, config);

    // ── 4. RETROPROPAGATION ─────────────────────────────────────────
    let backNode: MCTSNode | null = node;
    while (backNode !== null) {
      backNode.visits++;
      backNode.totalScore += simScore;
      backNode = backNode.parent;
    }
  }

  return root;
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Génère des suggestions de placement en utilisant MCTS.
 * Retourne le même format que generateSuggestions pour compatibilité UI.
 *
 * @param grid   Grille actuelle (CellState[][])
 * @param hand   Main actuelle (3 slots)
 * @param hints  Préférences utilisateur (optionnel)
 * @param config Configuration MCTS (optionnel)
 */
export function generateMCSTSuggestions(
  grid: Grid,
  hand: Array<BlockInstance | null>,
  _hints?: UserHints,
  config?: Partial<MCTSConfig>,
  reservedCells?: Set<string>,
  bossSlot?: number,
  spaceProject?: SpaceProject | null,
  catalog?: BlockDefinition[],
): Record<number, Suggestion[]> {
  const boolGrid = gridToBool(grid);

  // Si main vide → pas de suggestions
  if (hand.every(b => b === null)) return { 0: [], 1: [], 2: [] };

  _spaceProject = spaceProject ?? undefined;
  _catalog = catalog ?? BLOCK_CATALOG;

  // Initialiser le contexte global pour les fonctions internes
  _reservedCells = reservedCells;
  _bossSlot = bossSlot;

  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const totalStart = performance.now();

    // État racine pour MCTS (hand = copie complète des 3 slots)
    const rootState: SimState = {
      grid: boolGrid,
      hand: [...hand],
      score: 0,
    };

    // Lancer MCTS
    const root = mcts(rootState, finalConfig);

    // Organiser les résultats par slot
    const result: Record<number, Suggestion[]> = { 0: [], 1: [], 2: [] };

    // Grouper les enfants par slot
    const bySlot = new Map<number, MCTSNode[]>();
    for (const child of root.children) {
      if (!child.placement) continue;
      const slot = child.placement.slotIndex;
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      bySlot.get(slot)!.push(child);
    }

    const totalMs = (performance.now() - totalStart).toFixed(1);

    // Construire les suggestions pour chaque slot
    for (const [slot, nodes] of bySlot) {
      const suggestions: Suggestion[] = nodes
        .filter(n => n.visits > 0)
        .map(n => {
          const p = n.placement!;
          const avgScore = n.totalScore / n.visits;
          const combinedScore = avgScore + n.state.score;

          const futureCombo = countNearComplete(n.state.grid);
          const pctOfBest = root.visits > 0
            ? ((n.visits / root.visits) * 100).toFixed(0)
            : '0';

          const slotsStr = hand.map((_, i) =>
            i === p.slotIndex ? '📌' : hand[i] ? '▢' : '·'
          ).join(' ');

          const scoreBreakdown = [
            { label: 'Score moyen des simulations', value: Math.round(avgScore), icon: '📊' },
            { label: 'Score immédiat du placement', value: n.state.score, icon: '⚡' },
            { label: 'Simulations explorées', value: n.visits, icon: '🔄' },
          ];
          if (futureCombo > 0) {
            scoreBreakdown.push({ label: 'Lignes/cols quasi-complètes', value: futureCombo, icon: '🎯' });
          }

          let summary: string;
          if (_spaceProject) {
            summary = `🔮 MCTS a exploré ${n.visits} futurs depuis ce placement`;
            if (pctOfBest !== '0') summary += ` (${pctOfBest}% de l'arbre total)`;
            summary += `. Score moyen : ⌀${Math.round(avgScore).toLocaleString()} points.`;
            if (p.linesCleared + p.colsCleared > 0) {
              summary += ` Efface immédiatement ${p.linesCleared}L+${p.colsCleared}C.`;
            }
            const { rows, cols } = getFilledProfile(n.state.grid);
            const nearComplete = rows.filter(r => r >= 6).length + cols.filter(c => c >= 6).length;
            if (nearComplete > 0) {
              summary += ` Après placement, ${nearComplete} ligne${nearComplete > 1 ? 's' : ''}/colonne${nearComplete > 1 ? 's' : ''} proche${nearComplete > 1 ? 's' : ''} de la complétion.`;
            }
          } else {
            summary = `🔮 MCTS a exploré ${n.visits} parties futures depuis ce placement de ${p.blockInstance.definition.name} en L${p.row + 1}·C${p.col + 1}.`;
            if (p.linesCleared + p.colsCleared > 0) {
              summary += ` Efface ${p.linesCleared}L+${p.colsCleared}C.`;
            }
            summary += ` Score moyen estimé : ⌀${Math.round(avgScore).toLocaleString()}.`;
          }

          return {
            id: `${p.blockInstance.definition.id}-${p.blockInstance.rotation}-${p.blockInstance.flipped}-${p.row}-${p.col}`,
            blockInstance: p.blockInstance,
            position: { row: p.row, col: p.col },
            score: Math.round(combinedScore),
            linesCleared: p.linesCleared,
            colsCleared: p.colsCleared,
            cellsFreed: p.linesCleared * GRID_SIZE + p.colsCleared * GRID_SIZE - p.linesCleared * p.colsCleared,
            affectedCells: p.shape.map(([dr, dc]) => [p.row + dr, p.col + dc] as [number, number]),
            clearedLines: [],
            clearedCols: [],
            futureComboLines: futureCombo,
            comboLabel: `🎯 ${pctOfBest}% · ${n.visits} sims · ⌀${Math.round(avgScore).toLocaleString()} · ${slotsStr} · ${totalMs}ms`,
            reasoning: { summary, details: [], scoreBreakdown },
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      result[slot] = suggestions;
    }

    // Remplir les slots vides
    for (let i = 0; i < 3; i++) {
      if (!result[i]) result[i] = [];
    }

    // ── Règle du boss : prioritaire quand réservation active ──
    if (bossSlot !== undefined && bossSlot >= 0) {
      const nonBossHasPlacements = Object.entries(result)
        .some(([slotIdx, suggestions]) => parseInt(slotIdx) !== bossSlot && suggestions.length > 0);
      if (nonBossHasPlacements && (!_reservedCells || _reservedCells.size === 0)) {
        result[bossSlot] = [];
      }
    }

    // ── Fallback zone réservée : si aucune suggestion mais boss compatible ──
    const hasAnySuggestions = Object.values(result).some(arr => arr.length > 0);
    if (!hasAnySuggestions && _reservedCells && _reservedCells.size > 0 && bossSlot !== undefined) {
      const bossBlock = hand[bossSlot];
      if (bossBlock) {
        const transforms = getUniqueTransforms(bossBlock.definition, bossBlock.color);
        for (const instance of transforms) {
          const shape = getInstanceShape(instance);
          for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
              if (!canPlace(boolGrid, shape, row, col)) continue;
              const allInReserved = shape.every(([dr, dc]) => _reservedCells!.has(`${row + dr},${col + dc}`));
              if (allInReserved) {
                const { linesCleared, colsCleared } = getClearsBool(boolGrid, shape, row, col);
                const cellsFreed = linesCleared * GRID_SIZE + colsCleared * GRID_SIZE - linesCleared * colsCleared;
                result[bossSlot] = [{
                  id: `boss-fallback-${instance.rotation}-${instance.flipped ? 'f' : 'n'}-${row}-${col}`,
                  blockInstance: { ...bossBlock, rotation: instance.rotation, flipped: instance.flipped },
                  position: { row, col },
                  score: 10000 + (linesCleared + colsCleared) * 500,
                  linesCleared,
                  colsCleared,
                  cellsFreed,
                  affectedCells: shape.map(([dr, dc]) => [row + dr, col + dc] as [number, number]),
                  clearedLines: [],
                  clearedCols: [],
                }];
                break;
              }
            }
          }
          if (result[bossSlot]?.length) break;
        }
      }
    }

    return result;
  } finally {
    // Nettoyer le contexte global quoi qu'il arrive
    _reservedCells = undefined;
    _bossSlot = undefined;
    _spaceProject = undefined;
    _catalog = BLOCK_CATALOG;
  }
}

/**
 * Version légère : retourne UNIQUEMENT la meilleure suggestion globale (tous slots confondus).
 * Utile pour un affichage "coup recommandé".
 */
export function getBestMCTSMove(
  grid: Grid,
  hand: Array<BlockInstance | null>,
  config?: Partial<MCTSConfig>
): Suggestion | null {
  const suggestions = generateMCSTSuggestions(grid, hand, undefined, config);
  const all = Object.values(suggestions).flat();
  return all.length > 0 ? all[0] : null;
}

/**
 * Réinitialise le cache de transformations (utile si le catalogue change).
 */
export function clearTransformCache(): void {
  transformCache.clear();
}
