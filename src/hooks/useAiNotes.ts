// ─── Hook : notes d'apprentissage IA ─────────────────────────────────────────
// Gère la liste de notes manuelles, les persiste en localStorage.
import { useState, useCallback, useEffect } from 'react';
import type { AiNote, AiNoteCategory } from '@/lib/aiNotes';
import { categorizeNote } from '@/lib/aiNotes';

const STORAGE_KEY = 'blockpuzzle_ai_notes';
const MAX_NOTES = 20;

function loadNotes(): AiNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AiNote[];
  } catch {
    return [];
  }
}

function saveNotes(notes: AiNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch { /* quota dépassé — ignorer */ }
}

export function useAiNotes() {
  const [notes, setNotes] = useState<AiNote[]>(loadNotes);

  // Persiste chaque fois que la liste change
  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const addNote = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const category: AiNoteCategory = categorizeNote(trimmed);
    const newNote: AiNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      active: true,
      createdAt: Date.now(),
      category,
    };
    setNotes(prev => [newNote, ...prev].slice(0, MAX_NOTES));
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const toggleNote = useCallback((id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, active: !n.active } : n));
  }, []);

  const clearAllNotes = useCallback(() => {
    setNotes([]);
  }, []);

  const activeCount = notes.filter(n => n.active).length;

  return { notes, addNote, removeNote, toggleNote, clearAllNotes, activeCount };
}
