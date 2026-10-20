import { RELEASE_PLATFORMS as released } from "../../src/features/app-shell/routes"

// Browser-only fixture varies the authoritative release export, not component props.
const only = new URLSearchParams(location.search).get("release")
export const RELEASE_PLATFORMS = released.filter(
  (platform) => !only || platform === only
)
