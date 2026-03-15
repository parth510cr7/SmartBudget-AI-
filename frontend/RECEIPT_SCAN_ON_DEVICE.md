# Receipt scan & categories on a physical device

On a **physical device** (phone/tablet), receipt scanning and category organization depend on the app being able to reach your **backend**. If the backend is unreachable, scans will fail and you’ll see a message like “Can’t reach server”.

---

## How it works

1. **On-device OCR** (optional): The app uses `expo-text-extractor` to read text from the receipt image. This works in **EAS / dev builds** that include the native module. It may not be available in Expo Go.
2. **Backend does the rest**: Whether OCR runs on-device or not, the app sends either:
   - **Raw OCR text** → `POST /api/receipts/process-text` (parse + categorize), or  
   - **Image (base64)** → `POST /api/receipts/from-base64` (backend runs AI parse + categorize).
3. **Categories** are assigned on the backend (store + line-item categories). If the request never reaches the backend, nothing is saved and no categories are created.

---

## Why it might not work on device

| Cause | What to do |
|-------|------------|
| **Phone and PC on different networks** | Connect the phone to the **same Wi‑Fi** as the computer that runs the backend. |
| **Backend not running** | On the PC, run `npm run dev` in the `backend` folder and leave it running. |
| **Wrong API URL on device** | The built app uses the URL set at build time (`BASE_URL` or `EXPO_PUBLIC_API_URL`). For a device, that must be your PC’s IP (e.g. `http://10.0.0.47:8080`), not `localhost`. Rebuild with the correct URL if needed. |
| **Firewall blocking port 8080** | Allow inbound TCP on port 8080 for the backend (Windows Firewall or antivirus). |
| **Phone on cellular only** | Use Wi‑Fi so the phone can reach your PC’s local IP. |

---

## Checklist for “scan not working” on device

1. [ ] Backend is running on your computer: `cd backend && npm run dev`
2. [ ] Phone is on the **same Wi‑Fi** as that computer
3. [ ] The app was built with the correct API URL (e.g. `http://10.0.0.47:8080` for your PC’s IP)
4. [ ] No firewall is blocking port **8080** on the PC
5. [ ] If you see “Can’t reach server”, the app is telling you the backend is unreachable – fix 1–4 above

---

## After it’s working

- Scanned receipts are stored and **categorized** on the backend.
- You’ll see them in the **Scan** tab, **Insights** (spend by category), and when adding expenses from receipts to groups.
