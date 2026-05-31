// Contexte drag & drop pour partager l'état du bloc en cours de déplacement
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BlockInstance } from '@/types/types';
import { getInstanceShape, canPlace } from '@/lib/blockUtils';

export interface DragState {
  block: BlockInstance;
  slotIndex: number; // 0 | 1 | 2
}

interface DragContextValue {
  dragState: DragState | null;
  startDrag: (block: BlockInstance, slotIndex: number) => void;
  endDrag: () => void;
  // Prévisualisation sur la grille
  dropPreview: { cells: Array<[number, number]>; valid: boolean } | null;
  setDropPreview: (preview: { cells: Array<[number, number]>; valid: boolean } | null) => void;
  // Calcule si un drop à (row,col) est valide pour la grille courante
  computeDropPreview: (
    grid: boolean[][],
    anchorRow: number,
    anchorCol: number
  ) => { cells: Array<[number, number]>; valid: boolean } | null;
}

const DragContext = createContext<DragContextValue | null>(null);

export const DragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropPreview, setDropPreview] = useState<{ cells: Array<[number, number]>; valid: boolean } | null>(null);

  const startDrag = useCallback((block: BlockInstance, slotIndex: number) => {
    setDragState({ block, slotIndex });
    setDropPreview(null);
  }, []);

  const endDrag = useCallback(() => {
    setDragState(null);
    setDropPreview(null);
  }, []);

  const computeDropPreview = useCallback(
    (
      grid: boolean[][],
      anchorRow: number,
      anchorCol: number
    ): { cells: Array<[number, number]>; valid: boolean } | null => {
      if (!dragState) return null;
      const shape = getInstanceShape(dragState.block);
      const cells: Array<[number, number]> = shape.map(
        ([dr, dc]) => [anchorRow + dr, anchorCol + dc] as [number, number]
      );
      const valid = canPlace(grid, shape, anchorRow, anchorCol);
      return { cells, valid };
    },
    [dragState]
  );

  return (
    <DragContext.Provider
      value={{ dragState, startDrag, endDrag, dropPreview, setDropPreview, computeDropPreview }}
    >
      {children}
    </DragContext.Provider>
  );
};

export const useDrag = (): DragContextValue => {
  const ctx = useContext(DragContext);
  if (!ctx) {
    // Retourne un contexte vide par défaut pour éviter les crashes hors-provider
    return {
      dragState: null,
      startDrag: () => {},
      endDrag: () => {},
      dropPreview: null,
      setDropPreview: () => {},
      computeDropPreview: () => null,
    };
  }
  return ctx;
};
