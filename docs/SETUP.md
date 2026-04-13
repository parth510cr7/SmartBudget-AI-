## Setup (backend + frontend)

SmartBudgetAI has two parts that must both run:

- **Backend**: Express + Prisma (HTTP API)
- **Frontend**: Expo (React Native)

### Prerequisites

- Node.js (LTS recommended)
- npm
- (Optional) iOS dev client install for native-module features (see Troubleshooting)

### 1) Backend

From repo root:

```bash
cd backend
npm install
npm run dev
```

Default URL: `http://localhost:8080`

### 2) Frontend (Expo)

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8080
```

Run:

```bash
npx expo start -c
```

### Using a physical iPhone on the same Wi‑Fi

Set the API URL to your computer’s LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:8080
```

Restart Expo after changing `.env`:

```bash
npx expo start -c
```

### Important product rule (affects what you see)

- Receipts can be **`VERIFIED`** or **`NEEDS_REVIEW`**
- **Totals / Insights / Assistant data shortcuts** use **VERIFIED only**
- Library shows both, and you can approve a receipt to move it into VERIFIED totals

