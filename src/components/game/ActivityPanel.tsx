// Panneau de journal d'activités IA — affiche chaque opération background en temps réel
import React from 'react';
import { cn } from '@/lib/utils';
import type { ActivityEntry, ActivityStatus } from '@/hooks/useActivityLog';
import { Loader2, CheckCircle2, Zap, AlertCircle, Brain } from 'lucide-react';
import type { CacheStats } from '@/lib/aiCache';

interface ActivityPanelProps {
  entries: ActivityEntry[];
  cacheStats?: CacheStats;
  className?: string;
}

function statusIcon(status: ActivityStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />;
    case 'done':
      return <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />;
    case 'cached':
      return <Zap className="h-3 w-3 text-yellow-500 flex-shrink-0" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />;
  }
}

function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case 'running': return 'en cours…';
    case 'done':    return 'terminé';
    case 'cached':  return 'cache ⚡';
    case 'error':   return 'erreur';
  }
}

function statusColor(status: ActivityStatus): string {
  switch (status) {
    case 'running': return 'text-blue-500';
    case 'done':    return 'text-green-600 dark:text-green-400';
    case 'cached':  return 'text-yellow-600 dark:text-yellow-400';
    case 'error':   return 'text-destructive';
  }
}

function durationBadge(entry: ActivityEntry): string | null {
  if (entry.status === 'running') return null;
  if (entry.durationMs === undefined) return null;
  if (entry.durationMs < 1) return entry.status === 'cached' ? '< 1 ms' : null;
  return `${entry.durationMs} ms`;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ entries, cacheStats, className }) => {
  const hasRunning = entries.some(e => e.status === 'running');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* En-tête avec indicateur de cache global */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground">Journal IA</span>
          {hasRunning && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              calcul…
            </span>
          )}
        </div>
        {cacheStats && cacheStats.entries > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono shrink-0">
            <Zap className="h-2.5 w-2.5 text-yellow-500" />
            <span>
              {cacheStats.entries} entrées · {Math.round(cacheStats.hitRate * 100)}% hits
            </span>
          </div>
        )}
      </div>

      {/* Liste des activités */}
      {entries.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/60 italic py-1">
          Aucune activité — lancez une analyse
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className={cn(
                'flex items-start gap-1.5 px-2 py-1 rounded text-[11px] transition-opacity',
                idx === 0 ? 'bg-muted/40' : 'opacity-60 hover:opacity-80',
                entry.status === 'running' && 'bg-blue-500/5 opacity-100'
              )}
            >
              {statusIcon(entry.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-foreground truncate">{entry.label}</span>
                  <span className={cn('text-[10px] font-mono shrink-0', statusColor(entry.status))}>
                    {statusLabel(entry.status)}
                  </span>
                  {durationBadge(entry) && (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {durationBadge(entry)}
                    </span>
                  )}
                </div>
                {entry.detail && (
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {entry.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
