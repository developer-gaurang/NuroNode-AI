# Production Readiness Checklist

## Build Status

- Frontend build command: `npm run build`.
- Backend start command: `/app/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
- Backend health endpoint: `/health`.
- SPA rewrites configured for Vercel, including `/medical-profile/*`.

## Environment Variables

Frontend:

- `VITE_API_BASE_URL`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Backend:

- `APP_ENV`
- `API_BASE_URL`
- `FRONTEND_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_FILE`
- `FIREBASE_WEB_API_KEY`
- `SESSION_COOKIE_NAME`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Firebase:

- Authentication Email/Password enabled.
- Firestore database created.
- Storage bucket created.
- `firestore.rules` published.
- `storage.rules` published.
- Authorized domains include the Vercel production domain.

## Regression Matrix

- Signup creates Firebase Auth user and Firestore profile.
- Login restores dashboard data.
- Logout clears local auth state.
- Dashboard renders after refresh.
- Patient profile saves to private profile and public medical QR collection.
- Medical QR opens `/medical-profile/{patientId}` on Vercel.
- Reports save to Firestore and download locally.
- Gemini session summary calls Railway with Firebase ID token.
- SOS recording captures event, optional location, and Firestore write.
- Signal Center renders live/local telemetry states.
- Eye Control can send Web Serial commands in Chrome/Edge over HTTPS.
- Firestore reads and writes pass security rules for the signed-in user.
- Profile image upload writes to Firebase Storage or falls back locally with a visible status.

## Manual Production Tasks

- Deploy Firebase rules with the Firebase CLI.
- Add actual Railway and Vercel URLs to both platforms' environment variables.
- Add Vercel domain to Firebase Authentication authorized domains.
- Verify Gemini billing/quota for the selected model.
- Run the hardware Web Serial flow from a Chrome or Edge browser on the deployed HTTPS frontend.
