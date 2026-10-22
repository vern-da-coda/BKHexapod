# Projekt-Briefing: Lasius – Hexapod-Roboter & Digital Twin

Du unterstützt mich als KI-Entwickler beim Programmieren und Kalibrieren meines Hexapod-Roboters **Lasius** (6 Beine, 18 Freiheitsgrade / 18 Servos). Das Projekt gliedert sich modular in:
- **`lasius-core`**: Das Roboter-Backend auf dem Raspberry Pi (Hardware-Treiber, Kinematik, 50 Hz Harmonic Gait, Telemetrie- und Command-Server).
- **`lasius-dashboard`**: Das 3D Digital Twin Web-Interface als modulare Vue 3 + TypeScript + Pinia Single-Page Application (Three.js WebGL mit `shallowRef`, 2D-CAD-Projektionen, Kalibrier- & Steuer-Dashboard, moderne Vite Toolchain mit `dist/`-Produktionsbuild).
- **`lasius-pilot`**: Die Teleoperations-Anbindung für Bluetooth-Gamepads (PS4/PS5, Xbox, 8BitDo via Linux `/dev/input/js0`).

## 1. Entwicklungsumgebung & Workflow
- **Host-System (Laptop):** Ubuntu Linux mit PyCharm und Gemini CLI.
- **Ziel-System (Roboter):** Raspberry Pi 4 (IP: `192.168.0.123` / `bkhexapod.fritz.box`, User: `hexapod`).
- **Dateisystem & Deployment:** Der Projektordner liegt lokal unter `/home/bjoern/Workspace/Hexapods/lasius` und auf dem Raspberry Pi unter `/home/hexapod/lasius`.
- **Synchronisation:** Schneller, deterministischer Dateitransfer via `rsync` (ohne `node_modules` oder `.venv`). Das Dashboard wird lokal mit Vite vorkompiliert (`npm run build`) und als statisches `dist/`-Bundle auf den Pi übertragen.
- **WICHTIGE REGELN:**
  1. Python-Ausführung und Daemon-Betrieb erfolgen direkt auf dem Raspberry Pi über SSH (`python3 /home/hexapod/lasius/lasius-core/run_server.py --hardware`) oder als automatisierter Systemd-Dienst (`sudo systemctl status lasius`).
  2. Bei Hintergrundprozessen via SSH muss `stdin` entkoppelt werden (`</dev/null >/home/hexapod/server.log 2>&1 &`), um SSH-Hangs zu verhindern.
  3. Lokale Tests laufen mit `pytest` / `uv run pytest` (58 Tests in `lasius-core` & `lasius-pilot`, 100% bestanden).
  4. Systemstart: Auf dem Pi ist `lasius.service` unter `/etc/systemd/system/` eingerichtet und `enabled`. Der Server startet bei jedem Bootvorgang nach `network-online.target` automatisch und startet bei unerwarteten Abstürzen selbstständig neu (`Restart=always`).

## 2. Hardware-Architektur & Reale Abmessungen
- **Mechanik:** 6 Beine (3 links, 3 rechts). Jedes Bein besteht aus 3 Standard-Servomotoren:
  1. **Coxa** (Hüftgelenk – schwenkt vor/zurück in horizontaler Ebene): **6 cm (60 mm)** Hebelarm ab Drehachse; Träger erstreckt sich ab Drehachse um zusätzliche **3 cm (30 mm)** nach innen in den Plattenzwischenraum.
  2. **Femur** (Oberschenkel – hebt/senkt das Bein, Knie nach oben gerichtet): **10 cm (100 mm)**
  3. **Tibia** (Unterschenkel/Fuß – neigt sich zum Boden): **13 cm (130 mm)**
- **Chassis-Geometrie & Platten-Aufbau:**
  - **Doppelplatten-Sandwich (5 mm):** Zwei 5 mm starke Platten fassen die 6 Coxa-Drehachsen von oben ($y = +14,5\,\text{mm}$) und unten ($y = -14,5\,\text{mm}$) sicher ein. Lichter Plattenabstand: 24 mm, versteift mit 6 zylindrischen Distanzbolzen (Standoffs).
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
  3. **`control` (Auftragsverarbeitung & Order-Pipeline):** `Order`, `OrderAction` (inkl. `SET_JOINT_ANGLE`, `SET_LEG_JOINTS`, `TEST_LEG`, `STANCE_LEG`, `SWEEP_JOINT`), `OrderStatus`, `OrderPriority`, `OrderResult` und zentraler `OrderDispatcher` mit nicht-blockierendem Task-Worker, Abbruch-Watchdog, E-Stop-Vorrang sowie **sanfter Kosinus-Einstiegsinterpolation**: Schrittzyklen starten ausgehend von den aktuellen Servowinkeln (`current_angle`) oder Stance-Höhe ($z = -80\,\text{mm}$) direkt und weich im Startpunkt des Zyklus ($y = -\text{stride}/2, z = z_{\text{ground}}$) und kehren am Ende sanft zur Stance-Position zurück (eliminiert das frühere Durchsacken auf $0^\circ$/$-130\,\text{mm}$).
  4. **`server` (Transport & Schnittstellen):** Integrierter Threading-HTTP-Server mit REST-API (`/api/v1/orders`, `/api/v1/status`, `/api/v1/emergency_stop`, `/api/v1/relax`) und 50-Hz-WebSocket-Telemetrie (`ws://...:8765`), der automatisch das vorkompilierte Vite-Bundle `lasius-dashboard/dist` ausliefert.
  5. **Native Namespaces (PEP 420):** `lasius.core` und `lasius.pilot` ermöglichen saubere Trennung und unabhängige Paketierung ohne Import-Konflikte.
- **Moderne Vue 3 + TypeScript + Pinia Dashboard-Architektur (`lasius-dashboard`):**
  - **SFC-Modularisierung:** Vollständige Zerlegung des Dashboards in Vue 3 Single-File Components (`<script setup lang="ts">`).
  - **Wiederverwendbare `JointCard.vue`:** Eliminiert >400 Zeilen redundantes Markup für Gelenkschieberegler, Trimm-Nudges, Grenzen und Invert-Schalter.
  - **Zentraler Pinia-Store (`dashboardStore.ts`):** Verwaltet bidirektionale WebSocket-Verbindung, Echtzeit-Telemetrie, KPI-Streaming, Roboterzustand und REST-Order-Dispatching.
  - **Three.js Best Practice mit `shallowRef`:** Three.js Szenen, Meshes und Materialien werden über `shallowRef` gekapselt, wodurch reaktive Vue-Proxy-Overheads vollständig entfallen und 60 FPS garantiert sind.
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
- **Interaktiver 3D Digital Twin & 4-Tab Steuerung (Port 8000/8765):**
  - **3D-Ansicht (Three.js & OrbitControls):**
    - **Doppelplatten-Sandwich (5 mm):** Authentische Nachbildung der realen Karbonplatten mit oberer Platte ($y = +14,5\,\text{mm}$) und unterer Platte ($y = -14,5\,\text{mm}$), 24 mm Plattenabstand und 6 zylindrischen Distanzbolzen (Standoffs).
    - **Coxa-Träger:** Erstreckt sich ab der Drehachse ($x = 0$) um 30 mm nach innen in den Plattenzwischenraum ($x = -30\,\text{mm}$), während die Drehachse und die Beinkinematik exakt unverändert bleiben.
    - **Material-Harmonisierung:** Das Chassis verwendet exakt dasselbe Material (`legNeutralMat`: `#343746`, Roughness 0.45, Metalness 0.40) wie die Beine.
    - **Richtungsanzeige:** Dezent dimensioniertes blaues Vorwärts-Dreieck (`#3498db`, 30% verkleinert) flach auf der oberen Platte.
    - **Bereinigung:** Störende Scheinwerfer-/LED-Punkte auf dem Body vorn wurden in 3D und 2D restlos entfernt.
    - Authentische 3D-Beinmorphologie nach Hardware-Fotos: 3D-gedruckte Coxa-Servobox mit Messingritzel, Doppelplatten-Carbon-Femur, geschwungene Insekten-Sichelkralle als Tibia mit Spornen und Sichelfenster-Aussparung; Femur-Schraubenpunkte und Fußspitzen entfernt, 360°-Kamerarotation, Zoom, Pan und Bodenraster.
  - **Einheitliche CTA-Blau Hierarchie (Segment-Color-Coding verworfen):**
    - **Nicht ausgewählte Beine:** Unverändert vollständig monochrom und schlicht grau wie der Körper (`#343444`, kein störendes Color Coding auf inaktiven Beinen).
    - **Chassis-Ansatzachsen & Minimap-Spiegelung:** Die Montageachsen inaktiver Beine sind dezent hellgrau-metallisch (`#d0d4de`). Das in der Minimap selektierte Bein überträgt seinen statischen Cyan/Blau-Glow (`#38bdf8`) 1:1 auf den entsprechenden 3D-Chassis-Montagering und die Coxa-Drehachse (ohne Pulsieren).
    - **Ausgewähltes Bein (Base Selection State):** Alle Segmente des selektierten Beins (Coxa, Femur, Tibia) sind einheitlich in abgemildertem CTA-Blau (`#224870` / `0x224870`, `emissive: 0x0c2035`) gehalten, um eine klare farbliche Steigerung zum Active-State zu ermöglichen.
    - **Active-State (Fokussiertes Segment):** Beim Hover über eine Gelenkkarte (`joint-coxa`, `joint-femur`, `joint-tibia`) oder über die Test-Sweep-Buttons eskaliert das jeweilige Segment im 3D-Modell zu vollem, strahlendem CTA-Blau (`#38bdf8` / `0x38bdf8`, `emissiveIntensity: 1.15`).
    - **Vollständige Entfernung der Foot Tips:** Sämtliche Fußspitzen / Bodenkontaktbälle wurden konsistent aus allen Ansichten entfernt (3D-Modell sowie 2D Top/Side/Front Views).
  - **3-Spalten Robotics Studio Layout (Volle Screen-Breite & Simultane Multi-View):**
    - **Volle Screen-Breite (100% Widescreen):** Keine künstliche Breitenbegrenzung mehr; die gesamte Monitorfläche (100 vw / 100 vh) wird voll ausgenutzt.
    - **Spalte 1 (Links, 300 px): 2D Projections Studio Dock:**
      - **Harmonisierte Fassung (Unified Studio Dock):** Die drei CAD-Projektionen (Draufsicht Top XY, Frontansicht Front XZ, Seitenansicht Side YZ) sind in ein zusammenhängendes Bezel-Gehäuse (`#242430`, `border: 1px solid #2e2e3e`, `border-radius: 10px`, `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)`, 12px Innenabstand) eingebettet – exakt symmetrisch zur rechten Steuerungs-Sidebar.
      - **Kopfbereich:** Eleganter Header mit Titel *"2D Projections"* und dunklem Pill-Badge *"CAD • 3 Views"*.
      - **Vertiefte Viewport-Schächte (Inset Wells):** Jede der drei Projektionen sitzt als vertiefter, dunkler Bildschirm (`#141724`, Innenrand `1px solid #23273c`, abgerundete Ecken `8px`) im Dock, mit kompaktem Subheader (`#161722`) und dezentem Hover-Glow (`#38bdf8`).
      - Über den Button `[2D Strip]` im 3D-Header kann die gesamte Spalte bei Bedarf für maximalen 3D-Fokus ein-/ausgeklappt werden.
    - **Spalte 2 (Zentrum, `flex: 1`): 3D Digital Twin Viewport:** Der interaktive 3D-Roboter füllt den gesamten verbleibenden Bildschirmplatz in Breite und Höhe flexibel aus (`#1a1a24`). Ein `ResizeObserver` passt Three.js Renderer-Buffer und Kamera-Aspect-Ratio bei jeder Fensteränderung verzerrungsfrei an.
    - **Spalte 3 (Rechts, ~440 px): Steuerungs-Sidebar:** Autonom scrollbare Steuerungsleiste mit sticky Tab-Navigation (Gait & Directions, Leg Control, Tests, System).
  - **Multi-View 2D-Projektionen & Interaktive Beinauswahl (2D & 3D):**
    - **Direkte interaktive Beinauswahl (2D Point-to-Segment & 3D Raycasting):** Beine können direkt per Klick im 3D-Viewport (Three.js Raycasting) sowie in allen drei 2D-Projektionen (Punkt-zu-Segment-Abstandsdistanz $\le 28\,\text{px}$) angeklickt und selektiert werden (inkl. `pointer`-Cursor beim Überfahren).
    - **Synchroner Sofort-Redraw:** Jede Selektionsänderung (ob via Minimap, Dropdowns oder 2D/3D-Klick) sowie Gelenk-Hover löst sofort und ohne Zeitverzögerung ein synchrones Neuzeichnen (`drawRobot()` & `update3DLegHighlights()`) aller 4 Ansichten simultan aus.
    - **Z-Order Vordergrund-Priorität:** Das selektierte Bein wird in den 2D-Ansichten stets überdeckend als oberste Schicht gerendert, sodass es niemals von unselektierten Beinen im Vordergrund verdeckt wird.
    - **Farbcodierung, Skalierung & reine Vektorlinien:** Unselektierte Beine werden neutral grau gerendert (`#383a4c`), Montageachspunkte des aktiven Beins in Minimap-Blau (`#38bdf8`) und das aktive Bein hervorgehoben in CTA-Blau (`#2980b9`), bei Gelenkfokus in strahlendem Electric-Blue (`#38bdf8`). Dynamische Skalierung (`Math.min(...)`) stellt sicher, dass alle Beine und Extrempositionen ohne Randabschneiden vollständig sichtbar bleiben. Alle Gliedmaßen in 2D (inklusive der Tibia in Front- und Seitenansicht) verwenden ausnahmslos **rein gerade Linien** (`ctx.lineTo`), um eine saubere, exakte CAD-Projektion ohne künstliche Bogenkrümmungen zu gewährleisten.
  - **Tab 1: Gait & Directions:** D-Pad (Vor/Zurück, Strafe L/R, Turn L/R, Stop), Gangart-Wahl (Tripod, Ripple, Wave), Haltungsslider (Höhe, Roll, Pitch, Reset), Gangparameter (Speed, Step Height, Step Length) und Animation-Pause.
  - **Tab 2: Leg Control (Fusioniertes Direct Drive & Kalibrierung):**
    - **Kompakte Beinauswahl-Leiste (Active Leg Header & Pill-Selector LF, LM, LR, RF, RM, RR):** Die redundante große SVG-Minimap wurde entfernt, da die 2D-Projektionen permanent sichtbar sind und direkte Klick-Selektion auf den Beinen unterstützen. Dies spart über 200 px vertikalen Platz, sodass alle Gelenkkarten sofort ohne Scrollen sichtbar sind.
    - **Vollintegrierte Gelenkkarten & Konsolidiertes Slider-Design-System:**
      1. **Konsistentes Slider-Design über die gesamte UI:** Alle Schieberegler (Standard `input[type="range"]` in Gait/Control/Tests, Dual-Thumb Limit-Range-Slider sowie Center Trim Hybrid-Slider) nutzen dasselbe einheitliche Design-Token-System:
         - **Schiene (Track):** `#1c1d2c` mit dezentem Rand `1px solid #282a3c`, Höhe `6px`, abgerundet `3px`.
         - **Füllbalken & Highlights:** Durchgängig einheitliches Lasius-CTA-Blau (`#3498db`), keine abweichenden Mehrfarben-Gradienten.
         - **Knauf (Thumb):** Weißer Kreis (`15px` / `#ffffff`) mit `2px solid #3498db` Rahmen und weichem Schatten.
         - **Hover- & Active-Feedback:** Hover hebt den Knauf auf `scale(1.15)` mit strahlendem `#38bdf8`-Rand an; aktives Ziehen vergrößert auf `scale(1.25)` mit `#3498db`-Füllung.
         - **Werte-Badges:** `.val-badge`, `.range-label-val` und `.calib-val-readout` teilen denselben dunklen Pill-Badge-Stil (Monospace, `#3498db`, Hintergrund `#1c1d2c`, Rahmen `#2c2f46`).
      2. **Direct Drive Schieberegler:** Live-Winkelverstellung in Echtzeit mit Farbakzent, dynamisch beschränkt auf die kalibrierten Min/Max-Winkelgrenzen.
      3. **Dual-Thumb Limit Range Slider (Zwei-Schieber-Slider):** Feinfühlige, visuelle Einstellung der Min- und Max-Winkelgrenzen mit hervorgehobenem aktiven Bereich und Gradanzeigen.
      4. **Center Trim Hybrid Slider (Bipolar-Schieberegler & Micro-Nudges):** Feinfühliger Schieberegler mit optischer Nullpunkt-Kerbe bei 0 µs und homogenem bipolarem CTA-Blau-Füllbalken (Ausschlag nach links/rechts), flankiert von `[-1µs]` und `[+1µs]` Micro-Nudge-Buttons (Shift+Klick für ±10 µs), Soft-Snap bei Null sowie Klick auf das Wertelabel / Doppelklick zum sofortigen 0-µs-Reset.
      5. **Invert-Schalter:** Richtungsumkehr (`Inverted (-1)` vs. `Normal (+1)`).
      6. **Test Range:** Fährt die kalibrierten Grenzen des Gelenks sanft ab.
    - **Sofortiges Auto-Save & Floating Toast Modals:** Jede Änderung an Trim, Invertierung oder Min/Max-Grenzen wird sofort in den aktiven Servokonfigurationen angewendet und atomar in `calibration.json` persistiert – kein manuelles Zwischenspeichern vor Testläufen mehr nötig. Die Bestätigungsmeldungen ("Auto-saved ...") erscheinen als schwebendes, zentriertes Toast-Modal (`z-index: 9999`) über der gesamten Benutzeroberfläche und faden nach exakt 5 Sekunden sanft aus, ohne die UI-Elemente oder Gelenkkarten nach unten springen zu lassen.
    - **Bereinigte Gelenkkarten:** Redundante "Overlay Active"-Badges wurden entfernt, sodass der Fokus vollständig auf den Live-Winkeln, Trimmwerten und Grenzwert-Schiebereglern liegt.
    - **Aktionsleiste:** Schnellzugriff auf `Align Ref (0°)` (isoliert dieses Bein bei 0°, entspannt alle anderen 15 Servos), `Stance Position`, `Relax Leg` und `Reset Leg` (Werkszustand aus `config.yaml`).
  - **Tab 3: Tests & Diagnostics:** Parametrierbarer harmonischer Beinschrittzyklus-Testlauf (1–10 Zyklen), kalibrierungsbewusste Gelenk-Kollisionstests (`Sweep Coxa`, `Sweep Femur`, `Sweep Tibia` – nutzen exakt die kalibrierten Min/Max-Grenzen und Offsets des gewählten Zielbeins), Gesamtsystem-Aktionen (*Alle Servos relax*, *Alle in Stance*) sowie ein Live-Order-Monitor mit Statusanzeige und Latenz-Log.
  - **Tab 4: System (Raspberry Pi Telemetrie & KPIs):** Hardware-Überwachung in Echtzeit: CPU-Auslastung (%) & 1m/5m/15m Load-Average, RAM (genutzt/gesamt MB) & Daemon RSS, SoC-Temperatur (°C) mit Farb-Badges (Normal/Warm/Hot), Power & Throttling Health via `vcgencmd get_throttled` (Erkennung von Unterspannung/Brownouts durch Servo-Stromspitzen), WLAN-Link & Signalstärke (-57 dBm, wlan0), Root-Storage (GB) und Uptime.
  - **Kombinierte Server-Status & Steuerungs-Toolbar (Header rechts):**
    - Der Server-Status (Verbindungs-Dot und Telemetriestatus "Connecting...", "Connected", "Live Stream Active", "Disconnected") ist oben rechts direkt mit den Server-Funktionalitäten in einer zusammenhängenden `.server-toolbar` integriert.
    - Beinhaltet den eingelassenen Telemetrie-Indikator, `Restart Server` (sanfter Hintergrund-Neustart via `os.execv` mit Reconnect-Polling) und `Shutdown` (Herunterfahren des Roboters via `sudo shutdown -h now`).
    - Unmittelbar daneben befindet sich der eigenständige, signalrote `E-Stop`-Button (Priorität 99).
  - **Globale Header-Aktionen:**
    - `E-Stop`: Sofortiger Not-Aus setzt Geschwindigkeiten auf 0 und schaltet alle 18 Servos stromlos (Priorität 99).
    - `Restart Server`: Entspannt alle Servos sicher und führt einen sauberen Hintergrund-Neustart des Daemons (`os.execv`) mit Reconnect-Polling durch.
    - `Shutdown`: Bestätigungsdialog, entspannt alle Servos, beendet den Server und führt den Linux-Shutdown (`sudo shutdown -h now`) durch.
- **OpenAPI 3.1 REST-Spezifikation (`openapi.yaml`):**
  - Vollständige OpenAPI 3.1.0 Spezifikation für alle Endpunkte (`/api/v1/status`, `/api/v1/system/stats`, `/api/v1/orders`, `/api/v1/emergency_stop`, `/api/v1/relax`, `/api/v1/calibration`, `/api/v1/calibration/trim`, `/api/v1/calibration/reset`, `/api/v1/server/restart`, `/api/v1/server/shutdown`, `/api/v1/legs/{leg}/test`, `/api/v1/legs/{leg}/stance`, `/api/v1/robot`).
  - Wird direkt vom laufenden Server über `GET /api/v1/openapi.yaml` und `GET /api/v1/openapi.json` ausgeliefert.
  - Begleitende REST-Client-Sammlung: [`lasius-core/laisus-rest-control-api.http`](lasius-core/laisus-rest-control-api.http).
- **Option C Robotics Overlay Pattern (`calibration.json`):**
  - `config.yaml` dient als saubere, unberührte Basisgeometrie (Git-tracked).
  - Mechanische Servovarianzen werden atomar in `calibration.json` persistiert (`.tmp` + `fsync` + `os.replace` gegen Datenverlust bei Spannungsabfall).
  - `load_config()` überblendet `calibration.json` automatisch über `ServoConfig`.
  - Live-Trimming im Dashboard verstellt Servos unmittelbar im laufenden Betrieb ohne Schreibzugriffe auf die SD-Karte; erst beim Klick auf *Save Calibration* wird die Konfigurationsdatei geschrieben.
- **Interaktive Setup- & Kalibrier-Routine (`calibrate.py`):**
  - Konsolen-Alternative zum Web-Dialog für manuelle Terminal-Kalibrierung mit Einzelbein-Isolation und Trockenlauf (Dry Run).
- **Automatisierte Tests:** 58 `pytest`-Tests (55 in `lasius-core`, 3 in `lasius-pilot`) sichern Konfiguration, Overlay-Persistenz & Atomic Replaces, YAML-Updater, Kinematik, alle Gaits, Morphing, Strafing, Turning, Pose-Angles, Hardware-Treiber, Order-Modelle, Dispatcher-Pipelines, System-KPIs, Server-Lifecycle (Restart/Shutdown), REST-API-Endpunkte inkl. Kalibrierung, OpenAPI-Export (YAML & JSON), WebSocket-Protokoll, Gamepad-Deadzone/Mapping und mathematische Ruck-Reduktion der Harmonic-Cosine-Engine ab (100% grün auf Laptop und Pi).

## 5. Coding-Standards & Didaktik
Halte dich bei jedem Code-Vorschlag strikt an folgende Regeln:
1. **Modern Python (3.11+):** Verwende konsequent **Type Hints** (`typing`, Rückgabetypen wie `-> None`), **`@dataclass`** für Datenstrukturen, **`enum.Enum`** für Zustände und **`pathlib.Path`** statt `os.path`.
2. **Saubere OOP (Komposition vor Vererbung):** Modelliere die Hardware objektorientiert (`Servo` -> `Leg` -> `Hexapod`) und trenne Hardware-Zugriffe strikt von der Berechnungslogik (Dependency Injection).
3. **PEP 8 & Docstrings:** Saubere Formatierung mit kurzen, verständlichen deutschen Docstrings für jede Klasse und Methode.
4. **Didaktische Erklärung:** Erkläre mir bei neuen Konzepten oder Dateien kurz in 3–4 Stichpunkten, *warum* dieses Design-Pattern oder dieses Python-Feature gewählt wurde.

## 6. Nächste Schritte & Backlog (Details siehe [`TODOS.md`](TODOS.md))
- **Aktueller Status:** Physische Motorik pausiert, da Coxa-Teile gebrochen sind und neu gedruckt werden müssen.
- **Zentrale Help-Scripts (`scripts/`):**
  - `./scripts/dev_sim.sh` (Lokaler Simulationsserver & Dashboard)
  - `./scripts/run_tests.sh` (58 Tests in `core` + `pilot`)
  - `./scripts/deploy_pi.sh` (Vite-Build & Rsync auf Pi)
  - `./scripts/status_pi.sh` (Live-Telemetrie & KPIs vom Pi)
  - `./scripts/backup_calibration.sh` (Kalibrierungs-Snapshot)
1. **Mechanischer Coxa-Neudruck:**
   - Verstärkung der Wandstärken ($\ge 5$ Perimeter), Schichtorientierung parallel zu Biegemomenten, PETG/PETG-CF/PA-CF, Ausrundung von Innenkerben.
2. **Teleoperation via HTML5 Gamepad API im Web-Dashboard:**
   - Direktes Auslesen von Bluetooth/USB-Gamepads im Browser (`navigator.getGamepads()`).
3. **Posen & Show-Choreografien (`lasius-core`):**
   - Begrüßungswinken (`WAVE_HELLO`), Liegestütze (`PUSH_UPS`), Lauerstellung (`CROUCH`), kontinuierlicher Bogenlauf (*Arc Walking*).
4. **Sensor-Integration (IMU / MPU6050) & Autonomie:**
   - Selbstnivellierende Haltungsregelung (Auto-Leveling via PID auf Body Roll/Pitch) und Distanzsensoren (ToF/HC-SR04).
5. **Dashboard-Refactoring (Vue 3 + Vite) [✔ ABGESCHLOSSEN]:**
   - Vollständige Umstellung auf Vue 3 (`<script setup lang="ts">`), Pinia-Store und saubere Three.js Kapselung mit `shallowRef`. Alle 58 Tests grün.

