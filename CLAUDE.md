# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Next.js dev server on :3000
npm run build   # Production build
npm run start   # Production server
npm run lint    # next lint
```

There is no test suite configured. Type-checking runs as part of `next build`.

Required env vars (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`.

## Architecture

Next.js 15 (App Router) CRM for a real-estate sales team. All UI and code is in **Spanish**; preserve that when editing.

**Three external systems the frontend orchestrates:**
1. **Supabase (Postgres)** — source of truth for `leads`, `propiedades`, `documents`, `kanban_columns`, `agent_status`, `pautas`, `cola_seguimientos`, `cola_seguimientos_dos`. See `AGENT.md` for full schemas.
2. **Chatwoot** — WhatsApp conversations. All access goes through Next.js route handlers under `src/app/api/chats/**` and `src/app/api/agents/` which forward to the Chatwoot REST API using `CHATWOOT_API_TOKEN`. Never call Chatwoot directly from client code.
3. **n8n** (`https://mia-n8n.w9weud.easypanel.host`) — owns lead qualification, sending of follow-up messages, and Redis JID storage. The frontend only *reads* results and triggers Redis webhooks via `/api/redis-jids`.

**Data flow for leads:** `leadService.getAllLeads()` fetches up to 1000 rows from `leads`, runs `mapLeadRow()` to normalize (legacy states like `'Fríos'`/`'activo'` → canonical `frío|tibio|caliente|llamada|visita`), then caches in-module (`cachedLeads`) so filter UIs work client-side without extra round-trips. Custom kanban states come from `kanban_columns.custom_columns`. **Automatic lead qualification lives in n8n, not in the frontend** — `calificarLead()` exists but is not the primary path.

**Data flow for chat:** `useChats` → `/api/chats` → Chatwoot `/conversations`. Chatwoot's response shape is `data.data.payload` and it **ignores `per_page`** (always ~25 items/page). Phone numbers arrive in several formats (`+5492215...`, `549221...@s.whatsapp.net`, `WAID:549221...`, `wa_id`, `meta.sender.identifier`) — normalize with `extractNumericPhone()` and compare **last 10 digits** to match across formats. If a chat isn't in the locally cached page, `ChatList.js` falls back to `POST /api/chats/search` which paginates the full Chatwoot history.

**Two property sources coexist:** `propiedadesService.ts` (Supabase `propiedades`, CRUD, active) and `documentService.ts` (Supabase `documents`, read-only, has embeddings). `propertyService.ts` reads `src/app/data/properties.json` and is **legacy** — don't add features against it.

**Follow-ups (seguimientos):** queued in `cola_seguimientos`; once a row uses a `toque_2_*` template it moves to `cola_seguimientos_dos`. n8n sends the messages; the app only schedules/reads.

## Conventions

- Path alias: `@/*` → `./src/*` (set in `tsconfig.json`).
- shadcn/ui components live in `src/components/ui/`; app components in `src/app/components/`.
- `.tsx` for most code; a handful of chat files and hooks are `.js` (legacy) — keep them JS rather than converting ad-hoc.
- Services instantiate their own Supabase client via a module-local `getSupabase()` singleton and cast queries as `any` because there are **no generated DB types** (`database.types.ts` does not exist). Follow this pattern when adding services rather than introducing a shared typed client.
- API routes that hit Chatwoot must validate all three `CHATWOOT_*` env vars before calling out.
- Detail/edit sidebars are always separate components (`LeadDetailSidebar` vs `LeadEditSidebar`, same for propiedad). Don't merge them.

## n8n MCP (editar workflows desde esta terminal)

El workflow live de producción vive en `https://mia-n8n.w9weud.easypanel.host`. Un snapshot exportado está versionado en `workflows/opting-agente-ventas.json` (mismo workflow que los JSON en raíz, que son versiones viejas — usar solo el de `workflows/`).

Claude Code está configurado para gestionar ese workflow vía el MCP server **`n8n-mcp`** (comunidad, czlonkowski — no oficial). Config en `.mcp.json` (project scope, committeado). Expone tools para: listar/leer/crear/actualizar/validar/auto-fix workflows, disparar ejecuciones, health check, docs de los 525+ nodos.

**Cómo activarlo:**
1. Pegar el n8n API key en `.env.local` → `N8N_API_KEY=...` (sacarlo en n8n → Settings → n8n API → Create API key)
2. `N8N_API_URL` y `N8N_API_KEY` ya están exportadas en `~/.zshrc`, así que cualquier shell nuevo las tiene. Si alguna vez rotás la key, actualizá **ambos** lugares: `.env.local` (que lee Next.js al correr la app) y `~/.zshrc` (que lee Claude Code al arrancar).
3. Las tools aparecen con prefijo `mcp__n8n__*`. Si no aparecen, verificar con `claude mcp list` que `n8n` esté `connected`.

**Patrón de edición (no es sync automático — son tool calls explícitos):**
- **Pull**: pedir "traeme el workflow `Opting - Agente Ventas` y actualizá el archivo local" → uso `n8n_list_workflows` / `n8n_get_workflow` y reescribo `workflows/*.json`.
- **Edit**: editás el JSON local (o me pedís el cambio).
- **Validate + push**: `n8n_validate_workflow` contra el JSON, después `n8n_update_partial_workflow` (cambios parciales, preferido) o `n8n_update_workflow` (reemplazo completo). El `_partial` es safer — solo manda los nodos/conexiones modificadas.
- **Regla**: la fuente de verdad operativa es n8n live, el JSON local es snapshot versionado. Ante duda, pull antes de editar.

## Repo layout notes

- `AGENT.md` — much more detailed architecture reference (schemas, every route, every service). Consult it when the summary above isn't enough.
- `*.md` in the repo root (except `README.md`, `AGENT.md`, `CLAUDE.md`) are historical fix/feature notes, **not active docs**.
- `SUPABASE_*.sql` and `*.sql` in root are one-off migration scripts run manually against Supabase.
- `*.json` workflow files in root (`Opting - Agente Ventas*.json`, `Segundo-Toque-*.json`, `Team ali - agente1.json`, `My workflow*.json`) are exported n8n workflows kept for reference — not imported by the app.
