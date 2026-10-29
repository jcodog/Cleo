import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const root = new URL("../../", import.meta.url)
const workflow = Bun.YAML.parse(
  readFileSync(new URL("codemagic.yaml", root), "utf8")
)
const build = workflow.workflows["ios-development-unsigned"]
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"))
assert.equal(build.instance_type, "mac_mini_m2")
assert.equal(build.environment.node, manifest.engines.node)
assert.equal(build.environment.xcode, "27.1")
assert.deepEqual(build.environment.groups, ["cleo_mobile_development"])
assert.equal(
  build.triggering,
  undefined,
  "Native builds are started explicitly by the operator"
)
assert.equal(
  build.publishing,
  undefined,
  "The development IPA is never published to a store"
)
assert.equal(build.environment.ios_signing, undefined)
const commands = build.scripts.map((step) => step.script).join("\n")
assert.match(commands, /bun install --frozen-lockfile/)
assert.match(commands, /packageManager/)
assert.match(commands, /@workspace\/mobile build:ios:unsigned/)
assert.ok(build.artifacts.some((path) => path.endsWith("/*.ipa")))
const script = readFileSync(
  new URL("scripts/build-mobile-ios-unsigned.sh", root),
  "utf8"
)
assert.match(script, /-configuration Debug/)
assert.match(script, /-sdk iphoneos/)
assert.match(script, /-destination 'generic\/platform=iOS'/)
assert.match(script, /CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO/)
assert.match(script, /DTPlatformName/)
assert.match(script, /CFBundleSupportedPlatforms/)
assert.match(script, /expo-dev-launcher/)
assert.match(script, /lipo -verify_arch arm64/)
assert.match(script, /Payload\/Cleo.app/)
assert.match(script, /unzip -tq/)
assert.doesNotMatch(
  commands + script,
  /(?:npm ci|npx |eas build|build-ipa|allowProvisioningUpdates|app_store_connect)/
)
for (const source of [...build.scripts.map((step) => step.script), script]) {
  const result = spawnSync("bash", ["-n"], { input: source, encoding: "utf8" })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
}
console.log(
  "Codemagic device target, unsigned packaging, dev-client and Bash contracts passed."
)
