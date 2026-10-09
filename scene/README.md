# Scene half – window.SE

Load with `import { init } from './scene/scene.js'; const SE = await init();` (index.html does this).
Needs an http(s) server (ES modules + fetch do not work from file://).

| API | |
|---|---|
| `SE.selectPlanet(name)` | Eased fly-to (zoom-out arc, then settle into orbit). Returns `false` for unknown names. Case-insensitive. |
| `SE.zoom(delta)` | `delta > 0` zooms in, `< 0` out (exponential). In free-fly it dollies forward/back. |
| `SE.look(dx, dy)` | Drag deltas in px. Orbit mode: orbits the focused body. Free-fly: turns the camera. |
| `SE.fly(x, y, z)` | Held velocity input, each -1..1: x = strafe right, y = up, z = forward. Switches to free-fly; speed scales with distance to the nearest body surface. `SE.fly(0,0,0)` stops. |
| `SE.setTimeSpeed(x)` | Simulated days per real second (default 1; 0 = pause; negative = reverse). `SE.getTimeSpeed()` |
| `SE.getPlanets()` | Array of every body: `{name,type,parent,radius_km, ...planets.json fields}` |
| `SE.overview()` | Fly back out to the whole-system view. |
| `SE.pick(clientX, clientY)` | Raycast (plus finger-size screen fallback) → body name or `null`. |
| `SE.screenPos(name)` | `{x,y,visible}` in CSS px, for labels. |
| `SE.land(name)` | Descend from orbit and stand on the surface. Touchdown at exactly 2.5 s after the call (if not already orbiting that body it first flies there, then the 2.5 s descent starts). Allowed on every solid body (rocky planets, all moons, Pluto); returns `false` for the Sun and gas/ice giants (cloud dive not implemented). |
| `SE.takeOff()` | From the surface, ascend back to orbit in exactly 2.5 s. Returns `false` if not landed. |
| `SE.canLand(name)` | `true` for solid bodies – use it to show/hide a Land button. |
| `SE.getSurface()` | `{name, altitude, position}` while landing/landed/taking off, else `null`. |
| `SE.setSmallMoons(on)`, `SE.getSmallMoons()` | Toggle / inspect the faint per-giant swarms of tiny moons (one dot per real unmodelled moon, labelled with the real total count). |
| `SE.getMoons(name)` | Names of a body's modelled moons. |
| `SE.enableJoystick(on)` | Built-in thumbstick (bottom-left) + ▲/▼ buttons (right) that drive `SE.fly`. |
| `SE.getSelected()`, `SE.getMode()`, `SE.getDate()`, `SE.getStats()` | `getStats` → fps, pixelRatio, drawCalls, … |

Events on `window`: `se:ready`, `se:selected` (`detail: {name, body}`), `se:arrived` (`detail: {name}`),
`se:landed` / `se:tookoff` (`detail: {name}`), `se:modechange` (`detail: {mode: 'orbit'|'flight'|'free'|'landing'|'surface'|'takeoff'}`),
`se:textures` (procedural textures built), `se:realtextures` (image textures loaded).

## Surface mode
On the surface: `SE.look(dx,dy)` turns your head, `SE.fly(x, y, z)` walks (x strafe, z forward, ~6 m/s) and `y` hovers
up/down (0–80 m, jet-pack style), so the built-in thumbstick and ▲/▼ buttons work unchanged. `SE.zoom` is ignored.
Each world gets its own sky: black with stars on airless bodies, butterscotch on Mars, blue on Earth, thick orange
haze on Venus and Titan, a thin blue haze on Pluto. The parent planet hangs in the sky for moons (Earth from the Moon,
Jupiter from Io, Saturn with rings from Titan…), and the largest moon for planets. `selectPlanet`/`overview` while
landed leave the surface immediately and fly. Terrain is procedural and endless (the grid follows the walker).

## Textures
Real imagery lives in `textures/` (NASA Blue Marble / Black Marble / clouds for Earth – public domain; Solar System
Scope CC BY 4.0 for the Sun, other planets, the Moon, Saturn's rings and the Milky Way – see ../CREDITS.md).
Earth uses a Phong material with an ocean specular mask, city lights on the night side (shader patch), a cloud layer
and an atmosphere rim shader. The 4K Earth day map is only loaded when Earth is selected and the device is holding
>45 fps with ≥4 GB memory. Every image has a procedural fallback; small moons and Pluto/Charon are procedural.

Scale: radii ∝ √km, orbits = 16 + 26·AU^0.6 scene units, moon distances ∝ √(distance/parent radius).
Planets start at their real J2000-based mean longitudes for today's date. Axial spin and moon orbits are
visually slowed (×0.02, ×0.1) so they stay readable at 1 day/s.
Pixel ratio adapts between 0.6 and min(devicePixelRatio, 2) to hold ~40–60 fps.
Three.js r160 is vendored in `vendor/` (MIT, see THREE-LICENSE).

## Desktop controls (`scene/desktop.js`)
Enabled automatically when `matchMedia('(pointer: fine)')` matches (override with `init({desktop:true|false})`); touch/mobile is unchanged.
W/A/S/D or arrows = fly (walk on a surface) · Q/E = down/up · Shift = ×4 boost · mouse drag = look · wheel = zoom ·
click = select (fires `se:selected` with `detail.fly === false`, no flight) · double-click = fly there (`selectPlanet`).
Desktop also renders with antialiasing and a pixel ratio of max(1.5, devicePixelRatio) capped at 2 (adaptive floor 0.85).
The `#se-joy` thumbstick is hidden by CSS under `(pointer: fine)`.
Extra API: `SE.select(name)` (select without flying), `SE.setBoost(k)` (speed multiplier), `SE.isDesktop`.

## Astro (`astro/astro.js`)
Offline space-guide answer engine, loaded by index.html before ui/ui.js: `ASTRO.questions(name)`, `ASTRO.answer(name, q)`,
`ASTRO.ask(name, freeText)`, `ASTRO.speak(text)` / `ASTRO.stop()`; fires `astro:speaking` / `astro:done` on window.
