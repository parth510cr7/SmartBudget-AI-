# SmartBudgetAI

Budget and receipt tracking app with scan, insights, and basket recommendations.

## Docs (start here)

See `docs/README.md`.

## Run the app (both ends required)

You need to start **both** the backend and the frontend.

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

- Usually runs on **http://localhost:8080**
- Handles: receipts, auth, summary, stores, basket insights, categories

### 2. Frontend (Expo)

```bash
cd frontend
npm install
npx expo start
```

- Opens Expo dev server; run on simulator or scan QR for physical device
- Set API URL in `frontend/.env`:
  - **Simulator:** `EXPO_PUBLIC_API_URL=http://localhost:8080`
  - **Physical device (same Wi‑Fi):** `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:8080` (e.g. `http://10.0.0.47:8080`)
- After changing `.env`, restart Expo: `npx expo start -c`

### Summary

| What        | Command              | Where      |
|------------|----------------------|------------|
| Start API  | `npm run dev`        | `backend/` |
| Start app  | `npx expo start`     | `frontend/`|

Start backend first, then frontend.
