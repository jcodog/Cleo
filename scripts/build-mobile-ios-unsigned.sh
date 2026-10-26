#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/apps/mobile"

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'The iPhone device build requires the remote macOS/Xcode runner.' >&2
  exit 1
fi
: "${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:?Set the public development Clerk key in Codemagic}"
: "${EXPO_PUBLIC_CONVEX_URL:?Set the public development Convex URL in Codemagic}"
if [[ "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" != pk_test_* ]]; then
  echo 'This development build requires a Clerk test-instance publishable key.' >&2
  exit 1
fi
node -e 'if (new URL(process.env.EXPO_PUBLIC_CONVEX_URL).protocol !== "https:") throw new Error("Convex requires an HTTPS URL")'
test "$(bun --version)" = "$(node -p "require('../../package.json').packageManager.replace(/^bun@/, '')")"

export NODE_ENV=development
export RCT_NO_LAUNCH_PACKAGER=1
export SKIP_BUNDLING_METRO_IP=1
build_dir="$PWD/build/ios"
artifacts="$build_dir/artifacts"
mkdir -p "$artifacts"

xcodebuild -version | tee "$artifacts/toolchain.log"
sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
if (( ${sdk_version%%.*} < 27 )); then
  echo 'Expo SDK 58 requires an Xcode image with the iOS 27 SDK.' >&2
  exit 1
fi
printf 'iPhoneOS SDK: %s\n' "$sdk_version" >> "$artifacts/toolchain.log"
bun run prebuild:ios
(
  cd ios
  pod install --repo-update
) 2>&1 | tee "$artifacts/cocoapods.log"
grep -q 'expo-dev-launcher' ios/Podfile.lock

xcodebuild \
  -workspace ios/Cleo.xcworkspace \
  -scheme Cleo \
  -configuration Debug \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$build_dir/DerivedData" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  DEVELOPMENT_TEAM='' PROVISIONING_PROFILE_SPECIFIER='' \
  build 2>&1 | tee "$artifacts/xcodebuild.log"

app="$build_dir/DerivedData/Build/Products/Debug-iphoneos/Cleo.app"
plist="$app/Info.plist"
test "$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$plist")" = iphoneos
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$plist")" = iPhoneOS
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")"
lipo -verify_arch arm64 "$app/$executable"
xcrun vtool -show-build "$app/$executable" | grep -Eq 'platform[[:space:]]+IOS$'
test ! -e "$app/embedded.mobileprovision"
if codesign --display "$app" >/dev/null 2>&1; then
  echo 'Expected an unsigned application, but Xcode produced a code signature.' >&2
  exit 1
fi

staging="$(mktemp -d "$build_dir/ipa-stage.XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
mkdir "$staging/Payload"
ditto "$app" "$staging/Payload/Cleo.app"
ipa="$artifacts/Cleo-development-unsigned.ipa"
ditto -c -k --keepParent "$staging/Payload" "$ipa"
unzip -tq "$ipa"
(
  cd "$artifacts"
  shasum -a 256 Cleo-development-unsigned.ipa > Cleo-development-unsigned.ipa.sha256
)
echo "Unsigned device IPA ready for Sideloadly: $ipa"
