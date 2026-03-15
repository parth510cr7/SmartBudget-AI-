# EAS Build Guide – Install SmartBudget AI on Your Phone

Use Expo Application Services (EAS) to build the app and install it on your device.

---

## 1. Prerequisites

- **Expo account** (free): [expo.dev](https://expo.dev) → Sign up if needed.
- **Node.js** installed (you already have this).
- **Backend reachable from your phone** (see step 5). The app needs an API URL it can call (e.g. a deployed backend or tunnel).

---

## 2. Install EAS CLI

From your project root or the `frontend` folder:

```bash
npm install -g eas-cli
```

---

## 3. Log in to Expo

```bash
eas login
```

Enter your Expo email and password (or create an account at expo.dev).

---

## 4. Build from the frontend folder

Open a terminal and go to the **frontend** directory:

```bash
cd frontend
```

**Option A – Android (APK, easiest to install on phone)**

```bash
eas build --profile preview --platform android
```

- Builds an **APK** you can download and install.
- Uses the `preview` profile in `eas.json` (internal distribution, APK).

**Option B – iOS (TestFlight or internal)**

```bash
eas build --profile preview --platform ios
```

- Requires an Apple Developer account for real devices.
- You’ll be prompted for credentials if needed.

**Option C – Both**

```bash
eas build --profile preview --platform all
```

---

## 5. Set the API URL for the built app

The app reads the backend URL from:

1. **`app.json` → `expo.extra.apiUrl`**, or  
2. **Environment variable `EXPO_PUBLIC_API_URL`** at build time.

So the **built app** will use whatever API URL was set when the build ran.

**If your backend is deployed** (e.g. `https://your-api.railway.app`):

- Set it in EAS so every build uses it:

  ```bash
  cd frontend
  eas secret:create --name EXPO_PUBLIC_API_URL --value "https://your-api.railway.app" --type string
  ```

- Or in **app.json** under `expo.extra` add:

  ```json
  "apiUrl": "https://your-api.railway.app"
  ```

**If you only run the backend on your PC:**

- The phone cannot use `http://localhost:8080` or `http://10.0.0.47:8080` once you’re not on the same network.
- To use the app on your phone, either:
  - Deploy the backend (Railway, Render, Fly.io, etc.) and use that URL as above, or  
  - Use a tunnel (e.g. ngrok) and set `EXPO_PUBLIC_API_URL` or `apiUrl` to the tunnel URL (e.g. `https://abc123.ngrok.io`).

---

## 6. Wait for the build and install

1. After you run `eas build`, the build runs in the cloud.
2. When it finishes, EAS prints a **link** to the build page (or open [expo.dev](https://expo.dev) → your project → Builds).
3. **Android:** On the build page, download the **APK** and open it on your phone to install (you may need to allow “Install from unknown sources”).
4. **iOS:** Use the link/QR from EAS or install via TestFlight if configured.

---

## 7. Useful commands

| Command | Purpose |
|--------|--------|
| `eas build --profile preview --platform android` | Build APK for Android (install on phone). |
| `eas build --profile development --platform android` | Build with dev client (for development). |
| `eas build:list` | List recent builds. |
| `eas whoami` | Show current Expo user. |

---

## 8. Profiles in your `eas.json`

- **preview** – Internal build, APK on Android; good for installing on your own device.
- **development** – With dev client; for development installs.
- **production** – For store-ready builds (AAB on Android, etc.).

For “download and install on my phone,” use **preview** (or **development** if you want the dev client).

---

## Quick checklist

1. [ ] `npm install -g eas-cli`
2. [ ] `eas login`
3. [ ] `cd frontend`
4. [ ] Set `EXPO_PUBLIC_API_URL` or `expo.extra.apiUrl` to a URL your phone can reach.
5. [ ] `eas build --profile preview --platform android`
6. [ ] Download the APK from the build page and install on your phone.
