# Ladybug Adventurer

A top-down 2D web adventure game prototype with a Game Boy Advance-inspired pixel vibe.

## Current gameplay loop

- Play as a tiny ladybug explorer.
- Visit multiple islands (SPACE at dock).
- Collect materials (E near resource nodes):
  - wood
  - stone
  - fiber
- Craft items (C near craft bench):
  - **Raft Kit** = 2 wood + 2 fiber
  - **Bug Lantern** = 1 wood + 2 stone

## Stack

- TypeScript
- Phaser 3
- Vite

## Run locally

```bash
npm install
npm run dev
```

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
