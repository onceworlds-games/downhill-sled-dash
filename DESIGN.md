# Downhill Sled Dash: design

## Hook
An endless mountain, one sled, one more run. Steer with weight, hop logs, hit ramps and spin, thread slalom gates, and
watch the light turn from dawn to night as the speed climbs. Retry is one tap.

## What it resembles, and what is ours
It sits in the endless downhill sled runner family. Ours is a wide, winding alpine slope (not a narrow lane course), with
a race-bib distance counter, a BEST flag planted on the slope at your record, spin tricks with combos, slalom gates with a
streak multiplier, brass cowbells as currency, four power-ups, a day-to-night mountain, and our own sleds, names, courses
and shop. No gifts, candy or festive theme; the world is a mountain race.

## First minute
Title: the sled running by itself on the real slope, the logo, one Play button. Play starts at once. The opening 400 m is
scripted: an empty runway with a bell line, one log with the hint "HOP" (once), light trees, three gates, a ramp. Hints
are 1-2 words at the moment they matter and are remembered in the save.

## Art direction
Crisp stylised low-poly alpine race: faceted pines, granite boulders, pearly snow with soft blue shadows, layered
mountains in fog, a sky that changes with distance. UI is race signage: bibs, flags, timing slips, slanted cuts.
Palette: ink #0e1a2b, snow #f3f8ff, shadow blue #9fb7d9, signal orange #ff5b1f, pine #1d5a43, brass #ffc43d, crash red #d92e3a.
Type: Barlow Condensed (800/900, italic for numerals), with a system condensed fallback.
Signature: the distance readout is a race bib pinned at top centre, and the BEST flag stands on the slope at your record.

## Feel
Fixed 120 Hz simulation. Lateral velocity chases a steer target with a response that loosens with speed (weight, a small
drift at 35+ m/s). Camera follows with lag, banks into turns, widens FOV with speed (and a kick on Boost), spray from the
runners, speed lines, decaying-trauma shake. Hop is a short ballistic arc; ramps give big air with free spin; landing within
about 45 degrees of straight is clean (keeps speed), otherwise a wobble costs speed. Crash: slow motion tumble, snow burst,
the rider is thrown off, then the results slip.

## World and rules
- Track coordinates: distance d along the slope, lateral x in [-12, 12]. Rendering shears the track by a gentle centre curve.
- Speed: 14 m/s at the start, ~37 m/s at 3 km, soft cap near 39.
- Courses are built from stretches (scatter, tree walls, logs, fences, ramps, gates, ice, lanes, snowballs, snowcat) with
  a seeded RNG. A guaranteed route (a smooth path whose lateral slope is at most half of what the sled can do at that
  speed) is generated first and every blocking obstacle keeps clear of it; `test/fair.test.mjs` re-checks each course with
  an independent reachability sweep at 60 percent of the sled's lateral capability, in the air and on ice too.
- Hop rows keep a minimum spacing, ramps and logs keep a clear landing zone behind them.
- Score = metres + trick points + gate points (x2 while the power-up lasts). Bells are banked each run.
- Time of day by distance (period 7000 m): dawn 0, day 800, golden 1800, sunset 3000, dusk 3800, night 4500, loops with snow.

## Progression
Six sleds (cosmetic) and six outfits, three missions at a time (per-run goals, paid when the run ends, replaced by a new
one), records, leaderboards `best-distance` and `best-score`, six badges.

## Controls
Keys: A/D or arrows steer (ramped), Space/W/Up hop, P/Esc pause, Enter retry. Phone: drag anywhere left/right to steer
relative to the finger (the anchor follows, so reversing is instant) plus the platform's Hop button. Decision: a relative
drag beats the platform's analog stick here because the stick sits in the lower-left thumb zone and steering needs a
continuous travel range; the Hop button stays in the right thumb zone.

## Stack
Vite + three.js. Pure modules (no DOM, no three): rng, config, track, tod, course, fairness, sim, bot, missions, save.
Browser modules: world, models, fx, audio, input, ui, game, poster. Instanced meshes for trees, rocks, logs, fences,
ramps, bells; terrain segments recycled; mountains and sky follow the camera. Quality tiers: shadows none/1024/2048, fewer
decor trees and particles on low.
