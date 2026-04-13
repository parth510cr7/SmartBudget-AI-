## API (used by the app)

Base URL is configured in the app via `EXPO_PUBLIC_API_URL`.

All frontend calls live in `frontend/src/api/client.ts`.

### Auth

- Requests typically send `Authorization: Bearer <Firebase_ID_Token>`
- In development, some client calls fall back to `dev-token` to unblock local testing

### Analytics / Home / Insights

- `GET /api/transactions/summary`
  - **Uses `VERIFIED` receipts only**
  - Returns: `totalSpent`, `totalStores`, `categories[]`, and trust counters:
    - `verifiedReceiptCount`
    - `needsReviewCount`

- `GET /api/transactions/search-stats`
  - **Uses `VERIFIED` receipts only**
  - Returns top stores/categories + `last30Days` and the same trust counters:
    - `verifiedReceiptCount`
    - `needsReviewCount`

### Library / Receipts

- `GET /api/transactions` (list)
- `GET /api/receipts/:id/image` (receipt image served by backend)
- `POST /api/receipts/:id/approve` (or equivalent route) to mark `NEEDS_REVIEW` → `VERIFIED`

### Assistant

- `POST /api/app-query`
  - Deterministic answers from real app data (VERIFIED receipts)
- `POST /api/ai/chat`
  - Currently returns deterministic fallback built from app-query
  - Footer text is aligned to VERIFIED totals and explicitly calls out `NEEDS_REVIEW` counts

### Household

- `GET /api/household/dashboard`
  - Household-only analytics (HOUSEHOLD visibility + VERIFIED)

