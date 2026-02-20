# HANDOFF — ladybug-adventurer

## Current status

- Repo: `https://github.com/arale745/ladybug-adventurer`
- Branch: `main`
- Latest feature set includes:
  - top-down movement, island travel, gathering, crafting
  - mobile joystick + action buttons
  - pinch-to-zoom (world only; UI fixed)
  - NPC + simple quest
  - autosave/restore
  - FPS counter + 60 FPS target

## What is currently broken / ugly

### Terrain visuals regression

The current terrain tiles look like a checkerboard of small icons/decals instead of seamless ground.

**Root cause:**
- We swapped in Kenney Tiny Town single-tile PNGs (`public/assets/kenney/tiny-town/*.png`) that are not appropriate seamless base terrain for this use.
- The tile selection currently uses one “grass”, one “beach”, one “water” tile for the whole island classification loop, so any non-seamless tile looks awful immediately.

## Files to inspect first

- `src/main.ts`
  - `preload()` — terrain texture loading
  - `buildIslandTiles()` — terrain assignment loop
  - `startWaterAnimation()` — water frame flip
- `public/assets/kenney/tiny-town/`
  - `grass.png`, `beach.png`, `water0.png`, `water1.png`

## Next-step plan (recommended)

### Step 1 — immediate hotfix

Revert to procedural terrain generation (or known-good previous assets) so visuals are acceptable again quickly.

### Step 2 — proper assets pass

Use an actual seamless terrain source and transitions:
1. Choose a tileset intended for seamless terrain (not icon/decal tiles).
2. Add at least:
   - multiple grass variants
   - multiple beach variants
   - multiple water variants (2+ animated)
3. Update `buildIslandTiles()` to select variants (weighted/random) rather than one static tile per biome.
4. Add shore transition logic (edge tiles) for grass↔beach and beach↔water.
5. Re-run visual checks on desktop + mobile.

### Step 3 — QA screenshots

Capture and compare:
- `qa-screens/desktop-overview.png`
- `qa-screens/mobile-portrait.png`
- optional `qa-screens/mobile-inventory-open.png`

## Useful commands

```bash
npm run build
npm run dev -- --host 127.0.0.1 --port 5173
```

Visual check with agent-browser:

```bash
agent-browser open https://arale745.github.io/ladybug-adventurer/
agent-browser set viewport 1366 768
agent-browser screenshot qa-screens/desktop-overview.png --full
agent-browser set viewport 390 844
agent-browser screenshot qa-screens/mobile-portrait.png --full
agent-browser close
```

## Handoff prompt for next session

Use this exact prompt:

> Read `HANDOFF.md` in `ladybug-adventurer`, fix the terrain visual regression first, then continue with proper seamless asset integration and screenshot verification.
