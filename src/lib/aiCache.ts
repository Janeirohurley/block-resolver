// ─── Cache IA — Apprentissage automatisé ─────────────────────────────────────
// Évite de recalculer ce qu'on connaît déjà.
// Clé de cache = empreinte compacte de la grille + identifiants des blocs.
// Le cache survit aux re-renders mais est réinitialisé entre les sessions (mémoire).

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number; // 0-1
}

// Taille maximale du cache (entrées LRU)
const MAX_CACHE_SIZE = 256;

// Structure interne d'une entrée de cache
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private stats = { hits: 0, misses: 0 };

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    // Refresh LRU order
    this.map.delete(key);
    entry.hits++;
    this.map.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= MAX_CACHE_SIZE) {
      // Éviction de l'entrée la plus ancienne (premier élément de la Map)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { value, timestamp: Date.now(), hits: 0 });
  }

  clear(): void {
    this.map.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.map.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  get size(): number { return this.map.size; }
}

// ─── Instances globales ───────────────────────────────────────────────────────

/** Cache pour computeBossReservation */
export const bossCache = new LRUCache<unknown>();

/** Cache pour generateSuggestions */
export const suggestionsCache = new LRUCache<unknown>();

/** Cache pour suggestNextBlocks */
export const nextBlocksCache = new LRUCache<unknown>();

/** Cache pour canBlockBePlaced (résultats par bloc+grille) */
export const placabilityCache = new LRUCache<boolean>();

/** Cache pour suggestOneBlock (shuffle) */
export const oneBlockCache = new LRUCache<unknown>();

// ─── Fonctions d'empreinte ────────────────────────────────────────────────────

/**
 * Génère une empreinte compacte et déterministe d'une grille booléenne.
 * Encode chaque ligne en valeur numérique (8 bits = 1 octet).
 * Beaucoup plus rapide que JSON.stringify.
 */
export function gridFingerprint(grid: boolean[][]): string {
  // Chaque ligne → un nombre 0-255 (8 cases = 8 bits)
  return grid.map(row =>
    row.reduce((acc, cell, i) => acc | (cell ? 1 << i : 0), 0).toString(36)
  ).join(',');
}

/**
 * Empreinte d'un bloc : id + rotation + flip.
 */
export function blockFingerprint(blockId: string, rotation: number, flipped: boolean, color: string): string {
  return `${blockId}:${rotation}:${flipped ? 1 : 0}:${color}`;
}

/**
 * Clé composite pour une main complète + grille + mémoire résumée.
 */
export function handGridKey(
  gridFp: string,
  handIds: Array<string | null>,
  memoryHash: string
): string {
  return `${gridFp}|${handIds.join(',')}|${memoryHash}`;
}

/**
 * Résume la mémoire contextuelle en une chaîne compacte.
 */
export function memoryFingerprint(memory: Array<{ lines: number[]; cols: number[]; turn: number }>): string {
  if (memory.length === 0) return '';
  return memory.map(m => `${m.lines.join('-')}x${m.cols.join('-')}@${m.turn}`).join(';');
}

// ─── Réinitialisation globale ─────────────────────────────────────────────────

export function clearAllCaches(): void {
  bossCache.clear();
  suggestionsCache.clear();
  nextBlocksCache.clear();
  placabilityCache.clear();
  oneBlockCache.clear();
}

export function getAllCacheStats(): { boss: CacheStats; suggestions: CacheStats; nextBlocks: CacheStats; placability: CacheStats; oneBlock: CacheStats; combined: CacheStats } {
  const b = bossCache.getStats();
  const s = suggestionsCache.getStats();
  const n = nextBlocksCache.getStats();
  const p = placabilityCache.getStats();
  const o = oneBlockCache.getStats();
  const totalHits = b.hits + s.hits + n.hits + p.hits + o.hits;
  const totalMisses = b.misses + s.misses + n.misses + p.misses + o.misses;
  const totalEntries = b.entries + s.entries + n.entries + p.entries + o.entries;
  return {
    boss: b,
    suggestions: s,
    nextBlocks: n,
    placability: p,
    oneBlock: o,
    combined: {
      hits: totalHits,
      misses: totalMisses,
      entries: totalEntries,
      hitRate: (totalHits + totalMisses) > 0 ? totalHits / (totalHits + totalMisses) : 0,
    },
  };
}
