# Projekt-Briefing: Lasius – Hexapod-Roboter & Digital Twin

Du unterstützt mich als KI-Entwickler beim Programmieren und Kalibrieren meines Hexapod-Roboters **Lasius** (6 Beine, 18 Freiheitsgrade / 18 Servos). Das Projekt gliedert sich modular in:
- **`lasius-core`**: Das Roboter-Backend auf dem Raspberry Pi (Hardware-Treiber, Kinematik, 50 Hz Harmonic Gait, Telemetrie- und Command-Server).
- **`lasius-dashboard`**: Das 3D Digital Twin Web-Interface (Three.js WebGL, 2D-Projektionen, Kalibrier- & Steuer-Dashboard, moderne Vite Toolchain mit `dist/`-Produktionsbuild, `vendor/` entfernt).
- **`lasius-pilot`**: Die Teleoperations-Anbindung für Bluetooth-Gamepads (PS4/PS5, Xbox, 8BitDo via Linux `/dev/input/js0`).

## 1. Entwicklungsumgebung & Workflow
- **Host-System (Laptop):** Ubuntu Linux mit PyCharm und Gemini CLI.
- **Ziel-System (Roboter):** Raspberry Pi 4 (IP: `192.168.0.123` / `bkhexapod.fritz.box`, User: `hexapod`).
- **Dateisystem & Deployment:** Der Projektordner liegt lokal unter `/home/bjoern/Workspace/Hexapods/lasius` und auf dem Raspberry Pi unter `/home/hexapod/lasius`.
- **Synchronisation:** Schneller, deterministischer Dateitransfer via `rsync` (ohne `node_modules` oder `.venv`). Das Dashboard wird lokal mit Vite vorkompiliert (`npm run build`) und als statisches `dist/`-Bundle auf den Pi übertragen.
- **WICHTIGE REGELN:**
  1. Python-Ausführung und Daemon-Betrieb erfolgen direkt auf dem Raspberry Pi über SSH (`python3 /home/hexapod/lasius/lasius-core/run_server.py --hardware`).
  2. Bei Hintergrundprozessen via SSH muss `stdin` entkoppelt werden (`</dev/null >/home/hexapod/server.log 2>&1 &`), um SSH-Hangs zu verhindern.
  3. Lokale Tests laufen mit `pytest` / `uv run pytest` (49 Tests).

## 2. Hardware-Architektur & Reale Abmessungen
- **Mechanik:** 6 Beine (3 links, 3 rechts). Jedes Bein besteht aus 3 Standard-Servomotoren:
  1. **Coxa** (Hüftgelenk – schwenkt vor/zurück in horizontaler Ebene): **6 cm (60 mm)**
  2. **Femur** (Oberschenkel – hebt/senkt das Bein, Knie nach oben gerichtet): **10 cm (100 mm)**
  3. **Tibia** (Unterschenkel/Fuß – neigt sich zum Boden): **13 cm (130 mm)**
- **Chassis-Geometrie (Achsen-Abstände am Körper):**
  - **Breite vorn & hinten:** **13 cm (130 mm)** ($X = \pm 65\,\text{mm}$)
  - **Breite mitte:** **15 cm (150 mm)** ($X = \pm 75\,\text{mm}$)
  - **Längsabstand der Achsen entlang des Körpers:** **9 cm (90 mm)** ($Y = -90\,\text{mm}$ vorn, $0\,\text{mm}$ mitte, $+90\,\text{mm}$ hinten)
- **Konfigurationsdatei (`lasius-core/src/lasius/core/config.yaml`):** Alle Maße, Montageachsen und Servo-Kalibrierungen liegen zentral als *Single Source of Truth* in `config.yaml` (und gespiegelten `servos.yaml`) und werden über typsichere Dataclasses (`GeometryConfig`, `LimbConfig`, `ChassisConfig`) geladen.
- **Servo-Controller:** Zwei **PCA9685 16-Kanal PWM/Servo-Treiber-Boards** (Adafruit-Design), die über den **I2C-Bus** (`SDA` = GPIO 2 / Pin 3, `SCL` = GPIO 3 / Pin 5) des Raspberry Pi in Reihe (Daisy-Chain) geschaltet sind:
  - **Board 1 (Standard-Adresse `0x40`):** Steuert die 9 Servos der linken Körperhälfte.
    - *Left Front:* Ch 0 (Coxa), Ch 1 (Femur), Ch 2 (Tibia)
    - *Left Middle:* Ch 4 (Coxa), Ch 5 (Femur), Ch 6 (Tibia)
    - *Left Rear:* Ch 9 (Coxa: `center_offset_pulse: 440` [+40° Uhrzeigersinn kalibriert], `orientation: 1`, $\pm 25^\circ$), Ch 10 (Femur: `orientation: 1`), Ch 11 (Tibia: `center_offset_pulse: -420` [Kniestrec­kung kalibriert], `orientation: 1`) *(Hinweis: Ch 8 wird übersprungen)*
  - **Board 2 (Adresse `0x42` durch Lötbrücke A1):** Steuert die 9 Servos der rechten Körperhälfte.
    - *Right Front:* Ch 0 (Coxa), Ch 1 (Femur), Ch 2 (Tibia)
    - *Right Middle:* Ch 4 (Coxa), Ch 5 (Femur), Ch 6 (Tibia)
    - *Right Rear:* Ch 8 (Coxa), Ch 9 (Femur), Ch 10 (Tibia)
- **Physische I2C-Verkabelung (Farbcodierung & Pinbelegung):**
  Verbunden über einen 2x6-Blockstecker am Raspberry Pi (Pins 1–12) zu 1x6-Buchsen an PCA9685 Board 1:
  | Signal / Funktion | Raspberry Pi Pin | Kabelfarbe | PCA9685 Board 1 Pin |
  | :--- | :--- | :--- | :--- |
  | **Logikspannung (3,3V)** | **Pin 1** (3V3 Power) | **Rot** | **VCC** (Pin 5) |
  | **I2C Data (SDA)** | **Pin 3** (GPIO 2 / SDA) | **Grün** | **SDA** (Pin 4) |
  | **I2C Clock (SCL)** | **Pin 5** (GPIO 3 / SCL) | **Gelb** | **SCL** (Pin 3) |
  | **Masse (GND)** | **Pin 6** (GND) | **Schwarz** | **GND** (Pin 1) |
  | *Output Enable (OE)* | *(nicht belegt)* | -- | **OE** (Pin 2, frei / intern aktiv) |
  | *Servostrom (V+)* | *(nicht belegt)* | -- | **V+** (Pin 6, frei / externes Netzteil) |
  *(Wichtig: Die Pins 2 & 4 [5V] am Raspberry Pi bleiben zwingend unbeschaltet! Weiterleitung zu Board 2 erfolgt 1:1 als Daisy-Chain von Board 1).*

## 3. Aktuelle Stromversorgung (Testbetrieb am Schreibtisch)
Wir arbeiten aktuell im stationären Testbetrieb ohne LiPo-Akku und ohne UBEC:
- **Raspberry Pi (Gehirn & Logik):** Wird über ein eigenes, separates **USB-Netzteil** mit 5V versorgt. Er liefert über Pin 1 (3.3V) die Logikspannung (`VCC`) für die beiden PCA9685-Chips.
- **18 Servomotoren (Laststromkreis):** Werden über ein externes **Labornetzteil** (ca. 5.0V – 6.0V, strombegrenzt zum Schutz der Mechanik) versorgt, das an den Schraubklemmen (`V+` und `GND`) der beiden PCA9685-Boards hängt.
- **Common Ground:** Die Masse (`GND`) des Raspberry Pi und die Masse des Labornetzteils sind über die PCA9685-Platinen miteinander verbunden.
- **Sicherheitshinweis:** Zum Testen steht der Hexapod mit dem Bauch auf einem Karton aufgebockt, damit sich die Beine frei bewegen können. Vermeide extreme plötzliche Winkel-Sprünge, um mechanische Blockaden zu verhindern.

## 4. Software-Architektur, Digital Twin & Status
- **Modulare 4-Schichten-Architektur (`lasius-core/src/lasius/core`):**
  1. **`hardware` (HAL):** `PWMDriverProtocol`, `MockPWMDriver`, `RealPCA9685Driver` (I2C `smbus2`), `Servo`-Aktuierung mit Software-Limits und `relax()`.
  2. **`motion` (Kinematik & Gangarten):** Reine mathematische Kinematik (`calculate_leg_ik`), Bein-Modellierung (`Joint`, `Leg`), 50-Hz-Harmonic-Cosine-Engine (`OmniGait`, `TripodGait`, `RippleGait`, `WaveGait`).
  3. **`control` (Auftragsverarbeitung & Order-Pipeline):** `Order`, `OrderAction` (inkl. `SET_JOINT_ANGLE`, `SET_LEG_JOINTS`, `TEST_LEG`, `STANCE_LEG`, `SWEEP_JOINT`), `OrderStatus`, `OrderPriority`, `OrderResult` und zentraler `OrderDispatcher` mit nicht-blockierendem Task-Worker, Abbruch-Watchdog und E-Stop-Vorrang.
  4. **`server` (Transport & Schnittstellen):** Integrierter Threading-HTTP-Server mit REST-API (`/api/v1/orders`, `/api/v1/status`, `/api/v1/emergency_stop`, `/api/v1/relax`) und 50-Hz-WebSocket-Telemetrie (`ws://...:8765`), der automatisch das vorkompilierte Vite-Bundle `lasius-dashboard/dist` ausliefert.
  5. **Native Namespaces (PEP 420):** `lasius.core` und `lasius.pilot` ermöglichen saubere Trennung und unabhängige Paketierung ohne Import-Konflikte.
- **Omnidirektionale Gait-Engine (`OmniGait`):**
  - **50-Hz-Harmonic-Cosine-Engine (`harmonic_stance: True`):** Geschmeidiges harmonisches Kosinus-Geschwindigkeitsprofil für Stand- und Schwungphase ($C^1$-stetig). An den Phasenübergängen (Liftoff & Touchdown) geht die Geschwindigkeit exakt gegen Null. Reduziert mechanische Beschleunigungsspitzen um mehr als das Fünffache (>5x Ruck-Reduktion: von 2.2 auf 0.39 mm/tick²), verhindert Flattern und Servogetriebeschäden.
  - **Holonomes Bewegen:** Beliebiges Vor-/Zurücklaufen ($Y$), horizontales Strafing ($X$) und Diagonallauf.
  - **Drehen auf der Stelle (Yaw-Rotation):** Exakte tangentiale Beinvektoren für Drehungen um die $Z$-Achse oder Kurvenlauf.
  - **Gangarten (Gait Strategies):**
    - `TripodGait`: 3 Beine Boden, 3 Beine Luft (schnell, Tastgrad 0.5).
    - `RippleGait`: 4 Beine Boden, 2 Beine Luft (flüssiger Insektengang, Tastgrad 0.67).
    - `WaveGait`: 5 Beine Boden, 1 Bein Luft (Metachronale Welle, maximale statische Stabilität, Tastgrad 0.83).
  - **Nahtloses Gait-Morphing:** Flüssiger Übergang zwischen Gangarten über S-Kurven-Interpolation und kürzesten Kreisbogen ohne Phasensprünge.
  - **Sanftes Anfahren & Bremsen:** Trägheitsbehaftetes Nachführen von Geschwindigkeiten und Slew-Rate Limiting der Fußkoordinaten zum Schutz der Servogetriebe.
- **Body Attitude / Posing (6-DOF Körperhaltung):**
  - Chassis-Höhe einstellbar ($-40\,\text{mm}$ bis $-120\,\text{mm}$).
  - Dynamischer Body Roll (Neigung links/rechts, $\pm 25^\circ$).
  - Dynamischer Body Pitch (Neigung Nase hoch/runter, $\pm 25^\circ$).
  - Funktioniert im Stand (Pose) sowie live während des Gehens.
- **Inverse Kinematik (`calculate_leg_ik` & `Leg`):** Exakte 3-DOF-Insekten-Kinematik mit realen Hebellängen (60mm, 100mm, 130mm).
- **Interaktiver 3D Digital Twin & 3-Tab Steuerung (Port 8000/8765):**
  - **3D-Ansicht (Three.js & OrbitControls):** Biomimetisch geschwungenes Ant-Chassis (identisch zur Minimap mit Wespentaille, gefasten Schultern, Elektronikdeck und Servomontageringen), authentische 3D-Beinmorphologie nach Hardware-Fotos (3D-gedruckte Coxa-Servobox mit Messingritzel, Doppelplatten-Carbon-Femur mit Verschraubung, geschwungene Insekten-Sichelkralle als Tibia mit Spornen, Sichelfenster-Aussparung und Bodenkontaktpad), leuchtende Cyan-LED-Scheinwerfer, Vorwärts-Chevron, 360°-Kamerarotation, Zoom, Pan und Bodenraster.
  - **Multi-View 2D-Projektionen:** Draufsicht (Top XY mit biomimetischem Chassis-Contour & Scheinwerfern), Seitenansicht (Side YZ mit Beinhub) und Frontansicht (Front XZ mit Tiefenstaffelung).
  - **Tab 1: Gait & Directions:** D-Pad (Vor/Zurück, Strafe L/R, Turn L/R, Stop), Gangart-Wahl (Tripod, Ripple, Wave), Haltungsslider (Höhe, Roll, Pitch, Reset), Gangparameter (Speed, Step Height, Step Length) und Animation-Pause.
  - **Tab 2: Leg Control (Beinsteuerung):** Interaktive 2D-Minimap des Roboterchassis ohne Beine, bei dem die physischen Ansatzpunkte am Chassis als anklickbare Buttons (`LF`, `LM`, `LR ★`, `RF`, `RM`, `RR`) mit aktivem Leuchteffekt und Orientierungsmarker (`▲ FRONT`) zur Beinauswahl dienen; 3 Live-Schieberegler für Coxa, Femur und Tibia mit Farbindikatoren & Gradanzeigen (Direktansteuerung mit sub-2ms Hardware-Latenz via `SET_JOINT_ANGLE`), Neutralstellung (Stance), 0°-Nullstellung und selektives Bein-Relax.
  - **Tab 3: Tests & Diagnostics:** Parametrierbarer harmonischer Beinschrittzyklus-Testlauf (1–10 Zyklen), Gelenk-Kollisionstests (Sweeps für Coxa, Femur, Tibia), Gesamtsystem-Aktionen (*Alle Servos relax*, *Alle in Stance*) sowie ein Live-Order-Monitor mit Statusanzeige und Latenz-Log.
  - **Globaler Not-Aus:** Sofortiger `⛔ E-Stop`-Button im Header setzt Geschwindigkeiten auf 0 und schaltet alle 18 Servos stromlos (Priorität 99).
- **OpenAPI 3.1 REST-Spezifikation (`openapi.yaml`):**
  - Vollständige OpenAPI 3.1.0 Spezifikation für alle Endpunkte (`/api/v1/status`, `/api/v1/orders`, `/api/v1/emergency_stop`, `/api/v1/relax`, `/api/v1/legs/{leg}/test`, `/api/v1/legs/{leg}/stance`, `/api/v1/robot`).
  - Wird direkt vom laufenden Server über `GET /api/v1/openapi.yaml` und `GET /api/v1/openapi.json` ausgeliefert.
- **Interaktive Setup- & Kalibrier-Routine (`calibrate.py`):**
  - **Sichere Einzelbein-Isolation:** Nur das ausgewählte Bein wird mit PWM-Signal versorgt; alle anderen 15 Servos bleiben garantiert stromlos (`relax`), um Verkantungen und Netzteilüberlastungen auszuschließen.
  - **Live-Streaming zum Digital Twin:** Alle Winkeländerungen (Trimm, Neutralstellung, Harmonic-Schritt) werden simultan per WebSocket an die 3D-Ansicht im Browser gestreamt.
  - **Trockenlauf (Dry Run):** Ermöglicht die Vorschau aller Bewegungen rein im 3D-Twin ohne echten Servostrom.
  - **Interaktiver Gelenk-Trimm:** Schrittweises Anpassen der Offsets (`center_offset_pulse`) in $\pm 50\,\mu\text{s}$ ($\approx 4{,}5^\circ$) oder $\pm 10\,\mu\text{s}$ ($\approx 0{,}9^\circ$), Invertieren der Orientierung und direktes Speichern in `config.yaml` und `servos.yaml`.
  - **Kollisionsprüfung:** Automatischer sanfter Sweep von `min_angle` bis `max_angle` zur Prüfung der mechanischen Freigängigkeit.
- **Automatisierte Tests:** 51 `pytest`-Tests (48 in `lasius-core`, 3 in `lasius-pilot`) sichern Konfiguration, YAML-Updater, Kinematik, alle Gaits, Morphing, Strafing, Turning, Pose-Angles, Hardware-Treiber, Order-Modelle, Dispatcher-Pipelines, REST-API-Endpunkte, OpenAPI-Export (YAML & JSON), WebSocket-Protokoll, Gamepad-Deadzone/Mapping, Server-Lifecycle und mathematische Ruck-Reduktion der Harmonic-Cosine-Engine ab (100% grün auf Laptop und Pi).

## 5. Coding-Standards & Didaktik
Halte dich bei jedem Code-Vorschlag strikt an folgende Regeln:
1. **Modern Python (3.11+):** Verwende konsequent **Type Hints** (`typing`, Rückgabetypen wie `-> None`), **`@dataclass`** für Datenstrukturen, **`enum.Enum`** für Zustände und **`pathlib.Path`** statt `os.path`.
2. **Saubere OOP (Komposition vor Vererbung):** Modelliere die Hardware objektorientiert (`Servo` -> `Leg` -> `Hexapod`) und trenne Hardware-Zugriffe strikt von der Berechnungslogik (Dependency Injection).
3. **PEP 8 & Docstrings:** Saubere Formatierung mit kurzen, verständlichen deutschen Docstrings für jede Klasse und Methode.
4. **Didaktische Erklärung:** Erkläre mir bei neuen Konzepten oder Dateien kurz in 3–4 Stichpunkten, *warum* dieses Design-Pattern oder dieses Python-Feature gewählt wurde.

## 6. Nächste Schritte
1. **Kalibrierung der restlichen Beine mit `calibrate.py`:**
   - Schrittweise Inbetriebnahme der verbleibenden Beine (Vorne Links, Mitte Links, Rechte Seite) mit Live-Visualizer.
2. **Sensor-Integration (IMU / MPU6050):**
   - Selbstnivellierende Haltungsregelung (Auto-Leveling) bei unebenem Untergrund oder Schräglagen.
3. **Autonome Hinderniserkennung:**
   - Ultraschall-Sensor (HC-SR04) oder ToF-Distanzsensor (VL53L0X) an der Front für intelligentes Ausweichen.

