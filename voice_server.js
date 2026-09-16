#!/usr/bin/env node
// Local bridge for the native Android voice companion.
// The Android app sends recognized text here; Travis executes it through the same core.

const http = require('http');
const { handle } = require('./index');

const HOST = process.env.TRAVIS_VOICE_HOST || '127.0.0.1';
const PORT = Number(process.env.TRAVIS_VOICE_PORT || 8787);
const history = [];

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 32 * 1024) {
        reject(new Error('request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'travis' });
  if (req.method !== 'POST' || req.url !== '/voice') return send(res, 404, { ok: false, error: 'not found' });

  try {
    const data = await readJson(req);
    const text = String(data.text || '').trim();
    if (!text) return send(res, 400, { ok: false, error: 'missing text' });
    const reply = await handle(text, history);
    send(res, 200, { ok: true, text, reply });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Travis voice bridge ready at http://${HOST}:${PORT}`);
});
