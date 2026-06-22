import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { BlockDefinition } from '@/types/types';
import { BlockPreview } from '@/components/game/BlockPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import * as blockCatalogService from '@/lib/blockCatalogService';
import { Download, Upload, Trash2, Save, RotateCcw } from 'lucide-react';

const GRID = 8;

function normalizeShape(shape: [number, number][]): [number, number][] {
  if (shape.length === 0) return [];
  const minR = Math.min(...shape.map(([r]) => r));
  const minC = Math.min(...shape.map(([, c]) => c));
  const normalized = shape.map(([r, c]) => [r - minR, c - minC] as [number, number]);
  normalized.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return normalized;
}

function shapeToGrid(shape: [number, number][]): boolean[][] {
  const grid: boolean[][] = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  for (const [r, c] of shape) {
    if (r >= 0 && r < GRID && c >= 0 && c < GRID) grid[r][c] = true;
  }
  return grid;
}

function gridToShape(grid: boolean[][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) cells.push([r, c]);
    }
  }
  return normalizeShape(cells);
}

interface BlockEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBlockId?: string | null;
}

export function BlockEditor({ open, onOpenChange, editBlockId }: BlockEditorProps) {
  const { theme } = useTheme();
  const [grid, setGrid] = useState<boolean[][]>(() => Array.from({ length: GRID }, () => Array(GRID).fill(false)));
  const [name, setName] = useState('');
  const [blockId, setBlockId] = useState('');
  const [series, setSeries] = useState('');
  const [color, setColor] = useState(theme.blockColors[0]);
  const [error, setError] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    const unsub = blockCatalogService.subscribe(() => setCatalogVersion(v => v + 1));
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editBlockId) {
      const existing = blockCatalogService.getBlockById(editBlockId);
      if (existing) {
        setGrid(shapeToGrid(existing.shape as [number, number][]));
        setName(existing.name);
        setBlockId(existing.id);
        setSeries(existing.series);
        setError('');
      }
    } else {
      resetForm();
    }
  }, [open, editBlockId, catalogVersion]);

  const resetForm = useCallback(() => {
    setGrid(Array.from({ length: GRID }, () => Array(GRID).fill(false)));
    setName('');
    setBlockId('');
    setSeries('');
    setColor(theme.blockColors[0]);
    setError('');
  }, [theme.blockColors]);

  const shape = useMemo(() => gridToShape(grid), [grid]);

  const toggleCell = useCallback((r: number, c: number) => {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = !next[r][c];
      return next;
    });
    setError('');
  }, []);

  const handleSave = useCallback(() => {
    if (shape.length === 0) {
      setError('Le bloc doit avoir au moins 1 cellule');
      return;
    }
    if (!series.trim()) {
      setError('La série est obligatoire');
      return;
    }
    if (!blockId.trim()) {
      setError("L'identifiant est obligatoire");
      return;
    }

    const blockData = {
      id: blockId.trim(),
      name: name.trim() || blockId.trim(),
      series: series.trim().toUpperCase(),
      shape,
    } as Omit<BlockDefinition, 'size'> & { size?: number };

    try {
      if (editBlockId && blockCatalogService.isCustomBlock(editBlockId)) {
        blockCatalogService.updateBlock(editBlockId, blockData);
      } else {
        blockCatalogService.createBlock(blockData);
      }
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    }
  }, [shape, series, blockId, name, editBlockId, onOpenChange]);

  const handleDelete = useCallback(() => {
    if (editBlockId && blockCatalogService.isCustomBlock(editBlockId)) {
      blockCatalogService.deleteBlock(editBlockId);
      onOpenChange(false);
    }
  }, [editBlockId, onOpenChange]);

  const handleExport = useCallback(() => {
    const data = editBlockId
      ? blockCatalogService.exportCustomBlocks()
      : blockCatalogService.exportAllBlocks();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `block-catalog-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editBlockId]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const blocks = Array.isArray(data) ? data : [data];
        const count = blockCatalogService.importBlocks(blocks);
        setCatalogVersion(v => v + 1);
        setError('');
        alert(`${count} bloc(s) importé(s) avec succès`);
      } catch {
        setError('Fichier JSON invalide');
      }
    };
    input.click();
  }, []);

  const isCustom = editBlockId ? blockCatalogService.isCustomBlock(editBlockId) : false;

  const userBlocks = blockCatalogService.exportCustomBlocks();

  return (
    <div className="flex flex-col gap-4">
      {/* Grille d'édition */}
      <div className="flex flex-col items-center">
        <div className="text-xs text-muted-foreground mb-3">
          Cliquez sur les cellules pour dessiner le bloc ({shape.length} cellule{shape.length > 1 ? 's' : ''})
        </div>
        {/* Étiquettes colonnes */}
        <div className="flex gap-0.5 mb-1 pl-6">
          {Array.from({ length: GRID }).map((_, c) => (
            <div key={c} className="text-xs text-muted-foreground font-mono text-center" style={{ width: 42 }}>
              {c + 1}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {/* Étiquettes lignes */}
          <div className="flex flex-col gap-0.5 justify-center">
            {Array.from({ length: GRID }).map((_, r) => (
              <div key={r} className="text-xs text-muted-foreground font-mono text-right pr-1"
                style={{ height: 42, display: 'flex', alignItems: 'center' }}>
                {r + 1}
              </div>
            ))}
          </div>
          {/* Grille */}
          <div className="grid-bg rounded-md border p-1.5 shadow-md select-none">
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${GRID}, 42px)`,
                gridTemplateRows: `repeat(${GRID}, 42px)`,
              }}
            >
              {grid.flatMap((row, r) =>
                row.map((filled, c) => (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={cn(
                      'rounded-sm transition-all duration-100',
                      filled
                        ? 'shadow-inner cursor-pointer'
                        : 'grid-cell-empty border border-solid hover:opacity-70'
                    )}
                    style={{
                      width: 42,
                      height: 42,
                      backgroundColor: filled ? color : undefined,
                      border: filled ? `1px solid ${color}cc` : undefined,
                      boxShadow: filled ? `inset 0 2px 0 ${color}88, inset 0 -2px 0 ${color}44` : undefined,
                    }}
                    onClick={() => toggleCell(r, c)}
                    aria-label={`Cellule ${r},${c}${filled ? ' (remplie)' : ''}`}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Champs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Série</label>
          <Input
            value={series}
            onChange={e => { setSeries(e.target.value.toUpperCase().slice(0, 5)); setError(''); }}
            placeholder="ex: X"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">ID</label>
          <Input
            value={blockId}
            onChange={e => { setBlockId(e.target.value); setError(''); }}
            placeholder={`${series || 'X'}-${shape.length || '?'}`}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Nom</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={blockId || 'Nom du bloc'}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Couleur</label>
          <div className="flex gap-1.5 items-center">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded-md cursor-pointer border border-border"
            />
            <div className="flex gap-1 flex-wrap">
              {theme.blockColors.slice(0, 6).map(c => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'w-6 h-6 rounded-sm border transition-all',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Prévisualisation */}
      {shape.length > 0 && (
        <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
          <BlockPreview
            definition={{ id: blockId || 'preview', name: name || 'Aperçu', series, size: shape.length, shape }}
            color={color}
            cellSize={16}
          />
          <div className="text-xs text-muted-foreground">
            <div>{name || 'Aperçu'}</div>
            <div>{shape.length} cellule{shape.length > 1 ? 's' : ''}</div>
            <div className="flex gap-1 mt-1">
              {Array.from(new Set(shape.flat())).length > 0 && (
                <Badge variant="outline" className="text-[9px] px-1 h-4">
                  {Math.max(...shape.map(([r]) => r)) + 1}×{Math.max(...shape.map(([, c]) => c)) + 1}
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barre d'actions */}
      <div className="flex gap-2 justify-between items-center pt-2 border-t border-border">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleImport}>
            <Upload className="h-3 w-3" />
            Importer
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExport}>
            <Download className="h-3 w-3" />
            Exporter
          </Button>
        </div>
        <div className="flex gap-1">
          {isCustom && (
            <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={handleDelete}>
              <Trash2 className="h-3 w-3" />
              Supprimer
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { resetForm(); }}>
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave}>
            <Save className="h-3 w-3" />
            {editBlockId ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded-md">{error}</div>
      )}

      {/* Liste des blocs personnalisés */}
      {userBlocks.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2">
            Blocs personnalisés ({userBlocks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {userBlocks.map(b => (
              <button
                key={b.id}
                type="button"
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors',
                  editBlockId === b.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onOpenChange(false) /* editor will re-open with editBlockId set */}
              >
                <BlockPreview definition={b} color={color} cellSize={8} />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BlockEditorDialog({ open, onOpenChange, editBlockId }: BlockEditorProps) {
  const isCustom = editBlockId ? blockCatalogService.isCustomBlock(editBlockId) : false;
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        open ? 'visible' : 'invisible pointer-events-none'
      )}
    >
      {open && (
        <>
          <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
          <div className="relative bg-card rounded-lg border border-border shadow-xl w-full max-w-xl max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-semibold">
                {editBlockId ? (isCustom ? `Modifier ${editBlockId}` : `Consulter ${editBlockId}`) : 'Nouveau bloc'}
              </h2>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => onOpenChange(false)}
              >
                ✕
              </button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 h-screen">
                <BlockEditor open={open} onOpenChange={onOpenChange} editBlockId={editBlockId} />
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}
