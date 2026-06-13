# Reciprocal Zenith Angles

**An interactive 3D explainer of how surveyors measure the curvature of the Earth — and why those measurements are impossible to reproduce on a flat earth.**

**▶ Live demo: [rza.flerfwatch.com](https://rza.flerfwatch.com)**

Two surveyors stand a known distance apart, each with a theodolite, and aim at
the other. On a sphere, the two *zenith angles* they read do not add up to 180° —
they overshoot by an amount that depends only on the distance between them and the
radius of the planet:

```
z_A + z_B = 180° + d / R
```

That tiny excess is a direct, repeatable measurement of the Earth's radius. On a
flat earth the same two sightlines are simply mirror images across the midpoint, so
the angles pin to **exactly 180° at every distance** — the excess is zero, and there
is nothing left to measure. This app lets you see both worlds at once and morph
continuously between them.

## What it does

- **Two surveyors, live geometry.** Place two observers on the surface, aim their
  theodolites at each other, and watch the zenith angles and their sum update in
  real time.
- **Globe ↔ flat morph.** A single slider tweens the surface curvature `c = 1/R`
  from a globe all the way down to `c → 0` (flat). The math model is *one* unified
  model — flat earth is not a special case bolted on, it's just the zero-curvature
  limit of the same equations.
- **The implied-radius readout.** From the measured angle excess the app back-solves
  `R = d / (z_A + z_B − 180°)` and shows it to you. On a globe it lands on the radius
  you set. Flat ⇒ excess 0 ⇒ the radius is undefined. The measurement *can't* return
  a finite flat answer.
- **Atmospheric refraction, simulated honestly.** A refraction slider (the surveyor's
  coefficient *k*) bends the sightlines into real circular arcs. Each eye reads the
  arc's *tangent*, so refraction shrinks the measured excess — exactly the error real
  surveyors correct for. Crucially, refraction bends light *down*; it can shave the
  excess but it can never manufacture curvature out of a flat earth. Scenario presets
  carry the standard surveying *k* table.
- **First-person theodolite views** with a level-line HUD, a cutaway view of the
  planet, and a guided tour that walks through the whole argument step by step.
- **Desktop and mobile**, touch orbit/look, no install.

## Why it was built

Flat-earth arguments lean almost entirely on *appeals to the eye* — "it looks flat,"
"I don't feel it moving." Reciprocal zenith angles are the opposite kind of evidence:
a boring, 200-year-old instrument procedure that produces a *number*, and the number
only has a finite answer if the ground is curved. It's hard to argue with a
protractor.

The goal of this project is to make that procedure tangible. Instead of asking you
to trust a textbook formula, it draws the actual sightlines, lets you move the
surveyors, lets you flatten the world with a slider, and shows the readout collapsing
to "undefined" the instant the curvature hits zero. The flat-earth claim isn't
dismissed — it's *simulated*, side by side with the globe, using the same math, so you
can watch exactly where and why it fails.

## The science (it's real, and it's old)

This is not a toy equation invented for a website. It is **trigonometric leveling with
reciprocal vertical angles**, standard practice in geodetic surveying since the 1800s.
The great national triangulations of France, Britain and India all depended on it.
It's why long bridges and tunnels have to budget for curvature: the two ends of a
35 km tunnel survey would miss each other by meters if the Earth were modeled flat.

The key relationships, all computed live from the scene geometry (never faked):

- A surface point at arc distance `s` from the midpoint sits at
  `((sin sφ)/c, (cos sφ − 1)/c)` with `φ = s·c` (a small-angle Taylor fallback keeps
  it stable as `c → 0`).
- The zenith angle at each eye is `z = acos(up · sightDir)`. With equal instrument
  heights this gives `z_A + z_B = 180° + θ` exactly, where `θ = d/R` is the central
  angle subtended by the baseline.
- Refraction models the sightline as a circular arc of curvature `k/R`. The tangent
  each eye actually reads makes the measured sum `180° + θ − 2δ` with
  `δ = asin(L·c_ray/2)`. A naive radius then inflates to ≈ `R/(1−k)`; correcting for
  the known air coefficient divides it back out — which is exactly what a real survey
  crew does.

By default the app shows a deliberately small "toy planet" (~1,000 km radius) so the
angles are large enough to see with the naked eye. Switch the radius to **6,371 km**
(the real Earth) and the readouts become precisely what real surveyors measure: the
excess shrinks to about **0.9° per 100 km** but never reaches zero, and it always
implies the same radius. On a flat earth it is **0.000° at every distance**. That gap
is the entire point.

## How it was built

- **[three.js](https://threejs.org) r180**, vendored directly into `www/vendor/` —
  no package manager, no bundler, no build step.
- **Vanilla ES modules + an import map.** `www/js/main.js` is the whole application:
  the scene, the curvature morph, the angle math, the refraction model, the tour
  engine, the first-person camera and HUD.
- **Plain HTML/CSS** for the UI (`www/index.html`, `www/css/style.css`), responsive
  down to a mobile bottom-sheet layout.
- Served as static files by any web server. Because there's no build step, editing a
  source file and refreshing the page is the entire dev loop.

```
www/
├── index.html        UI panels, tour, readouts, intro/about overlays
├── css/style.css     styling, responsive ≤920px layout
├── js/main.js        the entire app — scene, morph, tour, math, FP camera, HUD
└── vendor/           three.js r180 + OrbitControls + CSS2DRenderer
docker-compose.yaml   one-command local run
default.conf          nginx config used by the compose file
```

## Run it

With Docker:

```bash
git clone https://github.com/harnoldcodes/rza.git
cd rza
docker compose up -d
# open http://localhost:8080
```

Or with any static file server — there is nothing to compile:

```bash
cd rza/www
python3 -m http.server 8080
# open http://localhost:8080
```

## License

MIT — see [`LICENSE`](LICENSE).
