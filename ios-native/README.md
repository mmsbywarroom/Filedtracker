# AAP Attendance — Native iOS App

SwiftUI app that matches the **Android Compose** screens (login, home, face punch, map, leave, footprints). Same APIs as `https://filed.videh.co.in`.

| App | Bundle ID | Folder |
|-----|-----------|--------|
| **Native iOS** | `in.videh.filedtracker.aap` | `ios-native/` |
| Native Android | `in.videh.filedtracker.native` | `android-native/` |
| Web | browser | `src/` |

iPhone pe Android jaisa APK link **nahi** chalta. Install **TestFlight** se hota hai (Mac + Apple Developer account, or Codemagic).

## Features

- Native login (OTP) + home dashboard — navy / yellow / blue like Android
- EN / PA language toggle
- Face punch: front camera + Vision green frame → auto JPEG → `POST /api/face/describe` → punch/register
- MapKit route (same chrome as Android; Google Maps iOS key not required)
- Leave + footprints via the same REST APIs
- Background location while punched in
- **30-min** lat/lng FLAG snapshots (8 same → flagged)
- VPN / simulated GPS logged on punch + admin security log

## Build (Mac + Xcode required)

Windows pe iOS IPA build **nahi** ho sakti.

1. Mac pe Xcode 15+ install karo
2. `ios-native/AAPAttendance.xcodeproj` kholo
3. Signing & Capabilities → **Team** `33AW34RHHQ` (or apna App Store Connect team)
4. Bundle ID `in.videh.filedtracker.aap`
5. iPhone USB se Run, ya **Product → Archive**
6. Organizer → Distribute App → **TestFlight**, ya Codemagic `ios-testflight` workflow

## Permissions in Xcode

- Signing: Automatically manage signing
- Background Modes → Location updates (already in Info.plist)
- Camera + Always location usage strings are in `Info.plist`

## Server

Same production URL: `https://filed.videh.co.in` (`AppConfig.apiBase`).
