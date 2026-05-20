# Building the iOS App (Capacitor)

This repo is both a Next.js PWA (deployed to Vercel) and a native iOS shell
that loads the same Vercel URL inside a WebView. The native shell adds:

- Real haptic feedback on every Button (via `UIImpactFeedbackGenerator`)
- Real iOS push (no PWA "Add to Home Screen" requirement once installed)
- Native splash + status bar handling
- Future: home screen widgets, Live Activities

The webapp content is **always live-loaded** from
`https://life-os-carter.vercel.app`. You don't need to rebuild Xcode every
time you ship a feature — just `git push` and the native app picks up the
new build on next launch.

## One-time setup

You need: macOS, Xcode 15+, your iPhone, a Lightning/USB-C cable.

1. **Install Xcode** from the Mac App Store (~7GB, takes a while). Open it
   once and accept the license agreement.
2. **Sign in with your Apple ID** in Xcode:
   `Xcode → Settings → Accounts → +` (any free Apple ID is fine — no
   $99/yr Developer Program required).
3. **Plug in your iPhone** with the cable. On the iPhone, tap "Trust" if
   prompted.

## Build + install

From the repo root:

```bash
# If you've changed plugin packages, sync them into the iOS project first.
# Safe to run every time; idempotent.
npx cap sync ios

# Open the Xcode workspace.
npx cap open ios
```

In Xcode:

1. Top-left scheme picker: choose **App**.
2. Target device dropdown: choose **your iPhone** (must be plugged in and
   unlocked).
3. **First time only**: click the **App** target in the navigator →
   **Signing & Capabilities** → **Team**: select your name (Personal Team).
   The bundle ID `com.carterbrady.lifeos` will auto-register.
4. Press **⌘R** (or the Play button) to build + install.
5. On your iPhone, open `Settings → General → VPN & Device Management`.
   Find your Apple ID under "DEVELOPER APP", tap it, and tap "Trust".
6. Launch Life OS from the home screen.

## The 7-day re-sign rhythm

A free Apple ID issues a "Personal Team" provisioning profile that's only
valid for **7 days**. After 7 days the app won't launch ("This app is no
longer available"). Your data inside the app sandbox is preserved.

To renew:

1. Plug iPhone in
2. `npx cap open ios`
3. **⌘R** — Xcode reinstalls in place (data preserved)
4. Done — good for another 7 days

This is annoying but works for personal use. Options to avoid it:

- **Pay $99/yr for the Apple Developer Program** — provisioning lasts a
  year, plus you get TestFlight, App Store distribution, etc.
- **Use AltStore or SideStore** — third-party tools that auto-renew your
  signing via a background process on your Mac. Free.

## What the native shell adds vs the PWA

| Feature | PWA (today) | Native shell |
|---|---|---|
| Push notifications | iOS 16.4+, must "Add to Home Screen" first | Works on launch |
| Haptic feedback | Only the `<input switch>` Toggle | Every Button via Taptic Engine |
| Splash screen | iOS auto-generates ugly white flash | Custom dark splash |
| Status bar | Adapts to color scheme | Same, with native sync |
| Home screen widgets | Impossible | Possible (requires custom Swift) |
| Live Activities (Dynamic Island) | Impossible | Possible (requires custom Swift) |

The Live Activities and Widget targets aren't built yet — they're
TODOs that require additional Swift code. The Capacitor shell ships
without them and is fully functional for haptics + push.

## Local dev against the iOS app

If you want the iOS app to load `localhost:3000` instead of Vercel for
testing local changes:

```bash
# In one terminal:
npm run dev

# In another terminal:
CAPACITOR_DEV=1 npx cap sync ios
npx cap open ios
# Build + run as normal.
```

The `CAPACITOR_DEV=1` env var flips the server URL in `capacitor.config.ts`
to `http://localhost:3000` with `cleartext: true` so the WebView can hit
your dev server. Make sure your iPhone and Mac are on the same Wi-Fi
network.

## Updating the native shell

When `@capacitor/*` packages get updated or you add a new plugin:

```bash
npm install <new-package>
npx cap sync ios
```

`cap sync` regenerates the iOS project's plugin manifests. If a plugin
adds new Info.plist keys (camera, mic, etc.), Capacitor handles them
automatically in `ios/App/App/Info.plist` — re-open Xcode and rebuild.
