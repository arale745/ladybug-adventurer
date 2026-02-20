# Ladybug Adventurer — Autonomous Improvement Roadmap

## Goal
Keep shipping small, safe, production-ready improvements in a continuous loop without burning rate limits.

## Delivery Cadence
- 1 scoped improvement cycle every 4 hours
- Each cycle must stay narrow: one gameplay/system/UI improvement max
- Mandatory validation per cycle:
  - `npm run build`
  - fresh screenshots:
    - `qa-screens/desktop-overview.png`
    - `qa-screens/mobile-portrait.png`
  - commit + push to `main`
  - short changelog summary

## Priority Backlog

### P0 — Core feel
1. Improve dodge readability (clear cooldown pulse + short invuln VFX)
2. Beetle AI polish (turn speed cap, less jitter, better pursuit arcs)
3. Better hit feedback (screen shake/light flash + stronger status messaging)

### P1 — Progression loop
4. Add risk/reward drops from beetles (chance for bonus material on clean dodge)
5. Expand recipes (2-3 new craftables with meaningful utility)
6. Add quest chapter 2 after relic completion

### P2 — World depth
7. Add one unique island event per island (timed encounter, mini puzzle, hidden cache)
8. Add mini-map / directional hints
9. Add run summary panel (materials gained, encounters dodged, quest progress)

### P3 — Performance and polish
10. Mobile control tuning for portrait thumb reach
11. HUD readability pass for small screens
12. Reduce bundle size (lazy-load non-critical systems)

## Hard Constraints
- Never break deployability
- Keep changes incremental and revertable
- No destructive refactors in autonomous cycles
- If a change is risky, split it into separate cycle steps

## Done Criteria (for each cycle)
- Works on desktop + mobile aspect ratio
- Build passes
- Screenshots updated and sent
- Commit message explains exactly one core improvement
