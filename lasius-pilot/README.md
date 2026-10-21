# lasius-pilot

Teleoperation client and Bluetooth gamepad interface for the **Lasius** Hexapod robot.

## Features

- **Direct Linux Joystick Interface:**
  - Reads raw binary joystick events directly from `/dev/input/js0`.
  - Zero external C-bindings or heavy dependencies (uses Python standard library `struct` and `select`).
- **Configurable Input Mapping:**
  - Deadzone filtering on analog sticks.
  - Linear velocity mapping for walking forward/backward ($Y$) and strafe ($X$).
  - Angular yaw velocity mapping for turning ($Z$).
  - Button mapping for gait selection (Tripod, Ripple, Wave), height adjust, and Emergency Stop.
- **WebSocket & REST Client:**
  - Streams locomotion commands to `lasius-core` over WebSocket (`ws://<robot-ip>:8765`) or REST (`http://<robot-ip>:8000/api/v1/orders`).

## CLI Usage

```bash
# Launch gamepad teleoperation connecting to robot daemon
python3 -m lasius.pilot.cli --host 192.168.0.123
```

## Testing

```bash
pytest tests/
```
