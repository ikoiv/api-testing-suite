import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Deliberately local-only demo credentials, not a production authentication design.
export const DEMO_TOKEN = 'local-lab-token';
// Exporting a factory lets tests create a fresh service without launching a CLI process.
export function createServer({ serveUI = false } = {}) {
  // Each server owns its data; restarting it intentionally clears this demo store.
  const tasks = new Map();
  let nextId = 1;
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Readiness is public so the test runner can wait for startup without credentials.
    if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
    if (serveUI && url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('./index.html', import.meta.url)));
    }
    if (!/^\/tasks(?:\/\d+)?$/.test(url.pathname)) return send(res, 404, { error: 'Not found' });
    // Reject unauthorized calls before parsing input or touching stored tasks.
    if (req.headers.authorization !== `Bearer ${DEMO_TOKEN}`) return send(res, 401, { error: 'Unauthorized' });
    const id = Number(url.pathname.split('/')[2]);
    const isCollection = url.pathname === '/tasks';
    let body;
    // Parse only write payloads, with a small cap so the lab cannot buffer unlimited input.
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Expected application/json' });
      try {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 8192) return send(res, 413, { error: 'Body too large' });
        }
        body = JSON.parse(raw);
      } catch { return send(res, 400, { error: 'Invalid JSON' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 422, { error: 'Expected an object' });
    }
    if (isCollection && req.method === 'GET') return send(res, 200, [...tasks.values()]);
    if (isCollection && req.method === 'POST') {
      // Normalize once at the API boundary; the UI must not be the only validator.
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120)
        return send(res, 422, { error: 'Title must contain 1–120 characters' });
      if (Object.keys(body).some(key => key !== 'title')) return send(res, 422, { error: 'Unknown field' });
      const task = { id: nextId++, title: body.title.trim(), completed: false };
      tasks.set(task.id, task);
      res.setHeader('Location', `/tasks/${task.id}`);
      return send(res, 201, task);
    }
    if (!isCollection && ['GET', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!tasks.has(id)) return send(res, 404, { error: 'Task not found' });
      if (req.method === 'GET') return send(res, 200, tasks.get(id));
      if (req.method === 'DELETE') { tasks.delete(id); return send(res, 204); }
      // Restrict PATCH to completion changes so callers cannot silently overwrite titles.
      if (Object.keys(body).length !== 1 || typeof body.completed !== 'boolean')
        return send(res, 422, { error: 'Only a boolean completed field is accepted' });
      const task = { ...tasks.get(id), completed: body.completed };
      tasks.set(id, task);
      return send(res, 200, task);
    }
    return send(res, 405, { error: 'Method not allowed' });
  });
}
// Importing this module does not open a port; only direct execution starts the demo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, '127.0.0.1', () => console.log(`Local lab: http://127.0.0.1:${port}`));
}
