// Panel de suggestions avec prévisualisation — version améliorée
import React from 'react';
import type { Suggestion } from '@/types/types';
import { BlockPreview } from '@/components/game/BlockPreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Sparkles, Trophy, Layers, ChevronRight, Eye, AlertTriangle } from 'lucide-react';

interface SuggestionCardProps {
  suggestion: Suggestion;
  rank: number;
  isHovered: boolean;
  onHover: (suggestion: Suggestion | null) => void;
  onApply?: (suggestion: Suggestion) => void;
  onDetail?: (suggestion: Suggestion) => void;
  slotLabel: string;
}

const RANK_STYLES = [
  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  'bg-zinc-400/15 text-zinc-500 dark:text-zinc-400 border border-zinc-400/30',
  'bg-orange-700/15 text-orange-700 dark:text-orange-500 border border-orange-700/30',
];

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  rank,
  isHovered,
  onHover,
  onApply,
  onDetail,
  slotLabel,
}) => {
  const block = suggestion.blockInstance;
  const hasClears = suggestion.linesCleared + suggestion.colsCleared > 0;

  return (
    <div
      className={cn(
        'p-3 rounded-md border cursor-pointer transition-all duration-150 animate-suggestion-in',
        rank === 1 && !isHovered && 'animate-glow-best',
        isHovered
          ? 'border-primary bg-primary/8 shadow-md scale-[1.01]'
          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30'
      )}
      onMouseEnter={() => onHover(suggestion)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onDetail?.(suggestion)}
    >
      <div className="flex items-start gap-2.5">
        {/* Badge de rang */}
        <div
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold',
            rank <= 3 ? RANK_STYLES[rank - 1] : 'bg-muted text-muted-foreground'
          )}
        >
          {rank === 1 ? <Trophy className="h-3.5 w-3.5" /> : `#${rank}`}
        </div>

        {/* Aperçu du bloc */}
        <div className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-md bg-muted/60">
          <BlockPreview
            definition={block.definition}
            color={block.color}
            rotation={block.rotation}
            flipped={block.flipped}
            cellSize={11}
          />
        </div>

        {/* Informations */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{block.definition.name}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1">{slotLabel}</Badge>
            {block.flipped && <Badge variant="secondary" className="text-[10px] h-4 px-1">↔</Badge>}
            {block.rotation !== 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">{block.rotation}°</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            L{suggestion.position.row + 1} · C{suggestion.position.col + 1}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-xs font-semibold text-primary">
                {suggestion.score > 0 ? '+' : ''}{suggestion.score}
              </span>
            </div>
            {hasClears && (
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                  {[
                    suggestion.linesCleared > 0 && `${suggestion.linesCleared}L`,
                    suggestion.colsCleared > 0 && `${suggestion.colsCleared}C`,
                  ].filter(Boolean).join('+')} libérée(s)
                </span>
              </div>
            )}
            {suggestion.comboLabel && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1.5 font-medium"
                style={{ maxWidth: '100%' }}
              >
                {suggestion.comboLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isHovered && 'text-primary')}
            title="Prévisualiser sur la grille"
            onClick={e => { e.stopPropagation(); onHover(isHovered ? null : suggestion); }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Détails et raisonnement"
            onClick={e => { e.stopPropagation(); onDetail?.(suggestion); }}
          >
            <span className="text-xs">🔍</span>
          </Button>
          {onApply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title="Appliquer ce placement"
              onClick={e => { e.stopPropagation(); onApply(suggestion); }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

interface SuggestionsPanelProps {
  suggestions: Record<number, Suggestion[]>;
  hand: Array<{ slot: number }>;
  isLoading?: boolean;
  hoveredSuggestion?: Suggestion | null;
  onHoverSuggestion: (suggestion: Suggestion | null) => void;
  onApplySuggestion?: (suggestion: Suggestion) => void;
  onSuggestionDetail?: (suggestion: Suggestion) => void;
}

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  suggestions,
  hand,
  isLoading,
  hoveredSuggestion,
  onHoverSuggestion,
  onApplySuggestion,
  onSuggestionDetail,
}) => {
  const allSuggestions: Array<{ suggestion: Suggestion; slot: number }> = [];
  Object.entries(suggestions).forEach(([slotStr, arr]) => {
    const slot = parseInt(slotStr);
    arr.forEach(s => allSuggestions.push({ suggestion: s, slot }));
  });
  allSuggestions.sort((a, b) => b.suggestion.score - a.suggestion.score);

  const totalCount = allSuggestions.length;
  const isEmpty = Object.keys(suggestions).length === 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-[76px] rounded-md bg-muted animate-pulse" />
        ))}
        <p className="text-xs text-center text-muted-foreground mt-1">
          Analyse en cours (look-ahead)…
        </p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-3">
        <Sparkles className="h-9 w-9 opacity-20" />
        <div>
          <p className="text-sm font-medium">Aucune analyse lancée</p>
          <p className="text-xs mt-1 text-pretty max-w-[200px] mx-auto">
            {hand.filter(s => s).length === 0
              ? 'Ajoutez vos blocs dans «\u00a0Ma main\u00a0» puis cliquez sur Analyser'
              : 'Cliquez sur Analyser pour obtenir les suggestions'}
          </p>
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <AlertTriangle className="h-9 w-9 text-warning opacity-60" />
        <div>
          <p className="text-sm font-medium text-foreground">Aucun placement possible</p>
          <p className="text-xs text-muted-foreground mt-1">
            La grille est trop remplie pour ces blocs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 pr-1 pb-2">
        {/* Meilleure suggestion mise en avant */}
        {allSuggestions.length > 0 && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            🏆 Meilleur coup
          </div>
        )}

        {allSuggestions.slice(0, 9).map(({ suggestion, slot }, index) => (
          <React.Fragment key={suggestion.id}>
            {index === 1 && (
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">
                Autres options ({totalCount - 1})
              </div>
            )}
            <SuggestionCard
              suggestion={suggestion}
              rank={index + 1}
              slotLabel={`Slot ${slot + 1}`}
              isHovered={hoveredSuggestion?.id === suggestion.id}
              onHover={onHoverSuggestion}
              onApply={onApplySuggestion}
              onDetail={onSuggestionDetail}
            />
          </React.Fragment>
        ))}

        <p className="text-[10px] text-muted-foreground text-center mt-1">
          Survolez une carte pour prévisualiser sur la grille
        </p>
      </div>
    </ScrollArea>
  );
};

export default SuggestionsPanel;
