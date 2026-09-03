# AAP Attendance — Native Android App

Pure **native Android** app (Java helpers + **Jetpack Compose** UI) for field workers. Uses the **same server and database** as the web app.

| App | Package | Folder |
|-----|---------|--------|
| **Native Android** | `in.videh.filedtracker.native` | `android-native/` |
| Web | browser | `src/` |

> The old Capacitor (`mobile/`) app has been **removed**. Use only this native APK.

## Features

- **Compose UI, no WebView** for login, home, live map, leave and footprints
- OTP login, punch in / out, profile + status header
- Google Map route (maps-compose), leave requests, session footprints
- CameraX + ML Kit face check screen
- Background GPS foreground service (`FieldLocationService`)
- 30-min interval snapshots + route tracking
- VPN / fake GPS / spoof-app detection + admin logs

## Build APK

```powershell
cd android-native
.\gradlew assembleDebug
```

APK: `android-native/app/build/outputs/apk/debug/app-debug.apk`

### Google Maps key

The live map needs a Maps SDK for Android key. Add it to `android-native/local.properties`
(or export `MAPS_API_KEY`) and rebuild:

```
MAPS_API_KEY=AIza...
```

Without a key everything else still works; the map screen shows a "map key not configured" message.

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
    nativeapp/          ApiClient, SessionStore, SecurityHelper, LocationHelper, AppConfig
    nativeapp/compose/  ComposeMainActivity (NavHost) + Login/Home/Map/Leave/Footprints/Face screens
    bglocation/         FieldLocationService
```

`MainActivity` is the launcher entry point and immediately hands off to `ComposeMainActivity`.
`FaceCaptureActivity` is still used for the face descriptor the server matches against; the legacy
XML `LoginActivity` / `DashboardActivity` and `WebShellActivity` are no longer on the launcher path.

API base URL: `AppConfig.API_BASE` (default: `https://filed.videh.co.in`).
