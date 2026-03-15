# EAS iOS development build (internal distribution)

## Pre-build check ✓

- **app.json** has `bundleIdentifier`: `com.parth510.smartbudgetai`
- **eas.json** has a `development` profile with `distribution: "internal"` and `developmentClient: true`

## Run the build (interactive – you must do this in your terminal)

EAS needs you to choose your Apple Team and manage credentials interactively. **Run these commands in PowerShell from your project:**

```powershell
cd c:\Users\parth\Desktop\SmartBudgetAI\frontend
$env:EAS_NO_VCS = "1"
eas build --platform ios --profile development
```

**When prompted:**

1. **Log in:** If asked, log in with your Expo account (`eas login`).
2. **Credentials:** Choose **“Let Expo manage your credentials”** (automatic).
3. **Team:** When asked for an **Apple Team**, select the one for **parth.bhatt@icloud.com**.
4. **Device registration:** If EAS asks to register the device at 10.0.0.47 (your iPhone), confirm so it can generate the right provisioning profile for internal distribution.

The build will then be submitted to Expo’s servers.

## After the build is submitted

1. **Build URL**  
   The CLI will print a link like:
   ```text
   https://expo.dev/accounts/YOUR_ACCOUNT/projects/smartbudget-ai/builds/BUILD_ID
   ```
   Open this in your browser to watch progress.

2. **Wait for the build (about 10–15 minutes)**  
   A Mac build server will compile your app. Status will move from “Queued” → “In progress” → “Finished”.

3. **Install on your iPhone**  
   When the build **Finished**:
   - The same build page will show a **QR code**.
   - Open the **Camera** app on your iPhone and scan that QR code (or open the build page on the phone and tap the install link).
   - Follow the prompts to install the app. You may need to trust the developer in **Settings → General → VPN & Device Management**.
   - The app will appear on your home screen as a permanent icon (development build with Expo Go–like dev tools).

## If Git is not installed

The `$env:EAS_NO_VCS = "1"` line is only needed if Git isn’t installed or EAS reports a Git error. If Git is working, you can run:

```powershell
cd c:\Users\parth\Desktop\SmartBudgetAI\frontend
eas build --platform ios --profile development
```
