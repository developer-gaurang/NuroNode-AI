# NeuroNode AI Deployment Guide

This project deploys as two services:

- Frontend: Vercel, built from the repository root with Vite.
- Backend: Railway, running FastAPI from `backend.main:app`.

## Frontend: Vercel

1. Import `developer-gaurang/NuroNode-AI` into Vercel.
2. Use the root directory as the project root.
3. Keep the default build from `vercel.json`: `npm ci` then `npm run build`.
4. Set the frontend environment variables from `.env.example`.
5. After Railway is deployed, set `VITE_API_BASE_URL` to the Railway public service URL.

Required frontend variables:

- `VITE_API_BASE_URL`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Backend: Railway

1. Create a Railway service from the same GitHub repository.
2. Keep the root directory as the service root.
3. Railway uses `railway.json` plus `nixpacks.toml` and starts `/app/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
4. Set the backend environment variables from `backend/.env.example`.
5. Add the final Vercel domain to `FRONTEND_ORIGINS`.

Required backend variables:

- `APP_ENV=production`
- `API_BASE_URL`
- `FRONTEND_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_FILE`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SESSION_COOKIE_NAME`

## Firebase

Enable these Firebase products before production verification:

- Authentication with Email/Password provider enabled.
- Firestore in production mode.
- Firebase Storage.
- Firestore rules from `firestore.rules`.
- Storage rules from `storage.rules`.

Expected collections:

- `users/{uid}/profile/current`
- `users/{uid}/emergency_contacts/{contactId}`
- `users/{uid}/sos_events/{eventId}`
- `users/{uid}/reports/{reportId}`
- `users/{uid}/ai_history/{recordId}`
- `public_medical_profiles/{patientId}`

## Post-Deploy Checks

- `GET /health` on Railway returns `status: ok`.
- Vercel loads without missing Firebase configuration errors.
- Login, signup, logout, profile save, contact save, SOS event, reports, QR generation, downloads, Web Serial UI, and Gemini summary are verified.
- Browser console has no failed API requests or CORS errors.
- No production environment value points at local development URLs.
