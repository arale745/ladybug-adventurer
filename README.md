# Ladybug Adventurer

A top-down 2D web adventure game prototype with a Game Boy Advance-inspired pixel vibe.

## Current gameplay loop

- Play as a tiny ladybug explorer.
- Visit multiple islands (SPACE at dock).
- Collect materials (E near resource nodes):
  - wood
  - stone
  - fiber
- Craft items at the bench with a recipe picker:
  - Select recipe: **Z / X**
  - Craft selected: **C**
  - **Raft Kit** = 2 wood + 2 fiber
  - **Bug Lantern** = 1 wood + 2 stone
- Kenney CC0 terrain assets integrated (Tiny Town base tiles) with palette tinting.
- Built-in GBA-style HUD and controls.

## Stack

- TypeScript
- Phaser 3
- Vite

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

This repo includes a Pages workflow (`.github/workflows/deploy-pages.yml`).

Expected URL after first successful deploy:

`https://arale745.github.io/ladybug-adventurer/`

> Note: GitHub Pages for private repos depends on your GitHub plan. If deploy fails due to repo visibility, make it public or use Tailscale Funnel.

## Share publicly with Tailscale Funnel

```bash
# from this project folder, with dev server running on 5173
tailscale serve 5173
tailscale funnel 443 on
```

Then share your Funnel URL.

## Next milestones

- Proper tilemaps with Tiled + pixel art sprite sheets
- Inventory UI panel and crafting menu
- NPCs, quests, and item progression
- Save system
