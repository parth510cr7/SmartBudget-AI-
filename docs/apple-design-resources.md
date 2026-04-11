# Apple design references (SmartBudgetAI)

Use these **official** sources when aligning Search / tab bar / navigation with iOS patterns.  
There is **no** separate public “App Store UI SDK” for third-party apps: the App Store app is Apple’s own product. What exists for **developers** is below.

## Human Interface Guidelines (behavior and layout)

- **Tab bars:** [Tab bars – HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars)  
  Guidance for items, selection, labels, and (on newer iOS) tab bar grouping.

- **Search fields / search placement:** Search-related guidance is under broader navigation patterns; see [Design – Apple Developer](https://developer.apple.com/design/) and search the site for “search” (e.g. search placement updates appear in “What’s New”).

- **General principles:** [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

## Design resources (kits, templates, symbols)

- **Central hub:** [Apple Design Resources](https://developer.apple.com/design/resources/)  
  Includes **iOS / iPadOS UI Kits** (often **Sketch**; some periods list Figma-related workflows via Apple’s announcements—download what matches your installed tools).

- **SF Symbols (icons aligned with system UI):**  
  - Overview: [SF Symbols](https://developer.apple.com/sf-symbols/)  
  - **Download (macOS app + catalogs):** DMG links are on the Design Resources page, e.g. **SF Symbols 7** (requires a recent macOS).  
  Use for **design** and for **export** of symbol shapes; **not** a drop-in React Native runtime.

- **Fonts:** **SF Pro** and related families are linked from [Design Resources](https://developer.apple.com/design/resources/) under **Fonts**.

## What we use in Expo / React Native

- **Runtime icons in the app:** We ship **vector icons** (e.g. `lucide-react-native`, `@expo/vector-icons` where used). We **map** layouts to HIG ideas (floating tab, search affordance); we do **not** bundle Apple’s Sketch kit inside the app binary.
- **Parity with SF Symbols:** On iOS you can optionally use symbol-like icons from `@expo/vector-icons` or community SF-compatible sets; exact **SF Symbol** rendering is a **native** API (Swift/UIKit), not something Expo exposes as a full duplicate of Apple’s catalog.

## Legal / assets

- Do **not** redistribute Apple’s **App Store** screenshots, marketing art, or trademarked App Store chrome as if it were your product UI.
- **Retailer logos** in budgeting UIs need your own license or generated placeholders (initials, etc.)—see product decisions.

## Figma

- Apple’s downloadable kits are historically **Sketch-first**; Figma users often **recreate** or use community iOS kits that track HIG. If you add a **Figma file** for SmartBudgetAI Search, link it in the project README or here for parity checks.
