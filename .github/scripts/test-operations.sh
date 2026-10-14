#!/usr/bin/env bash
# Check script syntax and disposable host fixtures. Never call installed
# production controllers or use production service accounts.
set -euo pipefail

for script in .github/scripts/*.sh; do
  bash -n "$script"
done
bash -n ops/discord/bootstrap-host.sh
bash -n ops/discord/bin/check-discord-runner
bash -n ops/discord/bin/check-discord-env
bash -n ops/discord/bin/check-discord-runtime
bash -n ops/discord/bin/deploy-discord-release
bash -n ops/discord/bin/deploy-discord-release.test.sh
bash -n ops/discord/bin/deploy-discord-release.validation.test.sh
bash -n ops/discord/bin/migrate-discord-deployment-state
bash -n ops/discord/bin/migrate-discord-deployment-state.test.sh
bash -n ops/discord/bin/read-discord-deployment-state
bash -n ops/discord/bin/read-discord-deployment-state.test.sh
bash -n ops/discord/bin/check-discord-env.test.sh
bash -n ops/discord/bin/run-discord-release
bash -n ops/discord/bin/run-discord-release.test.sh
bash ops/discord/bin/check-discord-env.test.sh
bash ops/discord/bin/run-discord-release.test.sh
bash ops/discord/bin/read-discord-deployment-state.test.sh
bash ops/discord/bin/migrate-discord-deployment-state.test.sh
bash ops/discord/bin/deploy-discord-release.test.sh
bash ops/discord/bin/deploy-discord-release.validation.test.sh
bash ops/twitch/test.sh
