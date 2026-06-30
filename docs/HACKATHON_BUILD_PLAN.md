# Hackathon Build Plan

Audit date: 2026-06-25  
Hackathon date: 2026-07-05  
Available time: 10 days

## Strategic Position

The winning path is not "more features." The winning path is a believable assistive mobility system with a healthcare/caregiver layer.

NuroNode AI should demonstrate:

1. A real Nurosync-powered eye/blink control loop.
2. Live signal transparency.
3. Safety and emergency handling.
4. Caregiver/clinical reporting.
5. A clear startup story: assistive mobility plus care intelligence for people with severe mobility limitations.

## What Should Be Built

### Core Demo Spine

- Connect to Nurosync hardware through Web Serial.
- Show real EOG telemetry, baseline, threshold, blink events, commands.
- Demonstrate blink-to-command mapping with the RC car.
- Demonstrate emergency stop from long blink or manual `E`.
- Show safety status and caregiver recommendation generated from real session metrics.

### Highest-Impact Additions

1. **Patient Profile**
   - Minimal fields: patient name, condition/use case, caregiver note.
   - Used in session summary and emergency panel.

2. **Emergency/Caregiver Mode**
   - Activated by `EMERGENCY_STOP`.
   - Shows "caregiver action required", signal state, latest command, timestamp.
   - Optional alarm/audio.

3. **Clinical Session Summary**
   - Signal reliability.
   - Contact quality.
   - Baseline drift.
   - Blink events.
   - Command distribution.
   - Emergency events.
   - Caregiver recommendations.

4. **CSV or Print Export**
   - Judges love artifacts.
   - CSV is easiest and aligns with Nurosync.
   - Print report is better for pitch if time allows.

5. **Optional AI Explanation**
   - Feed only derived metrics, not raw medical claims.
   - Output: "session explanation for caregiver".
   - Must include non-diagnostic wording.

## What Should Be Ignored

Ignore anything that competes with Nurosync or looks fake under questioning.

- Rebuilding signal processing.
- New blink detector.
- Mock telemetry.
- Full BioNode mobile UI.
- Firebase auth.
- Firestore migration.
- CrashGuard audio detection.
- Weather/route dashboard.
- Epidemic heatmap.
- rPPG vitals.
- AR medicine scanner.
- Mesh networking.
- EMS API dispatch.
- Digital legacy.
- Subscription/pricing.

## Highest Demo Impact

The demo should be a tight story:

1. "This user cannot use a joystick."
2. "Nurosync reads EOG/blink signals from the headband."
3. "NuroNode AI shows the signal transparently."
4. "A blink sequence moves the mobility device."
5. "A long blink triggers emergency stop."
6. "The caregiver sees exactly what happened and gets a clinical-style summary."

This is stronger than showing 15 unrelated app tabs.

## Highest Judge Impact

Judges will reward:

- Real hardware.
- Real-time signal visualization.
- Explainable safety behavior.
- Accessibility impact.
- Clear architecture.
- A credible path to clinics/caregivers.

Best judge-facing line:

> NuroNode AI does not guess the user's intent. It preserves the proven Nurosync control engine, then adds the safety, reporting, and caregiver intelligence required to make eye-controlled mobility deployable.

## Highest Startup Value

The startup value is not an all-purpose healthcare app. It is:

- assistive mobility interface
- caregiver dashboard
- session analytics
- safety evidence
- clinical onboarding/reporting

Potential buyers/users:

- people with severe motor impairment
- caregivers/family
- rehab centers
- assistive technology clinics
- disability-focused NGOs
- hospitals running neuro-rehab programs

## 10-Day Execution Plan

### Days 1-2: Freeze Architecture

- Keep current NuroNode UI.
- Confirm Nurosync serial protocol with hardware.
- Define exact demo flow.
- Decide which Phase A items fit without destabilizing the app.

### Days 3-4: Caregiver + Emergency Layer

- Add patient profile storage locally.
- Add emergency event state from Nurosync `EMERGENCY_STOP`.
- Add caregiver recommendation logic from existing metrics.

### Days 5-6: Report Artifact

- Add CSV export first.
- Add print-friendly session report if time remains.
- Include patient metadata and real session metrics.

### Days 7-8: Polish Demo Reliability

- Test Web Serial flow.
- Test keyboard/manual commands.
- Test emergency stop path.
- Create fallback explanation if hardware connection fails, without fake telemetry.

### Day 9: Pitch Story

- Prepare architecture slide.
- Prepare before/after comparison: Nurosync engine -> NuroNode care platform.
- Prepare clinical/non-diagnostic disclaimer.

### Day 10: Rehearsal

- Run full demo repeatedly.
- Keep backup screenshots/video of real hardware session.
- Do not add new features.

## Recommended Demo Script

1. Start on Home Dashboard and explain the problem.
2. Connect headband.
3. Show Signal Center with live EOG waveform.
4. Run or explain calibration.
5. Blink once to move forward.
6. Blink sequence or manual command to turn/stop.
7. Trigger emergency stop.
8. Show caregiver/clinical summary.
9. Close with startup path.

## Risk Controls

- If Web Serial fails, show saved screenshots/video and explain browser requirement.
- If hardware signal is noisy, use calibration flow, not mock data.
- If AI/Gemini is not ready, omit it.
- If export is unstable, keep in-app summary only.
- Never claim medical diagnosis, EMS dispatch, or autonomous rescue unless actually implemented.

