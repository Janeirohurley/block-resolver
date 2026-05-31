// ─── Persistance de la partie ─────────────────────────────────────────────────
// Sauvegarde et restaure le state complet du jeu dans localStorage.
// Permet de reprendre une partie après rechargement de la page.
import { useEffect, useRef, useCallback } from 'react';
import type { Grid, BlockInstance, CellState } from '@/types/types';
import type { ClearMemory, BossReservation } from '@/lib/predictionEngine';
import { BLOCK_CATALOG } from '@/data/blockCatalog';

const SAVE_KEY    = 'blockpuzzle_game_state';
const SAVE_DELAY  = 800; // ms après le dernier changement

// ─── Schéma sérialisé ─────────────────────────────────────────────────────────

interface SerializedCell {
  o: boolean;  // occupied
  c: string | null; // color
}

interface SerializedBlock {
  defId: string;
  color: string;
  rotation: number;
  flipped: boolean;
} 

interface SerializedBossReservation {
  cells: Array<[number, number]>;
  row: number;
  col: number;
  bossSlot: number;
  bossBlockId: string;
  bossBlockColor: string;
  bossBlockRotation: number;
  bossBlockFlipped: boolean;
}

interface SavedGameState {
  version: number;
  savedAt: number;
  grid: SerializedCell[][];
  hand: Array<SerializedBlock | null>;
  score: number;
  bossSlot: number;
  clearMemory: ClearMemory[];
  turnCount: number;
  bossReservation: SerializedBossReservation | null;
}

const CURRENT_VERSION = 1;

// ─── Sérialisation ────────────────────────────────────────────────────────────

function serializeGrid(grid: Grid): SerializedCell[][] {
  return grid.map(row => row.map(cell => ({ o: cell.occupied, c: cell.color })));
}

function deserializeGrid(data: SerializedCell[][]): Grid {
  return data.map(row => row.map((cell): CellState => ({ occupied: cell.o, color: cell.c })));
}

function serializeBlock(block: BlockInstance): SerializedBlock {
  return {
    defId: block.definition.id,
    color: block.color,
    rotation: block.rotation,
    flipped: block.flipped,
  };
}

function deserializeBlock(data: SerializedBlock): BlockInstance | null {
  const def = BLOCK_CATALOG.find(d => d.id === data.defId);
  if (!def) return null;
  const validRotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const rotation = validRotations.includes(data.rotation as 0 | 90 | 180 | 270)
    ? (data.rotation as 0 | 90 | 180 | 270)
    : 0;
  return { definition: def, color: data.color, rotation, flipped: data.flipped };
}

function serializeBoss(res: BossReservation): SerializedBossReservation {
  return {
    cells: res.cells,
    row: res.row,
    col: res.col,
    bossSlot: res.bossSlot,
    bossBlockId: res.bossBlock.definition.id,
    bossBlockColor: res.bossBlock.color,
    bossBlockRotation: res.bossBlock.rotation,
    bossBlockFlipped: res.bossBlock.flipped,
  };
}

function deserializeBoss(data: SerializedBossReservation): BossReservation | null {
  const def = BLOCK_CATALOG.find(d => d.id === data.bossBlockId);
  if (!def) return null;
  const validRotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  const rotation = validRotations.includes(data.bossBlockRotation as 0 | 90 | 180 | 270)
    ? (data.bossBlockRotation as 0 | 90 | 180 | 270)
    : 0;
  return {
    cells: data.cells,
    row: data.row,
    col: data.col,
    bossSlot: data.bossSlot,
    bossBlock: { definition: def, color: data.bossBlockColor, rotation, flipped: data.bossBlockFlipped },
  };
}

// ─── Lecture / écriture localStorage ────────────────────────────────────────

export function loadGameState(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameState;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameState(state: SavedGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* quota dépassé */ }
}

export function clearGameState(): void {
  localStorage.removeItem(SAVE_KEY);
}

// ─── Hydratation depuis SavedGameState ────────────────────────────────────────

export interface HydratedState {
  grid: Grid;
  hand: Array<BlockInstance | null>;
  score: number;
  bossSlot: number;
  clearMemory: ClearMemory[];
  turnCount: number;
  bossReservation: BossReservation | null;
}

export function hydrateState(saved: SavedGameState): HydratedState {
  return {
    grid: deserializeGrid(saved.grid),
    hand: saved.hand.map(b => b ? deserializeBlock(b) : null),
    score: saved.score,
    bossSlot: saved.bossSlot,
    clearMemory: saved.clearMemory,
    turnCount: saved.turnCount,
    bossReservation: saved.bossReservation ? deserializeBoss(saved.bossReservation) : null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface GameStateSnapshot {
  grid: Grid;
  hand: Array<BlockInstance | null>;
  score: number;
  bossSlot: number;
  clearMemory: ClearMemory[];
  turnCount: number;
  bossReservation: BossReservation | null;
}

/**
 * useGamePersistence — déclenche une sauvegarde debouncée à chaque changement de state.
 * Appeler avec le state courant à chaque render.
 */
export function useGamePersistence(snapshot: GameStateSnapshot) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const flush = useCallback(() => {
    const s = snapshotRef.current;
    const payload: SavedGameState = {
      version: CURRENT_VERSION,
      savedAt: Date.now(),
      grid: serializeGrid(s.grid),
      hand: s.hand.map(b => b ? serializeBlock(b) : null),
      score: s.score,
      bossSlot: s.bossSlot,
      clearMemory: s.clearMemory,
      turnCount: s.turnCount,
      bossReservation: s.bossReservation ? serializeBoss(s.bossReservation) : null,
    };
    saveGameState(payload);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  });
}
