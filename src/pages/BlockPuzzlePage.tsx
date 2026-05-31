// Page principale de l'assistant Block Puzzle — v11 (Boss + Mémoire contextuelle)
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Grid, BlockInstance, Suggestion, CellState } from '@/types/types';
import {
  generateSuggestions,
  suggestNextBlocks,
  suggestOneBlock,
  findBossSlot,
  computeBossReservation,
  reservationToCellSet,
} from '@/lib/predictionEngine';
import type { ClearMemory, BossReservation } from '@/lib/predictionEngine';
import { getInstanceShape, gridToBool, canPlace, applyPlacementWithClears } from '@/lib/blockUtils';
import { DragProvider } from '@/contexts/DragContext';
import { GameGrid } from '@/components/game/GameGrid';
import { HandSelector } from '@/components/game/HandSelector';
import { SuggestionsPanel } from '@/components/game/SuggestionsPanel';
import { GridToolbar } from '@/components/game/GridToolbar';
import { ThemeConfigPanel } from '@/components/game/ThemeConfigPanel';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LayoutGrid, Info, Puzzle, Sparkles, Hand, Trophy, Zap } from 'lucide-react';

const GRID_SIZE = 8;
const MAX_MEMORY = 5; // garder les 5 derniers coups en mémoire

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

  const [grid, setGrid] = useState<Grid>(createEmptyGrid);
  const [paintMode, setPaintMode] = useState<'paint' | 'erase'>('paint');
  const [selectedColor, setSelectedColor] = useState(theme.blockColors[0]);
  const [hand, setHand] = useState<Array<BlockInstance | null>>([null, null, null]);
  const [suggestions, setSuggestions] = useState<Record<number, Suggestion[]>>({});
  const [hoveredSuggestion, setHoveredSuggestion] = useState<Suggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedSlot, setHighlightedSlot] = useState<number | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [kbSlot, setKbSlot] = useState<number | null>(null);

  // ── Score & animation ────────────────────────────────────────────────────
  const [score, setScore] = useState(0);
  const [scoreBump, setScoreBump] = useState(false);
  const [explodingCells, setExplodingCells] = useState<Set<string>>(new Set());
  const [scorePopup, setScorePopup] = useState<{ value: number; key: number } | null>(null);
  const popupKeyRef = useRef(0);
  const explodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stratégie Boss ───────────────────────────────────────────────────────
  const [bossSlot, setBossSlot] = useState<number>(1);
  const [bossReservation, setBossReservation] = useState<BossReservation | null>(null);
  const [clearMemory, setClearMemory] = useState<ClearMemory[]>([]);
  const turnCountRef = useRef(0);

  // Recalcule le boss + sa zone réservée à chaque changement de main ou grille
  const recomputeBoss = useCallback(
    (currentGrid: Grid, currentHand: Array<BlockInstance | null>, currentMemory: ClearMemory[]) => {
      const newBossSlot = findBossSlot(currentHand);
      setBossSlot(newBossSlot);
      const bossBlock = currentHand[newBossSlot];
      if (!bossBlock) {
        setBossReservation(null);
        return;
      }
      const reservation = computeBossReservation(currentGrid, bossBlock, newBossSlot, currentMemory);
      setBossReservation(reservation);
    },
    []
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
      if (slot === bossSlot) return; // le boss ne se shufflerait pas
      const excludeIds = hand
        .filter((b): b is BlockInstance => b !== null)
        .map(b => b.definition.id);
      const newBlock = suggestOneBlock(
        grid,
        theme.blockColors,
        excludeIds,
        bossReservation,
        clearMemory
      );
      if (!newBlock) {
        toast.warning('Aucun bloc compatible trouvé', {
          description: 'La grille ne permet pas d\'autres blocs en ce moment.',
        });
        return;
      }
      // Appliquer la couleur du slot
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
      toast.success(`🔀 Bloc ${slot + 1} remplacé par ${coloredBlock.definition.name}`, {
        description: 'Nouveau bloc sélectionné par l\'IA.',
        duration: 2000,
      });
    },
    [bossSlot, hand, grid, theme.blockColors, bossReservation, clearMemory]
  );

  // ── Analyse ──────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    const hasBlocks = hand.some(Boolean);
    if (!hasBlocks) {
      toast.info('Ajoutez au moins un bloc dans votre main', {
        description: 'Utilisez les 3 slots ci-dessous pour sélectionner vos blocs.',
      });
      return;
    }
    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const result = generateSuggestions(grid, hand, 3, bossReservation, clearMemory);
        setSuggestions(result);
        setHasAnalyzed(true);
        const total = Object.values(result).flat().length;
        if (total === 0) {
          toast.warning('Aucun placement possible', { description: 'La grille est trop remplie.' });
        } else {
          toast.success(`${total} suggestion${total > 1 ? 's' : ''} trouvée${total > 1 ? 's' : ''}`, {
            description: 'Survolez une carte pour prévisualiser le placement.',
          });
        }
      } catch {
        toast.error("Erreur lors de l'analyse");
      } finally {
        setIsAnalyzing(false);
      }
    }, 50);
  }, [grid, hand, bossReservation, clearMemory]);

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
    setClearMemory([]);
    turnCountRef.current = 0;
    toast.info('Grille effacée');
  }, []);

  const handleHoverSuggestion = useCallback((s: Suggestion | null) => {
    setHoveredSuggestion(s);
    if (!s) { setHighlightedSlot(null); return; }
    const entry = Object.entries(suggestions).find(([, arr]) => arr.some(sg => sg.id === s.id));
    setHighlightedSlot(entry ? parseInt(entry[0]) : null);
  }, [suggestions]);

  // ── Recharger la main si tous les slots sont vides ──────────────────────
  const refillHandIfEmpty = useCallback(
    (updatedHand: Array<BlockInstance | null>, currentGrid: Grid, currentMemory: ClearMemory[]): Array<BlockInstance | null> => {
      const allEmpty = updatedHand.every(b => b === null);
      if (!allEmpty) return updatedHand;
      const colors = theme.blockColors;
      const suggested = suggestNextBlocks(currentGrid, colors, 3);
      // suggestNextBlocks garantit déjà [petit, grand(boss), moyen]
      toast.info("✨ Nouvelle main générée par l'IA", {
        description: 'Bloc central = 👑 Boss (le plus grand). Réservation mise à jour.',
        duration: 3000,
      });
      // Recalculer le boss avec la nouvelle main dans la prochaine update
      setTimeout(() => recomputeBoss(currentGrid, suggested as Array<BlockInstance | null>, currentMemory), 0);
      return suggested as Array<BlockInstance | null>;
    },
    [theme.blockColors, recomputeBoss]
  );

  // ── Logique centrale : placer un bloc + effacer lignes/cols + score ───────
  const triggerPlacementResult = useCallback(
    (
      newGrid: Grid,
      result: { clearedLines: number[]; clearedCols: number[]; scoreGained: number; cellsFreed: number },
      newHand: Array<BlockInstance | null> | null,
      newMemory: ClearMemory[]
    ) => {
      const { clearedLines, clearedCols, scoreGained, cellsFreed } = result;
      const combos = clearedLines.length + clearedCols.length;

      const toExplode = new Set<string>();
      for (const r of clearedLines) {
        for (let c = 0; c < GRID_SIZE; c++) toExplode.add(`${r},${c}`);
      }
      for (const col of clearedCols) {
        for (let r = 0; r < GRID_SIZE; r++) toExplode.add(`${r},${col}`);
      }

      setGrid(newGrid);

      if (toExplode.size > 0) {
        setExplodingCells(toExplode);
        if (explodeTimerRef.current) clearTimeout(explodeTimerRef.current);
        explodeTimerRef.current = setTimeout(() => {
          setExplodingCells(new Set());
          if (newHand) {
            setHand(newHand);
          }
          // Recalculer boss après effacement + nouvelle main
          recomputeBoss(newGrid, newHand ?? [], newMemory);
          setSuggestions({});
          setHasAnalyzed(false);
        }, 500);
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
        toast.success(`🎉 ${cellsFreed} cases libérées${comboMsg}`, {
          description: `+${scoreGained} points`,
          duration: 2000,
        });
      }
    },
    [recomputeBoss]
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
      // Garder seulement les MAX_MEMORY derniers souvenirs
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
      grid,
      shape,
      suggestion.position.row,
      suggestion.position.col,
      suggestion.blockInstance.color
    );
    const slotEntry = Object.entries(suggestions).find(([, arr]) =>
      arr.some(s => s.id === suggestion.id)
    );
    const slotIndex = slotEntry ? parseInt(slotEntry[0]) : -1;
    const updatedHand = [...hand] as Array<BlockInstance | null>;
    if (slotIndex >= 0) updatedHand[slotIndex] = null;
    const newMemory = buildNewMemory(result.clearedLines, result.clearedCols);
    const finalHand = refillHandIfEmpty(updatedHand, result.newGrid, newMemory);
    triggerPlacementResult(result.newGrid, result, finalHand, newMemory);
    setHoveredSuggestion(null);
  }, [grid, hand, suggestions, refillHandIfEmpty, triggerPlacementResult, buildNewMemory]);

  // ── Placer un bloc (drag, clavier) ───────────────────────────────────────
  const placeBlock = useCallback(
    (block: BlockInstance, slotIndex: number, anchorRow: number, anchorCol: number): boolean => {
      const shape = getInstanceShape(block);
      const boolGrid = gridToBool(grid);
      if (!canPlace(boolGrid, shape, anchorRow, anchorCol)) return false;
      const result = applyPlacementWithClears(grid, shape, anchorRow, anchorCol, block.color);
      const updatedHand = [...hand] as Array<BlockInstance | null>;
      if (slotIndex >= 0) updatedHand[slotIndex] = null;
      const newMemory = buildNewMemory(result.clearedLines, result.clearedCols);
      const finalHand = refillHandIfEmpty(updatedHand, result.newGrid, newMemory);
      triggerPlacementResult(result.newGrid, result, finalHand, newMemory);
      return true;
    },
    [grid, hand, refillHandIfEmpty, triggerPlacementResult, buildNewMemory]
  );

  // ── Drop depuis la Main ──────────────────────────────────────────────────
  const handleBlockDropped = useCallback(
    (block: BlockInstance, slotIndex: number, row: number, col: number) => {
      const ok = placeBlock(block, slotIndex, row, col);
      if (!ok) {
        toast.error('Placement invalide', { description: 'Ce bloc ne peut pas être placé ici.' });
      } else {
        toast.success(`Bloc ${block.definition.name} placé !`, {
          description: `Ligne ${row + 1}, colonne ${col + 1}`,
        });
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
        toast.success(`Bloc ${block.definition.name} placé !`, {
          description: `Clavier — Ligne ${row + 1}, colonne ${col + 1}`,
        });
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

  return (
    <div
      className="flex flex-col min-h-screen bg-background"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${theme.accentColor}30, ${theme.accentColor}15)`,
                border: `1px solid ${theme.accentColor}50`,
              }}
            >
              <Puzzle className="h-4 w-4" style={{ color: theme.accentColor }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">
                Block Puzzle — Assistant IA
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Prédiction intelligente des meilleurs coups
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Indicateur mémoire */}
            {clearMemory.length > 0 && (
              <Badge variant="outline" className="text-xs hidden md:flex gap-1 font-mono"
                style={{ borderColor: `${theme.accentColor}40`, color: theme.accentColor }}>
                🧠 {clearMemory.length} coup{clearMemory.length > 1 ? 's' : ''} mémorisé{clearMemory.length > 1 ? 's' : ''}
              </Badge>
            )}
            {/* Score */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${scoreBump ? 'animate-score-bump' : ''}`}
              style={{
                borderColor: `${theme.accentColor}50`,
                background: `${theme.accentColor}10`,
              }}
            >
              <Trophy className="h-3.5 w-3.5" style={{ color: theme.accentColor }} />
              <span
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: theme.accentColor }}
              >
                {score.toLocaleString()}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs hidden sm:flex font-mono"
              style={{ borderColor: `${theme.accentColor}40` }}>
              8 × 8
            </Badge>
            <ThemeConfigPanel />
          </div>
        </div>
      </header>

      {/* ── Layout principal ── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-4 min-w-0">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ═══ Colonne centrale ═══ */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">

            {/* Barre d'outils */}
            <div className="bg-card rounded-md border border-border p-3 shadow-sm">
              <GridToolbar
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                mode={paintMode}
                onModeChange={setPaintMode}
                onClearGrid={handleClearGrid}
                occupiedCount={occupiedCount}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
              />
            </div>

            {/* Grille 8×8 */}
            <div className="bg-card rounded-md border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <LayoutGrid className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Plateau de jeu</span>
                {explodingCells.size > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium ml-1"
                    style={{ color: theme.accentColor }}>
                    <Zap className="h-3.5 w-3.5" />
                    Explosion !
                  </span>
                )}
                {bossReservation && (
                  <span className="text-xs ml-1 hidden sm:inline" style={{ color: bossColor }}>
                    👑 Zone Boss réservée
                  </span>
                )}
                <Badge variant="outline" className="text-xs ml-auto font-mono">
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

            {/* ══ Main du joueur ══ */}
            <div className="bg-card rounded-md border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Hand className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Ma main</span>
                <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
                  — glissez un bloc vers la grille
                </span>
                <Badge variant="secondary" className="text-xs ml-auto">
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

            {/* Aide rapide */}
            <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary/60" />
              <p className="text-pretty">
                <strong className="text-foreground">Comment jouer :</strong>{' '}
                ① <strong className="text-foreground">Glissez</strong> un bloc de «&nbsp;Ma main&nbsp;» vers la grille.{' '}
                ② Le <strong className="text-yellow-600 dark:text-yellow-400">👑 Boss</strong> (bloc du milieu, le plus grand) a une{' '}
                <strong className="text-foreground">zone réservée</strong> (pointillés sur la grille) — l'IA l'utilise en dernier recours.{' '}
                ③ Utilisez <strong className="text-foreground">🔀 Changer</strong> sur les blocs gauche/droite pour demander un remplaçant IA.{' '}
                ④ Touche{' '}
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">1</kbd>
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] mx-0.5">2</kbd>
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">3</kbd>{' '}
                + flèches + <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Entrée</kbd>{' '}
                pour le mode clavier.
              </p>
            </div>
          </div>

          {/* ═══ Sidebar droite ═══ */}
          <div className="lg:w-80 xl:w-96 flex-shrink-0">
            <div
              className="bg-card rounded-md border border-border shadow-sm p-4 flex flex-col lg:sticky lg:top-[60px]"
              style={{ maxHeight: 'calc(100vh - 80px)' }}
            >
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: theme.accentColor }} />
                <span className="text-sm font-bold text-foreground">Suggestions IA</span>
                {hasAnalyzed && (
                  <Badge variant="secondary" className="text-xs ml-auto"
                    style={{ borderColor: `${theme.accentColor}40`, color: theme.accentColor }}>
                    {Object.values(suggestions).flat().length} idées
                  </Badge>
                )}
              </div>
              <div
                className="h-0.5 w-full rounded-full mb-3 flex-shrink-0"
                style={{ background: `linear-gradient(90deg, ${theme.accentColor}60, transparent)` }}
              />
              {/* Info boss dans la sidebar */}
              {bossReservation && bossBlock && (
                <div className="mb-3 flex-shrink-0 p-2 rounded-md border text-xs"
                  style={{ borderColor: `${bossColor}40`, background: `${bossColor}08` }}>
                  <div className="flex items-center gap-1.5 font-medium mb-0.5" style={{ color: bossColor }}>
                    <span>👑 Boss — {bossBlock.definition.name}</span>
                    <Badge className="text-[9px] px-1 h-4 ml-auto" style={{ background: `${bossColor}20`, color: bossColor, border: `1px solid ${bossColor}40` }}>
                      {bossBlock.definition.size} cases
                    </Badge>
                  </div>
                  <p className="text-muted-foreground leading-snug">
                    Zone réservée à L{bossReservation.row + 1}&nbsp;C{bossReservation.col + 1}.
                    Les blocs gauche/droite sont suggérés pour <em>ne pas bloquer</em> cette zone.
                  </p>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <SuggestionsPanel
                  suggestions={suggestions}
                  hand={hand.map((_, i) => ({ slot: i }))}
                  isLoading={isAnalyzing}
                  hoveredSuggestion={hoveredSuggestion}
                  onHoverSuggestion={handleHoverSuggestion}
                  onApplySuggestion={handleApplySuggestion}
                />
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
