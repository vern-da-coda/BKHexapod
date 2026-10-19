# Projekt-Briefing: Hexapod-Roboter (Raspberry Pi + Dual PCA9685)

Du unterstützt mich als KI-Entwickler beim Programmieren und Kalibrieren meines Hexapod-Roboters (6 Beine, 18 Freiheitsgrade / 18 Servos). Ich nutze dieses Projekt gleichzeitig, um modernes Python und Objektorientierte Programmierung (OOP) zu lernen.

## 1. Entwicklungsumgebung & Workflow
- **Host-System (Laptop):** Ubuntu Linux mit PyCharm und Gemini CLI.
- **Ziel-System (Roboter):** Raspberry Pi (aktuell im Umbau von Raspberry Pi 1 Model B Rev 2.0 auf Raspberry Pi 4).
- **Dateisystem-Sync:** Der Projektordner auf dem Raspberry Pi (`/home/pi/hexapod`) ist per `sshfs` direkt auf meinem Ubuntu-Laptop unter `~/hexapod_pi` eingehängt.
- **WICHTIGE REGELN FÜR DEN DATEIZUGRIFF:**
  1. Alle Dateien, die du im aktuellen Arbeitsverzeichnis erstellst oder änderst, liegen physisch direkt auf der SD-Karte des Raspberry Pi.
  2. Lege **niemals** ein Python Virtual Environment (`.venv`) in diesem ge-mounteten Ordner an, da das Indizieren tausender kleiner Dateien über SSHFS PyCharm ausbremst. Python-Pakete werden direkt per SSH auf dem Raspberry Pi installiert.
  3. Die Ausführung des Codes zum Testen der Hardware erfolgt direkt auf dem Raspberry Pi über ein SSH-Terminal.

## 2. Hardware-Architektur & Reale Abmessungen
- **Mechanik:** 6 Beine (3 links, 3 rechts). Jedes Bein besteht aus 3 Standard-Servomotoren:
  1. **Coxa** (Hüftgelenk – schwenkt vor/zurück in horizontaler Ebene): **6 cm (60 mm)**
  2. **Femur** (Oberschenkel – hebt/senkt das Bein, Knie nach oben gerichtet): **10 cm (100 mm)**
  3. **Tibia** (Unterschenkel/Fuß – neigt sich zum Boden): **13 cm (130 mm)**
- **Chassis-Geometrie (Achsen-Abstände am Körper):**
  - **Breite vorn & hinten:** **13 cm (130 mm)** ($X = \pm 65\,\text{mm}$)
  - **Breite mitte:** **15 cm (150 mm)** ($X = \pm 75\,\text{mm}$)
  - **Längsabstand der Achsen entlang des Körpers:** **9 cm (90 mm)** ($Y = -90\,\text{mm}$ vorn, $0\,\text{mm}$ mitte, $+90\,\text{mm}$ hinten)
- **Konfigurationsdatei (`src/bkhexapod/config.yaml`):** Alle Maße, Montageachsen und Servo-Kalibrierungen liegen zentral als *Single Source of Truth* in `config.yaml` und werden über typsichere Dataclasses (`GeometryConfig`, `LimbConfig`, `ChassisConfig`) geladen.
- **Servo-Controller:** Zwei **PCA9685 16-Kanal PWM/Servo-Treiber-Boards** (Adafruit-Design), die über den **I2C-Bus** (`SDA` = GPIO 2 / Pin 3, `SCL` = GPIO 3 / Pin 5) des Raspberry Pi in Reihe (Daisy-Chain) geschaltet sind:
  - **Board 1 (Standard-Adresse `0x40`):** Steuert die 9 Servos der linken Körperhälfte.
  - **Board 2 (Adresse `0x41` durch Lötbrücke A0):** Steuert die 9 Servos der rechten Körperhälfte.

## 3. Aktuelle Stromversorgung (Testbetrieb am Schreibtisch)
Wir arbeiten aktuell im stationären Testbetrieb ohne LiPo-Akku und ohne UBEC:
- **Raspberry Pi (Gehirn & Logik):** Wird über ein eigenes, separates **USB-Netzteil** mit 5V versorgt. Er liefert über Pin 1 (3.3V) die Logikspannung (`VCC`) für die beiden PCA9685-Chips.
- **18 Servomotoren (Laststromkreis):** Werden über ein externes **Labornetzteil** (ca. 5.0V – 6.0V, strombegrenzt zum Schutz der Mechanik) versorgt, das an den Schraubklemmen (`V+` und `GND`) der beiden PCA9685-Boards hängt.
- **Common Ground:** Die Masse (`GND`) des Raspberry Pi und die Masse des Labornetzteils sind über die PCA9685-Platinen miteinander verbunden.
- **Sicherheitshinweis:** Zum Testen steht der Hexapod mit dem Bauch auf einem Karton aufgebockt, damit sich die Beine frei bewegen können. Vermeide extreme plötzliche Winkel-Sprünge, um mechanische Blockaden zu verhindern.

## 4. Software-Architektur, Digital Twin & Status
- **Strategy / Adapter Pattern:** Hardware-Anbindung ist vollständig über `PWMDriverProtocol` entkoppelt:
  - `MockPWMDriver`: Simuliert alle 18 Kanäle im Speicher, speichert Winkel und ermöglicht die vollständige Simulation auf dem Laptop.
  - `RealPCA9685Driver`: Kommuniziert über I2C (`smbus2`) mit den beiden Boards (`0x40`, `0x41`), inkl. `relax_channel()` und `relax_all()` gegen Haltestrom.
- **Omnidirektionale Gait-Engine (`OmniGait`):**
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
- **Inverse Kinematik (`Leg._calculate_inverse_kinematics`):** Exakte 3-DOF-Insekten-Kinematik mit realen Hebellängen (60mm, 100mm, 130mm).
- **Interaktiver 3D Digital Twin (Web-Interface auf Port 8000/8765):**
  - **3D-Ansicht (Three.js & OrbitControls):** Exaktes maßstabsgetreues Hexagon-Chassis und 3D-Zylinderbeine, 360°-Kamerarotation, Zoom, Pan und Bodenraster.
  - **Multi-View 2D-Projektionen:** Draufsicht (Top XY), Seitenansicht (Side YZ mit Beinhub) und Frontansicht (Front XZ mit Tiefenstaffelung).
  - **Umfassende Web-Steuerung:** D-Pad (Vor/Zurück, Strafe L/R, Turn L/R, Stop), Tastatursteuerung (WASD / QE / Space), Gangart-Wahl (Tripod, Ripple, Wave), Haltungsslider (Höhe, Roll, Pitch, Reset) und Gangparameter (Speed, Step Height, Step Length).
  - **Netzwerkfähig:** Bindet an `0.0.0.0` mit dynamischem WebSocket-Host für Zugriff vom Laptop im WLAN.
- **Automatisierte Tests:** 32 `pytest`-Tests sichern Konfiguration & Geometrie-Loading, Kinematik, alle Gaits, Morphing, Strafing, Turning, Pose-Angles, Hardware-Treiber, WebSocket-Protokoll und Server-Lifecycle ab.

## 5. Coding-Standards & Didaktik
Halte dich bei jedem Code-Vorschlag strikt an folgende Regeln:
1. **Modern Python (3.11+):** Verwende konsequent **Type Hints** (`typing`, Rückgabetypen wie `-> None`), **`@dataclass`** für Datenstrukturen, **`enum.Enum`** für Zustände und **`pathlib.Path`** statt `os.path`.
2. **Saubere OOP (Komposition vor Vererbung):** Modelliere die Hardware objektorientiert (`Servo` -> `Leg` -> `Hexapod`) und trenne Hardware-Zugriffe strikt von der Berechnungslogik (Dependency Injection).
3. **PEP 8 & Docstrings:** Saubere Formatierung mit kurzen, verständlichen deutschen Docstrings für jede Klasse und Methode.
4. **Didaktische Erklärung:** Erkläre mir bei neuen Konzepten oder Dateien kurz in 3–4 Stichpunkten, *warum* dieses Design-Pattern oder dieses Python-Feature gewählt wurde.

## 6. Nächste Schritte
1. **Physical Calibration Tooling:**
   - Interaktives Kalibrierungs-Werkzeug (CLI oder Web-basiert) zur Feinabstimmung der `center_offset_pulse`-Werte in `src/bkhexapod/config.yaml` für alle 18 Servos.
2. **Sensor-Integration (IMU / MPU6050):**
   - Selbstnivellierende Haltungsregelung (Auto-Leveling) bei unebenem Untergrund oder Schräglagen.
3. **Autonome Hinderniserkennung:**
   - Ultraschall-Sensor (HC-SR04) oder ToF-Distanzsensor (VL53L0X) an der Front für intelligentes Ausweichen.
