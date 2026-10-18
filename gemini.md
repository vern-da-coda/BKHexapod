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

## 2. Hardware-Architektur
- **Mechanik:** 6 Beine (3 links, 3 rechts). Jedes Bein besteht aus 3 Standard-Servomotoren:
  1. **Coxa** (Hüftgelenk – schwenkt vor/zurück)
  2. **Femur** (Oberschenkel – hebt/senkt das Bein)
  3. **Tibia** (Unterschlankel/Fuß – beugt/streckt das Kniegelenk)
- **Servo-Controller:** Zwei **PCA9685 16-Kanal PWM/Servo-Treiber-Boards** (Adafruit-Design), die über den **I2C-Bus** (`SDA` = GPIO 2 / Pin 3, `SCL` = GPIO 3 / Pin 5) des Raspberry Pi in Reihe (Daisy-Chain) geschaltet sind:
  - **Board 1 (Standard-Adresse `0x40`):** Steuert die 9 Servos der linken Körperhälfte.
  - **Board 2 (Adresse `0x41` durch Lötbrücke A0):** Steuert die 9 Servos der rechten Körperhälfte.

## 3. Aktuelle Stromversorgung (Testbetrieb am Schreibtisch)
Wir arbeiten aktuell im stationären Testbetrieb ohne LiPo-Akku und ohne UBEC:
- **Raspberry Pi (Gehirn & Logik):** Wird über ein eigenes, separates **USB-Netzteil** mit 5V versorgt. Er liefert über Pin 1 (3.3V) die Logikspannung (`VCC`) für die beiden PCA9685-Chips.
- **18 Servomotoren (Laststromkreis):** Werden über ein externes **Labornetzteil** (ca. 5.0V – 6.0V, strombegrenzt zum Schutz der Mechanik) versorgt, das an den Schraubklemmen (`V+` und `GND`) der beiden PCA9685-Boards hängt.
- **Common Ground:** Die Masse (`GND`) des Raspberry Pi und die Masse des Labornetzteils sind über die PCA9685-Platinen miteinander verbunden.
- **Sicherheitshinweis:** Zum Testen steht der Hexapod mit dem Bauch auf einem Karton aufgebockt, damit sich die Beine frei bewegen können. Vermeide extreme plötzliche Winkel-Sprünge, um mechanische Blockaden zu verhindern.

## 4. Hardware-Abstraktion, Mocking & Digital Twin
- **Strategy / Adapter Pattern:** Implementiere für die Hardware-Ansteuerung das Interface über `typing.Protocol` (`PWMDriverProtocol`).
- **Zwei konkrete Treiber:**
  1. `RealPCA9685Driver`: Kommuniziert über I2C mit den beiden Boards (`0x40`, `0x41`).
  2. `MockPCA9685Driver`: Speichert den Zustand aller 18 Kanäle im Arbeitsspeicher, prüft Winkel-Grenzwerte und simuliert die Hardware auf dem Ubuntu-Laptop.
- **Digital Twin im Web-Interface:** Das Web-Frontend soll die aktuellen 18 Gelenkwinkel (egal ob vom Mock- oder Real-Treiber) per WebSocket empfangen und eine visuelle Live-Darstellung (2D/3D-Bein-Visualisierung im Browser-Canvas) rendern, sodass Bewegungen komplett ohne echte Hardware simuliert werden können.
- **Unit-Tests:** Schreibe zu Bewegungs- und Kinematik-Klassen passende `pytest`-Unit-Tests mit dem `MockPCA9685Driver`.

## 5. Coding-Standards & Lern-Modus (WICHTIG!)
Halte dich bei jedem Code-Vorschlag strikt an folgende Regeln:
1. **Modern Python (3.11+):** Verwende konsequent **Type Hints** (`typing`, Rückgabetypen wie `-> None`), **`@dataclass`** für Datenstrukturen, **`enum.Enum`** für Zustände und **`pathlib.Path`** statt `os.path`.
2. **Saubere OOP (Komposition vor Vererbung):** Modelliere die Hardware objektorientiert (`Servo` -> `Leg` -> `Hexapod`) und trenne Hardware-Zugriffe strikt von der Berechnungslogik (Dependency Injection).
3. **PEP 8 & Docstrings:** Saubere Formatierung mit kurzen, verständlichen deutschen Docstrings für jede Klasse und Methode.
4. **Didaktische Erklärung:** Erkläre mir bei neuen Konzepten oder Dateien kurz in 3–4 Stichpunkten, *warum* dieses Design-Pattern oder dieses Python-Feature gewählt wurde.

## 6. Nächste Schritte / Erste Aufgabe
Bitte erstelle mir als Erstes ein schlankes Diagnose- und Test-Skript (`check_hardware.py`), das:
1. Prüft, welche I2C-Adressen auf Bus 1 erkannt werden (Bestätigung von `0x40` und `0x41`).
2. Mir erlaubt, über die Kommandozeile einen einzelnen Kanal auf einem der beiden Boards sanft in die 90°-Mittelstellung zu fahren und das PWM-Signal danach wieder abzuschalten.