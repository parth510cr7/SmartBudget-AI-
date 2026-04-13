## Troubleshooting

### “Totals don’t match what I scanned”

- Home/Insights/Assistant shortcuts use **VERIFIED** receipts only.
- If a receipt is **NEEDS_REVIEW**, it shows in **Library** with a **Review** badge and does **not** count until approved.
- Use the Home/Insights banner to open `Library → Needs review` and approve.

### iPhone can’t reach backend

- Set `EXPO_PUBLIC_API_URL` to your computer’s LAN IP, not `localhost`.
- Ensure both devices are on the same Wi‑Fi.
- Restart Expo with cache clear: `npx expo start -c`.

### Dev client vs Expo Go

Some features require a **dev client / native build** (Expo Go is not enough), especially:

- on-device model loading
- certain filesystem/native-module integrations

If you see errors like missing native modules, confirm you installed the correct dev build on the device.

### Warning: `expo-file-system getInfoAsync` is deprecated

Expo SDK has a new filesystem API. The app may still use legacy methods; it’s a warning (not a runtime failure).

### Safe area warning

If you see `SafeAreaView` deprecation warnings, use `react-native-safe-area-context` (`useSafeAreaInsets`) for modern safe-area handling.

