import React from 'react';
import type { Suggestion } from '@/types/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BlockPreview } from '@/components/game/BlockPreview';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Layers, Trophy, AlertTriangle } from 'lucide-react';

interface SuggestionDetailModalProps {
  suggestion: Suggestion | null;
  slotLabel: string;
  rank: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SYMBOL_LEGEND: Record<string, { label: string; description: string }> = {
  '🏗️': { label: 'Construction périphérique', description: 'Ce coup remplit des cellules dans les lignes/colonnes cibles du Boss, renforçant la structure sans déclencher d\'effacement.' },
  '💣': { label: 'Activation Boss', description: 'Placement du Boss pour déclencher les lignes/colonnes préparées autour de lui.' },
  '⚠️': { label: 'Destruction prématurée', description: 'Ce coup efface des lignes/colonnes qui étaient préparées pour le Boss. À éviter si possible.' },
  '🚫': { label: 'Boss bloqué', description: 'Après ce placement, le Boss ne peut plus être placé nulle part. C\'est un coup très risqué.' },
  '🎯': { label: 'Simulation MCTS', description: 'Pourcentage de l\'arbre de recherche exploré depuis ce nœud. Plus le pourcentage est élevé, plus l\'IA a confiance.' },
  '📊': { label: 'Progression', description: 'Taux de remplissage des lignes/colonnes cibles du Boss (0-100%).' },
  '🔄': { label: 'Flexibilité', description: 'Ce coup préserve ou augmente les options de placement futures.' },
  '📈': { label: 'Progression Boss', description: 'Ce coup augmente le nombre de placements possibles pour le Boss.' },
};

const ICON_LEGEND: Record<string, { label: string; description: string }> = {
  '🏆': { label: 'Meilleur coup', description: 'Premier classement — score le plus élevé selon l\'IA.' },
  'Trophy': { label: 'Rang #1', description: 'Meilleure suggestion selon le score combiné.' },
  'Sparkles': { label: 'Score', description: 'Score total estimé de ce placement (immédiat + futur projeté). Plus le chiffre est élevé, meilleur est le coup.' },
  'Layers': { label: 'Lignes/Cols effacées', description: 'Nombre de lignes (L) et colonnes (C) complètes qui seront supprimées par ce placement.' },
  'Eye': { label: 'Prévisualiser', description: 'Affiche le placement sur la grille sans l\'appliquer.' },
};

export const SuggestionDetailModal: React.FC<SuggestionDetailModalProps> = ({
  suggestion,
  slotLabel,
  rank,
  open,
  onOpenChange,
}) => {
  if (!suggestion) return null;

  const block = suggestion.blockInstance;
  const hasClears = suggestion.linesCleared + suggestion.colsCleared > 0;
  const detailItems = suggestion.reasoning?.details ?? [];
  const scoreItems = suggestion.reasoning?.scoreBreakdown ?? [];
  const summary = suggestion.reasoning?.summary ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={rank === 1 ? 'text-yellow-500' : 'text-muted-foreground'}>
              {rank === 1 ? <Trophy className="h-4 w-4" /> : `#${rank}`}
            </span>
            {block.definition.name}
            <Badge variant="outline" className="text-[10px] h-4 px-1">{slotLabel}</Badge>
            {block.flipped && <Badge variant="secondary" className="text-[10px] h-4 px-1">↔</Badge>}
            {block.rotation !== 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{block.rotation}°</Badge>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            L{block.definition.shape[0]?.[0] !== undefined ? suggestion.position.row + 1 : '?'} · C{suggestion.position.col + 1}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-2">
          <div className="flex flex-col gap-4">
            {/* Aperçu du bloc */}
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
              <div className="w-14 h-14 flex items-center justify-center rounded-md bg-muted/60">
                <BlockPreview
                  definition={block.definition}
                  color={block.color}
                  rotation={block.rotation}
                  flipped={block.flipped}
                  cellSize={14}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{block.definition.name}</span> ({block.definition.size} cellules)
                <br />Série {block.definition.series} · {block.definition.id}
                <br />Rotation {block.rotation}° · {block.flipped ? 'Miroir' : 'Normal'}
              </div>
            </div>

            {/* Résumé */}
            {summary && (
              <div className="p-3 rounded-md bg-primary/5 border border-primary/10 text-sm leading-relaxed">
                {summary}
              </div>
            )}

            {/* Détails */}
            {detailItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Détails du raisonnement
                </h4>
                <div className="flex flex-col gap-1.5">
                  {detailItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/30">
                      <span className="flex-shrink-0 text-sm">{item.icon}</span>
                      <div>
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className="text-muted-foreground"> : {item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score breakdown */}
            {scoreItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Décomposition du score
                </h4>
                <div className="flex flex-col gap-1">
                  {scoreItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-1.5">
                        <span>{item.icon}</span>
                        <span className="text-muted-foreground">{item.label}</span>
                      </div>
                      <span className={`font-mono font-semibold ${item.value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {item.value > 0 ? '+' : ''}{item.value}
                      </span>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="flex items-center justify-between text-xs p-2 rounded-md bg-primary/5 border border-primary/10 mt-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold text-foreground">Score total</span>
                    </div>
                    <span className="font-mono font-bold text-primary">
                      {suggestion.score > 0 ? '+' : ''}{suggestion.score}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Effacement */}
            {hasClears && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/5 border border-yellow-500/20">
                <Layers className="h-4 w-4 text-yellow-500" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">
                  Efface {suggestion.linesCleared} ligne{suggestion.linesCleared > 1 ? 's' : ''}
                  {suggestion.linesCleared > 0 && suggestion.colsCleared > 0 ? ' + ' : ''}
                  {suggestion.colsCleared} colonne{suggestion.colsCleared > 1 ? 's' : ''}
                  {' '}→ {suggestion.cellsFreed} cellules libérées
                </span>
              </div>
            )}

            {/* Légende des symboles */}
            <div className="border-t pt-3 mt-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Légende des symboles
              </h4>
              <div className="flex flex-col gap-1.5">
                {Object.entries(SYMBOL_LEGEND).map(([icon, info]) => (
                  <div key={icon} className="flex items-start gap-2 text-[11px]">
                    <span className="flex-shrink-0">{icon}</span>
                    <div>
                      <span className="font-medium text-foreground">{info.label}</span>
                      <span className="text-muted-foreground"> : {info.description}</span>
                    </div>
                  </div>
                ))}
                {Object.entries(ICON_LEGEND).map(([key, info]) => (
                  <div key={key} className="flex items-start gap-2 text-[11px]">
                    <span className="flex-shrink-0 w-4 text-center">{/* icon from lucide, skip inline */}</span>
                    <div>
                      <span className="font-medium text-foreground">{info.label}</span>
                      <span className="text-muted-foreground"> : {info.description}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Le score total combine tous les composants ci-dessus. Un score négatif indique un coup risqué.
                Privilégie les suggestions avec le score le plus élevé et 🔄 (flexibilité).
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default SuggestionDetailModal;
