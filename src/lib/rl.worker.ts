// Worker d'apprentissage par démonstration
// Enregistre les mouvements du joueur et retrouve les coups similaires

import { DemonstrationDB, findSimilarMoves, recordMove, extractSignature } from './rlEngine';
import type { DemonstratedMove } from './rlEngine';

let db = new DemonstrationDB();

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'load') {
    try {
      db = DemonstrationDB.deserialize(msg.data);
      self.postMessage({ type: 'loaded', count: db.count() }, undefined as any);
    } catch (err) {
      self.postMessage({ type: 'error', message: 'Échec chargement démonstrations' }, undefined as any);
    }
    return;
  }

  if (msg.type === 'save') {
    const json = db.serialize();
    self.postMessage({ type: 'saved', data: json, count: db.count() }, undefined as any);
    return;
  }

  if (msg.type === 'record' && msg.move) {
    const move = msg.move as DemonstratedMove;
    db.add(move);
    self.postMessage({ type: 'recorded', count: db.count() }, undefined as any);
    return;
  }

  if (msg.type === 'findSimilar' && msg.grid && msg.hand) {
    const topN = msg.topN ?? 5;
    const results = findSimilarMoves(db, msg.grid, msg.hand, topN);
    self.postMessage({ type: 'similar', results, count: db.count() }, undefined as any);
    return;
  }

  if (msg.type === 'clear') {
    db.clear();
    self.postMessage({ type: 'cleared' }, undefined as any);
    return;
  }

  if (msg.type === 'count') {
    self.postMessage({ type: 'count', count: db.count() }, undefined as any);
    return;
  }
};
