# Lasius Hexapod Control Software

Modular control software, 3D Digital Twin, REST/WebSocket control API, and teleoperation system for an 18-DOF, 6-legged (hexapod) biomimetic walking robot.

## Repository Structure (Monorepo)

The repository is organized into three decoupled modules using native PEP 420 namespace packages (`lasius.core` and `lasius.pilot`):

```text
lasius
├── lasius-core/                     # Embedded Python backend & locomotion engine
│   ├── src/lasius/core/             # 4-Layer Architecture (hardware, motion, control, server)
│   │   ├── hardware/                # Dual PCA9685 I2C driver & servo models
│   │   ├── motion/                  # 3-DOF closed-form IK & 50 Hz Harmonic Gait engine
│   │   ├── control/                 # Command pipeline, OrderDispatcher & arbitration
│   │   └── server/                  # HTTP REST, WebSocket server & system_stats.py
│   ├── tests/                       # Unit & integration tests (Kinematics, Gaits, Drivers, Orders, REST)
│   ├── openapi.yaml                 # Canonical OpenAPI 3.1.0 specification
│   ├── laisus-rest-control-api.http # PyCharm / IntelliJ / VS Code REST Client test collection
│   ├── lasius.service               # Systemd daemon autostart unit for Raspberry Pi
│   ├── calibrate.py                 # Interactive CLI & 3D calibration tool
│   ├── check_hardware.py            # Hardware diagnostic & I2C bus scanner
│   ├── run_server.py                # Persistent HTTP REST & WebSocket telemetry daemon
│   └── pyproject.toml               # Core package dependencies
├── lasius-dashboard/                # Standalone 3D Digital Twin & browser interface (Vite build)
│   ├── index.html                   # 4-Tab UI (Gait & Directions, Leg Control, Tests, System)
│   ├── main.js                      # Three.js ES module rendering & 2D orthographic projections
│   ├── style.css                    # Dashboard styling, KPI cards & layout
│   ├── dist/                        # Production assets served statically by robot daemon
│   ├── package.json                 # Vite & Three.js dependency management
│   └── vite.config.js               # Vite configuration (relative base URL)
├── lasius-pilot/                    # Teleoperation client
│   ├── src/lasius/pilot/            # Gamepad controller (/dev/input/js0 event reader)
│   ├── tests/                       # Controller unit tests
│   ├── cli.py                       # Bluetooth gamepad CLI
│   └── pyproject.toml               # Pilot package dependencies
├── gemini.md                        # Hardware registry, pinout & calibration specs
└── pyproject.toml                   # Top-level workspace & pytest configuration
```

---

## Physical Specifications

All physical dimensions and servo configurations are maintained in [`lasius-core/src/lasius/core/config.yaml`](lasius-core/src/lasius/core/config.yaml):
- **Leg Limb Lengths (inter-axis distances):**
  - **Coxa:** 6 cm (60 mm)
  - **Femur:** 10 cm (100 mm)
  - **Tibia:** 13 cm (130 mm)
- **Chassis Dimensions (mount point axes):**
  - **Front & Rear width:** 13 cm (130 mm, $X = \pm 65\,\text{mm}$)
  - **Middle width:** 15 cm (150 mm, $X = \pm 75\,\text{mm}$)
  - **Axis distance along body:** 9 cm (90 mm, $Y = -90\,\text{mm}$ front, $0\,\text{mm}$ middle, $+90\,\text{mm}$ rear)

---

## Key Features

- **Harmonic Cosine 50 Hz Walking Engine:**
  - $C^1$-continuous harmonic cosine trajectories across swing and stance phases.
  - Zero-velocity liftoff and touchdown reducing acceleration shock and jerk by $>5\times$.
  - Continuous duty-cycle and phase morphing between Tripod, Ripple, and Wave gaits.
- **Inverse Kinematics (IK):**
  - 3-DOF insect-leg closed-form kinematics translating Cartesian foot coordinates `(x, y, z)` into joint angles (Coxa, Femur, Tibia).
  - Configurable coxa baseline angle offsets (e.g. $+40^\circ$ rear leg clearance).
- **Dual PCA9685 Hardware Drivers:**
  - I2C bus 1 control at `0x40` (left side) and `0x42` (right side, solder bridge A1).
  - Microsecond-accurate pulse calculation with center offsets and software safety limits.
- **Order Pipeline & REST/WebSocket Control API:**
  - Transport-agnostic `OrderDispatcher` supporting immediate and asynchronous tasks with priority arbitration and cancellation watchdog.
  - Instant joint actuation (`SET_JOINT_ANGLE`, `SET_LEG_JOINTS`) with sub-2ms hardware latency.
  - Full REST API under `/api/v1/...` and reactive 50 Hz WebSocket event streaming.
- **Biomimetic 3D Digital Twin & Multi-View Interface:**
  - Real-time Three.js 3D WebGL viewport and orthographic 2D projections (Top XY, Side YZ, Front XZ).
  - Authentic morphology modeled from physical hardware: 36-point spline wasp-waist chassis hull, elevated electronics deck, 3D-printed Coxa servo bracket with top brass pinion gear, dual-plate carbon-fiber Femur link, and skeletonized curved Tibia sickle claw with posterior knee spurs.
  - Left-aligned view tabs under the header ruler for rapid perspective switching.
- **4-Tab Control Sidebar:**
  - **Tab 1: Gait & Directions:** D-Pad (WASD / QE), Tripod/Ripple/Wave selector, Speed & Stride sliders, 6-DOF Body Attitude (Height, Roll, Pitch).
  - **Tab 2: Leg Control:** Interactive 2D Chassis Minimap with interactive leg attachment points (`LF`, `LM`, `LR ★`, `RF`, `RM`, `RR`) with active glow highlighting and heading indicators (`▲ FRONT`); 3 individual joint sliders (Coxa, Femur, Tibia) with live degree readouts; neutral stance, zero, and relax actions.
  - **Tab 3: Tests:** Harmonic step cycles with configurable cycle count, joint collision sweeps, all-stance, relax-all, and live order execution monitor.
  - **Tab 4: System (Raspberry Pi Telemetry & KPIs):** Real-time monitoring of SoC temperature (°C) with color-coded status badges, CPU load average & utilization %, RAM memory (used/total MB) & daemon RSS, hardware power health and under-voltage / brownout detection (`vcgencmd get_throttled`), Wi-Fi RSSI level (dBm) & link quality, root storage disk space, and system uptime.
- **Global Header Actions:**
  - Global `⛔ E-Stop` button: Immediately halts motion and relaxes all 18 servos.
  - `⟳ Restart Server` button: Safely relaxes PWM and re-executes the server daemon in the background with automated reconnection polling.
  - `⏻ Shutdown` button: Safely relaxes all 18 servos, stops the daemon, and powers off the Raspberry Pi with interactive confirmation and status overlay.
- **Gamepad Teleoperation (`lasius-pilot`):**
  - High-performance, zero-external-dependency Linux joystick reader (`/dev/input/js0`) with configurable deadzones.

---

## REST Control API & OpenAPI 3.1 (`/api/v1/...`)

The daemon serves a clean JSON REST API and OpenAPI 3.1.0 specification on port `8000`:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/openapi.yaml` | `GET` | OpenAPI 3.1.0 specification in YAML format |
| `/api/v1/openapi.json` | `GET` | OpenAPI 3.1.0 specification in JSON format |
| `/api/v1/status` | `GET` | Health status, control vectors, active orders, client count |
| `/api/v1/system/stats` | `GET` | Raspberry Pi KPIs: CPU %, Load Avg, RAM, SoC Temp, Power Health, Wi-Fi |
| `/api/v1/robot` | `GET` | Full kinematic geometry and joint layout definition |
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

## Quickstart

### 1. Installation

Install both Python packages in editable development mode:
```bash
pip install -e lasius-core -e lasius-pilot
```

### 2. Build the Dashboard (Vite)

Compile the web interface assets to `lasius-dashboard/dist/`:
```bash
cd lasius-dashboard
npm install
npm run build
cd ..
```

### 3. Run Automated Tests

Run the full cross-package test suite (54 tests):
```bash
pytest
# or with uv:
uv run pytest
```

### 4. Launch the Daemon & 3D Digital Twin

Start the daemon (HTTP port 8000, WebSocket port 8765):
```bash
# Simulation mode (Mock driver on laptop)
python3 lasius-core/run_server.py

# Physical robot mode (on Raspberry Pi)
python3 lasius-core/run_server.py --hardware
```
Then open `http://<robot-ip>:8000` in any web browser.

### 5. Raspberry Pi Autostart (systemd)

To automatically launch the Lasius daemon on Raspberry Pi boot:
```bash
# Copy and enable the systemd service
sudo cp lasius-core/lasius.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lasius.service

# Check service status and live logs
sudo systemctl status lasius
journalctl -u lasius -f
```

### 6. Interactive Leg Calibration

Calibrate individual servos or legs with visual feedback:
```bash
# Interactive pulse trim tool with 3D twin feedback
python3 lasius-core/calibrate.py --hardware --leg left_rear
```

### 7. Hardware Diagnostics

Scan I2C busses and verify servo boards:
```bash
python3 lasius-core/check_hardware.py --scan
```
