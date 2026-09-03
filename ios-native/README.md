# AAP Attendance — Native iOS App

Same **web dashboard UI** as `https://filed.videh.co.in` inside a WKWebView shell (same approach as `android-native/`).

| App | Bundle ID | Folder |
|-----|-----------|--------|
| **Native iOS** | `in.videh.filedtracker.aap` | `ios-native/` |
| Native Android | `in.videh.filedtracker.native` | `android-native/` |
| Web | browser | `src/` |

iPhone pe Android jaisa APK link **nahi** chalta. Install **TestFlight** se hota hai (Mac + Apple Developer account).

## Features

- Same login + dashboard UI as web
- Face punch (camera), map, leave, footprints
- Background location while punched in
- Hourly VPN security log; **30-min** lat/lng FLAG snapshots (8 same → flagged)
- VPN / simulated GPS block on punch + admin security log

## Build (Mac + Xcode required)

Windows pe iOS IPA build **nahi** ho sakti.

1. Mac pe Xcode 15+ install karo
2. `ios-native/AAPAttendance.xcodeproj` kholo
3. Signing & Capabilities → apna **Team** (App Store Connect wala Apple ID) select karo
4. Bundle ID `in.videh.filedtracker.aap` App Store Connect mein **naya iOS app** banao (Balbirs Map alag app hai — usko reuse mat karo)
5. iPhone USB se connect karke Run, ya **Product → Archive**
6. Organizer → Distribute App → **TestFlight**
7. Users and Access / TestFlight → External testers → **Public link** ya email invite

Users iPhone pe TestFlight app install karke us link se AAP Attendance lagayenge.

## Permissions in Xcode

Enable:

- Signing: Automatically manage signing
- Background Modes → Location updates (already in Info.plist)

## Server

Same production URL: `https://filed.videh.co.in` (`AppConfig.apiBase`).
