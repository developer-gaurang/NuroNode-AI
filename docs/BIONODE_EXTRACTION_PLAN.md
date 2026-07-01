# BioNode Extraction Plan

Audit date: 2026-06-25  
Source repo: `E:\Projects\My_Apps\bionode_ai`  
Target product: NuroNode AI  

## Extraction Principle

Only extract BioNode features that strengthen Nurosync's real eye-controlled mobility demo. Do not import BioNode's mobile UI wholesale. Do not replace Nurosync signal processing, blink detection, calibration, or hardware command logic.

## Feature Matrix

| Feature | Purpose | Complexity | Dependencies | Reusable? | Recommended? |
|---|---|---:|---|---|---|
| Firebase node registration/login | Creates cloud identity for app users | Medium | Firebase Core, Firestore, auth/security rules needed | Partially | No for hackathon; passwords are stored unsafely |
| Local login fallback | Lets users sign in from local storage | Low | SharedPreferences in Flutter equivalent | No | No |
| Health vault records | Store patient medical history, allergies, immunization, blood profile, symptom logs | Medium | Database or local storage, file/image support | Yes | Yes, but simplified |
| Public QR health record | Share critical health info with caregiver/EMS | Medium | QR generator, public route, database | Yes | Phase B unless backend exists |
| Vault image attachment | Attach scanned reports/prescriptions | Medium | Image picker/file upload/storage | Partially | Phase C for web hackathon |
| Gemini environmental advisory | Converts weather/location data into health precautions | Medium | Gemini key, GeoJS, Open-Meteo | Yes | Phase B; good pitch, not core demo |
| Weather metrics dashboard | Shows temperature, humidity, pressure, wind | Low-Medium | GeoJS, Open-Meteo | Partially | Phase B |
| Eco thermal route map | Visualizes routes and heat/weather risk | High | Flutter Map, Nominatim, OSRM, tiles, Open-Meteo | Low | No before hackathon |
| Crowd-sourced bio-surveillance heatmap | Epidemic/toxic zone tracker | High | Real data source, privacy model, maps | Mostly stub | No |
| Safe route finder | Calculates route and classifies risk | High | Geocoding, OSRM, weather | Partially | No |
| CrashGuard acoustic monitoring | Detect loud crash-like event and escalate SOS | High | Mic permission, record plugin, background behavior, false positive handling | Partially | No as-is; adapt emergency flow instead |
| Emergency contacts | Store caregiver contacts for SOS | Low-Medium | Database/local storage, SMS/mail/phone launch | Yes | Yes |
| SOS alert broadcast | Create incident alert with status/location | Medium | Firestore or local event record, location | Yes | Yes, simplified around Nurosync emergency stop |
| Nearby SOS feed | Shows recent crash alerts | Medium | Firestore stream | Partially | Phase C |
| SMS emergency launch | Opens SMS to contacts with message/location | Medium | Browser/mobile URI support | Partially | Phase B; demo carefully |
| Alarm playback | Audible alert during emergency | Low | Browser Audio or local asset | Yes | Phase A if tied to emergency stop |
| Smart triage indicator | Shows severity and emergency payload concept | Low | UI only | Yes | Phase A as a report/summary concept, not fake API |
| AI Smart Triage EMS Grid | Sends payload to 112/regional EMS | Very High | Official EMS API, compliance | No | No |
| Ad-hoc mesh network | Offline peer relay | Very High | BLE/Wi-Fi Direct/native mobile | Stub | No |
| Sentinel predictive threat | Personal safety anomaly detection | High | Sensors, location history, ML rules | Stub | No |
| Sleep apnea guardian | Detect breathing cessation | Very High | Mic/background/audio analysis, medical risk | Stub | No |
| AI vitals rPPG scanner | Camera-based HR/SpO2 | Very High | Camera, CV, validation | Stub | No |
| AR chemical decoder | Scan ingredients/medicine for allergies | High | Camera/OCR/Gemini Vision/allergy DB | Mostly stub | Phase C |
| PharmaNode scanner | Pick medicine image, simulate allergy conflict | Medium | Image picker, actual AI missing | Partially | No before hackathon; too easy to look fake |
| Mind & Memory Blackbox | Voice diary with mental health risk detection | Very High | Audio, storage, Gemini safety workflow | Stub | No |
| Circadian predictor | Predict energy crash from weather/biometrics | Medium | Weather + user data | Stub | No |
| Digital legacy handshake | Dead-man switch for assets | Very High | Legal/security/identity verification | Stub | No |
| Pricing screen | Subscription upsell | Low | UI only | No | No |
| Glassmorphism UI primitives | Visual style components | Low | Flutter only | No | No; NuroNode UI is already approved |

## Phase A: Must Add Before Hackathon

These features give high demo/pitch value while staying close to Nurosync's real engine.

1. **Caregiver/Emergency Layer Around Nurosync Emergency Stop**
   - Trigger from `EMERGENCY_STOP`, long blink, or manual `E`.
   - Show incident state, timestamp, last command, signal quality, and recommended caregiver action.
   - Do not claim real EMS dispatch unless actually implemented.

2. **Patient Session Profile**
   - Name/age/condition/caregiver note fields.
   - Used only to label reports and demo context.
   - Can be local-only for hackathon.

3. **Clinical Session Summary**
   - Reuse Nurosync report concepts: reliability, contact quality, drift, commands, blink count, emergency events, recommendations.
   - Present inside existing NuroNode UI or export later.

4. **Audible/Visual Emergency Alert**
   - Browser-safe alert when emergency stop occurs.
   - Use real Nurosync event as the trigger.

5. **Caregiver Recommendation Panel**
   - Based on actual session metrics.
   - Examples: recalibrate, check electrode contact, shorten session, review emergency event.

## Phase B: Useful But Optional

Add only if Phase A is stable.

1. **CSV Export**
   - Adapt Nurosync CSV schema to browser.
   - Strong proof for judges.

2. **PDF/Print Report**
   - Browser print view is safer than adding a PDF dependency.
   - Could mirror Nurosync clinical report sections.

3. **Emergency Contact Draft Message**
   - Generate copyable emergency summary with session facts.
   - Safer than automatic notification during hackathon.

4. **Simple Health Vault**
   - Local list of allergies, diagnosis, caregiver instructions.
   - Use it to enrich emergency report.

5. **Gemini Clinical Explanation**
   - Optional AI-generated plain-language interpretation from session metrics.
   - Must be clearly labeled as non-diagnostic and not required for core demo.

6. **Public QR Summary**
   - QR to static/local printable emergency summary.
   - Only if routing/storage is already solved.

## Phase C: Do Not Add Before Hackathon

Avoid these because they are risky, stubbed, off-mission, or too expensive for 10 days.

- Firebase auth/login from BioNode.
- Firestore security model.
- Full BioNode mobile UI.
- CrashGuard acoustic detection.
- Nearby SOS feed.
- Eco route map.
- Bio-surveillance heatmap.
- EMS/112 API dispatch.
- Mesh networking.
- Sentinel threat prediction.
- Sleep apnea monitoring.
- rPPG vitals scanner.
- AR chemical decoder.
- PharmaNode AI scanner.
- Mind blackbox.
- Digital legacy.
- Pricing/subscription.

## Final Recommendation

Extract the healthcare story, not the BioNode app.

For the hackathon, BioNode should contribute:

- emergency/caregiver workflow concepts
- patient context
- health-vault concept, simplified
- incident/report language
- optional AI explanation

It should not contribute:

- mobile navigation
- new frontend design
- fake sensor systems
- unproven medical claims
- cloud auth/security complexity
