// ─── Notes d'apprentissage IA ─────────────────────────────────────────────────
// L'utilisateur écrit des instructions en langage naturel (français) pour
// guider les décisions de l'IA. Ces notes sont parsées en "hints" de scoring.

export interface AiNote {
  id: string;
  text: string;        // texte libre de l'utilisateur
  active: boolean;     // peut être désactivée sans être supprimée
  createdAt: number;   // timestamp
  category: AiNoteCategory;
}

export type AiNoteCategory =
  | 'placement'   // stratégie de placement (coins, bords, centre…)
  | 'ligne'       // priorité sur les lignes
  | 'colonne'     // priorité sur les colonnes
  | 'boss'        // comportement du bloc Boss
  | 'custom';     // note libre non reconnue

/**
 * Résumé des préférences extraites de l'ensemble des notes actives.
 * Transmis à scoreCandidate pour biaiser le scoring IA.
 */
export interface UserHints {
  preferCorners: boolean;    // "coin", "corner"
  preferEdges: boolean;      // "bord", "edge", "bordure"
  avoidCenter: boolean;      // "évite centre", "avoid center"
  preferRows: boolean;       // "ligne", "row", "lignes d'abord"
  preferCols: boolean;       // "colonne", "col", "colonnes d'abord"
  preferDense: boolean;      // "dense", "compact", "groupé"
  avoidSparse: boolean;      // "évite vide", "pas d'isolé", "compact"
  cornerBonusMultiplier: number;  // 1.0 = neutre, >1.0 = boost coins
  rowBonusMultiplier: number;
  colBonusMultiplier: number;
  densityBonusMultiplier: number;
  hasCustomHints: boolean;
}

export const DEFAULT_HINTS: UserHints = {
  preferCorners: false,
  preferEdges: false,
  avoidCenter: false,
  preferRows: false,
  preferCols: false,
  preferDense: false,
  avoidSparse: false,
  cornerBonusMultiplier: 1.0,
  rowBonusMultiplier: 1.0,
  colBonusMultiplier: 1.0,
  densityBonusMultiplier: 1.0,
  hasCustomHints: false,
};

// ─── Parseur de mots-clés ─────────────────────────────────────────────────────

const CORNER_KEYWORDS = ['coin', 'corner', 'angle', 'coins'];
const EDGE_KEYWORDS   = ['bord', 'bordure', 'edge', 'bords', 'périphérie', 'limite'];
const CENTER_KEYWORDS_AVOID = ['évite centre', 'avoid center', 'pas au centre', 'éviter centre', 'loin du centre'];
const ROW_KEYWORDS    = ['ligne', 'lignes', 'row', 'rows', 'ligne d\'abord', 'lignes d\'abord', 'priorité lignes'];
const COL_KEYWORDS    = ['colonne', 'colonnes', 'col', 'cols', 'colonne d\'abord', 'colonnes d\'abord', 'priorité colonnes'];
const DENSE_KEYWORDS  = ['dense', 'compact', 'groupé', 'compacte', 'serré', 'regroupé'];
const SPARSE_AVOID    = ['évite vide', 'pas isolé', 'sans isolé', 'éviter isolé', 'pas d\'espace'];

/**
 * Détermine la catégorie d'une note par son texte.
 */
export function categorizeNote(text: string): AiNoteCategory {
  const lower = text.toLowerCase();
  if (CORNER_KEYWORDS.some(k => lower.includes(k)) || EDGE_KEYWORDS.some(k => lower.includes(k))) return 'placement';
  if (ROW_KEYWORDS.some(k => lower.includes(k))) return 'ligne';
  if (COL_KEYWORDS.some(k => lower.includes(k))) return 'colonne';
  if (lower.includes('boss') || lower.includes('dernier recours')) return 'boss';
  return 'custom';
}

/**
 * Parse toutes les notes actives et retourne un UserHints agrégé.
 */
export function parseNotesToHints(notes: AiNote[]): UserHints {
  const active = notes.filter(n => n.active);
  if (active.length === 0) return DEFAULT_HINTS;

  const hints: UserHints = { ...DEFAULT_HINTS };
  hints.hasCustomHints = true;

  for (const note of active) {
    const lower = note.text.toLowerCase();

    if (CORNER_KEYWORDS.some(k => lower.includes(k))) {
      hints.preferCorners = true;
      hints.cornerBonusMultiplier = Math.min(3.0, hints.cornerBonusMultiplier + 0.8);
    }
    if (EDGE_KEYWORDS.some(k => lower.includes(k))) {
      hints.preferEdges = true;
      hints.cornerBonusMultiplier = Math.min(2.5, hints.cornerBonusMultiplier + 0.5);
    }
    if (CENTER_KEYWORDS_AVOID.some(k => lower.includes(k))) {
      hints.avoidCenter = true;
    }
    if (ROW_KEYWORDS.some(k => lower.includes(k))) {
      hints.preferRows = true;
      hints.rowBonusMultiplier = Math.min(3.0, hints.rowBonusMultiplier + 0.6);
    }
    if (COL_KEYWORDS.some(k => lower.includes(k))) {
      hints.preferCols = true;
      hints.colBonusMultiplier = Math.min(3.0, hints.colBonusMultiplier + 0.6);
    }
    if (DENSE_KEYWORDS.some(k => lower.includes(k))) {
      hints.preferDense = true;
      hints.densityBonusMultiplier = Math.min(2.5, hints.densityBonusMultiplier + 0.5);
    }
    if (SPARSE_AVOID.some(k => lower.includes(k))) {
      hints.avoidSparse = true;
      hints.densityBonusMultiplier = Math.min(2.5, hints.densityBonusMultiplier + 0.4);
    }
  }

  return hints;
}

// ─── Icônes par catégorie ─────────────────────────────────────────────────────
export const CATEGORY_ICONS: Record<AiNoteCategory, string> = {
  placement: '📍',
  ligne:     '↔',
  colonne:   '↕',
  boss:      '👑',
  custom:    '🔧',
};

export const CATEGORY_LABELS: Record<AiNoteCategory, string> = {
  placement: 'Placement',
  ligne:     'Lignes',
  colonne:   'Colonnes',
  boss:      'Boss',
  custom:    'Personnalisé',
};

// ─── Suggestions prédéfinies ──────────────────────────────────────────────────
export const NOTE_SUGGESTIONS: { text: string; category: AiNoteCategory }[] = [
  { text: 'Priorise les coins pour maximiser les combos',      category: 'placement' },
  { text: 'Colle les blocs aux bords de la grille',            category: 'placement' },
  { text: 'Évite le centre de la grille',                      category: 'placement' },
  { text: 'Priorise la complétion des lignes horizontales',     category: 'ligne'     },
  { text: 'Priorise la complétion des colonnes verticales',     category: 'colonne'   },
  { text: 'Garde les blocs compacts et groupés',               category: 'placement' },
  { text: 'Évite de laisser des cases isolées',                category: 'placement' },
];
