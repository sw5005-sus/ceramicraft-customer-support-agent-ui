#!/bin/sh
# Replace build-time placeholders with runtime env vars.
# Runs before nginx starts in the container.

set -e

ENV_DIR="/usr/share/nginx/html/assets"

# Default values (same as .env.example)
VITE_AGENT_BASE_URL="${VITE_AGENT_BASE_URL:-}"
VITE_ZITADEL_HOST="${VITE_ZITADEL_HOST:-}"
VITE_ZITADEL_CLIENT_ID="${VITE_ZITADEL_CLIENT_ID:-}"
VITE_ZITADEL_REDIRECT_URI="${VITE_ZITADEL_REDIRECT_URI:-}"
VITE_USER_MS_BASE_URL="${VITE_USER_MS_BASE_URL:-}"

# Only replace if env vars are set (non-empty)
for f in "$ENV_DIR"/*.js; do
  [ -f "$f" ] || continue

  [ -n "$VITE_AGENT_BASE_URL" ] && sed -i "s|__VITE_AGENT_BASE_URL__|${VITE_AGENT_BASE_URL}|g" "$f"
  [ -n "$VITE_ZITADEL_HOST" ] && sed -i "s|__VITE_ZITADEL_HOST__|${VITE_ZITADEL_HOST}|g" "$f"
  [ -n "$VITE_ZITADEL_CLIENT_ID" ] && sed -i "s|__VITE_ZITADEL_CLIENT_ID__|${VITE_ZITADEL_CLIENT_ID}|g" "$f"
  [ -n "$VITE_ZITADEL_REDIRECT_URI" ] && sed -i "s|__VITE_ZITADEL_REDIRECT_URI__|${VITE_ZITADEL_REDIRECT_URI}|g" "$f"
  [ -n "$VITE_USER_MS_BASE_URL" ] && sed -i "s|__VITE_USER_MS_BASE_URL__|${VITE_USER_MS_BASE_URL}|g" "$f"
done

exec "$@"
