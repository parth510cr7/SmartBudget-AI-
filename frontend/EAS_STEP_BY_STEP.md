# EAS Build – Step-by-Step Guide

Follow these steps in order to build the app and install it on your phone.

---

## Step 1: Open a terminal

- Open **Command Prompt**, **PowerShell**, or the terminal in VS Code/Cursor.
- You’ll run all commands from this terminal.

---

## Step 2: Install EAS CLI (one-time)

Run:

```bash
npm install -g eas-cli
```

Wait until it finishes. If you see a permission warning, you can use:

```bash
npm install -g eas-cli --no-optional
```

---

## Step 3: Log in to Expo (one-time)

Run:

```bash
eas login
```

- If you **have** an Expo account: enter your **email** and **password**.
- If you **don’t**: go to [https://expo.dev](https://expo.dev) → **Sign up**, create an account, then run `eas login` again and use that email and password.

When you see something like “Logged in as …”, you’re done with this step.

---

## Step 4: Go to the frontend folder

From your project folder (e.g. `SmartBudgetAI`), run:

```bash
cd frontend
```

Or, if you’re already inside the project:

```bash
cd c:\Users\parth\Desktop\SmartBudgetAI\frontend
```

Check you’re in the right place: you should see `app.json`, `package.json`, and `eas.json` in this folder.

---

## Step 5: (Optional) Set your backend URL for the build

The app needs your **backend URL** so it can talk to your API.

**Option A – Backend is only on your computer (same Wi‑Fi as phone)**  
- Use your PC’s IP on your Wi‑Fi (e.g. `192.168.1.5`) and port `8080`.  
- Example: `http://192.168.1.5:8080`  
- Create an EAS secret so the build uses it:

```bash
eas secret:create --name EXPO_PUBLIC_API_URL --value "http://YOUR_PC_IP:8080" --type string
```

Replace `YOUR_PC_IP` with your actual IP (e.g. `192.168.1.5`). No trailing slash.

**Option B – Backend is deployed (e.g. Railway, Render)**  
- Use the full URL, e.g. `https://your-app.railway.app`  
- Run:

```bash
eas secret:create --name EXPO_PUBLIC_API_URL --value "https://your-app.railway.app" --type string
```

**Option C – Skip for now**  
- You can skip this step and run the build. The app will use whatever is in your `.env` or default. You can add the secret later and rebuild.

---

## Step 6: Start the build

Run:

```bash
eas build --profile preview --platform android
```

- First time you may be asked to **confirm project** (Expo account, project name). Choose **SmartBudget AI** / your project.
- You may be asked **Generate a new Android Keystore?** → answer **Y** (Yes).
- The build will **upload** your project to EAS and then build in the cloud. This can take **10–20 minutes**.

Do **not** close the terminal until the build is submitted. You’ll see a link to the build page when it’s queued.

---

## Step 7: Wait for the build to finish

- In the terminal you’ll get a link like:  
  `https://expo.dev/accounts/YOUR_ACCOUNT/projects/smartbudget-ai/builds/...`
- Open that link in your browser, or go to [https://expo.dev](https://expo.dev) → **Your project** → **Builds**.
- Wait until the status is **Finished** (green). You’ll get an email when it’s done if notifications are on.

---

## Step 8: Download the APK

- On the **build page**, find the **Android** build.
- Click **Download** (or the APK link).
- The file will be something like `build-xxxxx.apk`. Save it to your computer (or directly to your phone if you have a cable or cloud storage).

---

## Step 9: Install the APK on your Android phone

**If the APK is on your computer:**

1. Copy the APK to your phone (USB cable, Google Drive, email, etc.).
2. On your phone, open the **Files** (or Downloads) app and tap the APK file.
3. If Android says **“For your security, your phone is not allowed to install unknown apps from this source”**:
   - Tap **Settings** and turn on **Allow from this source** (or “Install unknown apps” for that app).
   - Go back and tap the APK again.
4. Tap **Install**, then **Open** when done.

**If you downloaded the APK on your phone:**

1. Open **Downloads** or **Files** and tap the APK.
2. Allow installation from that source if asked (as above).
3. Tap **Install**, then **Open**.

---

## Step 10: Use the app

- Open **SmartBudget AI** on your phone.
- If you set **EXPO_PUBLIC_API_URL** in Step 5, the app will use that backend.
- If the backend is on your PC, make sure:
  - The backend is running (`npm run dev` in the `backend` folder).
  - Your phone is on the **same Wi‑Fi** as your computer.
  - The URL you used (e.g. `http://192.168.1.5:8080`) is your PC’s IP on that Wi‑Fi.

---

## Quick reference

| Step | What to do |
|------|------------|
| 1 | Open terminal |
| 2 | `npm install -g eas-cli` |
| 3 | `eas login` (Expo email/password) |
| 4 | `cd frontend` |
| 5 | (Optional) `eas secret:create --name EXPO_PUBLIC_API_URL --value "http://YOUR_IP:8080" --type string` |
| 6 | `eas build --profile preview --platform android` |
| 7 | Wait for build to finish (expo.dev → Builds) |
| 8 | Download the APK from the build page |
| 9 | Copy APK to phone and install (allow “unknown sources” if asked) |
| 10 | Open the app; ensure backend is running and phone on same Wi‑Fi if using PC backend |

---

## If something goes wrong

- **“Not logged in”** → Run `eas login` again.
- **“Project not found”** → In the project folder run `eas init` and link the project, or confirm you’re in `frontend` and that `app.json` has the right `slug` and EAS `projectId`.
- **Build fails** → Open the build log on expo.dev and check the red error lines; paste that error for help.
- **App opens but can’t load data** → Check Step 5 (backend URL) and Step 10 (backend running, same Wi‑Fi if using PC).
