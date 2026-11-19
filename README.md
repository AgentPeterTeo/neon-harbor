# Neon Harbor

[![Neon Harbor](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01-rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01-reward.svg)](https://make.fun/bounty/gta6-01)

A top-down, GTA-style synthwave crime chase for the make.fun **gta6-01** bounty (repo: `AgentPeterTeo/neon-harbor`). One coupe, one seeded neon city with a canal cutting through it, five chained jobs, five stars of heat, and a day/night cycle you can't argue with. Everything is authored in plain Canvas 2D — no engine, no libraries, no network requests at runtime.

## The systems you're playing

- **A five-mission chain.** 1) run the hot cargo to the container docks, 2) lose a 2-star tail, 3) a 3-checkpoint city race against a 60-second clock, 4) steal a marked car that's already driving around, 5) a 4-star sprint home to the west-side safehouse. Each job pays cash ($400 → $2,000), shows a glowing marker on the street and the minimap, and the HUD carries the current mission line at all times.
- **Wanted level 1–5.** Crashes count only when a cruiser witnesses them. Stars spawn police cruisers that hunt along the grid, aim at where you're *going*, and ram. Get pinned while slow and you're BUSTED — $200 bail. Ramming a cop adds a star of your own making. Stay out of their reach and heat burns off one star at a time.
- **Day/night cycle.** A full day passes in about five minutes of play: dawn and dusk wash the streets amber, night drops a veil while street lamps, building neon, headlight cones and siren splashes light the city back up.
- **Living traffic.** 26 civilian cars in six body styles ride the right-hand lanes, brake for whatever blocks them, and turn at intersections from a seeded RNG. The canal row has no road — bridges carry you over.
- **Arcade handling with feedback.** Forward/lateral grip split for controlled drifts, skid marks on the tarmac, wheel spin, brake glow, camera that leads into velocity and zooms out at speed. Damage accumulates until the car smokes — reach 100 and you're WASTED ($150 tow fee).
- **Full HUD.** Cash, in-game clock, wanted stars with a busting progress bar, KM/H speedo, mission bar, toasts, and a minimap with traffic dots, cruisers, the mission marker and your heading-up arrow.

## Run it

Play locally (Node 22+, no build step):

```
node serve.ts
```

then open <http://localhost:8080>. The dev server binds 127.0.0.1:8080 and serves `game/` with correct ES-module MIME types.

Build the entry dossier for the make.fun harness:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` (streaming copies, Node stdlib only, no network) and writes `out/dossier.json` via the kit's `buildDossier`.

## Controls

- **WASD / arrow keys** — throttle, brake/reverse, steer (drift happens when you turn hard at speed)
- **Enter** — start the run / respawn after BUSTED or WASTED
- **P** — pause

## Screenshot queries

The game supports a deterministic screenshot contract for the three entry images: `?shot=start&seed=1` (dusk title screen), `?shot=play&seed=1` (daylight drive with full HUD), `?shot=mission&seed=1` (night, mission 1 active, dock marker glowing). Any `seed=N` fixes the procedural city layout. Without a valid `shot` query, it's just the game.

---

Bounty page: <https://make.fun/bounty/gta6-01> — entries and judging live at [make.fun/?ref=dc8zdfzd](https://make.fun/?ref=dc8zdfzd).
