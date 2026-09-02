# AAP Attendance — Native Android App

Pure **native Android** app (Java) for field workers. Uses the **same server and database** as the web app.

| App | Package | Folder |
|-----|---------|--------|
| **Native Android** | `in.videh.filedtracker.native` | `android-native/` |
| Web | browser | `src/` |

> The old Capacitor (`mobile/`) app has been **removed**. Use only this native APK.

## Features

- OTP login (same web login page in WebView)
- **Same dashboard UI as web** — full `/dashboard` in WebView
- Inline map, face capture, footprints, leave
- Background GPS foreground service (`FieldLocationService`)
- 30-min interval snapshots + route tracking
- VPN / fake GPS / spoof-app detection + admin logs

## Build APK

```powershell
cd android-native
.\gradlew assembleDebug
```

APK: `android-native/app/build/outputs/apk/debug/app-debug.apk`

Also copied to `public/aap-attendance-native.apk` for download from the server.

## Server requirements

Deploy latest server code so native Bearer auth works and OTP verify returns `token` in JSON.

```
NEXT_PUBLIC_APP_URL=https://filed.videh.co.in
```

## User setup

1. Install **AAP Attendance** (native) APK
2. Login with OTP
3. Allow **Location → All the time** + **Camera** + **Notifications**
4. Punch in — background GPS starts automatically

## Architecture

```
android-native/
  app/src/main/java/in/videh/filedtracker/
    nativeapp/     Login, WebShell, NativeAppBridge, API client
    bglocation/    FieldLocationService
```

API base URL: `AppConfig.API_BASE` (default: `https://filed.videh.co.in`).
