import type { BlockDefinition } from '@/types/types';
import { BLOCK_CATALOG } from '@/data/blockCatalog';

const STORAGE_KEY = 'blockpuzzle_custom_blocks';
const LISTENER_KEY = 'block-catalog-changed';

type CatalogListener = () => void;
const listeners = new Set<CatalogListener>();

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LISTENER_KEY));
  }
}

function loadCustomBlocks(): BlockDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BlockDefinition[];
  } catch { /* ignore */ }
  return [];
}

function saveCustomBlocks(blocks: BlockDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

/**
 * Retourne tous les blocs (catalogue statique + blocs personnalisés).
 * Les blocs personnalisés écrasent ceux du catalogue statique s'ils ont le même id.
 */
export function getAllBlocks(): BlockDefinition[] {
  const custom = loadCustomBlocks();
  const customIds = new Set(custom.map(b => b.id));
  const staticFiltered = BLOCK_CATALOG.filter(b => !customIds.has(b.id));
  return [...staticFiltered, ...custom];
}

export function getBlocksBySeries(): Record<string, BlockDefinition[]> {
  const all = getAllBlocks();
  return all.reduce((acc, block) => {
    if (!acc[block.series]) acc[block.series] = [];
    acc[block.series].push(block);
    return acc;
  }, {} as Record<string, BlockDefinition[]>);
}

export function getBlockById(id: string): BlockDefinition | undefined {
  return getAllBlocks().find(b => b.id === id);
}

export function createBlock(block: Omit<BlockDefinition, 'size'> & { size?: number }): BlockDefinition {
  const custom = loadCustomBlocks();
  const size = block.size ?? block.shape.length;
  const newBlock: BlockDefinition = { ...block, size };
  if (custom.some(b => b.id === newBlock.id)) {
    throw new Error(`Un bloc avec l'id "${newBlock.id}" existe déjà`);
  }
  custom.push(newBlock);
  saveCustomBlocks(custom);
  notifyListeners();
  return newBlock;
}

export function updateBlock(id: string, updates: Partial<BlockDefinition> & { id?: string }): BlockDefinition {
  const custom = loadCustomBlocks();
  const idx = custom.findIndex(b => b.id === id);
  if (idx === -1) {
    throw new Error(`Bloc "${id}" introuvable dans les blocs personnalisés`);
  }
  custom[idx] = {
    ...custom[idx],
    ...updates,
    size: updates.shape?.length ?? updates.size ?? custom[idx].size,
  };
  saveCustomBlocks(custom);
  notifyListeners();
  return custom[idx];
}

export function deleteBlock(id: string): boolean {
  const custom = loadCustomBlocks();
  const filtered = custom.filter(b => b.id !== id);
  if (filtered.length === custom.length) return false;
  saveCustomBlocks(filtered);
  notifyListeners();
  return true;
}

export function isCustomBlock(id: string): boolean {
  return loadCustomBlocks().some(b => b.id === id);
}

/**
 * Importe des blocs depuis un tableau JSON.
 * Remplace ceux qui ont le même id.
 */
export function importBlocks(blocks: BlockDefinition[]): number {
  const custom = loadCustomBlocks();
  let count = 0;
  for (const block of blocks) {
    const idx = custom.findIndex(b => b.id === block.id);
    const entry: BlockDefinition = {
      ...block,
      size: block.shape?.length ?? block.size,
    };
    if (idx >= 0) {
      custom[idx] = entry;
    } else {
      custom.push(entry);
    }
    count++;
  }
  saveCustomBlocks(custom);
  notifyListeners();
  return count;
}

/**
 * Exporte tous les blocs (statiques + personnalisés) en JSON.
 */
export function exportAllBlocks(): BlockDefinition[] {
  return getAllBlocks();
}

/**
 * Exporte uniquement les blocs personnalisés.
 */
export function exportCustomBlocks(): BlockDefinition[] {
  return loadCustomBlocks();
}

/**
 * Souscrire aux changements du catalogue.
 * Retourne une fonction de désabonnement.
 */
export function subscribe(listener: CatalogListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
