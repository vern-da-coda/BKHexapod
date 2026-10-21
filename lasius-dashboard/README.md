# lasius-dashboard

Standalone 3D Digital Twin and web control interface for the **Lasius** Hexapod robot. Built with Three.js and Vite.

## Features

- **Interactive 3D WebGL Digital Twin:**
  - Real-time 60 FPS mesh rendering of the biomimetic robot chassis and authentic 18-DOF leg morphology based on physical hardware:
    - **Coxa:** 3D-printed rectangular servo housing bracket (50x28x30 mm) with top brass pinion gear.
    - **Femur:** Dual-plate carbon-fiber link (100 mm center-to-center) with internal spacer core and stainless steel screws.
    - **Tibia:** Curved skeletonized insect sickle claw (130 mm span) with posterior spur fins, hollow crescent window cutout, and contact pad.
  - Full camera navigation via OrbitControls (Left-drag rotate, Right-drag pan, Wheel zoom).
  - Ground plane grid with origin coordinate axes.
- **Multi-View 2D Orthographic Projections:**
  - Top View (XY Plane): Heading and lateral stride.
  - Side View (YZ Plane): Leg lift and posture profile.
  - Front View (XZ Plane): Stance width and knee height.
- **3-Tab Sidebar Control System:**
  - **Tab 1: Gait & Directions:**
    - Direction Pad (WASD / QE / Space) and Tripod / Ripple / Wave gait pattern selector.
    - Gait parameter sliders (Speed, Step Height, Step Length).
    - 6-DOF Body Attitude posing (Chassis Height, Roll, Pitch, Reset).
  - **Tab 2: Leg Control:**
    - Interactive 2D Chassis Minimap: Clickable attachment points on the robot body hull to select any of the 6 legs (`LF`, `LM`, `LR ★`, `RF`, `RM`, `RR`) with active glow highlighting and orientation indicators (`▲ FRONT`).
    - 3 color-coded joint sliders (Coxa, Femur, Tibia) with live degree readouts and low-latency hardware synchronization.
    - Quick actions: *Stance Position*, *Zero (0°)*, *Relax Leg*.
  - **Tab 3: Tests & Diagnostics:**
    - Parametrizable harmonic step cycle test run (1–10 cycles).
    - Single-joint mechanical collision sweeps (Coxa, Femur, Tibia).
    - System actions: *All in Stance*, *Relax All Servos*.
    - Live Order Monitor with execution duration and status logging.
- **Global Header & View Navigation:**
  - Connection status indicator and prominent **⛔ E-Stop** button with immediate priority-99 bypass.
  - View selector tabs (3D View, Multi 2D, Top XY, Side YZ, Front XZ) situated directly above the viewports, left-aligned under the header rule.

## Development & Build

### Install Dependencies
```bash
npm install
```

### Local Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```
Builds optimized static assets into `dist/` (`dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`).

The Python daemon in `lasius-core` automatically detects `dist/` and serves it statically on port 8000.
