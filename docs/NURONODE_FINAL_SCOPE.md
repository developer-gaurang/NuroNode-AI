# NuroNode AI Final Scope

Audit date: 2026-06-25

## What Exactly Is NuroNode AI?

NuroNode AI is an assistive mobility and caregiver intelligence platform built on the Nurosync eye-control engine.

It connects to a Nurosync EOG headband, reads real blink/eye telemetry, preserves Nurosync's firmware-level blink detection and command mapping, controls a mobility device through the existing hardware command path, and adds the reporting, emergency, and caregiver context needed for real-world use.

## What Problem Does It Solve?

People with severe mobility limitations need a control interface that does not depend on hands, speech, or conventional joysticks. Nurosync proves that eye/blink signals can control mobility hardware. NuroNode AI turns that working control loop into a safer and more understandable care platform.

It solves three practical problems:

- **Control:** convert eye/blink intent into mobility commands.
- **Safety:** expose emergency stop, calibration state, signal quality, and command history.
- **Care:** help caregivers understand what happened during a session and what action is needed.

## Who Is The User?

Primary user:

- A person with limited mobility who needs eye-controlled movement or device control.

Secondary users:

- Family caregiver.
- Rehab therapist.
- Assistive technology evaluator.
- Clinical support staff.
- Hackathon judge/demo viewer.

## Version 1 Scope

Version 1 should include only features that are credible, demoable, and connected to the Nurosync engine.

### V1 Must Include

- Current approved NuroNode UI.
- Web Serial connection to Nurosync.
- Nurosync serial parser.
- Live EOG waveform.
- Baseline and blink threshold display.
- Blink sequence/event display.
- Manual command deck using Nurosync commands.
- Recalibration command `C`.
- Manual threshold command `T:<value>`.
- Mobility command history.
- Emergency stop state from long blink or `E`.
- Signal quality and contact guidance.
- Patient/session profile.
- Caregiver recommendation summary.
- Session analytics/report view.

### V1 Should Include If Time Allows

- CSV export of telemetry/session history.
- Print-friendly clinical session summary.
- Copyable emergency message for caregiver.
- Local-only health context: allergies, condition, caregiver instructions.
- Optional AI-generated caregiver explanation from session metrics.

### V1 Must Not Include

- Fake telemetry.
- New blink detection logic.
- Replacement calibration algorithm.
- New UI redesign.
- Mobile app migration.
- Firebase auth.
- Cloud health vault.
- Claims of diagnosis or real EMS dispatch.

## Version 2 Scope

Version 2 can expand after the hackathon once the core demo is stable.

### V2 Candidate Features

- Secure cloud sync for patient profile and session reports.
- Proper authentication.
- Caregiver account and remote dashboard.
- Emergency contacts with explicit consent.
- External message and email share flows.
- PDF report generation.
- QR emergency summary.
- Health vault with allergies, diagnosis, prescriptions, and caregiver notes.
- Gemini-powered plain-language session explanation.
- Longitudinal analytics across sessions.
- Therapist onboarding/calibration workflow.
- Device fleet/support dashboard.

### V2 Research Features

These require careful validation:

- rPPG vitals.
- medicine/ingredient scanner.
- acoustic emergency detection.
- route/environment advisory.
- offline relay/mesh.
- caregiver mobile companion app.

## Features To Remove Entirely

These should not be part of NuroNode's near-term product identity:

- Digital legacy/dead-man switch.
- Crypto/will/asset vault.
- Government epidemic surveillance dashboard.
- National EMS API claims.
- Quantum/security marketing language.
- Pricing screen before product-market clarity.
- Simulated AI scanners presented as real.
- Broad "survival OS" positioning.

## Final Feature Set Recommendation

The best final hackathon feature set is:

1. Nurosync-powered eye-controlled mobility.
2. Live biomedical signal center.
3. Eye control calibration and threshold controls.
4. Mobility command deck and command history.
5. Emergency stop and caregiver alert mode.
6. Patient/session profile.
7. Clinical-style session summary.
8. CSV or print export if time allows.

This is focused, believable, and valuable.

## Product Definition Statement

NuroNode AI is the care layer for eye-controlled mobility. It does not replace Nurosync; it productizes it. The platform helps a patient control movement through eye signals while giving caregivers and clinicians transparent evidence of signal quality, command intent, emergency events, and session outcomes.
