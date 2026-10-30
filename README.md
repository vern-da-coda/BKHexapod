# Lasius Hexapod Control Software
Modular control software, 3D Digital Twin, REST/WebSocket control API, and teleoperation system for an 18-DOF, 6-legged (hexapod) biomimetic walking robot.

## Repository Structure (Monorepo)

The repository is organized into three decoupled modules using native PEP 420 namespace packages (`lasius.core` and `lasius.pilot`):

```text
lasius
├── lasius-core/                     # Embedded Python backend & locomotion engine
│   ├── src/lasius/core/             # 4-Layer Architecture (hardware, motion, control, server)
│   │   ├── hardware/                # Thread-safe Dual PCA9685 I2C driver & servo models
│   │   ├── motion/                  # 3-DOF closed-form IK & 50 Hz Harmonic Gait engine
│   │   ├── control/                 # Command pipeline, OrderDispatcher & arbitration
│   │   └── server/                  # HTTP REST, WebSocket server & system_stats.py
│   ├── tests/                       # Unit & integration tests (Kinematics, Gaits, Drivers, Orders, REST)
│   ├── openapi.yaml                 # Canonical OpenAPI 3.1.0 specification
│   ├── lasius-rest-control-api.http # PyCharm / IntelliJ / VS Code REST Client test collection
│   ├── lasius.service               # Systemd daemon autostart unit for Raspberry Pi
│   ├── calibrate.py                 # Interactive CLI & 3D calibration tool
│   ├── check_hardware.py            # Hardware diagnostic & I2C bus scanner
│   ├── run_server.py                # Persistent HTTP REST & WebSocket telemetry daemon
│   └── pyproject.toml               # Core package dependencies & CLI entry point (lasius-server)
├── lasius-dashboard/                # Vue 3 + TypeScript + Pinia 3D Digital Twin & browser interface
│   ├── src/                         # Modular Single-File Components (<script setup lang="ts">)
│   │   ├── components/              # AppHeader, DigitalTwin3D, OrthogonalStrip2D, sidebar tabs & JointCard.vue
│   │   ├── engine/                  # Three.js LasiusGraphicsEngine & 2D CAD projection math
│   │   ├── stores/                  # Pinia dashboardStore (WebSocket telemetry & order dispatch)
│   │   ├── types/                   # Shared TypeScript interfaces & domain types
│   │   └── styles/                  # Cleaned CSS design system & typography
│   ├── dist/                        # Production assets served statically by robot daemon
│   ├── index.html                   # Single-page application root
│   ├── package.json                 # Vue 3, Pinia, TypeScript, Three.js & Vite toolchain
│   └── vite.config.ts               # Vite configuration (relative base URL)
├── lasius-pilot/                    # Teleoperation client
│   ├── src/lasius/pilot/            # Gamepad controller (/dev/input/js0 event reader) & CLI
│   ├── tests/                       # Controller unit tests
│   ├── cli.py                       # Bluetooth gamepad CLI launcher
│   └── pyproject.toml               # Pilot package dependencies & CLI entry point (lasius-pilot)
├── scripts/                         # Development, simulation, deployment & backup helper tools
│   ├── banner.txt                   # Shared ASCII CLI header banner
│   ├── dev_sim.sh                   # Launch local mock simulation server & dashboard
│   ├── deploy_pi.sh                 # Compile and deploy to Raspberry Pi with graceful reload
│   ├── run_tests.sh                 # Execute test suite across core and pilot
│   ├── backup_calibration.sh        # Backup calibration.json snapshot with timestamp
│   └── status_pi.sh                 # Query live Pi telemetry, KPIs and robot status
├── backups/                         # Local calibration backup snapshots (.gitignore)
├── cad/scans/                       # 3D scan meshes (.stl / .obj) for reverse-engineered leg parts
├── GAMEPAD_STADIA.md                # Google Stadia Controller setup, button map & code changelog
├── TODOS.md                         # Project task list, backlog & feature ideas
└── pyproject.toml                   # Top-level workspace & pytest configuration
```

---

## Physical & Hardware Specifications

All physical dimensions and servo configurations are maintained in [`lasius-core/src/lasius/core/config.yaml`](lasius-core/src/lasius/core/config.yaml):

- **Leg Limb Lengths (inter-axis distances):**
  - **Coxa:** 6 cm (60 mm) — bracket extends an additional 3 cm (30 mm) inwards from the vertical pivot axis towards the chassis interior
  - **Femur:** 10 cm (100 mm)
  - **Tibia:** 13 cm (130 mm)
- **Chassis Dimensions & Dual-Plate Construction:**
  - **Dual Sandwich Plates:** Two distinct 5 mm chassis plates (carbon/aluminum) sandwiching and supporting the 6 coxa rotation axes from top and bottom.
  - **Plate Clearance & Standoffs:** 24 mm internal vertical gap spanned by 6 cylindrical standoff spacer pillars.
  - **Front & Rear width:** 13 cm (130 mm, $X = \pm 65\,\text{mm}$)
  - **Middle width:** 15 cm (150 mm, $X = \pm 75\,\text{mm}$)
  - **Axis distance along body:** 9 cm (90 mm, $Y = -90\,\text{mm}$ front, $0\,\text{mm}$ middle, $+90\,\text{mm}$ rear)
  - **Default Stance:** $X = 160\,\text{mm}$ radial reach, $Z = -80\,\text{mm}$ ground clearance.
- **Actuation & Planned Sensor Expansion:**
  - **Servos (18×):** Standard 25T spline metal-gear servos.
  - **PWM Drivers (2×):** PCA9685 on I2C Bus 1 at `0x40` (left 9 servos) and `0x42` (right 9 servos, A1 bridged), powered by a 6.0 V high-current UBEC. PCA9685 `ALLCALL` (`0x70`) is explicitly disabled in software to avoid address collision with the I2C multiplexer.
  - **Planned STEMMA QT / Qwiic Sensor Bus (I2C):**
    - `0x70`: Adafruit PCA9548 8-Channel I2C Multiplexer
    - `0x4A`: Adafruit BNO085 9-DOF Orientation IMU
    - `0x41` & `0x44`: 2× Adafruit INA260 High-Side Voltage/Current/Power Monitors (left & right servo banks)
    - `CH0–CH2` (`0x29`): 3× Adafruit VL53L4CD Time-of-Flight laser distance sensors (1–1300 mm, front left/center/right)
    - `0x20`: Adafruit MCP23017 16-pin I2C GPIO expander reading 6× foot contact microswitches

---

## Key Features

- **Harmonic Cosine 50 Hz Walking Engine & Safe Locomotion State Machine:**
  - $C^1$-continuous harmonic cosine trajectories across swing and stance phases with zero-velocity liftoff and touchdown (reducing acceleration jerk by $>5\times$).
  - Continuous duty-cycle and phase morphing between Tripod, Ripple, and Wave gaits.
  - **Safe Boot & Disengagement Arbitration (`locomotion_active`):** The daemon boots with `OmniGait` attached in a disengaged, zero-PWM state (`locomotion_active = False`). Locomotion or pose orders (`SET_VELOCITY`, `SET_WALK`, `SET_TURN`, `SET_POSE`, `SET_HEIGHT`, `SET_ROLL`, `SET_PITCH`, `RESET_POSE`) automatically engage the 50 Hz gait loop, while single-joint/single-leg calibration commands (`SET_JOINT_ANGLE`, `SET_LEG_JOINTS`, `RELAX_LEG`, `RELAX_ALL`, `EMERGENCY_STOP`) and async test sequences (`TEST_LEG`, `STANCE_LEG`, `SWEEP_JOINT`) automatically disengage full-body gait actuation so isolated leg tests are never overwritten.
- **Inverse Kinematics (IK):**
  - 3-DOF insect-leg closed-form kinematics translating Cartesian foot coordinates `(x, y, z)` into joint angles (Coxa, Femur, Tibia).
- **Thread-Safe Dual PCA9685 Hardware Drivers:**
  - Shared per-bus `threading.RLock` protecting concurrent I2C transactions between the 50 Hz locomotion loop and asynchronous `OrderDispatcher` worker threads.
  - Microsecond-accurate pulse calculation with center offsets, orientation inversion, and software safety limits.
- **Order Pipeline & REST/WebSocket Control API:**
  - Transport-agnostic `OrderDispatcher` supporting immediate and asynchronous tasks with priority arbitration and cancellation watchdog.
  - Instant joint actuation (`SET_JOINT_ANGLE`, `SET_LEG_JOINTS`) with sub-2ms hardware latency.
  - Full REST API under `/api/v1/...` and reactive 50 Hz WebSocket event streaming.
- **Modular Vue 3 + TypeScript + Pinia Architecture (`lasius-dashboard`):**
  - Modern Single-Page Application built with Vue 3 `<script setup lang="ts">` and Vite.
  - Reusable `JointCard.vue` component for both Direct Drive and Calibration modes.
  - Pinia `dashboardStore.ts` for unified WebSocket streaming, telemetry synchronization, and order dispatching.
  - High-performance Three.js encapsulation using `shallowRef`, in-place `BufferAttribute` updates for 50 Hz motion-range arcs, and proper WebGL geometry/material disposal.
  - Responsive keyboard controls (`WASD`, `QE`, `Arrows`, `Space`) with automatic `keyup` stop detection.
- **Biomimetic 3D Digital Twin & Multi-View Interface:**
  - Real-time Three.js 3D WebGL viewport and 2D orthographic projections (Top XY, Side YZ, Front XZ).
  - Dual 5 mm chassis plates sandwiching the 6 coxa rotation axes with internal standoff spacer pillars.
  - Unified chassis and leg styling using identical PBR material (`#343746`) and a compact blue forward direction indicator triangle (`#3498db`).
  - Clean CAD orthographic projections using strictly straight vectors for all limb segments.
- **4-Tab Control Sidebar:**
  - **Tab 1: Gait & Directions:** D-Pad (WASD / QE), Tripod/Ripple/Wave selector, Speed & Stride sliders, 6-DOF Body Attitude (Height, Roll, Pitch).
  - **Tab 2: Leg Control (Direct Drive & Calibration):**
    - Interactive leg selector (`LF`, `LM`, `LR`, `RF`, `RM`, `RR`) synchronized with the 3D viewport.
    - **Direct Drive Mode:** 3 individual joint sliders (Coxa, Femur, Tibia) with live degree readouts; neutral stance, zero, and relax actions.
    - **Calibration Mode (Option C Robotics Overlay):** Isolated reference pose alignment (`🎯 Align Ref Pose (0°)`, relaxing the other 15 servos), live microsecond pulse trim steppers (`[-10µs]`, `[-1µs]`, `[Zero]`, `[+1µs]`, `[+10µs]`), live direction inversion checkbox (`Inverted (-1)`), limit boundaries (`Min/Max Angle`), range motion test sweeps, atomic `calibration.json` persistence (`💾 Save Calibration`), and factory defaults reset (`↺ Reset Leg`).
  - **Tab 3: Tests:** Harmonic step cycles with configurable cycle count, joint collision sweeps, all-stance, relax-all, and live order execution monitor.
  - **Tab 4: System (Raspberry Pi Telemetry & KPIs):** Real-time monitoring of SoC temperature (°C), CPU load average & utilization %, RAM memory & daemon RSS, hardware power health and under-voltage detection (`vcgencmd get_throttled`), Wi-Fi RSSI level (dBm) & link quality, root storage disk space, and system uptime.
- **Global Header Actions:**
  - Global `⛔ E-Stop` button: Immediately halts motion and relaxes all 18 servos.
  - `⟳ Restart Server` button: Safely relaxes PWM and re-executes the server daemon in the background with automated reconnection polling.
  - `⏻ Shutdown` button: Safely relaxes all 18 servos, stops the daemon, and powers off the Raspberry Pi with interactive confirmation and status overlay.
- **Gamepad Teleoperation (`lasius-pilot`, see [`GAMEPAD_STADIA.md`](GAMEPAD_STADIA.md)):**
  - High-performance, zero-external-dependency Linux joystick reader (`/dev/input/js0`) with configurable radial deadzones, atomic `set_velocity` WebSocket streaming, and first-class **Google Stadia Controller** support (`Axis 2` turn mapping + action buttons for E-Stop, gait switching, speed, body height, and pose reset).

---

## REST Control API & OpenAPI 3.1 (`/api/v1/...`)

The daemon serves a clean JSON REST API and OpenAPI 3.1.0 specification on port `8000` (see [`lasius-core/lasius-rest-control-api.http`](lasius-core/lasius-rest-control-api.http) for ready-to-run HTTP requests):

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/openapi.yaml` | `GET` | OpenAPI 3.1.0 specification in YAML format |
| `/api/v1/openapi.json` | `GET` | OpenAPI 3.1.0 specification in JSON format |
| `/api/v1/status` | `GET` | Health status, control vectors, active orders, client count |
| `/api/v1/system/stats` | `GET` | Raspberry Pi KPIs: CPU %, Load Avg, RAM, SoC Temp, Power Health, Wi-Fi |
| `/api/v1/robot` | `GET` | Full kinematic geometry and joint layout definition |
| `/api/v1/calibration` | `GET` | Query runtime calibration parameters and overlay state for all 18 servos |
| `/api/v1/calibration` | `POST` | Atomically save servo calibration overlay to `calibration.json` |
| `/api/v1/calibration/trim` | `POST` | Live in-memory servo trim adjustment (immediate actuation, no disk write) |
| `/api/v1/calibration/reset` | `POST` | Reset target servo, leg, or all servos back to `config.yaml` factory defaults |
| `/api/v1/orders` | `GET` | History of recently executed orders with latency & duration |
| `/api/v1/orders/{order_id}` | `GET` | Status and telemetry of a specific order by ID |
| `/api/v1/orders` | `POST` | Submit any robot order (`SET_JOINT_ANGLE`, `SET_LEG_JOINTS`, `TEST_LEG`, etc.) |
| `/api/v1/emergency_stop` | `POST` | Immediate Priority-99 E-Stop: stops motion and relaxes all 18 servos |
| `/api/v1/relax` | `POST` | Disables PWM output across all PCA9685 channels |
| `/api/v1/server/restart` | `POST` | Safely halts motion, relaxes PWM, and restarts daemon process |
| `/api/v1/server/shutdown` | `POST` | Safely halts motion, relaxes PWM, and powers off the Raspberry Pi |
| `/api/v1/legs/{leg}/test` | `POST` | Launches isolated harmonic step cycle on target leg |
| `/api/v1/legs/{leg}/stance` | `POST` | Moves target leg smoothly into neutral standing position |

---

## Quickstart & Developer Workflows

### Helper Scripts (`scripts/`)

Pre-configured shell scripts in [`scripts/`](scripts/) automate common development, simulation, deployment, and maintenance tasks:

| Script | Description | Usage |
| :--- | :--- | :--- |
| [`scripts/dev_sim.sh`](scripts/dev_sim.sh) | Launches the local simulation server (Mock HAL) on port 8000 (HTTP) & 8765 (WS). | `./scripts/dev_sim.sh` |
| [`scripts/run_tests.sh`](scripts/run_tests.sh) | Runs all 59 unit & integration tests across `lasius-core` (55) and `lasius-pilot` (4). | `./scripts/run_tests.sh` |
| [`scripts/deploy_pi.sh`](scripts/deploy_pi.sh) | Builds the Vue 3 dashboard (Vite), syncs `core`, `pilot`, & `dist/` to the Pi via `rsync`, and gracefully reloads the daemon. | `./scripts/deploy_pi.sh [PI_IP]` |
| [`scripts/status_pi.sh`](scripts/status_pi.sh) | Queries live telemetry, Raspberry Pi KPIs, SoC temperature, power health, and gait vectors. | `./scripts/status_pi.sh [PI_IP]` |
| [`scripts/backup_calibration.sh`](scripts/backup_calibration.sh) | Downloads and validates `calibration.json` with a timestamp into [`backups/`](backups/). | `./scripts/backup_calibration.sh [PI_IP]` |
| [`scripts/banner.txt`](scripts/banner.txt) | Centralized `Lasius HexaPod` ASCII CLI header banner displayed by all shell scripts. | `cat scripts/banner.txt` |

### 1. Installation & Local Simulation (Workstation without Robot)

1. **Create a virtual environment & install packages in editable mode:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e lasius-core -e lasius-pilot
   ```
2. **Build the Dashboard (Vite):**
   ```bash
   cd lasius-dashboard
   npm install
   npm run build
   cd ..
   ```
3. **Run the Automated Test Suite (59 tests: 55 in `lasius-core`, 4 in `lasius-pilot`):**
   ```bash
   ./scripts/run_tests.sh
   # or directly via uv:
   uv run pytest
   ```
4. **Launch the Simulation Daemon & 3D Digital Twin:**
   ```bash
   ./scripts/dev_sim.sh
   # or directly:
   python3 lasius-core/run_server.py
   ```
   - **REST API & 3D Web Dashboard:** `http://127.0.0.1:8000`
   - **WebSocket Telemetry Stream:** `ws://127.0.0.1:8765`

### 2. Raspberry Pi Deployment & Autostart (`systemd`)

Deploy code and pre-built dashboard assets from your workstation or configure `systemd` on the Raspberry Pi:
```bash
# Deploy from workstation (pings Pi, builds dashboard, syncs files via rsync, restarts service)
./scripts/deploy_pi.sh 192.168.0.123

# Run directly on the Raspberry Pi with physical PCA9685 hardware
python3 lasius-core/run_server.py --hardware

# Copy and enable the systemd service on the Raspberry Pi
sudo cp lasius-core/lasius.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lasius.service

# Check service status and live logs
sudo systemctl status lasius
journalctl -u lasius -f
```

### 3. Live Robot Status, Calibration Backup & Emergency Handling

- **Query Live Robot Status & Raspberry Pi System Health:**
  ```bash
  ./scripts/status_pi.sh 192.168.0.123
  ```
- **Backup Servo Calibration (`backups/calibration_YYYYMMDD_HHMMSS.json`):**
  ```bash
  ./scripts/backup_calibration.sh 192.168.0.123
  ```
- **Emergency Stop (E-Stop) & Relax All 18 Servos via CLI:**
  ```bash
  # Immediate Priority-99 E-Stop (halts motion & de-energizes all servos)
  curl -s -X POST http://192.168.0.123:8000/api/v1/emergency_stop

  # Relax all 18 servos (disable PWM channels)
  curl -s -X POST http://192.168.0.123:8000/api/v1/relax
  ```

### 4. Interactive Leg Calibration & Hardware Diagnostics

Calibrate individual servos in the terminal or scan the I2C bus:
```bash
# Interactive pulse trim tool with 3D twin feedback
python3 lasius-core/calibrate.py --hardware --leg left_rear

# Scan I2C bus for 0x40 and 0x42
python3 lasius-core/check_hardware.py --scan
```
