# ceramicraft-customer-support-agent-ui

Chat UI for the CeramiCraft Customer Support Agent.

A lightweight Vue 3 SPA that provides login (Zitadel PKCE) and a chat interface connected to the CS Agent backend via SSE streaming.

## Architecture

```
Browser (SPA on csagent.ntdoc.site)
  ├─ Sign In ──▶ Zitadel OIDC (PKCE) ──▶ user-ms oauth-callback
  └─ Chat    ──▶ POST /chat/stream (SSE) ──▶ CS Agent (via nginx reverse proxy)
```

- Single-page app — no separate login page; sign-in is integrated into the chat view
- Nginx reverse proxy: `/chat`, `/reset`, `/cs-agent/*` → cs-agent; `/user-ms/*` → user-ms
- SSE streaming: real-time stage updates (guarding → classifying → processing → reply)

## Tech Stack

- Vue 3 + TypeScript + Vite
- vue-router (SPA routing)
- Native `fetch` + `ReadableStream` for SSE
- marked + DOMPurify for markdown rendering
- nginx-unprivileged for production serving + reverse proxy

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
| `VITE_ZITADEL_CLIENT_ID` | `369270211708226724` | Zitadel app client ID |
| `VITE_ZITADEL_REDIRECT_URI` | `{origin}/callback` | OAuth redirect URI |
| `VITE_USER_MS_BASE_URL` | `http://localhost:8083` | User microservice URL |

## Testing

```bash
npm test                   # Run all tests
npm run test:coverage      # Run tests with coverage report
```
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
├── router/index.ts         # Routes (single-page, no auth guard)
├── services/
│   ├── config.ts           # Runtime configuration (build + runtime env)
│   ├── auth.ts             # Zitadel PKCE auth
│   ├── chat.ts             # CS Agent API client (SSE)
│   └── session.ts          # Multi-conversation persistence (localStorage)
├── types/index.ts          # TypeScript types
└── views/
    ├── CallbackView.vue    # OAuth callback handler
    └── ChatView.vue        # Chat interface + sidebar + login integration
```

## CI/CD

| Workflow | Trigger | Description |
|----------|---------|-------------|
| Lint | push/PR | Type check (vue-tsc) + build |
| Snyk | push to main, PR | npm dependency vulnerability scan |
| Trivy | push to main, PR | Docker image vulnerability scan |
| Sonar | push to main, PR | SonarCloud code analysis + quality gate |
| Test | push (all branches) | Vitest unit tests |
| Release | version tag | Auto-create GitHub release |
| Deploy | manual | Build + push DockerHub + update ArgoCD |

## Kubernetes Deployment

The Deploy workflow builds a Docker image tagged with `dev-YYYYMMDDHHmm` and updates the ArgoCD deploy repo (`ceramicraft-argocd-deploy`).

When deploying alongside cs-agent, no CORS configuration is needed — nginx reverse proxy keeps all API calls same-origin.

### Prerequisites

- Zitadel: configure a SPA-type application with correct redirect URI
- IngressRoute or Ingress for external access (Traefik recommended)
- ArgoCD application pointing to the helm chart directory
- No CORS configuration needed on cs-agent (nginx reverse proxy handles same-origin)
