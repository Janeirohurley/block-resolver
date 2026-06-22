// Sélecteur de blocs pour la main du joueur (3 slots) — avec drag & drop et Boss
import React, { useState, useRef } from 'react';
import type { BlockInstance, BlockDefinition } from '@/types/types';
import * as blockCatalogService from '@/lib/blockCatalogService';
import { BlockPreview } from '@/components/game/BlockPreview';
import { useTheme } from '@/contexts/ThemeContext';
import { useDrag } from '@/contexts/DragContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Plus, X, RotateCcw, FlipHorizontal2, GripVertical, Shuffle } from 'lucide-react';

interface HandSlotProps {
  slot: 0 | 1 | 2;
  block: BlockInstance | null;
  onSelect: (slot: 0 | 1 | 2, block: BlockInstance) => void;
  onRemove: (slot: 0 | 1 | 2) => void;
  onRotate: (slot: 0 | 1 | 2) => void;
  onFlip: (slot: 0 | 1 | 2) => void;
  isBoss?: boolean;
  onShuffle?: (slot: 0 | 1 | 2) => void;
  isHighlighted?: boolean;
  isKeyboardSelected?: boolean;
}

const HandSlot: React.FC<HandSlotProps> = ({
  slot,
  block,
  onSelect,
  onRemove,
  onRotate,
  onFlip,
  isBoss = false,
  onShuffle,
  isHighlighted,
  isKeyboardSelected,
}) => {
  const { theme } = useTheme();
  const { startDrag, endDrag, dragState } = useDrag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDef, setSelectedDef] = useState<BlockDefinition | null>(null);
  const [selectedColor, setSelectedColor] = useState(theme.blockColors[slot] || theme.accentColor);
  const dragImgRef = useRef<HTMLDivElement | null>(null);

  const filteredBlocks = blockCatalogService.getAllBlocks().filter(b =>
    b.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = () => {
    if (!selectedDef) return;
    onSelect(slot, { definition: selectedDef, rotation: 0, flipped: false, color: selectedColor });
    setOpen(false);
    setSelectedDef(null);
    setSearch('');
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!block) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-block-slot', String(slot));
    startDrag(block, slot);
    const ghost = document.createElement('div');
    ghost.style.cssText = 'width:1px;height:1px;opacity:0;position:fixed;top:-999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    dragImgRef.current = ghost;
  };

  const handleDragEnd = () => {
    endDrag();
    if (dragImgRef.current) {
      document.body.removeChild(dragImgRef.current);
      dragImgRef.current = null;
    }
  };

  const isDragging = dragState?.slotIndex === slot;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-md border transition-all duration-150 relative',
        isBoss && 'border-yellow-400/60 bg-yellow-500/5 dark:bg-yellow-400/5',
        isHighlighted && !isBoss && 'border-primary shadow-md bg-primary/10',
        isHighlighted && isBoss && 'shadow-md',
        isKeyboardSelected && 'border-primary ring-2 ring-primary/50 bg-primary/10',
        !isHighlighted && !isKeyboardSelected && !isBoss && 'border-border bg-card',
        isDragging && 'opacity-40 scale-95'
      )}
    >
      {/* Label + badge boss */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground font-medium">Bloc {slot + 1}</span>
        {isBoss && (
          <Badge className="text-[9px] px-1 h-4 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-400/40 hover:bg-yellow-500/20">
            👑 Boss
          </Badge>
        )}
      </div>

      {block ? (
        <>
          {/* Zone draggable */}
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              'flex items-center justify-center min-h-[72px] cursor-grab active:cursor-grabbing',
              'rounded-md px-2 py-1 hover:bg-muted/40 transition-colors select-none',
              'overflow-x-auto focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
            tabIndex={0}
            aria-label={`Glisser le bloc ${block.definition.name} depuis le slot ${slot + 1}`}
            title="Glisser vers la grille"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground mr-1 flex-shrink-0" />
            <BlockPreview
              definition={block.definition}
              color={block.color}
              rotation={block.rotation}
              flipped={block.flipped}
              cellSize={18}
            />
          </div>
          <div className="text-xs font-medium text-foreground">{block.definition.name}</div>
          <div className="flex gap-1 flex-wrap justify-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRotate(slot)} title="Pivoter (R)">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onFlip(slot)} title="Miroir (F)">
              <FlipHorizontal2 className="h-3.5 w-3.5" />
            </Button>
            {/* Shuffle uniquement pour les blocs non-boss */}
            {!isBoss && onShuffle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                onClick={() => onShuffle(slot)}
                title="Changer ce bloc (IA)"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onRemove(slot)}
              title="Retirer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Indication boss = pas de shuffle */}
          {isBoss && (
            <div className="text-[9px] text-yellow-600 dark:text-yellow-400 text-center leading-tight">
              Dernier recours — zone réservée
            </div>
          )}
        </>
      ) : (
        <Dialog open={open}
         onOpenChange={setOpen}
         
         >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-14 w-full border-dashed">
              <Plus className="h-4 w-4 mr-1" />
              Choisir
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Sélectionner un bloc — Slot {slot + 1}{isBoss ? ' (Boss)' : ''}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 items-center flex-shrink-0">
              <Input
                placeholder="Rechercher (ex: L-4, T-5...)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1"
              />
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Couleur:</label>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={e => setSelectedColor(e.target.value)}
                  className="w-8 h-8 rounded-md cursor-pointer border border-border"
                  title="Couleur du bloc"
                />
              </div>
            </div>
            <div className="flex gap-1 flex-wrap flex-shrink-0">
              {theme.blockColors.map((color, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-6 h-6 rounded-sm border-2 transition-all',
                    selectedColor === color ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-4 pr-2 h-screen">
                {search ? (
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {filteredBlocks.map(def => (
                      <BlockCatalogItem key={def.id} definition={def} color={selectedColor}
                        selected={selectedDef?.id === def.id} onSelect={() => setSelectedDef(def)} />
                    ))}
                  </div>
                ) : (
                  Object.entries(blockCatalogService.getBlocksBySeries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([series, blocks]) => (
                      <div key={series}>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Série {series}
                        </div>
                        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                          {blocks.map(def => (
                            <BlockCatalogItem key={def.id} definition={def} color={selectedColor}
                              selected={selectedDef?.id === def.id} onSelect={() => setSelectedDef(def)} />
                          ))}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </ScrollArea>
            <div className="flex gap-2 justify-end flex-shrink-0 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={handleConfirm} disabled={!selectedDef}>
                Confirmer {selectedDef ? `— ${selectedDef.name}` : ''}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

interface BlockCatalogItemProps {
  definition: BlockDefinition;
  color: string;
  selected: boolean;
  onSelect: () => void;
}

const BlockCatalogItem: React.FC<BlockCatalogItemProps> = ({ definition, color, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      'flex flex-col items-center gap-1 p-2 rounded-md border transition-all text-xs font-medium',
      selected ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
    )}
  >
    <div className="flex items-center justify-center h-12 w-12">
      <BlockPreview definition={definition} color={selected ? color : color + '99'} cellSize={10} />
    </div>
    <span className={cn('text-[10px]', selected ? 'text-primary' : 'text-muted-foreground')}>
      {definition.name}
    </span>
    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{definition.size}</Badge>
  </button>
);

// Composant principal: main du joueur (3 slots)
interface HandSelectorProps {
  hand: Array<BlockInstance | null>;
  onSlotChange: (slot: 0 | 1 | 2, block: BlockInstance | null) => void;
  highlightedSlot?: number | null;
  keyboardSelectedSlot?: number | null;
  onKeyboardSelectSlot?: (slot: number | null) => void;
  bossSlot?: number;
  onShuffleSlot?: (slot: 0 | 1 | 2) => void;
}

export const HandSelector: React.FC<HandSelectorProps> = ({
  hand,
  onSlotChange,
  highlightedSlot,
  keyboardSelectedSlot,
  bossSlot = 1,
  onShuffleSlot,
}) => {
  const handleRotate = (slot: 0 | 1 | 2) => {
    const block = hand[slot];
    if (!block) return;
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const currentIdx = rotations.indexOf(block.rotation);
    const nextRotation = rotations[(currentIdx + 1) % 4];
    onSlotChange(slot, { ...block, rotation: nextRotation });
  };

  const handleFlip = (slot: 0 | 1 | 2) => {
    const block = hand[slot];
    if (!block) return;
    onSlotChange(slot, { ...block, flipped: !block.flipped });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map(slot => (
          <HandSlot
            key={slot}
            slot={slot}
            block={hand[slot]}
            onSelect={(s, b) => onSlotChange(s, b)}
            onRemove={s => onSlotChange(s, null)}
            onRotate={handleRotate}
            onFlip={handleFlip}
            isBoss={slot === bossSlot}
            onShuffle={slot !== bossSlot ? onShuffleSlot : undefined}
            isHighlighted={highlightedSlot === slot}
            isKeyboardSelected={keyboardSelectedSlot === slot}
          />
        ))}
        
      </div>
      {keyboardSelectedSlot !== null && keyboardSelectedSlot !== undefined && (
        <div className="text-xs text-primary text-center animate-suggestion-in">
          ⌨️ Bloc {keyboardSelectedSlot + 1} sélectionné — Utilisez les flèches sur la grille, Entrée pour placer, Échap pour annuler
        </div>
      )}
      {(keyboardSelectedSlot === null || keyboardSelectedSlot === undefined) && (
        <div className="text-xs text-muted-foreground text-center">
          Glissez un bloc vers la grille ou appuyez sur{' '}
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">1</kbd>
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] mx-0.5">2</kbd>
          <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">3</kbd> pour sélectionner un slot
        </div>
      )}
    </div>
  );
};

export default HandSelector;
