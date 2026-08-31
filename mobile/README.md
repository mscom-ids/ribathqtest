# Native mentor applications

These are true platform applications. Android uses Kotlin, Jetpack Compose,
Android Keystore, and SQLite. iOS uses Swift, SwiftUI, Keychain, and SQLite.
Neither app uses a WebView, PWA runtime, Capacitor, React Native, or Flutter.

## Implemented first slice

- Mobile login and installation registration.
- Memory-only access tokens.
- Rotating refresh tokens protected by Android Keystore or iOS Keychain.
- A setup/restoration screen for first login and replacement phones.
- Atomic bootstrap persistence: profile, academic year, roster, and cursor become
  visible together or not at all.
- Offline launch from the last committed SQLite snapshot.
- Cursor-based delta downloads and transactional cursor advancement.
- Native Hifz entry forms with recent-entry history on each student.
- Durable Hifz offline drafts with idempotent retry when connectivity returns.
- Explicit sign-out with server-side refresh-session revocation.
- HTTPS-only release networking. Local HTTP is enabled only for Android debug
  builds and iOS local networking.

Only Hifz entry creation is enrolled for offline writes. Other business
mutations remain online-only until each operation has explicit idempotency,
authorization, conflict, and audit behavior on the server.

## Android

Open `mobile/android` in Android Studio. The checked-in Gradle wrapper builds
with the installed JDK 17 runtime and Android SDK 34.

The emulator defaults to the local staging backend:

```text
http://10.0.2.2:5001/api/mobile
```

Override it for another staging deployment without editing source:

```bash
./gradlew -PRIBATH_API_BASE_URL=https://staging-api.example.com/api/mobile assembleDebug
```

The debug APK is written to `mobile/android/app/build/outputs/apk/debug/`.

## iOS

Open `mobile/ios/RibathMentor.xcodeproj` on macOS with Xcode 16 or newer. The
simulator defaults to `http://127.0.0.1:5001/api/mobile`. Replace the value in
`AppConfiguration.swift` with the HTTPS staging API URL before device testing.

The iOS project cannot be compiled or signed on Windows. It has no third-party
runtime dependencies; Xcode only links Apple frameworks and system SQLite.

## Staging identity

Run `npm run seed:staging:mobile` from the repository root. The command refuses
to run unless both Supabase and PostgreSQL URLs contain the dedicated staging
project reference. Credentials stay in ignored
`backend/.env.staging.local` variables; no real user data is required.
