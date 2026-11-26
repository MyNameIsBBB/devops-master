// Tiny keyword search over kb/*.md. No model calls; returns the best matching sections.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kb');
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'is', 'how', 'what', 'my', 'do', 'i', 'and', 'or', 'for', 'on', 'it', 'be', 'with', 'can', 'why', 'does']);

export function loadKb(dir = KB_DIR) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const tags = (text.match(/^Tags:\s*(.*)$/m)?.[1] || '').split(/[,\s]+/).filter(Boolean).map(t => t.toLowerCase());
    return { file: f, title: text.match(/^# (.*)$/m)?.[1] ?? f, tags, body: text };
  });
}

export function ask(question, dir) {
  const words = question.toLowerCase().match(/[a-z0-9.\-_/]+/g)?.filter(w => !STOP.has(w) && w.length > 1) ?? [];
  if (!words.length) return [];
  return loadKb(dir).map(doc => {
    let score = 0;
    const hay = (doc.title + ' ' + doc.body).toLowerCase();
    for (const w of words) {
      if (doc.tags.includes(w)) score += 3;
      else if (doc.tags.some(t => t.startsWith(w) || w.startsWith(t))) score += 2;
      if (hay.includes(w)) score += 1;
    }
    return { ...doc, score };
  }).filter(d => d.score >= 3).sort((a, b) => b.score - a.score);  // require a real tag hit, not a substring
}
