import { useState, useRef, useCallback } from 'react';
import type { Grid, BlockInstance, Suggestion } from '@/types/types';
import type { BossReservation } from '@/lib/predictionEngine';
import { findReservedBlockSlot, computeBestBlockReservation, reservationToCellSet } from '@/lib/predictionEngine';
import { gridToBool } from '@/lib/blockUtils';

export interface AutoPlayDeps {
  grid: Grid;
  hand: Array<BlockInstance | null>;
  bossReservation: BossReservation | null;
  bossSlot: number;
  suggestions: Record<number, Suggestion[]>;
  hasAnalyzed: boolean;
}

export interface AutoPlayCallbacks {
  onApplySuggestion: (suggestion: Suggestion) => void;
  onShuffleSlot: (slot: number) => void;
  onAnalyze: () => void;
  onSetBossReservation: (reservation: BossReservation | null) => void;
  onSetBossSlot: (slot: number) => void;
}

export interface UseAutoPlayReturn {
  isPlaying: boolean;
  status: string;
  start: () => void;
  stop: () => void;
}

export function useAutoPlay(
  getDeps: () => AutoPlayDeps,
  callbacks: AutoPlayCallbacks,
): UseAutoPlayReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisRequestedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  isPlayingRef.current = isPlaying;

  const scheduleNext = useCallback((delay = 300) => {
    timerRef.current = setTimeout(tick, delay);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    analysisRequestedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('');
  }, []);

  function tick() {
    if (!isPlayingRef.current) return;

    const deps = getDeps();
    const { grid, hand, bossReservation, bossSlot, suggestions, hasAnalyzed } = deps;
    const boolGrid = gridToBool(grid);
    const reservedCells = reservationToCellSet(bossReservation);

    // Step 1: No reservation → create one
    if (!bossReservation) {
      const best = computeBestBlockReservation(boolGrid);
      if (best) {
        const reservation: BossReservation = {
          cells: best.cells,
          row: best.row,
          col: best.col,
          bossBlock: { definition: best.blockDef, rotation: 0, flipped: false, color: '#888' },
          bossSlot,
        };
        callbacksRef.current.onSetBossReservation(reservation);
        setStatus(`Réserve pour ${best.blockDef.name}`);
        analysisRequestedRef.current = false;
        scheduleNext(500);
      } else {
        setStatus('Plus de bloc plaçable — fin');
        stop();
      }
      return;
    }

    // Step 2: Check if boss block is in hand
    const foundBossSlot = findReservedBlockSlot(boolGrid, hand, reservedCells);
    if (foundBossSlot >= 0 && foundBossSlot !== bossSlot) {
      callbacksRef.current.onSetBossSlot(foundBossSlot);
      setStatus(`Boss: ${hand[foundBossSlot]?.definition.name}`);
      analysisRequestedRef.current = false;
      scheduleNext(400);
      return;
    }

    // Step 3: Need analysis?
    if (!hasAnalyzed) {
      if (!analysisRequestedRef.current) {
        callbacksRef.current.onAnalyze();
        analysisRequestedRef.current = true;
        setStatus('Analyse en cours…');
      }
      scheduleNext(600);
      return;
    }
    analysisRequestedRef.current = false;

    // Step 4: Try to play a non-boss block
    const nonBossSlots = hand
      .map((b, i) => (b && i !== bossSlot ? i : -1))
      .filter(i => i >= 0);
    for (const slotIdx of nonBossSlots) {
      const slotSuggestions = suggestions[slotIdx];
      if (slotSuggestions?.length > 0) {
        callbacksRef.current.onApplySuggestion(slotSuggestions[0]);
        setStatus(`Joue ${slotSuggestions[0].blockInstance.definition.name}`);
        scheduleNext(400);
        return;
      }
    }

    // Step 5: Non-boss blocks exist but can't be placed → shuffle
    if (nonBossSlots.length > 0) {
      callbacksRef.current.onShuffleSlot(nonBossSlots[0]);
      setStatus(`Remplace slot ${nonBossSlots[0] + 1}…`);
      scheduleNext(500);
      return;
    }

    // Step 6: Try to play the boss block
    const bossSuggestions = suggestions[bossSlot];
    if (bossSuggestions?.length > 0) {
      callbacksRef.current.onApplySuggestion(bossSuggestions[0]);
      setStatus('🔥 BOSS ! Clear massif !');
      scheduleNext(1000);
      return;
    }

    // Step 7: Nothing works → re-analyze
    callbacksRef.current.onAnalyze();
    analysisRequestedRef.current = true;
    setStatus('Re-analyse…');
    scheduleNext(600);
  }

  const start = useCallback(() => {
    setIsPlaying(true);
    isPlayingRef.current = true;
    setStatus('Démarrage…');
    scheduleNext(500);
  }, [scheduleNext]);

  return { isPlaying, status, start, stop };
}
