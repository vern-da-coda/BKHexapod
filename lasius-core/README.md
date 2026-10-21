# lasius-core

Embedded Python locomotion engine, hardware abstraction layer, control pipeline, and server daemon for the **Lasius** 18-DOF Hexapod robot.

## Architecture

`lasius-core` implements a clean 4-layer decoupled architecture under native PEP 420 namespace `lasius.core`:

```text
src/lasius/core/
├── hardware/   # Hardware Abstraction Layer (HAL)
│   ├── driver.py  # PWMDriverProtocol, MockPWMDriver, RealPCA9685Driver (smbus2)
│   └── servo.py   # Servo motor model with software limits, pulse conversion & relax
├── motion/     # Kinematics & Locomotion
│   ├── kinematics.py # 3-DOF closed-form insect inverse kinematics
│   ├── leg.py        # Leg and Joint abstractions with BodySide & LegRow enums
│   └── gait.py       # 50 Hz Harmonic Cosine gait engine (OmniGait, Tripod, Ripple, Wave)
├── control/    # Command & Order Pipeline
│   ├── orders.py     # Order, OrderAction, OrderStatus, OrderPriority, OrderResult
│   └── dispatcher.py # OrderDispatcher: arbitration, async worker, watchdog, E-Stop
└── server/     # Transport & Telemetry
    ├── app.py        # LasiusServer combining HTTP REST and 50 Hz WebSocket server
    └── handlers.py   # LasiusRestHandler (/api/v1/...) serving static Vite dist/
```

## Tools & Entry Points

- **`run_server.py`**: Persistent robot daemon.
  ```bash
  python3 run_server.py --hardware   # on Raspberry Pi with dual PCA9685
  python3 run_server.py              # on laptop with mock simulation
  ```
- **`calibrate.py`**: Interactive CLI and 3D Digital Twin calibration tool for pulse offsets and joint orientation.
  ```bash
  python3 calibrate.py --hardware --leg left_rear
  ```
- **`check_hardware.py`**: Hardware diagnostic scanner for I2C busses (verifies `0x40` and `0x42`).
  ```bash
  python3 check_hardware.py --scan
  ```

## REST API & OpenAPI Specification (`/api/v1/...`)

Full OpenAPI 3.1.0 specification available in [openapi.yaml](openapi.yaml) and served live:
- `GET /api/v1/openapi.yaml`: Raw OpenAPI 3.1 specification (YAML).
- `GET /api/v1/openapi.json`: OpenAPI 3.1 specification (JSON).
- `GET /api/v1/status`: Robot telemetry, locomotion vectors, active orders, client count.
- `GET /api/v1/system/stats`: Raspberry Pi hardware KPIs (CPU, RAM, Temp, Power Health, Wi-Fi).
- `GET /api/v1/robot`: Chassis geometry, segment dimensions, and leg mount coordinates.
- `GET /api/v1/orders`: Recent order execution history with duration and results.
- `GET /api/v1/orders/{order_id}`: Query order status and telemetry by ID.
- `POST /api/v1/orders`: Submit commands (`SET_JOINT_ANGLE`, `SET_LEG_JOINTS`, `TEST_LEG`, etc.).
- `POST /api/v1/emergency_stop`: Immediate motion halt and PWM disable (Priority 99).
- `POST /api/v1/relax`: Disable PWM signals on all 18 servos.
- `POST /api/v1/server/restart`: Safely halt locomotion, relax PWM, and restart daemon process.
- `POST /api/v1/server/shutdown`: Safely halt locomotion, relax PWM, and power off the Raspberry Pi.
- `POST /api/v1/legs/{leg}/test`: Launch isolated harmonic step cycle.
- `POST /api/v1/legs/{leg}/stance`: Move leg smoothly to neutral stance coordinates.

## Testing

Run unit and integration tests (51 tests in core, 54 total):
```bash
pytest tests/
```
