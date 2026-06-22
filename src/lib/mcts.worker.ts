import { generateMCSTSuggestions } from './mctsEngine';
import type { Grid, BlockInstance, Suggestion } from '@/types/types';
import type { UserHints } from '@/lib/aiNotes';
import type { MCTSConfig } from '@/lib/mctsEngine';
import type { SpaceProject } from '@/lib/spaceProjectEngine';

interface AnalyzeMessage {
  type: 'analyze';
  grid: Grid;
  hand: Array<BlockInstance | null>;
  hints: UserHints;
  config: Partial<MCTSConfig>;
  reservedCells?: string[];
  bossSlot?: number;
  spaceProject?: SpaceProject | null;
}

interface WorkerMessage extends AnalyzeMessage {}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  if (msg.type === 'analyze') {
    try {
      const { grid, hand, hints, config, reservedCells, bossSlot, spaceProject } = msg;
      const reservedSet = reservedCells ? new Set(reservedCells) : undefined;
      const result = generateMCSTSuggestions(grid, hand, hints, config, reservedSet, bossSlot, spaceProject ?? undefined);
      const total = Object.values(result).flat().length;
      const totalSims = Object.values(result).flat().reduce(
        (acc, s) => acc + (parseInt((s.comboLabel?.match(/(\d+) sims/) ?? ['0', '0'])[1]) || 0), 0
      );
      self.postMessage({ type: 'result', suggestions: result, totalSims, total }, undefined as any);
    } catch (err) {
      console.error('[MCTS Worker]', err);
      self.postMessage({ type: 'error', error: String(err) }, undefined as any);
    }
  }
};
