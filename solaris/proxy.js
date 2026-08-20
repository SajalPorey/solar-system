#!/usr/bin/env node
/**
 * proxy.js — SOLARIS local CORS proxy for the Anthropic API
 * ──────────────────────────────────────────────────────────
 * Forwards browser requests to api.anthropic.com, adding CORS
 * headers so the browser doesn't block the call.
 *
 * USAGE
 *   node proxy.js
 *
 * REQUIREMENTS
 *   Node.js 18+ (uses built-in fetch + http/https modules)
 *   No npm packages required.
 *
 * Then open the SOLARIS chat widget, paste your Anthropic API key,
 * and start asking questions.
 */

'use strict';

const http  = require('http');
const https = require('https');

const PORT = 3001;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
};

// ─── Simple logger ────────────────────────────────────────────────────────────

function log(msg) {
  const now = new Date().toISOString().slice(11, 19);  // HH:MM:SS
  console.log(`[${now}] ${msg}`);
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/claude') {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found — only POST /api/claude is handled.' }));
    return;
  }

  // Collect request body
  let rawBody = '';
  req.on('data', (chunk) => { rawBody += chunk; });

  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body.' }));
      return;
    }

    const { apiKey, model, maxTokens, system, messages } = payload;

    if (!apiKey) {
      res.writeHead(401, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No apiKey in request body.' }));
      return;
    }

    // Build upstream Anthropic request body
    const upstreamBody = JSON.stringify({
      model:      model      ?? 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens  ?? 300,
      system,
      messages,
    });

    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
        'content-length':    Buffer.byteLength(upstreamBody),
      },
    };

    log(`→ Anthropic (${model ?? 'haiku'}) — ${messages.length} message(s)`);

    const upstream = https.request(options, (upRes) => {
      let data = '';
      upRes.on('data', (chunk) => { data += chunk; });
      upRes.on('end', () => {
        log(`← HTTP ${upRes.statusCode}`);
        res.writeHead(upRes.statusCode, {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        });
        res.end(data);
      });
    });

    upstream.on('error', (err) => {
      log(`✗ Upstream error: ${err.message}`);
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Upstream error: ${err.message}` }));
    });

    upstream.write(upstreamBody);
    upstream.end();
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✦ SOLARIS Proxy running');
  console.log(`  ✦ Listening on http://localhost:${PORT}`);
  console.log('');
  console.log('  Open SOLARIS, click the AI button (bottom-right),');
  console.log('  and paste your Anthropic API key in the chat widget.');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
