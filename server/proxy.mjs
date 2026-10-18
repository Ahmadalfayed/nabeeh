#!/usr/bin/env node
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 8791);
const DEFAULT_BASE = (process.env.NABEEH_TARGET_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
const DEFAULT_KEY = process.env.NABEEH_API_KEY || '';
const CORS = process.env.NABEEH_CORS_ORIGIN || '*';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': CORS,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Target-Base',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

const ROUTES = {
  '/v1/chat/completions': '/chat/completions',
  '/v1/images/generations': '/images/generations',
  '/v1/models': '/models',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/' || u.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
      res.end(JSON.stringify({ ok: true, name: 'nabeeh-proxy', defaultBase: DEFAULT_BASE, keyConfigured: !!DEFAULT_KEY }));
      return;
    }
    const rel = ROUTES[u.pathname];
    if (!rel) {
      res.writeHead(404, corsHeaders());
      res.end('not found');
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const targetBase = (req.headers['x-target-base'] || DEFAULT_BASE).toString().replace(/\/$/, '');
    const key = (
      req.headers['x-api-key'] ||
      DEFAULT_KEY ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    ).toString();
    if (!key) {
      res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders() });
      res.end(JSON.stringify({ error: 'missing api key — set NABEEH_API_KEY or send X-Api-Key' }));
      return;
    }
    const url = targetBase + rel + u.search;
    const upstream = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    });
    const reader = upstream.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`نَبيه proxy → http://127.0.0.1:${PORT}`);
});
