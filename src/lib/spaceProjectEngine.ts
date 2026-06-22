// Moteur de projet Espace — Block Puzzle 8×8
// Le joueur sculpte un espace vide en jouant. Le jeu donne des blocs qui rentrent dans cet espace.
// Stratégie : identifier la zone de jeu active (le vide), jouer dedans, préparer des déclencheurs.
import type { BlockInstance, Grid, BlockShape, Suggestion } from '@/types/types';
import {
  getUniqueTransforms,
  getInstanceShape,
  canPlace,
  gridToBool,
} from '@/lib/blockUtils';
import { BLOCK_CATALOG } from '@/data/blockCatalog';

const GRID_SIZE = 8;

// ─── Types publics ────────────────────────────────────────────────────────────

export interface VoidProfile {
  rows: number[];       // remplissage par ligne
  cols: number[];       // remplissage par colonne
  voidRows: number[];   // lignes avec ≤3 cases occupées (espace de jeu actif)
  voidCols: number[];   // colonnes avec ≤3 cases occupées
  denseRows: number[];  // lignes avec ≥6 cases occupées (presque fermées)
  denseCols: number[];  // colonnes avec ≥6 cases occupées
  triggerRows: number[]; // lignes à ≥7 — un seul bloc peut déclencher
  triggerCols: number[]; // colonnes à ≥7
  coherence: number;    // 0..1 — à quel point le vide est concentré
}

export interface SpaceProject {
  voidProfile: VoidProfile;
  phase: 'exploration' | 'sculpting' | 'trigger';
  coherence: number;
  age: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const VOID_FILL_BONUS = 80;
const COHERENCE_BONUS = 60;
const TRIGGER_SETUP_BONUS = 120;
const SCATTER_PENALTY = 100;
const DENSE_FILL_PENALTY = 80;
const RESERVED_ZONE_PENALTY = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function boolGridFromGrid(grid: Grid): boolean[][] {
  return grid.map(row => row.map(c => c.occupied));
}

function getClearsBool(
  grid: boolean[][],
  shape: BlockShape,
  row: number,
  col: number
): { clearedLines: number[]; clearedCols: number[] } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) g[r][c] = true;
  }
  const clearedLines: number[] = [];
  const clearedCols: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) if (g[r].every(Boolean)) clearedLines.push(r);
  for (let c = 0; c < GRID_SIZE; c++) if (g.every(r => r[c])) clearedCols.push(c);
  return { clearedLines, clearedCols };
}

function applyAndClearBool(
  grid: boolean[][],
  shape: BlockShape,
  row: number,
  col: number
): { grid: boolean[][]; linesCleared: number[]; colsCleared: number[] } {
  const g = grid.map(r => [...r]);
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) g[r][c] = true;
  }
  const linesCleared: number[] = [];
  const colsCleared: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) if (g[r].every(Boolean)) linesCleared.push(r);
  for (let c = 0; c < GRID_SIZE; c++) if (g.every(r => r[c])) colsCleared.push(c);
  for (const r of linesCleared) for (let c = 0; c < GRID_SIZE; c++) g[r][c] = false;
  for (const c of colsCleared) for (let r = 0; r < GRID_SIZE; r++) g[r][c] = false;
  return { grid: g, linesCleared, colsCleared };
}

// ─── Analyse de l'espace vide ─────────────────────────────────────────────────

/**
 * Calcule le profil de l'espace vide sur la grille.
 * Identifie les zones de jeu actives vs les zones presque fermées.
 */
export function analyzeVoid(grid: boolean[][]): VoidProfile {
  const rows = new Array(GRID_SIZE).fill(0);
  const cols = new Array(GRID_SIZE).fill(0);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c]) { rows[r]++; cols[c]++; }
    }
  }

  const voidRows = rows.map((v, i) => v <= 3 ? i : -1).filter(i => i >= 0);
  const voidCols = cols.map((v, i) => v <= 3 ? i : -1).filter(i => i >= 0);
  const denseRows = rows.map((v, i) => v >= 6 ? i : -1).filter(i => i >= 0);
  const denseCols = cols.map((v, i) => v >= 6 ? i : -1).filter(i => i >= 0);
  const triggerRows = rows.map((v, i) => v >= 7 ? i : -1).filter(i => i >= 0);
  const triggerCols = cols.map((v, i) => v >= 7 ? i : -1).filter(i => i >= 0);

  // Cohérence : le vide est-il concentré ou dispersé ?
  // Plus les voidRows et voidCols sont proches les unes des autres, plus c'est cohérent.
  let coherence = 0;
  if (voidRows.length > 1) {
    const gaps = [];
    for (let i = 1; i < voidRows.length; i++) gaps.push(voidRows[i] - voidRows[i - 1]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    coherence += Math.max(0, 1 - avgGap / GRID_SIZE) * 0.5;
  } else if (voidRows.length === 1) {
    coherence += 0.5;
  }
  if (voidCols.length > 1) {
    const gaps = [];
    for (let i = 1; i < voidCols.length; i++) gaps.push(voidCols[i] - voidCols[i - 1]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    coherence += Math.max(0, 1 - avgGap / GRID_SIZE) * 0.5;
  } else if (voidCols.length === 1) {
    coherence += 0.5;
  }

  return { rows, cols, voidRows, voidCols, denseRows, denseCols, triggerRows, triggerCols, coherence };
}

/**
 * Crée ou met à jour un SpaceProject à partir de l'état actuel de la grille.
 */
export function createSpaceProject(
  grid: Grid,
  previous?: SpaceProject | null
): SpaceProject {
  const boolGrid = boolGridFromGrid(grid);
  const voidProfile = analyzeVoid(boolGrid);

  let phase: 'exploration' | 'sculpting' | 'trigger';
  if (voidProfile.triggerRows.length + voidProfile.triggerCols.length >= 2) {
    phase = 'trigger';
  } else if (voidProfile.coherence > 0.3 && voidProfile.voidRows.length + voidProfile.voidCols.length > 0) {
    phase = 'sculpting';
  } else {
    phase = 'exploration';
  }

  return {
    voidProfile,
    phase,
    coherence: voidProfile.coherence,
    age: (previous?.age ?? 0) + 1,
  };
}

// ─── Évaluation d'un coup selon le projet Espace ─────────────────────────────

export interface SpaceMoveEval {
  score: number;
  coherence: number;
  triggerPotential: number;
  scatterPenalty: number;
  reservedPenalty: number;
}

/**
 * Évalue un placement selon la cohérence avec l'espace vide.
 */
export function evaluateMove(
  project: SpaceProject,
  grid: boolean[][],
  shape: BlockShape,
  row: number,
  col: number,
  reservedCells?: Set<string>,
): SpaceMoveEval {
  const profile = project.voidProfile;
  const { clearedLines: linesCleared, clearedCols: colsCleared } = getClearsBool(grid, shape, row, col);

  // ── A. Cohérence avec le vide ────────────────────────────────────────────
  // Bonus si le placement remplit des cellules dans les zones de vide
  let coherence = 0;
  let inVoidCount = 0;
  let inDenseCount = 0;
  let totalCells = 0;

  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    totalCells++;
    if (profile.voidRows.includes(r) || profile.voidCols.includes(c)) {
      coherence += COHERENCE_BONUS;
      inVoidCount++;
    }
    if (profile.denseRows.includes(r) || profile.denseCols.includes(c)) {
      inDenseCount++;
    }
  }

  // Bonus spécial si le placement chevauche l'intersection voidRow × voidCol
  // (coeur de la zone de jeu)
  for (const [dr, dc] of shape) {
    const r = row + dr;
    const c = col + dc;
    if (profile.voidRows.includes(r) && profile.voidCols.includes(c)) {
      coherence += COHERENCE_BONUS / 2;
    }
  }

  // ── B. Potentiel de déclenchement ────────────────────────────────────────
  // Bonus si le placement prépare un déclencheur (ligne/col à 7/8)
  let triggerPotential = 0;
  for (const r of linesCleared) {
    if (profile.triggerRows.includes(r)) triggerPotential += TRIGGER_SETUP_BONUS;
  }
  for (const c of colsCleared) {
    if (profile.triggerCols.includes(c)) triggerPotential += TRIGGER_SETUP_BONUS;
  }

  // Bonus si on remplit la dernière case d'une ligne/col à 7/8 (déclenchement)
  for (const r of linesCleared) {
    if (profile.denseRows.includes(r) || profile.triggerRows.includes(r)) {
      triggerPotential += TRIGGER_SETUP_BONUS;
    }
  }
  for (const c of colsCleared) {
    if (profile.denseCols.includes(c) || profile.triggerCols.includes(c)) {
      triggerPotential += TRIGGER_SETUP_BONUS;
    }
  }

  // ── C. Pénalité de dispersion ────────────────────────────────────────────
  // Pénalité si le placement remplit des cellules dans des zones denses (hors vide)
  let scatterPenalty = 0;
  if (inDenseCount > 0 && inVoidCount === 0) {
    // Placement entièrement en zone dense → dispersion
    scatterPenalty = SCATTER_PENALTY * inDenseCount;
  } else if ((inDenseCount / totalCells) > 0.5) {
    // Plus de la moitié du bloc en zone dense → pénalité partielle
    scatterPenalty = SCATTER_PENALTY * inDenseCount / 2;
  }

  // Si le placement déclenche un clear, c'est moins grave (on libère de l'espace)
  if (linesCleared.length + colsCleared.length > 0) {
    scatterPenalty = Math.max(0, scatterPenalty - SCATTER_PENALTY * (linesCleared.length + colsCleared.length));
  }

  // ── D. Pénalité zone réservée ────────────────────────────────────────────
  // Si le joueur a réservé manuellement des cellules, les toucher est très pénalisé
  let reservedPenalty = 0;
  if (reservedCells && reservedCells.size > 0) {
    let overlap = 0;
    for (const [dr, dc] of shape) {
      if (reservedCells.has(`${row + dr},${col + dc}`)) overlap++;
    }
    if (overlap > 0) {
      reservedPenalty = RESERVED_ZONE_PENALTY * overlap;
    }
  }

  const score = coherence + triggerPotential - scatterPenalty - reservedPenalty;

  return { score, coherence, triggerPotential, scatterPenalty, reservedPenalty };
}

// ─── Suggestion d'un coup pour un bloc donné ─────────────────────────────────

/**
 * Évalue tous les placements d'un bloc selon le projet Espace.
 */
export function getSuggestionsForBlock(
  block: BlockInstance,
  grid: Grid,
  project: SpaceProject,
  maxResults: number = 3,
  reservedCells?: Set<string>,
): Suggestion[] {
  const boolGrid = boolGridFromGrid(grid);
  const candidates: Suggestion[] = [];
  const transforms = getUniqueTransforms(block.definition, block.color);

  for (const transform of transforms) {
    const shape = getInstanceShape(transform);
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (!canPlace(boolGrid, shape, row, col)) continue;

        const { clearedLines, clearedCols } = getClearsBool(boolGrid, shape, row, col);
        const evalScore = evaluateMove(project, boolGrid, shape, row, col, reservedCells);

        // Construire raisonnement
        const details: { label: string; value: string; icon: string }[] = [];
        const scoreBreakdown: { label: string; value: number; icon: string }[] = [];

        const phaseLabels: Record<string, string> = {
          exploration: '🔍 Exploration — identifier la zone de jeu',
          sculpting: '🏗️ Sculpture — construire dans le vide choisi',
          trigger: '💣 Déclenchement — préparer les effacements',
        };
        details.push({ label: 'Phase', value: phaseLabels[project.phase] ?? project.phase, icon: '📋' });
        details.push({ label: 'Cohérence du vide', value: `${Math.round(project.coherence * 100)}%`, icon: '🎯' });

        // Axes de jeu
        const axesInVoid: string[] = [];
        for (const [dr, dc] of shape) {
          const r = row + dr;
          const c = col + dc;
          if (project.voidProfile.voidRows.includes(r) && !axesInVoid.includes(`L${r}`)) axesInVoid.push(`L${r}`);
          if (project.voidProfile.voidCols.includes(c) && !axesInVoid.includes(`C${c}`)) axesInVoid.push(`C${c}`);
        }
        if (axesInVoid.length > 0) {
          details.push({ label: 'Zone de jeu', value: axesInVoid.join(', '), icon: '🎯' });
        }

        scoreBreakdown.push(
          { label: 'Cohérence avec le vide', value: evalScore.coherence, icon: '🎯' },
          { label: 'Potentiel déclencheur', value: evalScore.triggerPotential, icon: '💥' },
        );
        if (evalScore.scatterPenalty > 0) {
          scoreBreakdown.push({ label: 'Pénalité dispersion', value: -evalScore.scatterPenalty, icon: '🌪️' });
        }
        if (evalScore.reservedPenalty > 0) {
          scoreBreakdown.push({ label: 'Zone réservée touchée', value: -evalScore.reservedPenalty, icon: '🚫' });
        }

        const isTrigger = clearedLines.length + clearedCols.length > 0;
        const isScatter = evalScore.scatterPenalty > evalScore.coherence;
        const isVoidPlay = evalScore.coherence > 0;
        const isReservedHit = evalScore.reservedPenalty > 0;
        const overlapCount = reservedCells
          ? shape.filter(([dr, dc]) => reservedCells.has(`${row + dr},${col + dc}`)).length
          : 0;

        let summary: string;
        if (isReservedHit) {
          summary = `🚫 Ce placement touche la zone réservée (${overlapCount} cellule${overlapCount > 1 ? 's' : ''}). `;
          summary += `La zone réservée doit être préservée pour le déclenchement futur. Choisis un placement qui l'évite.`;
        } else if (isTrigger) {
          summary = `💥 Déclenche ${clearedLines.length}L+${clearedCols.length}C. `;
          const clearedInDense = [...clearedLines, ...clearedCols].filter(
            x => project.voidProfile.denseRows.includes(x) || project.voidProfile.denseCols.includes(x)
          ).length;
          if (clearedInDense > 0) {
            summary += `Ces lignes/cols étaient presque fermées — bon débarras !`;
          } else {
            summary += `Libère de l'espace pour continuer à sculpter.`;
          }
        } else if (isScatter) {
          summary = `🌪️ Placement dispersé : remplit des cellules hors de la zone de jeu active. `;
          summary += `Essaie de jouer dans le vide (${axesInVoid.length > 0 ? axesInVoid.join(', ') : 'recherche une zone cohérente'}).`;
        } else if (isVoidPlay) {
          summary = `🏗️ Joue dans le vide (${axesInVoid.join(', ')}) : renforce la cohérence. `;
          if (project.phase === 'sculpting') {
            summary += `Continue à sculpter cette zone.`;
          } else if (project.phase === 'trigger') {
            summary += `Prépare les déclencheurs.`;
          } else {
            summary += `Cherche à stabiliser une zone de jeu.`;
          }
        } else {
          summary = `Place ${block.definition.name} en L${row + 1}·C${col + 1}. Ce coup est neutre pour la stratégie d'espace.`;
        }

        const totalVoidAxes = project.voidProfile.voidRows.length + project.voidProfile.voidCols.length;
        if (totalVoidAxes > 0) {
          details.push({ label: 'Zone vide active', value: `${totalVoidAxes} axes (${project.voidProfile.voidRows.length}L + ${project.voidProfile.voidCols.length}C)`, icon: '📐' });
        }

        let comboLabel: string | undefined;
        if (isTrigger) {
          comboLabel = `💥 ${clearedLines.length}L+${clearedCols.length}C`;
        } else if (isVoidPlay) {
          comboLabel = `🏗️ ${axesInVoid.slice(0, 2).join('+')}`;
        } else if (isScatter) {
          comboLabel = '🌪️ Dispersé';
        }

        candidates.push({
          id: `${transform.definition.id}-${transform.rotation}-${transform.flipped}-${row}-${col}`,
          blockInstance: transform,
          position: { row, col },
          score: Math.round(evalScore.score),
          linesCleared: clearedLines.length,
          colsCleared: clearedCols.length,
          cellsFreed: clearedLines.length * GRID_SIZE + clearedCols.length * GRID_SIZE - clearedLines.length * clearedCols.length,
          affectedCells: shape.map(([dr, dc]) => [row + dr, col + dc] as [number, number]),
          clearedLines,
          clearedCols,
          comboLabel,
          reasoning: { summary, details, scoreBreakdown },
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Génère les suggestions pour toute la main selon le projet Espace.
 */
export function generateProjectSuggestions(
  grid: Grid,
  hand: Array<BlockInstance | null>,
  project: SpaceProject,
  maxPerBlock: number = 3,
  reservedCells?: Set<string>,
): Record<number, Suggestion[]> {
  const rawResults: Record<number, Suggestion[]> = {};

  hand.forEach((block, slotIndex) => {
    if (!block) { rawResults[slotIndex] = []; return; }
    rawResults[slotIndex] = getSuggestionsForBlock(block, grid, project, maxPerBlock, reservedCells);
  });

  return rawResults;
}

/**
 * Suggère un bloc pour recharger la main, cohérent avec le projet Espace.
 */
export function suggestNextBlockForProject(
  grid: Grid,
  colors: string[],
  project: SpaceProject | null,
  excludeIds: string[] = [],
  excludeSeries: string[] = [],
  reservedCells?: Set<string>,
): BlockInstance | null {
  const boolGrid = boolGridFromGrid(grid);

  const scored = BLOCK_CATALOG
    .filter(def => !excludeIds.includes(def.id) && !excludeSeries.includes(def.series))
    .map((def, idx) => {
      const color = colors[idx % colors.length] || colors[0];
      const transforms = getUniqueTransforms(def, color);
      let bestScore = -Infinity;

      for (const instance of transforms) {
        const shape = getInstanceShape(instance);
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            if (!canPlace(boolGrid, shape, row, col)) continue;
            let score = 0;
            if (project) {
              const eval_ = evaluateMove(project, boolGrid, shape, row, col, reservedCells);
              score = eval_.score;
            } else {
              const { clearedLines, clearedCols } = getClearsBool(boolGrid, shape, row, col);
              score = (clearedLines.length + clearedCols.length) * 10 + shape.length;
            }
            if (score > bestScore) bestScore = score;
          }
        }
      }

      return bestScore > -Infinity
        ? { def, color, score: bestScore }
        : null;
    })
    .filter((x): x is { def: typeof BLOCK_CATALOG[0]; color: string; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const pick = scored[0];
  return { definition: pick.def, rotation: 0, flipped: false, color: pick.color };
}
