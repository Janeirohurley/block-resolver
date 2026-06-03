// Barre d'outils de la grille: couleur sélectionnée, effacer, etc.
import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Eraser, Trash2, Grid, Lightbulb, Brain } from 'lucide-react';

interface GridToolbarProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  mode: 'paint' | 'erase';
  onModeChange: (mode: 'paint' | 'erase') => void;
  onClearGrid: () => void;
  occupiedCount: number;
  onAnalyze: () => void;
  isAnalyzing?: boolean;
  learningMode?: boolean;
  learningCount?: number;
}

export const GridToolbar: React.FC<GridToolbarProps> = ({
  selectedColor,
  onColorChange,
  mode,
  onModeChange,
  onClearGrid,
  occupiedCount,
  onAnalyze,
  isAnalyzing,
  learningMode,
  learningCount,
}) => {
  const { theme } = useTheme();

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode peinture / effacement */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => onModeChange('paint')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5',
              mode === 'paint'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            <div
              className="w-3 h-3 rounded-sm border border-current"
              style={{ backgroundColor: mode === 'paint' ? 'currentColor' : selectedColor }}
            />
            Peindre
          </button>
          <button
            type="button"
            onClick={() => onModeChange('erase')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5',
              mode === 'erase'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            <Eraser className="h-3 w-3" />
            Effacer
          </button>
        </div>

        {/* Color picker */}
        {mode === 'paint' && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {theme.blockColors.map((color, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onColorChange(color)}
                      className={cn(
                        'w-6 h-6 rounded-sm border-2 transition-all',
                        selectedColor === color
                          ? 'border-foreground scale-110 shadow-md'
                          : 'border-transparent hover:scale-105'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Couleur {i + 1}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <input
              type="color"
              value={selectedColor}
              onChange={e => onColorChange(e.target.value)}
              className="w-7 h-7 rounded-sm cursor-pointer border border-border bg-transparent"
              title="Couleur personnalisée"
            />
          </div>
        )}

        {/* Compteur de cases */}
        <Badge variant="secondary" className="text-xs font-mono ml-auto">
          {occupiedCount}/64
        </Badge>

        {/* Vider la grille */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onClearGrid}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Effacer toute la grille</p>
          </TooltipContent>
        </Tooltip>

        {/* Mode apprentissage */}
        {learningMode && (
          <Badge variant="outline" className="text-[10px] flex items-center gap-1 h-6 text-purple-500 border-purple-400/40 bg-purple-500/5">
            <Brain className="h-3 w-3" />
            Apprentissage {learningCount !== undefined ? `(${learningCount})` : ''}
          </Badge>
        )}

        {/* Analyser */}
        <Button
          size="sm"
          onClick={onAnalyze}
          disabled={isAnalyzing || learningMode}
          className="flex items-center gap-1.5"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          {isAnalyzing ? 'Analyse...' : learningMode ? 'Analyse désactivée' : 'Analyser'}
        </Button>
      </div>
    </TooltipProvider>
  );
};

export default GridToolbar;
