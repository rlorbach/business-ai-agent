// Simple Express proxy to call OpenAI securely from a server environment.
// IMPORTANT: Do NOT put your API key in client-side code or chat messages.
// Set environment variable OPENAI_API_KEY before running: export OPENAI_API_KEY="sk-..."

const express = require('express');
const fetch = require('node-fetch');
const http = require('http');
const WebSocket = require('ws');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 8787;

app.use(express.json());

// Allow simple CORS for local testing (adjust for production)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AI Chat Widget Backend is running', endpoints: ['/api/llm', '/api/llm-stream', '/ws'] });
});

// Simple proxy auth middleware: require `Authorization: Bearer <PROXY_TOKEN>` or header `x-api-key`
function requireProxyAuth(req, res, next){
  const token = process.env.PROXY_TOKEN;
  if (!token) return res.status(500).json({ error: 'PROXY_TOKEN not configured on server' });
  const auth = (req.headers.authorization || '').trim();
  const headerKey = req.headers['x-api-key'] || '';
  if (auth.toLowerCase().startsWith('bearer ')){
    const v = auth.slice(7).trim();
    if (v === token) return next();
  }
  if (headerKey === token) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/llm', requireProxyAuth, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

    const { prompt, system } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt in request body' });

    // Basic proxy to Chat Completions endpoint
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system || 'You are an expert assistant that provides concise, actionable, and professional recommendations. For website requests return numbered technical improvements; for AI/business requests return numbered benefits tailored to the business type. Keep replies short and use numbered bullets when listing items. Avoid technical jargon and acronyms - use plain language that any business owner can understand.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600
      })
    });

    const data = await resp.json();
    // safe extraction
    const assistant = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? JSON.stringify(data);
    res.json({ assistant });
  } catch (err) {
    console.error('LLM proxy error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Streaming endpoint: forwards OpenAI streaming chunks to the HTTP client as plain text
app.post('/api/llm-stream', requireProxyAuth, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

    const { prompt, system } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt in request body' });

    // set headers for streaming plain text
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system || 'You are an expert assistant that provides concise, actionable, and professional recommendations. For website requests return numbered technical improvements; for AI/business requests return numbered benefits tailored to the business type. Keep replies short and use numbered bullets when listing items. Avoid technical jargon and acronyms - use plain language that any business owner can understand.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        stream: true
      })
    });

    if (!upstream.body) {
      res.end('');
      return;
    }

    // Relay chunks as they arrive
    let buffer = '';
    upstream.body.on('data', (chunk) => {
      try {
        buffer += chunk.toString('utf8');
        const parts = buffer.split('\n\n');
        // keep last partial piece in buffer
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          if (line.startsWith('data:')) {
            const data = line.replace(/^data:\s*/, '').trim();
            if (data === '[DONE]') {
              res.write('\n');
              res.end();
              return;
            }
            let parsed = null;
            try { parsed = JSON.parse(data); } catch (e) { parsed = null; }
            const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.text;
            if (delta) {
              res.write(delta);
            }
          }
        }
      } catch (err) {
        console.error('Streaming parse error', err);
      }
    });

    upstream.body.on('end', () => {
      res.end();
    });

    upstream.body.on('error', (err) => {
      console.error('Upstream stream error', err);
      try { res.end(); } catch (e) {}
    });

  } catch (err) {
    console.error('LLM stream proxy error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Create HTTP server and attach WebSocket server for lower latency streaming
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  try {
    // validate token via query param
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token || token !== process.env.PROXY_TOKEN) {
      ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    ws.on('message', async (msg) => {
      // expect JSON: { prompt, system }
      let body = null;
      try { body = JSON.parse(msg.toString()); } catch (e) { body = null; }
      if (!body || !body.prompt) return ws.send(JSON.stringify({ type: 'error', error: 'Missing prompt' }));

      const prompt = body.prompt;
      const system = body.system || 'You are an expert assistant that provides concise, actionable, and professional recommendations. For website requests return numbered technical improvements; for AI/business requests return numbered benefits tailored to the business type. Avoid technical jargon and acronyms - use plain language that any business owner can understand.';

      try {
        // Call the newer Responses API (preferred) with streaming
        const upstream = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: prompt,
            // include system as metadata that the model can use
            // keep streaming for progressive output
            stream: true
          })
        });

        if (!upstream.body) {
          ws.send(JSON.stringify({ type: 'done' }));
          return;
        }

        let buffer = '';
        upstream.body.on('data', (chunk) => {
          try {
            buffer += chunk.toString('utf8');
            const parts = buffer.split('\n\n');
            buffer = parts.pop();
            for (const part of parts) {
              const line = part.trim();
              if (!line) continue;
              if (line.startsWith('data:')) {
                const data = line.replace(/^data:\s*/, '').trim();
                if (data === '[DONE]') {
                  ws.send(JSON.stringify({ type: 'done' }));
                  continue;
                }
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { parsed = null; }
                // Responses API streaming JSON may include output chunks in different shapes
                const text = parsed?.output?.[0]?.content?.map(c=>c?.text || c?.value || '').join('')
                          || parsed?.choices?.[0]?.delta?.content
                          || parsed?.choices?.[0]?.text
                          || '';
                if (text) ws.send(JSON.stringify({ type: 'delta', text }));
              }
            }
          } catch (err) { console.error('WS stream parse error', err); }
        });

        upstream.body.on('end', () => {
          ws.send(JSON.stringify({ type: 'done' }));
        });

        upstream.body.on('error', (err) => {
          console.error('Upstream responses stream error', err);
          ws.send(JSON.stringify({ type: 'error', error: String(err) }));
        });

      } catch (err) {
        console.error('WS handler error', err);
        try { ws.send(JSON.stringify({ type: 'error', error: String(err) })); } catch(e){ }
      }
    });

  } catch (err) {
    console.error('WS connection error', err);
    try { ws.close(1011, 'Server error'); } catch(e){}
  }
});

server.listen(port, ()=>{
  console.log(`LLM proxy (HTTP+WS) listening on http://localhost:${port}`);
});
