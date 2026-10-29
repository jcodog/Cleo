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

The root [`codemagic.yaml`](../../codemagic.yaml) defines the manual `ios-development-unsigned` workflow. It builds on Codemagic's Mac mini M2 with Xcode 27.1, Node 24.15.0 and the exact Bun version in the root `packageManager` field. It requires no EAS signing, paid Apple membership or App Store Connect.

In the existing Codemagic application, use the repository root as the configuration location. Create an environment group named `cleo_mobile_development` with these two values:

| Variable                            | Value                                                       |
| ----------------------------------- | ----------------------------------------------------------- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | The development instance's `pk_test_...` publishable key    |
| `EXPO_PUBLIC_CONVEX_URL`            | The HTTPS URL of the matching development Convex deployment |

Use the same values in `apps/mobile/.env.local` for Metro on Windows. They are public app configuration and are embedded in JavaScript. Never add Clerk secrets, provider tokens, Apple credentials or deployment keys. The native build script rejects a production Clerk key. Enable Clerk Native API and register `uk.co.jconet.cleo` and the `cleo://sso-callback` return URL as required by that instance. The new backend directory query must be available in the development deployment.

Select **Start new build**, the branch and commit being verified, and workflow **Cleo iPhone development IPA for Sideloadly**. For PR #272, use its existing `fix/dashboard-navigation-premium-guild` branch and confirm the run's commit matches the PR HEAD. No automatic build trigger or store publishing is configured. No Apple signing integration, team ID, certificate or provisioning profile is needed.

The workflow installs locked dependencies from the monorepo root and checks Expo compatibility. It then runs [`scripts/build-mobile-ios-unsigned.sh`](../../scripts/build-mobile-ios-unsigned.sh) through the mobile package script. That script:

1. Runs Expo iOS prebuild without reinstalling JavaScript dependencies, then `pod install --repo-update` in `apps/mobile/ios`.
2. Checks that CocoaPods included `expo-dev-launcher`, then builds the `Cleo` workspace and scheme in **Debug**, with `-sdk iphoneos`, `-destination 'generic/platform=iOS'`, arm64 and code signing disabled.
3. Rejects simulator platforms, non-arm64 executables, provisioning profiles or a signed app. It checks the Mach-O platform as well as the app plist, since arm64 alone does not distinguish device and simulator builds.
4. Packages `Payload/Cleo.app` into `apps/mobile/build/ios/artifacts/Cleo-development-unsigned.ipa`, tests the ZIP, and writes a SHA-256 checksum. Codemagic collects the IPA, checksum and toolchain/CocoaPods/Xcode logs as downloadable artifacts, including logs on failed builds.

Debug preserves Expo Dev Client and its Metro connection screen. JavaScript can be loaded from the Windows development server; an embedded offline JavaScript bundle is not required. The remote Mac's Metro address is not baked into the IPA. Native modules and app capabilities still require a new remote build.

### Install on Windows

1. After a successful Codemagic run, download `Cleo-development-unsigned.ipa` from that run's artifacts. If the run fails, inspect its logs; an IPA from a previous run does not validate the current commit.
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

Local validation covers the official Codemagic JSON schema, Bash syntax and workflow contracts, Expo compatibility, JavaScript bundles and native/provider tests. This does not compile Xcode code. No Codemagic build has been submitted or inspected here, and no physical iPhone test has been performed. The operator must run the workflow, install its device IPA through Sideloadly and exercise the sign-in and session-restoration checklist above.

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
- [Codemagic Xcode 27.1 image](https://docs.codemagic.io/specs-macos/xcode-27-1/)
- [Codemagic YAML validation](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/#validating-codemagicyaml-locally)
- [Sideloadly installation and free-account limits](https://sideloadly.io/faq)
