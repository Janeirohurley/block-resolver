// Hook de journal d'activités IA — suivi en temps réel de chaque opération background
import { useState, useCallback, useRef } from 'react';

export type ActivityStatus = 'running' | 'done' | 'cached' | 'error';

export interface ActivityEntry {
  id: string;
  label: string;         // Texte court affiché
  detail?: string;       // Détail optionnel (ex: "depuis cache", "3 suggestions")
  status: ActivityStatus;
  startedAt: number;     // timestamp ms
  durationMs?: number;   // rempli quand status = done|cached|error
}

const MAX_LOG = 8; // garder les N dernières activités visibles

export function useActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const counterRef = useRef(0);

  /** Démarre une activité → retourne son id pour la terminer ensuite */
  const startActivity = useCallback((label: string, detail?: string): string => {
    const id = `act-${++counterRef.current}`;
    const entry: ActivityEntry = {
      id,
      label,
      detail,
      status: 'running',
      startedAt: Date.now(),
    };
    setEntries(prev => {
      const next = [entry, ...prev];
      return next.slice(0, MAX_LOG);
    });
    return id;
  }, []);

  /** Termine une activité avec son statut final */
  const finishActivity = useCallback((
    id: string,
    status: Exclude<ActivityStatus, 'running'>,
    detail?: string
  ) => {
    setEntries(prev =>
      prev.map(e => e.id === id
        ? { ...e, status, detail: detail ?? e.detail, durationMs: Date.now() - e.startedAt }
        : e
      )
    );
  }, []);

  /** Raccourci : enregistre une activité déjà terminée (ex: résultat depuis cache) */
  const logInstant = useCallback((
    label: string,
    status: Exclude<ActivityStatus, 'running'>,
    detail?: string
  ) => {
    const id = `act-${++counterRef.current}`;
    const entry: ActivityEntry = {
      id,
      label,
      detail,
      status,
      startedAt: Date.now(),
      durationMs: 0,
    };
    setEntries(prev => [entry, ...prev].slice(0, MAX_LOG));
  }, []);

  const clearLog = useCallback(() => setEntries([]), []);

  return { entries, startActivity, finishActivity, logInstant, clearLog };
}
