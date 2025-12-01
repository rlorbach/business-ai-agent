# Chat Widget Demo

Files added:
- `index.html` — demo page with the embedded widget
- `styles.css` — widget styles
- `widget.js` — conversation state machine implementing the flowchart

What this implements
- Initial prompt: "Website" or "AI"
- Website path: asks how long since site built (Never, 10+, 5-10, 1-5 years), gives tailored improvement suggestions, then offers contact CTA
- AI path: asks type of business, returns a list of benefits tailored by simple keyword matching, then offers contact CTA

How to try locally
1. Open `index.html` in a browser (double-click or `open index.html`).
2. Click the "AI Assistant" toggle at the bottom-right to start the flow.

Embedding on your site
Copy the `styles.css` and `widget.js` into your site and insert the HTML block from `index.html` where appropriate (or lazy-load using an iframe). For a production integration, replace the contact form console.log in `widget.js` with an API POST to your backend.

Backend LLM integration (secure)
- A small Node proxy is included at `server.js` to securely call OpenAI from your server. It does NOT contain your key.
- Do NOT paste your OpenAI key into client-side code or into chat messages. If you already pasted a key in public or chat, revoke it and create a new one.

Quick setup for the proxy
1. Copy `.env.example` to `.env` or set environment variables directly.
2. Install dependencies and run the server:

```bash
cd chat-widget
npm install
npm start
```

3. Enable backend usage in the widget by setting `window.USE_LLM = true` from the page (or update your embed to set this flag). The widget will POST to `/api/llm` for richer responses and fall back to static replies if the proxy is unavailable.

Streaming (better UX)
- The proxy supports a streaming endpoint at `/api/llm-stream`. The widget is configured to use streaming so responses appear progressively in the chat.
- Streaming provides a snappier experience and reduces latency for the user. To enable, set `window.USE_LLM = true` in the page before opening the widget.

Prompt & system message guidance
- The server injects a stronger default `system` message that instructs the assistant to produce concise, actionable numbered bullets for website and AI/business requests. You can override the `system` message by modifying `server.js` or passing `system` in your POST body.

Proxy authentication and WebSocket forwarding
- The proxy now requires a token specified in `PROXY_TOKEN` (set on the server). HTTP requests to `/api/llm` and `/api/llm-stream` must include one of:
	- `Authorization: Bearer <PROXY_TOKEN>` header, or
	- `x-api-key: <PROXY_TOKEN>` header.

- For low-latency streaming, the server exposes a WebSocket endpoint at `/ws`. Connect with a query parameter token: `wss://your-host/ws?token=<PROXY_TOKEN>`.
	- After the WS opens, send JSON: `{ "prompt": "...", "system": "optional system message" }`.
	- The server will stream JSON messages back: `{ type: 'delta', text: '...' }`, and finally `{ type: 'done' }`.

Security notes
- Do not expose `PROXY_TOKEN` publicly. For browser usage you should mint short-lived client tokens server-side and pass those to the page rather than embedding the long-lived `PROXY_TOKEN` in client code.
- The README and `.env.example` show `PROXY_TOKEN` for development — in production wire tokens to a secure auth flow.

Security note
- Never commit secrets to source control. Use environment variables or secret managers. If a key was exposed in chat or elsewhere, rotate it immediately.

Next steps I can help with
- Hooking the contact form to an API endpoint
- Improving the AI assistant responses using a server-side LLM call
- Rewriting as an embeddable JS snippet that lazy-loads and doesn't require copying assets
