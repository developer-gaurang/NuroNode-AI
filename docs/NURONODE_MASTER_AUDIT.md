# NuroNode AI Master Audit

Audit date: 2026-06-25  
Hackathon date: 2026-07-05  
Repositories audited:

- Nurosync: `E:\Nurosync`
- BioNode AI: `E:\Projects\My_Apps\bionode_ai`
- NuroNode AI: `E:\NuroNode AIII`

## Audit Boundary

This audit reviewed authored source, firmware, app code, configuration, documentation, platform manifests, screenshots, and visible report/log artifacts. Generated dependencies and build outputs were not treated as product source: `node_modules`, `.venv`, `__pycache__`, `.dart_tool`, `build`, `.git`, and backup platform folders were inventoried but excluded from feature analysis.

No implementation code was modified.

## Executive Finding

Nurosync is the working technical core. Its value is in proven EOG telemetry, firmware-level blink sequencing, ESP-NOW hardware command relay, serial parsing, calibration, desktop monitoring, and clinical session reporting.

BioNode is not a single backend platform; it is a Flutter prototype with Firebase, Gemini, weather/map APIs, a health vault, CrashGuard SOS, and several high-concept widgets. The best reusable value is not the full mobile app, but selected healthcare/caregiver workflows that can wrap Nurosync's real mobility engine.

NuroNode AI is already a React/Vite UI built around the Nurosync protocol. It should remain the final product foundation. Its current implementation already respects the critical rule: it parses Nurosync telemetry and sends Nurosync commands instead of inventing a replacement blink system.

## Nurosync Audit

### Structure

- `README.md`: Browser/Web Serial dashboard documentation.
- `README_RUN.md`: Python desktop app setup and COM-port instructions.
- `main.py`: PySide6 desktop entry point.
- `app/parser.py`: Serial text parser.
- `app/serial_reader.py`: PySerial worker thread.
- `app/ui.py`: Desktop app UI, session model, calibration UI, live signals, manual control, clinical report workflow.
- `app/report_generator.py`: CSV/PDF clinical report generation and session analytics.
- `app/tts.py`: Text-to-speech worker.
- `src/components/BioDashboard.jsx`: Browser dashboard using Web Serial and Chart.js.
- `firmware/NuroSync_Headband_DSP/...ino`: ESP32-S3 headband EOG acquisition, calibration, blink detection, command transmission.
- `firmware/NuroSync_Car_ESPNow_Receiver...ino`: ESP-NOW car receiver and motor control.
- `firmware/esp8266_relay/esp8266_relay.ino`: ESP relay firmware present, but the main audited mobility path is ESP32/ESP-NOW.

### Serial Communication

Nurosync uses 115200 baud.

Firmware emits text lines such as:

- `Raw_Signal:<value>,Baseline:<value>,Blink_Threshold:<value>`
- `Command:<COMMAND>`
- `Blink detected in sequence: <count>`
- `Blink sequence executed: <count>`
- calibration and ESP-NOW status logs

Python receives serial data in `SerialReader`, emits raw lines, and lets `DataParser` convert them to typed signals. The web dashboard also reads serial through Web Serial.

Outbound serial commands include:

- `F`: forward
- `L`: left
- `R`: right
- `B`: backward
- `S`: stop
- `E`: emergency stop
- `C`: recalibrate baseline
- `T:<value>`: manual blink threshold

### Parser

`app/parser.py` is simple and purpose-built. It recognizes command lines, blink sequence lines, and telemetry lines containing all three required keys: `Raw_Signal`, `Baseline`, and `Blink_Threshold`.

Invalid or unknown lines are surfaced as parse errors. This is important for a hackathon demo because it lets the UI show the real hardware stream without hiding failures.

### Calibration

Calibration exists in two places:

- Firmware baseline calibration: `calibrateBaseline()` samples EOG for 5 seconds while eyes are open/still, then sets `blinkThreshold = baseline + 700` and `releaseThreshold = baseline + 120`.
- Desktop smart calibration: `SmartBlinkCalibrator` collects resting and blinking telemetry, estimates noise, blink peaks, signal strength, confidence, and a recommended threshold. It can send `C` or `T:<value>` back to firmware.

This means NuroNode should not implement new signal calibration logic. It should expose and explain Nurosync calibration commands.

### Blink Detection

Blink detection is firmware-owned. The headband firmware:

- starts a blink when raw signal crosses `blinkThreshold`
- ends a blink when raw signal falls below `releaseThreshold`
- treats long blinks as emergency stop
- counts normal blinks into a sequence
- executes the sequence after timeout

Current mapping:

- 1 blink: `FORWARD`
- 2 blinks: `LEFT`
- 3 blinks: `RIGHT`
- 4 blinks: `BACKWARD`
- 5+ blinks: `STOP`
- long blink: `EMERGENCY_STOP`

NuroNode must preserve this.

### Hardware Commands

Headband firmware sends named commands over ESP-NOW to the car receiver and logs them to serial. The manual app/browser can also send single-character commands to the headband over serial.

Safety behavior:

- Movement commands are cooldown-protected on the headband.
- `STOP` and `EMERGENCY_STOP` bypass cooldown.
- Car receiver stops on unknown commands.
- Car receiver has a 20-second safety timeout for forward/backward.
- Left/right are short pulse turns.

### RC Car Control

The car receiver uses four motor pins:

- `IN1 = 12`
- `IN2 = 13`
- `IN3 = 14`
- `IN4 = 27`

It accepts both short serial commands and full command strings. It reports status lines like `CAR_FORWARD_20_SEC_MODE`, `SHORT_TURN_AUTO_STOP`, and `SAFETY_TIMEOUT_STOP`.

### Analytics

Python desktop analytics calculate:

- signal reliability
- electrode contact quality
- blink control reliability
- command distribution
- safety events
- worst signal warning
- baseline drift
- control strain
- overall grade
- caregiver recommendations

NuroNode currently has lighter browser-side metrics: latest signal, baseline, threshold, noise estimate, drift, reliability score, quality label, contact status, command counts, packet counts, and parse errors.

### Reports

Nurosync has real report generation in Python:

- CSV export of timestamp, raw signal, baseline, threshold, blink sequence, command, source, raw line.
- PDF clinical report using ReportLab.
- Patient metadata: name, age, gender.
- Signal integrity, control/usability, safety/caregiver recommendations, best signal snapshot, practical interpretation.

This is one of the strongest sources for NuroNode V1 expansion because it is already aligned with EOG mobility.

### Dashboard/UI

Nurosync includes:

- Browser dashboard: Web Serial, Chart.js live signal, recording CSV download, manual remote control, simulated AI verification.
- Python desktop dashboard: dashboard cards, live signal plot, command history, settings, calibration, clinical report.

Some web labels are older or inconsistent (`Bio-Panic`, `NEUROSYNC CLINICAL SUITE`), but the underlying protocol is valuable.

## BioNode AI Audit

### Structure

BioNode is a Flutter app. Key authored files:

- `README.md`: ambitious product vision and 14-pillar capability list.
- `pubspec.yaml`: dependencies and assets.
- `lib/main.dart`: most implemented app behavior.
- `lib/personal_features.dart`: high-concept personal feature widgets.
- `lib/government_features.dart`: high-concept emergency/government feature widgets.
- `android`, `ios`, `web`: platform scaffolding.
- `screenshots`: app screenshots.
- `models.json`, logs, patch scripts: development artifacts.

### Implemented App Architecture

`lib/main.dart` contains:

- Firebase initialization using `.env` values.
- Material app with `/public?id=<alias>` public health record route.
- Auth/register/login screens.
- Main hub with four tabs: Hub, Eco, Vault, Guard.
- Shared glassmorphism UI primitives.

There is no separate backend server in the repo. Cloud persistence is Firebase Firestore directly from the Flutter client.

### Firebase Usage

Firestore collections used:

- `bionodes/{alias}`: registration profile with `name`, `alias`, `pass`, `createdAt`.
- `bionodes/{alias}/vault_records`: health vault records.
- `bionodes/{alias}/emergency_contacts`: emergency contacts.
- `crash_alerts`: public SOS alerts with user, location, timestamp, status, message.

Important risks:

- Passwords are stored directly as `pass`; this is not production-safe.
- Firebase keys are loaded from `.env`, but web client keys are still client-side by nature.
- Firestore security rules are not present in the repo.
- The app falls back to `SharedPreferences` for local login data.

### Gemini Usage

Gemini is actually used in `DashboardTab._fetchRealTelemetry()`.

Workflow:

1. Fetch IP-based location from GeoJS.
2. Fetch weather/current/forecast data from Open-Meteo.
3. Send a prompt to `gemini-2.5-flash`.
4. Request strict JSON with title, condition, summary, precaution, forecast, and risk flag.
5. Parse the response and show an AI environmental advisory.

Gemini is not actually used for CrashGuard acoustic analysis or PharmaNode scanning; those areas simulate AI behavior.

### Healthcare Features

Implemented or partially implemented:

- Health vault categories: Blood Profile, Symptom & Viral Log, Medical History, Immunization, Allergies.
- Firestore CRUD for vault records.
- Optional image attachment stored as base64 in Firestore records.
- QR public health record route.
- Public vault screen displaying records.
- PharmaNode scanner UI that picks an image and shows a simulated allergy conflict.
- Environmental advisory with health precautions.

Stub/presentation features:

- AI vitals rPPG scanner.
- AR chemical decoder.
- Mind/memory blackbox.
- Circadian predictor.
- Digital legacy.
- Sleep apnea guardian.

### Emergency Features

Implemented or partially implemented:

- CrashGuard tab.
- Microphone recording attempt and amplitude polling.
- If amplitude exceeds threshold, `_onCrashDetected()` fires.
- 10-second monitoring countdown.
- Simulated AI crash result after countdown if no real crash is detected.
- Alarm playback from a remote URL.
- IP-based approximate location.
- Firestore `crash_alerts` broadcast.
- SMS launch to emergency contacts using `url_launcher`.
- Nearby SOS alerts stream from Firestore.
- Map link for alerts.

Stub/presentation features:

- Smart triage API payload.
- Ad-hoc mesh network.
- Sentinel predictive threat.
- Sleep apnea rescue.

### Caregiver Features

BioNode caregiver-relevant features:

- Emergency contacts list.
- SOS SMS message with location.
- Nearby SOS alert feed.
- Public health QR record.
- Health vault records.

Nurosync caregiver-relevant features:

- Clinical EOG report.
- Signal reliability/contact guidance.
- command history/source tracking.
- control strain/caregiver recommendations.

The strongest NuroNode direction is combining Nurosync report/caregiver analytics with a simple BioNode-style emergency/caregiver contact layer.

### Patient Features

BioNode patient/user features:

- Node registration/login.
- Personal health vault.
- Public QR record.
- Environmental health advisory.
- CrashGuard emergency flow.
- Medical/allergy/immunization/blood/symptom record categories.

Nurosync patient/user features:

- Assistive mobility via blink control.
- Calibration and threshold adjustment.
- Blink-to-command mapping.
- Clinical session report.
- Text-to-speech worker exists, with spoken phrase history in session state, but speech UX is not central in the current UI.

### Report Generation

BioNode does not generate formal PDF/CSV reports. Its report-like surfaces are:

- Public vault view.
- Weather/Gemini advisory.
- Crash alert record.

Nurosync is the stronger report system.

### Notifications

BioNode notification behavior:

- Snackbars for in-app events.
- SMS launch via `sms:<phone>?body=<msg>`.
- Firestore crash alert feed.
- Alarm sound playback.

No Firebase Cloud Messaging, background service, or push notification implementation was found.

### Backend APIs

BioNode has no custom backend API server.

External APIs/services:

- Firebase Core / Firestore.
- Gemini via `google_generative_ai`.
- GeoJS IP geolocation.
- Open-Meteo weather.
- Nominatim geocoding.
- OSRM routing.
- Carto tile server.
- Google alarm sound URL.
- Google Maps URL and SMS URI intents.
- ui-avatars.com profile image.

### Dashboards

BioNode dashboards:

- Hub dashboard: weather metrics and Gemini health advisory.
- Eco dashboard: map, routes, thermal/viral risk overlays, safe route finder.
- Vault dashboard: QR identity card and record category cards.
- Guard dashboard: CrashGuard, emergency contacts, nearby alerts.

Most BioNode dashboards are mobile-first and not directly compatible with NuroNode's approved desktop web UI.

## NuroNode AI Audit

### Structure

- `package.json`: Vite/React app with Chart.js.
- `src/App.jsx`: renders `NuroNodeAI`.
- `src/main.jsx`: React entry point.
- `src/components/NuroNodeAI.jsx`: entire current product UI and logic.
- `src/index.css`: approved styling.
- `screenshots`: approved UI screenshots.
- `dist`: build output.

There is no backend, database layer, or server API in the current NuroNode repo.

### Existing Implemented Features

NuroNode already implements:

- Web Serial connection to Nurosync ESP32 headband at 115200 baud.
- Nurosync line parser for telemetry, command, blink, calibration, threshold, and system logs.
- Live EOG chart with raw signal, baseline, and blink threshold.
- Session metrics: runtime, packets, blinks, parse errors, commands.
- Signal quality estimate from raw samples, noise, baseline drift, saturation.
- Contact quality labeling.
- Manual command deck using Nurosync command characters.
- Keyboard command control.
- Recalibration command `C`.
- Manual threshold command `T:<value>`.
- Four approved UI screens: Home Dashboard, Signal Center, Eye Control Center, Mobility Center.

### Existing UI Modules

All UI is inside `NuroNodeAI.jsx`:

- `HomeDashboard`
- `SignalCenter`
- `EyeControlCenter`
- `MobilityCenter`
- shared `StatusPill`, `Card`, `Panel`, `Stat`, `EventList`

The UI is cohesive and should be kept.

### Existing Backend Modules

None.

### Existing Integrations

- Browser Web Serial API.
- Chart.js via `react-chartjs-2`.
- Nurosync serial protocol.
- Nurosync firmware command protocol.

### Gaps Compared To Final Product Vision

High-value gaps:

- No patient profile.
- No caregiver/emergency contact concept.
- No CSV/PDF export.
- No persistent health vault.
- No emergency incident record.
- No AI summary layer.

Risks:

- Current app is browser-only; Web Serial requires Chrome/Edge and localhost/HTTPS.
- No backend or cloud persistence exists yet.
- No real notification system exists yet.

## Integration Conclusion

NuroNode AI should be defined as a Nurosync-powered assistive mobility and caregiver intelligence platform.

The correct integration direction is:

1. Keep Nurosync as the hardware/signal/control engine.
2. Keep the current NuroNode UI shell.
3. Add only healthcare intelligence that explains, records, shares, or escalates Nurosync sessions.
4. Avoid BioNode features that simulate sensors, require mobile-only permissions, or compete with the Nurosync engine.

