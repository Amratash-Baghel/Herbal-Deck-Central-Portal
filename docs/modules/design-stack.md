# Design stack

A set of Claude Code skills plus a CI gate for UI work on the portal, sourced
from [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(MIT-licensed). Nothing here is wired into the app's runtime — it only affects
how UI changes get planned, reviewed, and gated in CI.

---

## What's installed

| Layer | What | Where |
|-------|------|-------|
| Knowledge | `ui-ux-pro-max` skill — searchable local design guidance (accessibility, layout, typography, color, stack-specific patterns) | `.claude/skills/ui-ux-pro-max` |
| Supporting skills | `brand`, `design-system`, `design`, `slides`, `ui-styling`, `banner-design` | `.claude/skills/*` |
| Component generation | `shadcn` MCP server | `.mcp.json` |
| Visual feedback | `@playwright/mcp` + `chrome-devtools-mcp` MCP servers | `.mcp.json` |
| Automated review | `design-review` subagent + `/design-review` and `/design-plan` commands | `.claude/agents`, `.claude/commands` |
| Standalone audit | `scripts/design-audit.mjs` — multi-viewport heuristic screenshot audit | `scripts/`, CI in `.github/workflows/design-review.yml` |

None of the three MCP servers need an API key or paid account — they're
launched on demand via `npx`.

## The design loop

1. **Plan with data** — before writing markup, query `ui-ux-pro-max` for
   concrete tokens (color, type, spacing) and UX guidance for the surface
   you're building.
2. **Build** — implement with those tokens, matching this codebase's existing
   Tailwind conventions (see `app/globals.css`). Use the `shadcn` MCP to add
   components rather than hand-rolling primitives.
3. **See it** — open the page in a real browser via the Playwright / Chrome
   DevTools MCP, screenshot it, exercise interactive states, resize the
   viewport. A change that hasn't been looked at isn't finished.
4. **Review** — run `/design-review <url>` before calling a UI change
   complete. It drives Playwright across viewports, checks WCAG 2.1 AA
   (contrast, focus order, keyboard traps), and returns ranked findings.

## CI: automated design audit

`.github/workflows/design-review.yml` runs on any PR touching `.tsx`/`.css`
files. It waits for the PR's Vercel preview deployment (the same one Vercel
already posts a comment for), then runs `scripts/design-audit.mjs` against it
— checking horizontal overflow, unsized images (CLS risk), missing `alt`
text, small tap targets, missing focus indicators, missing accessible names,
heading structure, viewport/lang meta, and an approximate contrast pass. It
uploads a report + per-viewport screenshots as a build artifact, and fails
the PR on high-severity findings.

This is heuristic and mechanical — it catches defects, not taste. It's a
CI gate, not a replacement for the `/design-review` subagent.

## One-time manual setup (not done by this change)

Two steps happen inside an interactive Claude Code session, not from a PR:

1. **Approve the project MCP servers.** Opening Claude Code in this repo
   reads `.mcp.json` and prompts you to approve `playwright`,
   `chrome-devtools`, and `shadcn`. `enableAllProjectMcpServers: true` in
   `.claude/settings.json` means they load automatically once approved.
   Verify with `/mcp`.
2. **Optional: install the `frontend-design` plugin** for aesthetic-judgment
   guidance (a separate Anthropic-published plugin, not part of this repo):
   ```
   /plugin install frontend-design@anthropics/claude-code
   ```

## What was deliberately left out

- The upstream stack's own `scripts/setup.sh` and `CLAUDE.md` — this repo
  already has its own root `CLAUDE.md`/`AGENTS.md`; this doc supplements it
  rather than replacing anything.
- A broad `Read(//home/**)` permission the upstream template ships in its
  `.claude/settings.json` — dropped as unnecessarily wide for this repo.
- The CLI, gallery, and example projects from the upstream repo — none of
  that ships with the skill content itself.
