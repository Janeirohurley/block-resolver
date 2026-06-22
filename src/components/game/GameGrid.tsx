// Composant grille 8x8 interactive — avec drag & drop, touch et clavier
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Grid, BlockInstance, Suggestion } from '@/types/types';
import { getInstanceShape, gridToBool } from '@/lib/blockUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { useDrag } from '@/contexts/DragContext';
import { cn } from '@/lib/utils';

const GRID_SIZE = 8;
const CELL_SIZE = 42;
const CELL_GAP = 2;

interface GameGridProps {
  grid: Grid;
  onCellClick: (row: number, col: number) => void;
  selectedColor: string;
  previewSuggestion?: Suggestion | null;
  hoveredSuggestion?: Suggestion | null;
  isEditing?: boolean;
  onBlockDropped?: (block: BlockInstance, slotIndex: number, row: number, col: number) => void;
  keyboardBlock?: BlockInstance | null;
  keyboardSlot?: number | null;
  onKeyboardPlace?: (row: number, col: number) => void;
  onKeyboardCancel?: () => void;
  explodingCells?: Set<string>;
  scorePopup?: { value: number; key: number } | null;
  // Zone réservée pour le bloc boss (cellules à marquer avec overlay pointillés)
  reservedZoneCells?: Set<string>;
  // Couleur du bloc boss pour l'overlay
  bossColor?: string;
}

export const GameGrid: React.FC<GameGridProps> = ({
  grid,
  onCellClick,
  selectedColor,
  previewSuggestion,
  hoveredSuggestion,
  isEditing = true,
  onBlockDropped,
  keyboardBlock,
  keyboardSlot,
  onKeyboardPlace,
  onKeyboardCancel,
  explodingCells,
  scorePopup,
  reservedZoneCells,
  bossColor,
}) => {
  const { theme } = useTheme();
  const { dragState, dropPreview, setDropPreview, computeDropPreview, endDrag } = useDrag();
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [kbCursor, setKbCursor] = useState<[number, number]>([0, 0]);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Cellules prévisualisées (suggestion IA ou drag) ───────────────────────
  const activeSuggestion = hoveredSuggestion || previewSuggestion;
  const suggestionCells = new Set<string>();
  const clearedLineCells = new Set<string>();

  if (activeSuggestion) {
    for (const [r, c] of activeSuggestion.affectedCells) {
      suggestionCells.add(`${r},${c}`);
    }
    for (const lr of activeSuggestion.clearedLines) {
      for (let c = 0; c < GRID_SIZE; c++) clearedLineCells.add(`${lr},${c}`);
    }
    for (const lc of activeSuggestion.clearedCols) {
      for (let r = 0; r < GRID_SIZE; r++) clearedLineCells.add(`${r},${lc}`);
    }
  }

  const activeDragPreview = dragState ? dropPreview : null;

  const kbPreview = useCallback((): { cells: Array<[number,number]>; valid: boolean } | null => {
    if (!keyboardBlock) return null;
    const boolGrid = gridToBool(grid);
    const shape = getInstanceShape(keyboardBlock);
    const [anchorRow, anchorCol] = kbCursor;
    const cells: Array<[number,number]> = shape.map(([dr, dc]) => [anchorRow + dr, anchorCol + dc] as [number,number]);
    const valid = cells.every(([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && !boolGrid[r][c]);
    return { cells, valid };
  }, [keyboardBlock, kbCursor, grid]);

  const activeKbPreview = keyboardBlock ? kbPreview() : null;

  const getCellFromClientXY = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      if (!gridRef.current) return null;
      const rect = gridRef.current.getBoundingClientRect();
      const GRID_PADDING = 6;
      const x = clientX - rect.left - GRID_PADDING;
      const y = clientY - rect.top - GRID_PADDING;
      const col = Math.floor(x / (CELL_SIZE + CELL_GAP));
      const row = Math.floor(y / (CELL_SIZE + CELL_GAP));
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
      return [row, col];
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragState) return;
      setIsDragOver(true);
      const cell = getCellFromClientXY(e.clientX, e.clientY);
      if (!cell) { setDropPreview(null); return; }
      const boolGrid = gridToBool(grid);
      const preview = computeDropPreview(boolGrid, cell[0], cell[1]);
      setDropPreview(preview);
    },
    [dragState, getCellFromClientXY, grid, computeDropPreview, setDropPreview]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!gridRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropPreview(null);
    }
  }, [setDropPreview]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!dragState || !dropPreview) { endDrag(); return; }
      const cell = getCellFromClientXY(e.clientX, e.clientY);
      if (!cell) { endDrag(); setDropPreview(null); return; }
      if (!dropPreview.valid) { endDrag(); return; }
      const boolGrid = gridToBool(grid);
      const directPreview = computeDropPreview(boolGrid, cell[0], cell[1]);
      if (!directPreview?.valid) { endDrag(); return; }
      if (onBlockDropped) {
        onBlockDropped(dragState.block, dragState.slotIndex, cell[0], cell[1]);
      }
      endDrag();
    },
    [dragState, dropPreview, getCellFromClientXY, grid, computeDropPreview, onBlockDropped, endDrag, setDropPreview]
  );

  const touchDragActive = useRef(false);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragState) return;
      e.preventDefault();
      touchDragActive.current = true;
      const touch = e.touches[0];
      const cell = getCellFromClientXY(touch.clientX, touch.clientY);
      if (!cell) { setDropPreview(null); return; }
      const boolGrid = gridToBool(grid);
      const preview = computeDropPreview(boolGrid, cell[0], cell[1]);
      setDropPreview(preview);
    },
    [dragState, getCellFromClientXY, grid, computeDropPreview, setDropPreview]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!dragState || !touchDragActive.current) return;
      touchDragActive.current = false;
      const touch = e.changedTouches[0];
      const cell = getCellFromClientXY(touch.clientX, touch.clientY);
      if (!cell || !dropPreview?.valid) { endDrag(); return; }
      if (onBlockDropped) {
        onBlockDropped(dragState.block, dragState.slotIndex, cell[0], cell[1]);
      }
      endDrag();
    },
    [dragState, dropPreview, getCellFromClientXY, onBlockDropped, endDrag]
  );

  useEffect(() => {
    if (!keyboardBlock) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onKeyboardCancel?.(); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        if (activeKbPreview?.valid && onKeyboardPlace) {
          onKeyboardPlace(kbCursor[0], kbCursor[1]);
        }
        return;
      }
      const MOVES: Record<string, [number, number]> = {
        ArrowUp:    [-1, 0],
        ArrowDown:  [1,  0],
        ArrowLeft:  [0, -1],
        ArrowRight: [0,  1],
      };
      if (MOVES[e.key]) {
        e.preventDefault();
        const [dr, dc] = MOVES[e.key];
        setKbCursor(prev => [
          Math.max(0, Math.min(GRID_SIZE - 1, prev[0] + dr)),
          Math.max(0, Math.min(GRID_SIZE - 1, prev[1] + dc)),
        ]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardBlock, kbCursor, activeKbPreview, onKeyboardPlace, onKeyboardCancel]);

  // ── Style de chaque cellule ───────────────────────────────────────────────
  const getCellStyle = useCallback(
    (row: number, col: number) => {
      const key = `${row},${col}`;
      const cell = grid[row][col];

      if (activeDragPreview) {
        const inPreview = activeDragPreview.cells.some(([r, c]) => r === row && c === col);
        if (inPreview) {
          const color = dragState!.block.color;
          if (activeDragPreview.valid) {
            return { backgroundColor: color + 'cc', border: `2px dashed ${color}`, boxShadow: `0 0 8px ${color}88` };
          } else {
            return { backgroundColor: '#ef444477', border: '2px dashed #ef4444', boxShadow: '0 0 8px #ef444466' };
          }
        }
      }

      if (activeKbPreview) {
        const inKb = activeKbPreview.cells.some(([r, c]) => r === row && c === col);
        if (inKb) {
          const color = keyboardBlock!.color;
          if (activeKbPreview.valid) {
            return { backgroundColor: color + 'cc', border: `2px dashed ${color}`, boxShadow: `0 0 8px ${color}88` };
          } else {
            return { backgroundColor: '#ef444477', border: '2px dashed #ef4444' };
          }
        }
        if (row === kbCursor[0] && col === kbCursor[1]) {
          return { outline: `2px solid ${keyboardBlock!.color}`, outlineOffset: '-2px' };
        }
      }

      if (clearedLineCells.has(key) && (cell.occupied || suggestionCells.has(key))) {
        return { backgroundColor: theme.accentColor + '99', border: `2px solid ${theme.accentColor}`, boxShadow: `0 0 6px ${theme.accentColor}88` };
      }

      if (suggestionCells.has(key)) {
        const color = activeSuggestion!.blockInstance.color;
        return { backgroundColor: color + 'aa', border: `2px dashed ${color}`, boxShadow: `0 0 4px ${color}66` };
      }

      if (cell.occupied && cell.color) {
        return { backgroundColor: cell.color, border: `1px solid ${cell.color}cc`, boxShadow: `inset 0 2px 0 ${cell.color}88, inset 0 -2px 0 ${cell.color}44` };
      }

      return undefined;
    },
    [
      grid, activeDragPreview, dragState, activeKbPreview, keyboardBlock, kbCursor,
      suggestionCells, clearedLineCells, activeSuggestion, theme.accentColor,
    ]
  );

  const effectiveBossColor = bossColor ?? theme.accentColor;

  return (
    <div className="flex flex-col items-center">
      {/* Étiquettes colonnes */}
      <div className="flex gap-0.5 mb-1 pl-6">
        {Array.from({ length: GRID_SIZE }).map((_, c) => (
          <div key={c} className="text-xs text-muted-foreground font-mono text-center" style={{ width: CELL_SIZE }}>
            {c + 1}
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        {/* Étiquettes lignes */}
        <div className="flex flex-col gap-0.5 justify-center">
          {Array.from({ length: GRID_SIZE }).map((_, r) => (
            <div key={r} className="text-xs text-muted-foreground font-mono text-right pr-1"
              style={{ height: CELL_SIZE, display: 'flex', alignItems: 'center' }}>
              {r + 1}
            </div>
          ))}
        </div>

        {/* Grille principale */}
        <div className="relative">
          <div
            ref={gridRef}
            className={cn(
              'grid-bg rounded-md border p-1.5 shadow-md transition-all duration-150',
              isDragOver && dragState && 'border-transparent',
              keyboardBlock && 'border-primary/60'
            )}
            style={{
              display: 'inline-block',
              ...(isDragOver && dragState ? { boxShadow: `0 0 20px ${dragState.block.color}66, 0 0 60px ${dragState.block.color}33` } : {}),
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
              }}
            >
              {Array.from({ length: GRID_SIZE }).map((_, row) =>
                Array.from({ length: GRID_SIZE }).map((_, col) => {
                  const key = `${row},${col}`;
                  const cell = grid[row][col];
                  const isSuggestion = suggestionCells.has(key);
                  const isCleared = clearedLineCells.has(key);
                  const isExploding = explodingCells?.has(key) ?? false;
                  const isReserved = !cell.occupied && !isSuggestion && !activeDragPreview && !activeKbPreview
                    && (reservedZoneCells?.has(key) ?? false);
                  const customStyle = getCellStyle(row, col);
                  const isKbCursor = keyboardBlock && row === kbCursor[0] && col === kbCursor[1];

                  return (
                    <div
                      key={key}
                      onClick={() => {
                        if (keyboardBlock) {
                          if (activeKbPreview?.valid) onKeyboardPlace?.(row, col);
                        } else if (isEditing) {
                          onCellClick(row, col);
                        }
                      }}
                      onMouseEnter={() => setHoverCell([row, col])}
                      onMouseLeave={() => setHoverCell(null)}
                      className={cn(
                        'rounded-sm transition-all duration-100 select-none relative overflow-hidden',
                        (isEditing || keyboardBlock) && 'cursor-pointer',
                        !cell.occupied && !isSuggestion && !activeDragPreview && !activeKbPreview && !isExploding && 'grid-cell-empty border border-solid',
                        isCleared && 'animate-pulse-highlight',
                        isEditing && !cell.occupied && !isSuggestion && !activeDragPreview && !activeKbPreview &&
                          hoverCell?.[0] === row && hoverCell?.[1] === col && 'opacity-70',
                        isKbCursor && 'ring-2 ring-offset-1',
                      )}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        ...customStyle,
                      }}
                      aria-label={`Ligne ${row + 1}, Colonne ${col + 1}${cell.occupied ? ' (occupé)' : ''}`}
                    >
                      {/* Overlay zone réservée boss — pointillés colorés subtils */}
                      {isReserved && (
                        <div
                          className="absolute inset-0 rounded-sm pointer-events-none z-[1]"
                          style={{
                            border: `2px dashed ${effectiveBossColor}88`,
                            backgroundColor: `${effectiveBossColor}14`,
                          }}
                        />
                      )}

                      {/* Overlay d'explosion */}
                      {isExploding && (
                        <div
                          className="absolute inset-0 rounded-sm animate-cell-explode z-10"
                          style={{
                            backgroundColor: theme.accentColor,
                            boxShadow: `0 0 12px ${theme.accentColor}`,
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Score flottant */}
          {scorePopup && scorePopup.value > 0 && (
            <div key={scorePopup.key} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 animate-score-float">
              <span className="text-2xl font-black drop-shadow-lg" style={{ color: theme.accentColor, textShadow: `0 0 20px ${theme.accentColor}` }}>
                +{scorePopup.value}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm grid-cell-empty border border-solid" />
          <span>Vide</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: selectedColor }} />
          <span>Occupé</span>
        </div>
        {reservedZoneCells && reservedZoneCells.size > 0 && !activeDragPreview && !activeKbPreview && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ border: `2px dashed ${effectiveBossColor}`, backgroundColor: `${effectiveBossColor}14` }} />
            <span>Zone réservée</span>
          </div>
        )}
        {(activeDragPreview || activeKbPreview) && (
          <>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm border-2 border-dashed border-green-500 bg-green-500/30" />
              <span>Valide</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm border-2 border-dashed border-red-500 bg-red-500/30" />
              <span>Invalide</span>
            </div>
          </>
        )}
        {activeSuggestion && !activeDragPreview && !activeKbPreview && (
          <>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm border-2 border-dashed"
                style={{ backgroundColor: activeSuggestion.blockInstance.color + 'aa', borderColor: activeSuggestion.blockInstance.color }} />
              <span>Suggestion</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: theme.accentColor + '99', border: `2px solid ${theme.accentColor}` }} />
              <span>Libéré</span>
            </div>
          </>
        )}
      </div>

      {isDragOver && dragState && (
        <div className={cn(
          'mt-2 text-xs font-medium px-2 py-1 rounded-md',
          dropPreview?.valid
            ? 'text-green-600 dark:text-green-400 bg-green-500/10'
            : 'text-red-600 dark:text-red-400 bg-red-500/10'
        )}>
          {dropPreview?.valid ? '✓ Placement valide — relâchez ici' : '✗ Zone invalide'}
        </div>
      )}
    </div>
  );
};

export default GameGrid;
