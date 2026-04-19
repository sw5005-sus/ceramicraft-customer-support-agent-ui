# ceramicraft-customer-support-agent-ui

Chat UI for the CeramiCraft Customer Support Agent.

A lightweight Vue 3 SPA that provides login (Zitadel PKCE) and a chat interface connected to the CS Agent backend via SSE streaming.

## Architecture

```
Browser (SPA)
  ├─ Login ──▶ Zitadel OIDC (PKCE) ──▶ user-ms oauth-callback
  └─ Chat  ──▶ POST /chat/stream (SSE) ──▶ CS Agent
```

- Pure static SPA — no backend dependency beyond CS Agent
- Hot-pluggable: configure the agent URL and deploy independently
- SSE streaming: real-time stage updates (guarding → classifying → processing → reply)

## Tech Stack

- Vue 3 + TypeScript + Vite
- vue-router (SPA routing with auth guards)
- Native `fetch` + `ReadableStream` for SSE
- nginx-unprivileged for production serving

## Development

```bash
npm install
cp .env.example .env.local    # Configure endpoints
npm run dev                    # http://localhost:5173
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_AGENT_BASE_URL` | `http://localhost:8080` | CS Agent backend URL |
| `VITE_ZITADEL_HOST` | `https://cerami-t6ihrd.us1.zitadel.cloud` | Zitadel OIDC issuer |
| `VITE_ZITADEL_CLIENT_ID` | `361761429302373082` | Zitadel app client ID |
| `VITE_ZITADEL_REDIRECT_URI` | `{origin}/callback` | OAuth redirect URI |
| `VITE_USER_MS_BASE_URL` | `http://localhost:8083` | User microservice URL |

## Build & Deploy

```bash
npm run build     # Output: dist/
```

## Docker Deployment

```bash
docker build -t ceramicraft-customer-support-agent-ui .
docker run -p 8080:8080 \
  -e VITE_AGENT_BASE_URL=https://api.ceramicraft.com \
  -e VITE_ZITADEL_REDIRECT_URI=https://chat.ceramicraft.com/callback \
  ceramicraft-customer-support-agent-ui
```

Runtime env vars override build-time values via `docker-entrypoint.sh` placeholder replacement.

## Project Structure

```
src/
├── main.ts                 # App entry
├── App.vue                 # Root component
├── router/index.ts         # Routes + auth guard
├── services/
│   ├── config.ts           # Runtime configuration (build + runtime env)
│   ├── auth.ts             # Zitadel PKCE auth
│   ├── chat.ts             # CS Agent API client (SSE)
│   └── session.ts          # Chat session persistence (localStorage)
├── types/index.ts          # TypeScript types
└── views/
    ├── LoginView.vue       # Login page
    ├── CallbackView.vue    # OAuth callback handler
    └── ChatView.vue        # Chat interface
```

## CI/CD

| Workflow | Trigger | Description |
|----------|---------|-------------|
| Lint | push/PR | Type check (vue-tsc) + build |
| Snyk | push to main, PR | npm dependency vulnerability scan |
| Trivy | push to main, PR | Docker image vulnerability scan |
| Release | version tag | Auto-create GitHub release |
| Deploy | manual | Build + push DockerHub + update ArgoCD |
