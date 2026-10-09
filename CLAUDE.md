# Project memory — RAIJIN OVERLOAD (Stake Engine slot)

## What the user asked for (keep these requirements)
- A complete slot machine to publish on **Stake Engine** (math files + static frontend).
- **RTP 96.10 %** in every bet mode.
- Hacksaw-style ante: **3x the bet for 5x the bonus chance** (e.g. 0.30 for a 0.10 bet) — implemented as the `ante` mode ("THUNDER HUNT").
- Bonus buys, multiple bonus tiers, big max win (10,000x).
- Full creative freedom on sounds, symbols and theme.
- Visual bar: the first neon 2D version was rejected as "too basic". The user wants a **huge, premium, fully animated 3D game** with a strong theme and a **main character**, inspired by Nolimit City and the best (3-star) Stake slots — "every detail counts".
- Talk to the user in **French**; answers objective.

## Key facts
- Math: `shared/` (rules, engine, reels) + `math/` (generator, verifier). Published files in
  `math/publish_files/` (index.json, lookUpTable_*.csv, books_*.jsonl.zst). Any change to
  `shared/game.ts` pays/rules, `shared/reels.ts` or `shared/engine.ts` requires
  `npm run math` (generate + independent verify) — the books must stay in sync.
- Books are theme-agnostic (symbol codes L5..L1, H4..H1, WD, SW, SC), so visual re-theming
  never touches the math.
- Frontend: Vite + TypeScript + three.js (`src/scene/*` 3D modules, `src/game/controller.ts`
  game flow, `src/net/*` RGS/demo backends, `src/ui/*` HTML overlay, `src/audio/*` procedural audio).
- Art bible: `docs/ART_DIRECTION.md`. Dev harness: `dev/harness.html` + `node dev/shoot.cjs`.
- Demo without Stake session: open the page without `rgs_url`; `?demo_force=t1|t2|t3|storm|big`.
