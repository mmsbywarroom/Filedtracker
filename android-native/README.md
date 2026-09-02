# AAP Attendance — Native Android App

Pure **native Android** app (Java) for field workers. Uses the **same server and database** as the web app and Capacitor app.

| App | Package | Folder |
|-----|---------|--------|
| Capacitor (WebView) | `in.videh.filedtracker` | `mobile/` |
| **Native Android** | `in.videh.filedtracker.native` | `android-native/` |

Both apps can be installed on the same phone — different package names.

## Features

- OTP login (same APIs as web)
- Native dashboard UI
- Face register / punch via camera (loads `/native-face` WebView bridge — same face-api models as web)
- Background GPS foreground service (reused Java from `field-background-location` plugin)
- 30-min interval snapshots + 2-min heartbeat to server

## Build APK

```powershell
cd android-native
.\gradlew assembleDebug
```

APK: `android-native/app/build/outputs/apk/debug/app-debug.apk`

Also copied to `public/aap-attendance-native.apk` for download from the server.

> **Note:** The Capacitor app builds to `mobile/android/app/build/outputs/apk/debug/`.  
> The **native** app is in `android-native/` — not the `mobile/` folder.

## Server requirements

Deploy latest server code so native Bearer auth works on all user APIs and OTP verify returns `token` in JSON.

Set in `.env`:

```
NEXT_PUBLIC_APP_URL=https://filed.videh.co.in
```

## User setup

1. Install **AAP Attendance** (native) APK
2. Login with OTP
3. Register face (first time)
4. Allow **Location → All the time** + **Notifications**
5. Punch in — background GPS starts automatically

## Architecture

```
android-native/
  app/src/main/java/in/videh/filedtracker/
    nativeapp/     Login, Dashboard, Face WebView, API client
    bglocation/    FieldLocationService (copied from Capacitor plugin)
```

API base URL: `AppConfig.API_BASE` in `AppConfig.java` (default: `https://filed.videh.co.in`).

## Capacitor app unchanged

The Capacitor app in `mobile/` continues to work as before. Update both APKs when releasing new versions.
