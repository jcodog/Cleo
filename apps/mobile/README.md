# Cleo mobile

Read-only native server directory for iOS and Android. Expo SDK 58 uses React Native 0.88 and React 19.3. The workspace pins its own compatible TypeScript compiler. Web and bot dependency versions stay independent.

iOS uses Expo's native Liquid Glass material for the toolbar and sign-in action, plus SF Symbols for account controls. Runtime and compiler availability checks guard the effect. Reduce Transparency uses opaque controls and updates when the preference changes. Android and older iOS versions use the solid fallback. The server directory remains a plain native list.

## Local development

From the repository root:

```sh
bun install --frozen-lockfile
```

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Set the publishable Clerk key and Convex URL for the same development environment. Never put Clerk secrets, Discord or Twitch tokens, or Convex deployment keys in `EXPO_PUBLIC_*` variables.

```sh
bun run --filter @workspace/mobile dev
```

On Windows, the Metro config excludes foreign Sharp binaries from Bun's store before the watcher reaches their unreadable libvips junctions. It keeps Expo's workspace resolution and default exclusions, including Windows-compatible dependencies. macOS and Linux keep their original visibility.

Clerk must have its Native API enabled and Discord sign-in configured. Register the mobile identifiers and `cleo://sso-callback` callback as required by your Clerk instance. Keep Discord as the primary identity. Use the existing Convex Clerk integration and issuer; no second auth backend is required. Deploy the directory query to a development backend through the usual operator workflow before testing it. This PR does not deploy backend changes.

Clerk owns the session and uses its official Expo token cache with Expo SecureStore. The app waits for both Clerk restoration and Convex authentication before querying the directory. Sign-out removes the authenticated view immediately. Provider tokens remain on the backend.

The directory contains last-known server metadata, with a separate verification state. Expired evidence does not grant access to protected backend functions. Pull-to-refresh synchronizes linked accounts and resumes the existing bounded Discord discovery workflow. This app exposes no billing, moderation, role assignment, or server configuration controls.

## Codemagic and Sideloadly on Windows

The operator builds the IPA remotely with Codemagic and signs it on Windows with Sideloadly and a free Apple ID. This workflow does not require an EAS project, paid Apple membership or App Store Connect. Remote compilation and device verification are handled by the operator.

The existing Codemagic workflow must install the pinned Bun dependencies from the repository root, then run Expo prebuild and CocoaPods in `apps/mobile`. Build the generated `Cleo` workspace and scheme with Xcode's **Debug** configuration, `-sdk iphoneos`, `-destination 'generic/platform=iOS'` and code signing disabled. Preserve `expo-dev-client` in that build. Package the resulting device `.app` inside `Payload/` at the root of the IPA. A simulator `.app` cannot be installed on an iPhone.

Configure `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CONVEX_URL` for the same development environment in Codemagic and in the local `.env.local`. These values are public app configuration. Never supply Apple credentials or backend secrets as Expo public variables.

1. Download the device IPA from the existing Codemagic workflow.
2. Load it in Sideloadly on Windows, connect the iPhone and sign/install with your Apple ID. Keep the same bundle identifier and Apple ID for subsequent installs. The configured bundle identifier is `uk.co.jconet.cleo`.
3. Trust the developer profile and enable Developer Mode on the iPhone when requested.
4. Run `bun run --filter @workspace/mobile dev` on Windows. Open the Metro QR link in the installed Cleo development client. Both devices must reach Metro over the local network. Allow its port through the Windows firewall where needed.
5. Fast Refresh applies JavaScript and TypeScript edits without another IPA build. Rebuild in Codemagic when changing native dependencies, config plugins, native capabilities or the Expo SDK.
6. Verify Discord sign-in, cancellation, cold-start session restoration, Convex authentication, multiple guilds, provider failure, pull-to-refresh, expiry and sign-out on the device.

Free Apple ID installs expire after seven days and permit up to three active sideloaded apps. Re-sign using Sideloadly before expiry. Reinstallation may affect local sessions, so test session restoration after updates. This MVP requests no push notifications, associated domains, iCloud or other advanced Apple capabilities. Liquid Glass still depends on the device's iOS version and the Xcode SDK used by Codemagic.

`eas.json` remains an optional configuration for operators who already have EAS signing access. Its standard iOS development profile uses internal signed distribution and is not the free-account installation path described above. Its simulator profile produces a simulator build. Neither profile is evidence of a completed device build.

## Validation

```sh
bun run --filter @workspace/mobile check:expo
bun run --filter @workspace/mobile typecheck
bun run --filter @workspace/mobile lint
bun run --filter @workspace/mobile test
bun run --filter @workspace/mobile test:coverage
bun run --filter @workspace/mobile build
```

`build` exports native JavaScript/Hermes bundles. It does not produce a signed IPA or APK. Tests verify session gates, sign-in activation, sign-out and directory states with mocked native/provider boundaries. They do not replace physical device testing.

## Device verification status

Local validation covers JavaScript bundles, compatible dependencies and tests at the native/provider boundaries. No Codemagic build was submitted or inspected here, and no physical iPhone test was performed. The operator owns the existing remote build and Sideloadly installation workflow.

## References

- [Expo SDK 58 release](https://expo.dev/changelog/sdk-58)
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/)
- [Expo Router installation](https://docs.expo.dev/router/installation/)
- [Expo GlassEffect](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/)
- [Expo Symbols](https://docs.expo.dev/versions/v58.0.0/sdk/symbols/)
- [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart)
- [Clerk SSO hook](https://clerk.com/docs/reference/expo/native-hooks/use-sso)
- [Convex with Clerk](https://docs.convex.dev/auth/clerk)
- [Codemagic unsigned native builds](https://docs.codemagic.io/yaml-quick-start/first-signed-build/)
- [Sideloadly installation and free-account limits](https://sideloadly.io/faq)
