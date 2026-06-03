// Page principale de l'assistant Block Puzzle — v15 (Boss valide + Cache IA + Journal + Notes IA + Persistance)
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Grid, BlockInstance, Suggestion, CellState } from '@/types/types';
import {
  suggestOneBlock,
  suggestNextBlocks,
  findBossSlot,
  computeBossReservation,
  reservationToCellSet,
} from '@/lib/predictionEngine';
import type { ClearMemory, BossReservation } from '@/lib/predictionEngine';
import { getAllCacheStats, clearAllCaches } from '@/lib/aiCache';
import type { CacheStats } from '@/lib/aiCache';
import { parseNotesToHints } from '@/lib/aiNotes';
import { useAiNotes } from '@/hooks/useAiNotes';
import { useGamePersistence, loadGameState, hydrateState, clearGameState } from '@/hooks/useGamePersistence';
import { getInstanceShape, gridToBool, canPlace, applyPlacementWithClears } from '@/lib/blockUtils';
import { gridFingerprint } from '@/lib/aiCache';
import { DragProvider } from '@/contexts/DragContext';
import { GameGrid } from '@/components/game/GameGrid';
import { HandSelector } from '@/components/game/HandSelector';
import { SuggestionsPanel } from '@/components/game/SuggestionsPanel';
import { GridToolbar } from '@/components/game/GridToolbar';
import { ThemeConfigPanel } from '@/components/game/ThemeConfigPanel';
import { ActivityPanel } from '@/components/game/ActivityPanel';
import { AiNotesPanel } from '@/components/game/AiNotesPanel';
import { useActivityLog } from '@/hooks/useActivityLog';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  LayoutGrid, Info, Puzzle, Sparkles, Hand, Trophy, Zap,
  ChevronDown, ChevronUp, ShieldAlert, BookOpen, Save,
  Crown, Brain, RefreshCw, Star, PartyPopper, Shuffle,
  Lightbulb, Gamepad2, Swords, ScrollText, GripVertical,
  Search, RotateCcw, Trash2, AlertTriangle, Download, Upload,
} from 'lucide-react';

const GRID_SIZE = 8;
const MAX_MEMORY = 5;

function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, (): CellState => ({
      occupied: false,
      color: null,
    }))
  );
}

const BlockPuzzleAssistant: React.FC = () => {
  const { theme } = useTheme();
  const { entries: activityEntries, startActivity, finishActivity, logInstant, clearLog } = useActivityLog();

  // ── Notes d'apprentissage IA (persistées en localStorage) ────────────────
  const { notes, addNote, removeNote, toggleNote, clearAllNotes, activeCount: activeNotesCount } = useAiNotes();
  const [showNotes, setShowNotes] = useState(false);

  // ── Restauration de la partie précédente ─────────────────────────────────
  const savedState = loadGameState();
  const hydrated = savedState ? hydrateState(savedState) : null;

  const [grid, setGrid] = useState<Grid>(() => hydrated?.grid ?? createEmptyGrid());
  const [paintMode, setPaintMode] = useState<'paint' | 'erase'>('paint');
  const [selectedColor, setSelectedColor] = useState(theme.blockColors[0]);
  const [hand, setHand] = useState<Array<BlockInstance | null>>(() => hydrated?.hand ?? [null, null, null]);
  const [suggestions, setSuggestions] = useState<Record<number, Suggestion[]>>({});
  const [hoveredSuggestion, setHoveredSuggestion] = useState<Suggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedSlot, setHighlightedSlot] = useState<number | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [kbSlot, setKbSlot] = useState<number | null>(null);
  const [showActivityLog, setShowActivityLog] = useState(true);
  const [learningMode, setLearningMode] = useState(false);
  const learningModeRef = useRef(false);
  const [demoCount, setDemoCount] = useState(0);

  // ── Score & animation ────────────────────────────────────────────────────
  const [score, setScore] = useState(() => hydrated?.score ?? 0);
  const [scoreBump, setScoreBump] = useState(false);
  const [explodingCells, setExplodingCells] = useState<Set<string>>(new Set());
  const [scorePopup, setScorePopup] = useState<{ value: number; key: number } | null>(null);
  const popupKeyRef = useRef(0);
  const explodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stratégie Boss ───────────────────────────────────────────────────────
  const [bossSlot, setBossSlot] = useState<number>(() => hydrated?.bossSlot ?? 1);
  const [bossReservation, setBossReservation] = useState<BossReservation | null>(() => hydrated?.bossReservation ?? null);
  const [clearMemory, setClearMemory] = useState<ClearMemory[]>(() => hydrated?.clearMemory ?? []);
  const turnCountRef = useRef(hydrated?.turnCount ?? 0);
  const prevBossReservationRef = useRef<BossReservation | null>(hydrated?.bossReservation ?? null);

  const workerRef = useRef<Worker | null>(null);
  const analyzeReqIdRef = useRef(0);
  const isAnalyzingRef = useRef(false);

  // Sync learningMode ref
  useEffect(() => { learningModeRef.current = learningMode; }, [learningMode]);

  // ── MCTS Worker (thread séparé pour ne pas bloquer l'UI) ────────────────
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../lib/mcts.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Worker Apprentissage par Démonstration ───────────────────────────────
  const demonWorkerRef = useRef<Worker | null>(null);
  const pendingExportRef = useRef(false);
  useEffect(() => {
    const w = new Worker(
      new URL('../lib/rl.worker.ts', import.meta.url),
      { type: 'module' }
    );
    w.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'recorded') {
        setDemoCount(msg.count);
      } else if (msg.type === 'loaded' || msg.type === 'cleared') {
        setDemoCount(msg.count ?? 0);
      } else if (msg.type === 'saved') {
        setDemoCount(msg.count ?? 0);
        if (msg.data) {
          try { localStorage.setItem('block_demos', msg.data); } catch { /* localStorage plein */ }
          if (pendingExportRef.current) {
            pendingExportRef.current = false;
            const blob = new Blob([msg.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `block-demos-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`${msg.count} coups exportés`);
          } else {
            toast.success(`Démos sauvegardées (${msg.count} coups)`);
          }
        }
      } else if (msg.type === 'count') {
        setDemoCount(msg.count);
      }
    };
    // Charger les démos existantes
    try {
      const saved = localStorage.getItem('block_demos');
      if (saved) {
        w.postMessage({ type: 'load', data: saved }, undefined as any);
      } else {
        setDemoCount(0);
      }
    } catch { setDemoCount(0); }
    demonWorkerRef.current = w;
    return () => { w.terminate(); demonWorkerRef.current = null; };
  }, []);

  // ── Cache stats ──────────────────────────────────────────────────────────
  const [cacheStats, setCacheStats] = useState<CacheStats>({ hits: 0, misses: 0, entries: 0, hitRate: 0 });

  const refreshCacheStats = useCallback(() => {
    setCacheStats(getAllCacheStats().combined);
  }, []);

  // Toast de restauration
  useEffect(() => {
    if (hydrated) {
      logInstant('Partie restaurée', 'done', `Score : ${hydrated.score.toLocaleString()}`);
      toast.success('🔄 Partie restaurée', {
        description: `Score : ${hydrated.score.toLocaleString()} — ${hydrated.grid.flat().filter(c => c.occupied).length} cases occupées.`,
        duration: 3500,
      });
    }
  // Intentionnellement vide — s'exécute une seule fois au montage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistance automatique de la partie ────────────────────────────────
  useGamePersistence({ grid, hand, score, bossSlot, clearMemory, turnCount: turnCountRef.current, bossReservation });

  // ── Recalcul Boss (avec vérification de placement valide) ────────────────
  const recomputeBoss = useCallback(
    (currentGrid: Grid, currentHand: Array<BlockInstance | null>, currentMemory: ClearMemory[]) => {
      const actId = startActivity('Calcul zone Boss', 'Recherche du meilleur bloc plaçable…');
      const t0 = Date.now();

      // findBossSlot reçoit la grille → vérifie que le boss peut être placé
      const newBossSlot = findBossSlot(currentHand, currentGrid);
      setBossSlot(newBossSlot);
      const bossBlock = currentHand[newBossSlot];

      if (!bossBlock) {
        setBossReservation(null);
        prevBossReservationRef.current = null;
        finishActivity(actId, 'done', 'Main vide — pas de boss');
        refreshCacheStats();
        return;
      }

      const reservation = computeBossReservation(currentGrid, bossBlock, newBossSlot, currentMemory, prevBossReservationRef.current);
      prevBossReservationRef.current = reservation;
      setBossReservation(reservation);

      const ms = Date.now() - t0;
      if (ms < 2) {
        finishActivity(actId, 'cached', `Slot ${newBossSlot + 1} → ${bossBlock.definition.name}`);
      } else {
        finishActivity(actId, 'done', `Slot ${newBossSlot + 1} → ${bossBlock.definition.name} (${ms} ms)`);
      }
      refreshCacheStats();
    },
    [startActivity, finishActivity, refreshCacheStats]
  );

  // Recalculer le boss quand la main change
  useEffect(() => {
    recomputeBoss(grid, hand, clearMemory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand]);

  const occupiedCount = grid.flat().filter(c => c.occupied).length;

  // ── Peinture manuelle ────────────────────────────────────────────────────
  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (kbSlot !== null) return;
      setGrid(prev => {
        const next = prev.map(r => r.map(c => ({ ...c })));
        if (paintMode === 'erase') {
          next[row][col] = { occupied: false, color: null };
        } else {
          const cell = next[row][col];
          if (cell.occupied && cell.color === selectedColor) {
            next[row][col] = { occupied: false, color: null };
          } else {
            next[row][col] = { occupied: true, color: selectedColor };
          }
        }
        return next;
      });
      if (hasAnalyzed) { setSuggestions({}); setHasAnalyzed(false); }
    },
    [paintMode, selectedColor, hasAnalyzed, kbSlot]
  );

  const handleSlotChange = useCallback(
    (slot: 0 | 1 | 2, block: BlockInstance | null) => {
      setHand(prev => {
        const next = [...prev] as Array<BlockInstance | null>;
        next[slot] = block;
        return next;
      });
      setSuggestions({});
      setHasAnalyzed(false);
    },
    []
  );

  // ── Shuffle d'un bloc non-boss ────────────────────────────────────────────
  const handleShuffleSlot = useCallback(
    (slot: 0 | 1 | 2) => {
      if (slot === bossSlot) return;
      const actId = startActivity(`Shuffle bloc ${slot + 1}`, `Recherche d'un bloc compatible…`);
      const excludeIds = hand
        .filter((b): b is BlockInstance => b !== null)
        .map(b => b.definition.id);
      const t0 = Date.now();
      const newBlock = suggestOneBlock(grid, theme.blockColors, excludeIds, bossReservation, clearMemory);
      const ms = Date.now() - t0;
      if (!newBlock) {
        finishActivity(actId, 'error', 'Aucun bloc compatible');
        toast.warning('Aucun bloc compatible trouvé', {
          description: 'La grille ne permet pas d\'autres blocs en ce moment.',
        });
        refreshCacheStats();
        return;
      }
      const coloredBlock: BlockInstance = {
        ...newBlock,
        color: theme.blockColors[slot] || newBlock.color,
      };
      setHand(prev => {
        const next = [...prev] as Array<BlockInstance | null>;
        next[slot] = coloredBlock;
        return next;
      });
      setSuggestions({});
      setHasAnalyzed(false);
      finishActivity(actId, ms < 2 ? 'cached' : 'done', `→ ${coloredBlock.definition.name}`);
      refreshCacheStats();
      toast.success(`🔀 Bloc ${slot + 1} remplacé par ${coloredBlock.definition.name}`, {
        description: 'Nouveau bloc sélectionné par l\'IA.',
        duration: 2000,
      });
    },
    [bossSlot, hand, grid, theme.blockColors, bossReservation, clearMemory,
      startActivity, finishActivity, refreshCacheStats]
  );

  // ── Analyse (via Web Worker MCTS) ────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    if (learningModeRef.current) {
      toast.info('Mode apprentissage actif', {
        description: 'Désactivez le mode apprentissage pour utiliser les suggestions.',
      });
      return;
    }
    if (isAnalyzingRef.current) {
      toast.info('Analyse déjà en cours…');
      return;
    }
    const hasBlocks = hand.some(Boolean);
    if (!hasBlocks) {
      toast.info('Ajoutez au moins un bloc dans votre main', {
        description: 'Utilisez les 3 slots ci-dessous pour sélectionner vos blocs.',
      });
      return;
    }
    const worker = workerRef.current;
    if (!worker) {
      toast.error('Worker MCTS non disponible');
      return;
    }

    analyzeReqIdRef.current += 1;
    const reqId = analyzeReqIdRef.current;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    const actId = startActivity('Analyse IA', `${hand.filter(Boolean).length} bloc(s) à évaluer…`);
    const t0 = Date.now();

    worker.onmessage = (e: MessageEvent) => {
      if (reqId !== analyzeReqIdRef.current) return;
      worker.onmessage = null;
      worker.onerror = null;
      const msg = e.data;
      if (msg.type === 'error') {
        finishActivity(actId, 'error', 'Erreur Worker');
        toast.error("Erreur lors de l'analyse");
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
        return;
      }
      const result = msg.suggestions as Record<number, Suggestion[]>;
      const totalSims = msg.totalSims as number;

      // Query demos pour booster les suggestions similaires
      const doSetSuggestions = (suggestions: Record<number, Suggestion[]>) => {
        setSuggestions(suggestions);
        setHasAnalyzed(true);
        const total = Object.values(suggestions).flat().length;
        const bossSlotLocal = bossReservation?.bossSlot ?? 1;
        const nonBossTotal = Object.entries(suggestions)
          .filter(([idx]) => parseInt(idx) !== bossSlotLocal)
          .reduce((acc, [, arr]) => acc + arr.length, 0);
        const isLastResort = nonBossTotal === 0 && (suggestions[bossSlotLocal]?.length ?? 0) > 0;
        const ms = Date.now() - t0;
        finishActivity(actId, 'done',
          `${total} sugg. · ${totalSims} sims MCTS ${isLastResort ? '⚠ Boss dernier recours' : ''} ${activeNotesCount > 0 ? `📝×${activeNotesCount}` : ''} en ${ms} ms`.trim());
        refreshCacheStats();
        if (total === 0) {
          toast.warning('Aucun placement possible', { description: 'La grille est trop remplie.' });
        } else if (isLastResort) {
          toast.warning('⚠ Dernier recours — Boss obligatoire', {
            description: 'Les blocs gauche/droite ne peuvent plus être posés.',
            duration: 3500,
          });
        } else {
          toast.success(`${total} suggestion${total > 1 ? 's' : ''} · ${totalSims} simulations MCTS`, {
            description: '🔮 L\'IA a exploré des centaines de parties futures.',
          });
        }
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
      };

      if (demoCount > 0) {
        const origHandler = demonWorkerRef.current?.onmessage;
        const handler = (ev: MessageEvent) => {
          const dmsg = ev.data;
          if (dmsg.type === 'similar') {
            demonWorkerRef.current!.onmessage = origHandler ?? null;
            if (dmsg.results?.length > 0) {
              const boosted: Record<number, Suggestion[]> = {};
              for (const [slotKey, suggestions] of Object.entries(result)) {
                boosted[slotKey] = suggestions.map(s => {
                  const match = (dmsg.results as any[]).find((r: any) =>
                    r.move.blockId === s.blockInstance.definition.id &&
                    r.move.rotation === s.blockInstance.rotation &&
                    r.move.flipped === s.blockInstance.flipped &&
                    r.move.row === s.position.row &&
                    r.move.col === s.position.col
                  );
                  if (match) {
                    const boost = 1 + match.similarity * 0.5;
                    return { ...s, score: Math.round(s.score * boost), comboLabel: `👤 ${Math.round(match.similarity * 100)}% · ` + s.comboLabel };
                  }
                  return s;
                }).sort((a, b) => b.score - a.score);
              }
              doSetSuggestions(boosted);
            } else {
              doSetSuggestions(result);
            }
          } else if (dmsg.type === 'recorded') {
            setDemoCount(dmsg.count);
          }
        };
        demonWorkerRef.current!.onmessage = handler;
        demonWorkerRef.current?.postMessage({
          type: 'findSimilar',
          grid,
          hand,
          topN: 10,
        }, undefined as any);
      } else {
        doSetSuggestions(result);
      }
    };

    worker.onerror = () => {
      if (reqId !== analyzeReqIdRef.current) return;
      worker.onmessage = null;
      worker.onerror = null;
      finishActivity(actId, 'error', 'Erreur Worker');
      toast.error("Erreur lors de l'analyse");
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    };

    const hints = parseNotesToHints(notes);
    const reservedCells = bossReservation?.cells.map(([r, c]) => `${r},${c}`) ?? undefined;
    worker.postMessage({
      type: 'analyze',
      grid,
      hand,
      hints,
      config: { iterations: 400, timeBudget: 3000 },
      reservedCells,
      bossSlot: bossReservation?.bossSlot,
    });
  }, [grid, hand, bossReservation, notes, activeNotesCount, startActivity, finishActivity, refreshCacheStats]);

  // ── Effacer la grille ────────────────────────────────────────────────────
  const handleClearGrid = useCallback(() => {
    setGrid(createEmptyGrid());
    setSuggestions({});
    setHasAnalyzed(false);
    setHoveredSuggestion(null);
    setKbSlot(null);
    setScore(0);
    setExplodingCells(new Set());
    setScorePopup(null);
    setBossReservation(null);
    prevBossReservationRef.current = null;
    setClearMemory([]);
    turnCountRef.current = 0;
    clearAllCaches();
    clearGameState();
    clearLog();
    refreshCacheStats();
    logInstant('Grille réinitialisée', 'done', 'Cache IA + sauvegarde effacés');
    toast.info('Grille effacée');
  }, [clearLog, logInstant, refreshCacheStats]);

  const handleHoverSuggestion = useCallback((s: Suggestion | null) => {
    setHoveredSuggestion(s);
    if (!s) { setHighlightedSlot(null); return; }
    const entry = Object.entries(suggestions).find(([, arr]) => arr.some(sg => sg.id === s.id));
    setHighlightedSlot(entry ? parseInt(entry[0]) : null);
  }, [suggestions]);

  // ── S'assurer que le boss (slot 1) est le plus grand ────────────────────
  // ── Recharger un slot individuel en mode apprentissage ──────────────────
  const refillLearningSlot = useCallback(
    (slotIndex: number, currentHand: Array<BlockInstance | null>, currentGrid: Grid): BlockInstance | null => {
      const currentBlocks = currentHand.filter((b): b is BlockInstance => b !== null);
      const excludeIds = currentBlocks.map(b => b.definition.id);
      const excludeSeries = currentBlocks.map(b => b.definition.series);
      const color = theme.blockColors[slotIndex] || theme.blockColors[0];
      const newBlock = suggestOneBlock(currentGrid, theme.blockColors, excludeIds, bossReservation, clearMemory, excludeSeries);
      if (!newBlock) return null;
      return { ...newBlock, color };
    },
    [theme.blockColors, bossReservation, clearMemory]
  );

  // ── Recharger la main si tous les slots sont vides ──────────────────────
  const refillHandIfEmpty = useCallback(
    (updatedHand: Array<BlockInstance | null>, currentGrid: Grid, currentMemory: ClearMemory[]): Array<BlockInstance | null> => {
      const allEmpty = updatedHand.every(b => b === null);
      if (!allEmpty) return updatedHand;
      const actId = startActivity('Nouvelle main IA', 'Sélection de 3 blocs stratégiques…');
      const t0 = Date.now();
      const colors = theme.blockColors;
      const suggested = suggestNextBlocks(currentGrid, colors, 3);
      const ms = Date.now() - t0;
      const fromCache = ms < 2;
      finishActivity(actId, fromCache ? 'cached' : 'done',
        `Boss → ${suggested[1]?.definition.name ?? '?'} ${fromCache ? '(cache)' : `(${ms} ms)`}`);
      refreshCacheStats();
      toast.info("✨ Nouvelle main générée par l'IA", {
        description: fromCache
          ? '⚡ Résultat instantané (cache IA)'
          : 'Bloc central = 👑 Boss (le plus grand).',
        duration: 3000,
      });
      setTimeout(() => recomputeBoss(currentGrid, suggested as Array<BlockInstance | null>, currentMemory), 0);
      return suggested as Array<BlockInstance | null>;
    },
    [theme.blockColors, recomputeBoss, startActivity, finishActivity, refreshCacheStats]
  );

  // ── Logique centrale : placer un bloc + effacer lignes/cols + score ───────
  const triggerPlacementResult = useCallback(
    (
      newGrid: Grid,
      result: { clearedLines: number[]; clearedCols: number[]; scoreGained: number; cellsFreed: number; clearType: string; comboLabel: string },
      newHand: Array<BlockInstance | null> | null,
      newMemory: ClearMemory[]
    ) => {
      const { clearedLines, clearedCols, scoreGained, cellsFreed, clearType, comboLabel } = result;
      const combos = clearedLines.length + clearedCols.length;
      const isAmazing = clearType === 'amazing';

      let toExplode = new Set<string>();
      if (isAmazing) {
        // Big combo = toute la grille explose
        for (let r = 0; r < GRID_SIZE; r++)
          for (let c = 0; c < GRID_SIZE; c++)
            toExplode.add(`${r},${c}`);
      } else {
        for (const r of clearedLines)
          for (let c = 0; c < GRID_SIZE; c++) toExplode.add(`${r},${c}`);
        for (const col of clearedCols)
          for (let r = 0; r < GRID_SIZE; r++) toExplode.add(`${r},${col}`);
      }

      setGrid(newGrid);

      if (toExplode.size > 0) {
        setExplodingCells(toExplode);
        if (explodeTimerRef.current) clearTimeout(explodeTimerRef.current);
        explodeTimerRef.current = setTimeout(() => {
          setExplodingCells(new Set());
          if (newHand) setHand(newHand);
          recomputeBoss(newGrid, newHand ?? [], newMemory);
          setSuggestions({});
          setHasAnalyzed(false);
        }, isAmazing ? 1200 : 500);
      } else {
        if (newHand) setHand(newHand);
        recomputeBoss(newGrid, newHand ?? [], newMemory);
        setSuggestions({});
        setHasAnalyzed(false);
      }

      if (scoreGained > 0) {
        setScore(prev => prev + scoreGained);
        setScoreBump(true);
        setTimeout(() => setScoreBump(false), 400);
        popupKeyRef.current += 1;
        setScorePopup({ value: scoreGained, key: popupKeyRef.current });
        setTimeout(() => setScorePopup(null), 1100);
        const comboMsg = combos > 1 ? ` (×${combos} combo !)` : '';
        if (combos > 0) {
          logInstant(
            isAmazing
              ? `🔥 ${comboLabel}`
              : `💥 ${combos} ligne${combos > 1 ? 's' : ''} effacée${combos > 1 ? 's' : ''}${comboMsg}`,
            'done',
            `+${scoreGained} pts · ${cellsFreed} cases libérées`
          );
        }
        toast.success(isAmazing ? `🔥 ${comboLabel}` : `🎉 ${cellsFreed} cases libérées${comboMsg}`, {
          description: `+${scoreGained.toLocaleString()} points`,
          duration: isAmazing ? 4000 : 2000,
        });
      }
    },
    [recomputeBoss, logInstant]
  );

  // Construit la nouvelle mémoire après un placement
  const buildNewMemory = useCallback(
    (clearedLines: number[], clearedCols: number[]): ClearMemory[] => {
      if (clearedLines.length === 0 && clearedCols.length === 0) return clearMemory;
      turnCountRef.current += 1;
      const newEntry: ClearMemory = {
        lines: clearedLines,
        cols: clearedCols,
        turn: turnCountRef.current,
      };
      const updated = [...clearMemory, newEntry];
      const trimmed = updated.slice(-MAX_MEMORY);
      setClearMemory(trimmed);
      return trimmed;
    },
    [clearMemory]
  );

  // ── Appliquer une suggestion ─────────────────────────────────────────────
  const handleApplySuggestion = useCallback((suggestion: Suggestion) => {
    const shape = getInstanceShape(suggestion.blockInstance);
    const result = applyPlacementWithClears(
      grid, shape, suggestion.position.row, suggestion.position.col,
      suggestion.blockInstance.color
    );
    logInstant(
      `Bloc placé : ${suggestion.blockInstance.definition.name}`,
      'done',
      `L${suggestion.position.row + 1} C${suggestion.position.col + 1}`
    );
    if (learningModeRef.current) {
      const fp = gridFingerprint(gridToBool(grid));
      const handIds = hand.map(b => b?.definition.id ?? 'null').join(',');
      demonWorkerRef.current?.postMessage({
        type: 'record',
        move: {
          gridFingerprint: fp,
          handIds,
          blockId: suggestion.blockInstance.definition.id,
          rotation: suggestion.blockInstance.rotation,
          flipped: suggestion.blockInstance.flipped,
          row: suggestion.position.row,
          col: suggestion.position.col,
          linesCleared: result.clearedLines.length,
          colsCleared: result.clearedCols.length,
          scoreGained: result.scoreGained,
          timestamp: Date.now(),
        },
      }, undefined as any);
    }
    const slotEntry = Object.entries(suggestions).find(([, arr]) =>
      arr.some(s => s.id === suggestion.id)
    );
    const slotIndex = slotEntry ? parseInt(slotEntry[0]) : -1;
    const updatedHand = [...hand] as Array<BlockInstance | null>;
    if (slotIndex >= 0) updatedHand[slotIndex] = null;
    const newMemory = buildNewMemory(result.clearedLines, result.clearedCols);
    let finalHand: Array<BlockInstance | null>;
    if (learningModeRef.current) {
      const newHand = [...updatedHand];
      const newBlock = refillLearningSlot(slotIndex, updatedHand, result.newGrid);
      if (newBlock) newHand[slotIndex] = newBlock;
      finalHand = newHand.every(b => b === null)
        ? refillHandIfEmpty(newHand, result.newGrid, newMemory)
        : newHand;
    } else {
      finalHand = refillHandIfEmpty(updatedHand, result.newGrid, newMemory);
    }
    triggerPlacementResult(result.newGrid, result, finalHand, newMemory);
    setHoveredSuggestion(null);
  }, [grid, hand, suggestions, refillHandIfEmpty, triggerPlacementResult, buildNewMemory, logInstant, refillLearningSlot]);

  // ── Placer un bloc (drag, clavier) ───────────────────────────────────────
  const placeBlock = useCallback(
    (block: BlockInstance, slotIndex: number, anchorRow: number, anchorCol: number): boolean => {
      const shape = getInstanceShape(block);
      const boolGrid = gridToBool(grid);
      if (!canPlace(boolGrid, shape, anchorRow, anchorCol)) return false;
      const result = applyPlacementWithClears(grid, shape, anchorRow, anchorCol, block.color);
      logInstant(
        `Bloc placé : ${block.definition.name}`,
        'done',
        `L${anchorRow + 1} C${anchorCol + 1}`
      );
      if (learningModeRef.current) {
        const fp = gridFingerprint(boolGrid);
        const handIds = hand.map(b => b?.definition.id ?? 'null').join(',');
        demonWorkerRef.current?.postMessage({
          type: 'record',
          move: {
            gridFingerprint: fp,
            handIds,
            blockId: block.definition.id,
            rotation: block.rotation,
            flipped: block.flipped,
            row: anchorRow,
            col: anchorCol,
            linesCleared: result.clearedLines.length,
            colsCleared: result.clearedCols.length,
            scoreGained: result.scoreGained,
            timestamp: Date.now(),
          },
        }, undefined as any);
      }
      const updatedHand = [...hand] as Array<BlockInstance | null>;
      if (slotIndex >= 0) updatedHand[slotIndex] = null;
      const newMemory = buildNewMemory(result.clearedLines, result.clearedCols);
      let finalHand: Array<BlockInstance | null>;
      if (learningModeRef.current) {
        const newHand = [...updatedHand];
        const newBlock = refillLearningSlot(slotIndex, updatedHand, result.newGrid);
        if (newBlock) newHand[slotIndex] = newBlock;
        finalHand = newHand.every(b => b === null)
          ? refillHandIfEmpty(newHand, result.newGrid, newMemory)
          : newHand;
      } else {
        finalHand = refillHandIfEmpty(updatedHand, result.newGrid, newMemory);
      }
      triggerPlacementResult(result.newGrid, result, finalHand, newMemory);
      return true;
    },
    [grid, hand, refillHandIfEmpty, triggerPlacementResult, buildNewMemory, logInstant, refillLearningSlot]
  );

  // ── Drop depuis la Main ──────────────────────────────────────────────────
  const handleBlockDropped = useCallback(
    (block: BlockInstance, slotIndex: number, row: number, col: number) => {
      const ok = placeBlock(block, slotIndex, row, col);
      if (!ok) {
        toast.error('Placement invalide', { description: 'Ce bloc ne peut pas être placé ici.' });
      }
    },
    [placeBlock]
  );

  // ── Mode clavier ─────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1' && hand[0]) { setKbSlot(0); e.preventDefault(); }
      else if (e.key === '2' && hand[1]) { setKbSlot(1); e.preventDefault(); }
      else if (e.key === '3' && hand[2]) { setKbSlot(2); e.preventDefault(); }
      else if (e.key === 'Escape') { setKbSlot(null); }
    },
    [hand]
  );

  const handleKeyboardPlace = useCallback(
    (row: number, col: number) => {
      if (kbSlot === null) return;
      const block = hand[kbSlot];
      if (!block) return;
      const ok = placeBlock(block, kbSlot, row, col);
      if (ok) {
        setKbSlot(null);
      } else {
        toast.error('Placement invalide', { description: 'Choisissez une position libre.' });
      }
    },
    [kbSlot, hand, placeBlock]
  );

  // Cellules réservées pour l'overlay boss
  const reservedZoneCells = reservationToCellSet(bossReservation);
  const bossBlock = hand[bossSlot];
  const bossColor = bossBlock?.color ?? theme.accentColor;

  // Boss = dernier recours seulement si aucun bloc non-boss n'a de suggestion
  const nonBossHasSuggestions = hand.some((block, idx) =>
    block !== null && idx !== bossSlot && (suggestions[idx]?.length ?? 0) > 0
  );
  const bossIsLastResort = hasAnalyzed && !nonBossHasSuggestions && (suggestions[bossSlot]?.length ?? 0) > 0;

  const bentoCard = 'bg-card rounded-md border border-border shadow-sm';

  return (
    <div
      className="flex flex-col min-h-screen bg-background"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-3 md:px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${theme.accentColor}30, ${theme.accentColor}15)`,
                border: `1px solid ${theme.accentColor}50`,
              }}
            >
              <Puzzle className="h-3.5 w-3.5" style={{ color: theme.accentColor }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">
                Block Puzzle <span className="hidden sm:inline">— Assistant IA</span>
              </h1>
              <p className="text-[10px] text-muted-foreground hidden md:block">
                Prédiction intelligente des meilleurs coups
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {clearMemory.length > 0 && (
              <Badge variant="outline" className="text-[10px] hidden lg:flex gap-1 font-mono h-5"
                style={{ borderColor: `${theme.accentColor}40`, color: theme.accentColor }}>
                <Brain className="h-3 w-3" />
                {clearMemory.length} coup{clearMemory.length > 1 ? 's' : ''}
              </Badge>
            )}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${scoreBump ? 'animate-score-bump' : ''}`}
              style={{ borderColor: `${theme.accentColor}50`, background: `${theme.accentColor}10` }}
            >
              <Trophy className="h-3 w-3" style={{ color: theme.accentColor }} />
              <span className="text-sm font-bold font-mono tabular-nums leading-tight" style={{ color: theme.accentColor }}>
                {score.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground hidden md:flex items-center gap-1" title="Partie sauvegardée automatiquement">
              <Save className="h-3 w-3" />
              <span className="hidden lg:inline">Auto</span>
            </span>
            <button
              className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
              title="Exporter l'état complet"
              onClick={async () => {
                try {
                  const out: Record<string, any> = { version: 1, exportedAt: Date.now() };
                  for (const key of ['blockpuzzle_game_state', 'blockpuzzle_ai_notes', 'blockpuzzle-theme', 'block_demos']) {
                    const val = localStorage.getItem(key);
                    if (val) out[key] = JSON.parse(val);
                  }
                  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `blockpuzzle-save-${Date.now()}.json`; a.click();
                  URL.revokeObjectURL(url);
                  toast.success('État exporté');
                } catch { toast.error('Erreur export'); }
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
              title="Importer un état complet"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = '.json';
                input.onchange = async () => {
                  const file = input.files?.[0]; if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (!data.version) { toast.error('Fichier invalide'); return; }
                    const keys = ['blockpuzzle_game_state', 'blockpuzzle_ai_notes', 'blockpuzzle-theme', 'block_demos'];
                    let restored = false;
                    for (const key of keys) {
                      if (data[key] !== undefined) {
                        localStorage.setItem(key, JSON.stringify(data[key]));
                        restored = true;
                      }
                    }
                    if (restored) {
                      toast.success('État importé — rechargez la page', { duration: 4000 });
                      setTimeout(() => window.location.reload(), 1500);
                    } else {
                      toast.error('Aucune donnée trouvée');
                    }
                  } catch { toast.error('Fichier invalide'); }
                };
                input.click();
              }}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <ThemeConfigPanel />
          </div>
        </div>
      </header>

      {/* ── Bento Grid Layout ── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-3 md:px-4 py-3 md:py-4 min-w-0">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 auto-rows-min">

          {/* ═══ COLONNE GAUCHE ═══ */}
          <div className="flex flex-col gap-3 min-w-0 xl:col-start-1">

            {/* ── Barre d'outils ── */}
            <div className={`${bentoCard} p-2.5 md:p-3`}>
              <GridToolbar
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                mode={paintMode}
                onModeChange={setPaintMode}
                onClearGrid={handleClearGrid}
                occupiedCount={occupiedCount}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
                learningMode={learningMode}
                learningCount={demoCount}
              />
            </div>

            {/* ── Grille 8×8 ── */}
            <div className={`${bentoCard} p-3 md:p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Gamepad2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Plateau</span>
                {explodingCells.size > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: theme.accentColor }}>
                    <Zap className="h-3 w-3" />
                    Explosion !
                  </span>
                )}
                {bossReservation && (
                  <span className="text-[10px] hidden sm:inline-flex items-center gap-1 ml-1" style={{ color: bossColor }}>
                    <Crown className="h-3 w-3" />
                    Boss
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] ml-auto font-mono h-5">
                  {occupiedCount}/64
                </Badge>
              </div>
              <div className="overflow-x-auto w-full flex justify-center">
                <GameGrid
                  grid={grid}
                  onCellClick={handleCellClick}
                  selectedColor={selectedColor}
                  hoveredSuggestion={hoveredSuggestion}
                  isEditing={kbSlot === null}
                  onBlockDropped={handleBlockDropped}
                  keyboardBlock={kbSlot !== null ? hand[kbSlot] : null}
                  keyboardSlot={kbSlot}
                  onKeyboardPlace={handleKeyboardPlace}
                  onKeyboardCancel={() => setKbSlot(null)}
                  explodingCells={explodingCells}
                  scorePopup={scorePopup}
                  reservedZoneCells={reservedZoneCells}
                  bossColor={bossColor}
                />
              </div>
            </div>

            {/* ── Main du joueur ── */}
            <div className={`${bentoCard} p-3 md:p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Hand className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Ma main</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  — glissez vers la grille
                </span>
                <Badge variant="secondary" className="text-[10px] ml-auto h-5">
                  {hand.filter(Boolean).length}/3
                </Badge>
              </div>
              <HandSelector
                hand={hand}
                onSlotChange={handleSlotChange}
                highlightedSlot={highlightedSlot}
                keyboardSelectedSlot={kbSlot}
                onKeyboardSelectSlot={setKbSlot}
                bossSlot={bossSlot}
                onShuffleSlot={handleShuffleSlot}
              />
            </div>

            {/* ── Journal IA + Aide rapide ── */}
            <div className={`${bentoCard} overflow-hidden`}>
              <button
                className="w-full flex items-center gap-2 px-3 md:px-4 py-2.5 hover:bg-muted/30 transition-colors"
                onClick={() => setShowActivityLog(v => !v)}
              >
                <Brain className="h-3.5 w-3.5 flex-shrink-0" style={{ color: theme.accentColor }} />
                <span className="text-xs font-semibold text-foreground flex-1 text-left">
                  Journal IA
                </span>
                {activityEntries.some(e => e.status === 'running') && (
                  <span className="text-[10px] text-blue-500 font-medium animate-pulse">calcul…</span>
                )}
                {cacheStats.entries > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground hidden md:inline">
                    <Zap className="h-2.5 w-2.5 inline mr-0.5" />
                    {Math.round(cacheStats.hitRate * 100)}%
                  </span>
                )}
                {showActivityLog
                  ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                }
              </button>
              {showActivityLog && (
                <div className="border-t border-border/50">
                  <div className="px-3 md:px-4 pb-2 pt-2">
                    <ActivityPanel
                      entries={activityEntries}
                      cacheStats={cacheStats}
                      className=""
                    />
                  </div>
                  <div className="flex items-start gap-2 px-3 md:px-4 pb-3 pt-1 text-[10px] text-muted-foreground border-t border-border/30">
                    <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/60" />
                    <p className="text-pretty leading-snug">
                      <strong className="text-foreground">Aide :</strong>{' '}
                      ① <strong className="text-foreground">Glissez</strong> un bloc vers la grille.{' '}
                      ② <Crown className="h-2.5 w-2.5 inline" />{' '}
                      <strong className="text-yellow-600 dark:text-yellow-400">Boss</strong> = le plus grand bloc plaçable (zone réservée).{' '}
                      ③ <Shuffle className="h-2.5 w-2.5 inline" />{' '}
                      <strong className="text-foreground">Changer</strong> les blocs gauche/droite.{' '}
                      ④ Touches{' '}
                      <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">1</kbd>
                      <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">2</kbd>
                      <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">3</kbd> + flèches +{' '}
                      <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">Entrée</kbd>.
                    </p>
                  </div>
                </div>
              )}
              {!showActivityLog && (
                <div className="flex items-start gap-2 px-3 md:px-4 pb-3 text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                  <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/60" />
                  <p className="text-pretty leading-snug">
                    <strong className="text-foreground">Aide :</strong> Glissez un bloc → grille. <Crown className="h-2.5 w-2.5 inline" /> Boss = dernier recours. Touches{' '}
                    <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">1</kbd>
                    <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">2</kbd>
                    <kbd className="px-0.5 rounded bg-muted font-mono text-[9px]">3</kbd> + flèches.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ COLONNE DROITE ═══ */}
          <div className="flex flex-col gap-3 min-w-0 xl:col-start-2 xl:row-span-1">
            <div
              className={`${bentoCard} p-3 md:p-4 flex flex-col xl:sticky xl:top-[56px]`}
              style={{ maxHeight: 'calc(100vh - 72px)' }}
            >
              {/* ── En-tête Suggestions ── */}
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: theme.accentColor }} />
                <span className="text-sm font-bold text-foreground">Suggestions IA</span>
                {hasAnalyzed && (
                  <Badge variant="secondary" className="text-[10px] ml-auto h-5"
                    style={{ borderColor: `${theme.accentColor}40`, color: theme.accentColor }}>
                    {Object.values(suggestions).flat().length}
                  </Badge>
                )}
              </div>
              <div
                className="h-px w-full rounded-full mb-3 flex-shrink-0"
                style={{ background: `linear-gradient(90deg, ${theme.accentColor}40, transparent)` }}
              />

              {/* ── Info Boss (condensé) ── */}
              {bossReservation && bossBlock && (
                <div
                  className="mb-3 flex-shrink-0 p-2 rounded-md border"
                  style={{
                    borderColor: bossIsLastResort ? `#ef444460` : `${bossColor}30`,
                    background: bossIsLastResort ? `#ef444408` : `${bossColor}05`,
                  }}
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs"
                    style={{ color: bossIsLastResort ? '#ef4444' : bossColor }}>
                    {bossIsLastResort
                      ? <ShieldAlert className="h-3 w-3 flex-shrink-0" />
                      : <Crown className="h-3 w-3 flex-shrink-0" />
                    }
                    <span className="truncate">{bossBlock.definition.name}</span>
                    <Badge className="text-[9px] px-1 h-4 ml-auto"
                      style={{
                        background: bossIsLastResort ? `#ef444420` : `${bossColor}20`,
                        color: bossIsLastResort ? '#ef4444' : bossColor,
                        border: `1px solid ${bossIsLastResort ? '#ef444440' : `${bossColor}40`}`,
                      }}>
                      {bossBlock.definition.size} cases
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    {bossIsLastResort
                      ? <><AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />Dernier recours — aucun autre bloc disponible.</>
                      : <>Zone réservée L{bossReservation.row + 1}C{bossReservation.col + 1}. Posez d'abord les autres.</>
                    }
                  </p>
                </div>
              )}

              {/* ── Liste des suggestions ── */}
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                {learningMode ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
                    <Brain className="h-6 w-6 text-purple-400" />
                    <p className="text-xs font-medium text-foreground">Mode Apprentissage actif</p>
                    <p className="text-[10px] max-w-[200px]">
                      Les suggestions sont désactivées. Chaque coup que vous jouez est enregistré.
                    </p>
                    <p className="text-[9px] mt-1 text-purple-500">{demoCount} coup{demoCount > 1 ? 's' : ''} enregistré{demoCount > 1 ? 's' : ''}</p>
                  </div>
                ) : (
                  <SuggestionsPanel
                    suggestions={suggestions}
                    hand={hand.map((_, i) => ({ slot: i }))}
                    isLoading={isAnalyzing}
                    hoveredSuggestion={hoveredSuggestion}
                    onHoverSuggestion={handleHoverSuggestion}
                    onApplySuggestion={handleApplySuggestion}
                  />
                )}
              </div>

              {/* ── Apprentissage par Démonstration ── */}
              <div className="flex-shrink-0 mt-2 border-t border-border/50 pt-2">
                <button
                  className="w-full flex items-center gap-2 hover:opacity-80 transition-opacity"
                  onClick={() => setLearningMode(v => !v)}
                >
                  <Brain className="h-3 w-3 flex-shrink-0 text-purple-500" />
                  <span className="text-[10px] font-semibold text-foreground flex-1 text-left">
                    Mode apprentissage
                  </span>
                  {learningMode ? (
                    <span className="text-[9px] text-purple-500 animate-pulse">Enregistrement…</span>
                  ) : demoCount > 0 ? (
                    <Badge variant="secondary" className="text-[9px] px-1 h-4">{demoCount}</Badge>
                  ) : null}
                  {learningMode
                    ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  }
                </button>
                {learningMode && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 text-[10px] px-2 py-1 rounded-md border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          pendingExportRef.current = false;
                          demonWorkerRef.current?.postMessage({ type: 'save' }, undefined as any);
                        }}
                      >
                        Sauvegarder
                      </button>
                      <button
                        className="flex-1 text-[10px] px-2 py-1 rounded-md border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          pendingExportRef.current = true;
                          demonWorkerRef.current?.postMessage({ type: 'save' }, undefined as any);
                        }}
                      >
                        Export
                      </button>
                      <button
                        className="flex-1 text-[10px] px-2 py-1 rounded-md border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.json';
                          input.onchange = async () => {
                            const file = input.files?.[0];
                            if (!file) return;
                            const text = await file.text();
                            try { JSON.parse(text); } catch {
                              toast.error('Fichier invalide');
                              return;
                            }
                            demonWorkerRef.current?.postMessage({ type: 'load', data: text }, undefined as any);
                            try { localStorage.setItem('block_demos', text); } catch {}
                            toast.info('Démos importées');
                          };
                          input.click();
                        }}
                      >
                        Import
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 text-[10px] px-2 py-1 rounded-md border border-red-300/30 text-red-500 hover:bg-red-500/10 transition-colors"
                        onClick={() => {
                          demonWorkerRef.current?.postMessage({ type: 'clear' }, undefined as any);
                          try { localStorage.removeItem('block_demos'); } catch {}
                          toast.info('Démos effacées');
                        }}
                      >
                        <Trash2 className="h-2.5 w-2.5 inline mr-0.5" />
                        Effacer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Notes d'apprentissage IA ── */}
              <div className="flex-shrink-0 mt-2 border-t border-border/50 pt-2">
                <button
                  className="w-full flex items-center gap-2 hover:opacity-80 transition-opacity"
                  onClick={() => setShowNotes(v => !v)}
                >
                  <BookOpen className="h-3 w-3 flex-shrink-0 text-primary" />
                  <span className="text-[10px] font-semibold text-foreground flex-1 text-left">
                    Plan apprentissage
                  </span>
                  {activeNotesCount > 0 && (
                    <Badge variant="secondary" className="text-[9px] px-1 h-4 text-primary border-primary/30">
                      {activeNotesCount}
                    </Badge>
                  )}
                  {showNotes
                    ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  }
                </button>
                {showNotes && (
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    <AiNotesPanel
                      notes={notes}
                      activeCount={activeNotesCount}
                      onAdd={addNote}
                      onRemove={removeNote}
                      onToggle={toggleNote}
                      onClearAll={clearAllNotes}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

const BlockPuzzlePage: React.FC = () => (
  <ThemeProvider>
    <DragProvider>
      <BlockPuzzleAssistant />
    </DragProvider>
  </ThemeProvider>
);

export default BlockPuzzlePage;
