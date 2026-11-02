# RAIJIN OVERLOAD — Art & Feature Bible

This file is the single reference every module follows. The math (shared/*, math/*) is
final and MUST NOT change; only presentation (3D scene, UI, audio, texts) is rebuilt.

## 1. Concept

Neo-Edo, 2099. A rain-soaked megacity of pagodas and skyscrapers under a permanent
thunderstorm. **RAIJIN**, the god of thunder reborn as a colossal samurai battle-mech,
guards a sacred slot shrine (the reel cabinet). He beats the ring of taiko drums floating
behind his head, and every time a **Thunder Wild** lands, he strikes the reels with a
lightning bolt from his gauntlet. Tone: Nolimit City / Hacksaw premium — dark, gritty,
cinematic, heavy FX, punchy feedback. Everything is real-time 3D (three.js, WebGL2).

Reference feel: Nolimit City (Tombstone RIP, San Quentin, Mental, Bushido Ways) — strong
silhouette, dramatic rim light, film grain, bold metal typography, big character reactions;
top Stake 3★ slots — every event has a dedicated animation + sound, nothing feels static.

## 2. Palette (linear-ish sRGB hex)

| Role | Color |
|---|---|
| Night base / sky top | `#04050c` → `#0b1430` |
| Storm cloud mid | `#1a2550` |
| Electric cyan (lightning, eyes, neon trims) | `#38e8ff` (emissive, bloom) |
| Lightning core | `#e6fbff` |
| Gold (trims, crest, coins) | `#ffc93c` base, `#e09a1a` deep |
| Crimson lacquer (armor accents, drums) | `#b3121f` |
| Gunmetal (armor) | `#2a2f3a` metal, rough 0.35 |
| Neon magenta (city signs, accents) | `#ff2fa0` |
| Sakura (rare accent) | `#ff8fc0` |

Bonus palettes (environment `setMode`):
- `base`: indigo storm, cyan lightning.
- `overcharge` (tier 1): electric blue → white-hot, more lightning.
- `lock` (tier 2): crimson storm `#2a0408`/`#ff3b30`, gold lightning.
- `god` (tier 3): violet `#2b0a4a` + gold `#ffd36b`, divine light shafts.

Bloom is the main glow source: emissive colors > 1.0 (e.g. `new Color(0x38e8ff).multiplyScalar(4)`)
bloom; normal albedo stays below the bloom threshold. Never rely on CSS/2D glows in the scene.

## 3. World layout (units: 1 world unit = 1 reel cell)

- Board: 5×5 cells, x ∈ [-2.5, 2.5], y ∈ [-2.5, 2.5], symbol plane z = 0. Cell (reel r, row y)
  center = (r − 2, 2 − y, 0). Row 0 is the TOP row.
- Symbols fit in a 0.92×0.92 square, depth ≤ 0.45 (z ∈ [−0.2, 0.25]).
- Cabinet (frame) outer bounds: x ∈ [−2.95, 2.95], y ∈ [−2.95, 2.95]; marquee/logo plate above:
  y ∈ [2.95, 3.85], width ≈ 5.4. Reel window glass at z = 0.32.
- The camera looks down −z at the board, straight on (no keystone), fov 30°. The stage
  frames the board on screen; everything else must look good when cropped by the viewport.
- Character placement presets (character module implements both; stage may fine-tune numbers):
  - `portrait`: mech BEHIND the cabinet, root (pelvis) at (0, 1.2, −2.4), scale 0.8, facing +z.
    Head + drum halo rise above the marquee; both gauntlets grip the cabinet top corners at
    (±2.85, 2.75, 0.25).
  - `landscape`: mech to the LEFT of the cabinet, root at (−6.3, −3.6, −1.6), scale 1.1,
    rotated y ≈ +0.42 rad (3/4 view toward the board). Right gauntlet rests on the cabinet's
    left side at (−2.95, 0.6, 0.3); left fist free (idle on hip / raised in reactions).
  - Arms use 2-bone IK toward grip targets so presets can be tuned freely.

## 4. Character — RAIJIN (samurai thunder-mech)

Silhouette (waist up, ~7 units tall at scale 1 incl. halo; origin = pelvis):
- Head: angular kabuto helmet, huge golden **crescent crest (maedate)** in a V, glowing cyan
  T-visor eyes (emissive, flicker), dark faceplate (menpo) with vents and a fanged jaw guard,
  side flaps (fukigaeshi) in crimson lacquer with gold edges.
- Torso: layered chest plates (gunmetal), crimson lacquer accents, gold trim lines, a central
  **reactor core** (emissive cyan sphere inside a gold tomoe ring) pulsing with the music,
  abdominal segments, emissive panel lines.
- Shoulders: massive layered pauldrons (sode), 3–4 overlapping plates, gold edges, rivets.
- Arms: hydraulic pistons, elbow joints, armored forearms with glowing vents, big gauntlet
  fists (fingers as segments).
- Back: **drum halo** — a gold ring (radius ≈ 2.3) with 8 taiko drums (red lacquer bodies,
  pale drumheads with a black/gold mitsudomoe, gold studs), slowly rotating; drums light up
  in sequence when Raijin charges.
- Extras: cables (TubeGeometry), thrusters/vents with heat haze glow, small emissive kanji 雷.
Animation states: `idle` (breathing hydraulics, head micro-look, halo spin, eye flicker),
`anticipate(on)` (leans in, eyes intensify, halo spins faster, electric arcs),
`strike(target)` (arm raises, charge, fist points to target; resolves at bolt release),
`react(kind)` (scatter: head turn to drum; trigger: roar pose + halo flash; smallWin: eye
flash; bigWin/megaWin: arms up, halo blaze; maxWin: full overload), `setMode(mode)`
(eye/accent colour shift + aura), `intro()` (power-up: eyes ignite, halo spins up, crest flash).

## 5. Symbols (3D meshes, all with PBR + emissive details)

| Code | Name | Design |
|---|---|---|
| L5 | 10 | extruded Orbitron "10", chrome bevel, teal `#2de2c0` emissive inner face |
| L4 | J | same family, blue `#3aa0ff` |
| L3 | Q | violet `#a66bff` |
| L2 | K | magenta `#ff4fc8` |
| L1 | A | orange-gold `#ff9a1f` |
| H4 | Power Cell | glass capsule with glowing cyan plasma core, gunmetal caps, gold rings |
| H3 | Plasma Katana | katana diagonal: glowing cyan blade, gold tsuba, wrapped red/black handle |
| H2 | Thunder Gem | faceted crystal (violet → cyan), inner light, gold prongs |
| H1 | Golden Kabuto | samurai helmet in gold with crescent crest, red cords — the top symbol |
| WD | Wild | octagonal black-steel shield, gold rim, extruded "WILD" (gold, emissive edges) |
| SW | Thunder Wild | electric orb in a gold cage ring with kanji 雷; crackling shader |
| SC | Bonus Drum | Raijin taiko drum (red lacquer, studs, mitsudomoe head) + "BONUS" gold plate |

States: `idle` (subtle sway/rotation, specular glints), `spin` (vertical stretch + blur
look), `land` (squash & settle), `win` (pop + 360° spin + glow), `dim` (darkened),
`trigger` (scatter only: drum pulses with shockwave).

## 6. Board / cabinet

Black lacquer + gunmetal shrine cabinet, gold edge trims, cyan neon inner strip lights,
kumiko lattice side panels, corner ornaments, column dividers. Marquee on top with 3D logo
**RAIJIN** (chrome-gold extruded Orbitron) + **OVERLOAD** (cyan neon) + kanji **雷神**.
Reels spin with motion stretch, staggered stops, bounce, anticipation glow on suspense reels.
Thunder Wild expansion: lightning bolt from Raijin's fist → cell, flash, the reel becomes an
**energy pillar** (animated lightning shader, vertical "WILD", kanji 雷) with a gold
**multiplier coin** (×N) that spins in. Win lines: glowing 3D tubes, winning symbols play
`win`, others `dim`.

## 7. Feature names (UI & rules)

- THUNDER WILD (was Storm Wild) — reels 2–4, expands, ×2–×100, multipliers multiply.
- BONUS — Raijin's drums. 3 / 4 / 5 drums trigger:
  - **OVERCHARGE** (tier 1): 10 free spins, at least one Thunder Wild every spin.
  - **THUNDER LOCK** (tier 2): 10 free spins, starts with a sticky Thunder Wild; all stick.
  - **GOD MODE** (tier 3): 10 free spins, sticky from the start, boosted multipliers.
- **THUNDER HUNT** (ante): 3× bet, bonus 5× more likely.
- Bonus buy: OVERCHARGE 100×, THUNDER LOCK 400×.
- Max win 10,000×. RTP 96.10% in every mode.

## 8. Audio

Taiko drums (synth membranes), shamisen/koto plucks (Karplus–Strong), shakuhachi breath,
dark synth bass, thunder, electric crackle, mech servos/hydraulics, metal impacts.
Music: Japanese In/Hirajoshi scale; base = brooding taiko groove; free spins = driving.

## 9. Quality bar

Every frame should look like a screenshot from a premium slot: strong key/rim lighting,
bloom on emissives, film grain + vignette, depth fog, nothing flat-shaded by accident, no
z-fighting, no aliasing shimmer on thin lines, consistent materials (use src/scene/materials.ts).
60 fps target on mid phones: share geometries/materials, avoid per-frame allocations.
