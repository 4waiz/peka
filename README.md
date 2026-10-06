# P.E.K.A. — Predictive Emulator for Kinetic Assessments

**The City That Heals Itself.** An interactive digital twin that watches the
utilities under a city, spots a developing water-main leak from sensor data,
predicts when it will fail, ranks the repair and dispatches a crew — before
anything breaks.

```bash
npm install
npm run dev
```

No backend, API keys or external assets — the city, underground utilities and
sensor feed are generated procedurally / simulated locally.

## Presenting

Press **Run AI Simulation** (or `Space`) for the 45-second guided story:
healthy city → sensor anomaly → AI correlation → leak localised in Sector B-12 →
streets break open to reveal the pipes → leak reveal → failure forecast →
impact on hospital, school and residents → prioritisation → repair plan and
crew dispatch. The UI scales to fit any screen; `F` toggles fullscreen.

The screen reads left to right: live sensor status and the AI summary, the 3D
twin with the alert and camera/layer controls, then the repair plan and risk
map. The bottom row follows the pipeline: workflow, failure timeline, risk
score and affected services.

| Key | Action |
| --- | --- |
| `Space` | Run / stop the AI simulation · `→` next step |
| `R` / `U` / `L` | Reset view · underground · fly to the leak |
| `1` `2` `3` | 3D twin · map · asset view |
| `X` | X-ray: streets break apart to show the utilities |
| `T` | Day / night mode |
| `?` | All shortcuts |

Mouse: drag to orbit, right-drag to pan, scroll to zoom, click sectors or pipes
to inspect, double-click a pipe to follow it underground.

## Structure

- `src/three/` — Three.js twin: procedural city, cut-away ground, utility
  network with flow shaders, leak simulation, road slabs, camera, overlays
- `src/simulation/` — sensor engine, risk scoring, scripted demo, world data
- `src/components/` — React UI (sidebars, bottom row, drawers, overlays)
- `src/store/` — Zustand store and actions bridging UI and the 3D engine

Risk weights and model outputs are illustrative prototype values, not a
validated engineering model.
