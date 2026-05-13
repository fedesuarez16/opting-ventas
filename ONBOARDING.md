# Welcome to Opting Ventas

## How We Use Claude

Based on fedesuarez16's usage over the last 30 days:

Work Type Breakdown:
  Build Feature  ██████████░░░░░░░░░░  50%
  Plan Design    ██████████░░░░░░░░░░  50%

Top Skills & Commands:
  /init   ████░░░░░░░░░░░░░░░░  1x/month
  /mcp    ████░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  n8n       ████████████████████  39 calls
  supabase  ██████████░░░░░░░░░░  20 calls

## Your Setup Checklist

### Codebases
- [ ] opting-ventas — https://github.com/fedesuarez16/opting-ventas

### MCP Servers to Activate
- [ ] n8n — Edit and sync the production n8n workflow (`Opting - Agente Ventas`) at `https://mia-n8n.w9weud.easypanel.host` from your terminal. Get an API key from n8n → Settings → n8n API → Create API key, then put it in `.env.local` as `N8N_API_KEY` and also export `N8N_API_URL` + `N8N_API_KEY` in your `~/.zshrc`. Config lives in `.mcp.json` (committed). Verify with `claude mcp list` — should show `n8n` as `connected`.
- [ ] supabase — Read tables, run SQL, generate types, check advisors against the project's Supabase instance. Ask fedesuarez16 for the access token, then add the supabase MCP server via `claude mcp add`.

### Skills to Know About
- /init — Generates a CLAUDE.md for a new repo. Already done for this one — useful if you spin up a sibling project.
- /mcp — Lists configured MCP servers and their connection status. First thing to run after cloning to confirm `n8n` and `supabase` are connected.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
