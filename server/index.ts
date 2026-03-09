import express from 'express';
import { db } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

app.use(express.json({ limit: '50mb' }));

// ── Health check (used by Cloud Run) ─────────────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'prism-ai' }));

// ── Projects ─────────────────────────────────────────────────────────────────
app.get('/api/projects', (_req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/projects', (req, res) => {
  const { name, brandVoice = 'Professional & Creative' } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(
    'INSERT INTO projects (name, brand_voice, created_at) VALUES (?, ?, ?)'
  ).run(name, brandVoice, Date.now());
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Media items ───────────────────────────────────────────────────────────────
app.get('/api/media', (req, res) => {
  const { projectId } = req.query;
  const rows = projectId
    ? db.prepare('SELECT * FROM media WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    : db.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/media', (req, res) => {
  const { projectId = null, type, url, prompt } = req.body ?? {};
  if (!type || !url || !prompt) return res.status(400).json({ error: 'type, url and prompt are required' });
  const result = db.prepare(
    'INSERT INTO media (project_id, type, url, prompt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, type, url, prompt, Date.now());
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/media/:id', (req, res) => {
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Storyboards ───────────────────────────────────────────────────────────────
app.get('/api/storyboards', (req, res) => {
  const { projectId } = req.query;
  const rows = projectId
    ? db.prepare('SELECT * FROM storyboards WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    : db.prepare('SELECT * FROM storyboards ORDER BY created_at DESC').all();
  res.json(rows.map((r: any) => ({ ...r, parts: JSON.parse(r.parts) })));
});

app.post('/api/storyboards', (req, res) => {
  const { projectId = null, title, brandVoice = 'Professional & Creative', parts = [] } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(
    'INSERT INTO storyboards (project_id, title, brand_voice, parts, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, title, brandVoice, JSON.stringify(parts), Date.now());
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/storyboards/:id', (req, res) => {
  db.prepare('DELETE FROM storyboards WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── SPA fallback (serves Vite build) ─────────────────────────────────────────
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Prism AI] Server listening on http://0.0.0.0:${PORT}`);
  console.log(`[Prism AI] Environment: ${process.env.NODE_ENV || 'development'}`);
});
