// ─── Panneau notes d'apprentissage IA ────────────────────────────────────────
// L'utilisateur rédige des instructions en langage naturel pour guider l'IA.
import React, { useState } from 'react';
import type { AiNote } from '@/lib/aiNotes';
import { NOTE_SUGGESTIONS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/lib/aiNotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, Trash2, ToggleLeft, ToggleRight, Lightbulb, BookOpen } from 'lucide-react';

interface AiNotesPanelProps {
  notes: AiNote[];
  activeCount: number;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onClearAll: () => void;
}

export const AiNotesPanel: React.FC<AiNotesPanelProps> = ({
  notes,
  activeCount,
  onAdd,
  onRemove,
  onToggle,
  onClearAll,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput('');
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (text: string) => {
    onAdd(text);
    setShowSuggestions(false);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">Plan d&apos;apprentissage IA</span>
        </div>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-4 text-primary border-primary/30">
              {activeCount} activ{activeCount > 1 ? 'es' : 'ée'}
            </Badge>
          )}
          {notes.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onClearAll}
              title="Effacer toutes les notes"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground leading-snug">
        Écrivez des instructions pour guider l&apos;IA. Elle adaptera ses suggestions
        selon vos préférences stratégiques.
      </p>

      {/* Formulaire d'ajout */}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ex : Priorise les coins…"
          className="h-8 text-xs flex-1 min-w-0 px-2"
        />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!input.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>

      {/* Bouton suggestions rapides */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground self-start px-2"
        onClick={() => setShowSuggestions(s => !s)}
      >
        <Lightbulb className="h-3 w-3" />
        Suggestions rapides
      </Button>

      {/* Liste de suggestions prédéfinies */}
      {showSuggestions && (
        <div className="flex flex-col gap-1 p-2 rounded-md border border-border bg-muted/30">
          {NOTE_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(s.text)}
              className="text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors text-foreground flex items-center gap-1.5"
            >
              <span>{CATEGORY_ICONS[s.category]}</span>
              <span>{s.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Liste des notes */}
      {notes.length === 0 ? (
        <div className="text-center py-4 text-[11px] text-muted-foreground">
          <p>Aucune note d&apos;apprentissage.</p>
          <p>Ajoutez votre première instruction ci-dessus.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
          {notes.map((note, index) => (
            <div
              key={note.id}
              className={cn(
                'flex items-start gap-2 p-2 rounded-md border transition-all duration-150',
                note.active
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/20 opacity-50'
              )}
            >
              {/* Numéro + icône */}
              <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5 w-4 text-right">
                {index + 1}.
              </span>
              <span className="shrink-0 mt-0.5" title={CATEGORY_LABELS[note.category]}>
                {CATEGORY_ICONS[note.category]}
              </span>
              {/* Texte */}
              <span className="flex-1 min-w-0 text-xs leading-snug text-foreground break-words">
                {note.text}
              </span>
              {/* Boutons toggle + supprimer */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onToggle(note.id)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title={note.active ? 'Désactiver cette note' : 'Activer cette note'}
                >
                  {note.active
                    ? <ToggleRight className="h-4 w-4 text-primary" />
                    : <ToggleLeft  className="h-4 w-4" />
                  }
                </button>
                <button
                  onClick={() => onRemove(note.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer cette note"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Résumé de l'effet sur l'IA */}
      {activeCount > 0 && (
        <div className="p-2 rounded-md bg-primary/5 border border-primary/20 text-[10px] text-primary leading-snug">
          🧠 L&apos;IA intègre <strong>{activeCount} instruction{activeCount > 1 ? 's' : ''}</strong> dans son scoring.
        </div>
      )}
    </div>
  );
};

export default AiNotesPanel;
