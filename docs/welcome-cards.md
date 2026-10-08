# Welcome cards

The free welcome enable switch, destination, subtext, mention policy and text-only delivery fallback remain available. Unicode and custom emoji rendering fixes apply to free cards.

The studio is a component of the existing guild dashboard, visible only when its server response permits access for a verified Premium guild. The capability currently returns false for every guild until JCN-57 implements the entitlement resolver. Non-Premium guilds retain the free welcome controls and never see the studio. Browser tests simulate a future authorised response in an isolated fixture outside production routes.

The studio offers a visual gallery of Cleo Classic, Aurora, Spotlight and Ribbon, with distinct compositions, palette swatches, alignment and greeting templates using `{member}` and `{server}`. Its responsive live preview shares the bot's drawing and fitting code and has an editable member name. Canvas pixels can differ slightly between browser and Skia text rasterisation.

Premium styling remains preview-only when the studio is accessible. The dedicated Save free settings action persists only existing free settings and explicitly says preview styling has not been saved. The Convex mutation validates any submitted style, returns `INVALID_WELCOME_STYLE` for malformed input, and rejects every paid alteration with `PREMIUM_WELCOME_UNAVAILABLE`, after the existing guild-management checks. The production delivery entrypoint always renders the free style. No client flag, subscription claim, billing integration or entitlement grant activates it.

Before enabling production Premium use, JCN-57 must supply verified guild entitlements to the save mutation and bot runtime projection. Persist styles without erasing them on downgrade, render Classic while access is inactive, and verify cross-guild isolation, trial/grace/expiry, refund/revocation and cache invalidation. These lifecycle scenarios remain outstanding because this PR deliberately does not implement billing or the entitlement resolver.

## Rendering and assets

The previous renderer used host `sans-serif`, which depended on Linux font availability. Emoji now use local Twemoji 17.0.3 SVG images independently of host colour-font support. Grapheme segmentation preserves tones, flags, ZWJ sequences, presentation selectors, keycaps and combining marks. Fitting measures shaped text runs, reduces the font size, then ellipsizes whole graphemes instead of overflowing at minimum size. Missing avatars use the first textual letter or number; names containing only emoji use C.

The build packages pinned Geist Latin, Latin Extended, Cyrillic and Cyrillic Extended fonts from `@fontsource/geist` and checksummed Twemoji artwork. Both browser and bot register all four subsets. Geist does not cover every Unicode text character: its extended Cyrillic cmap includes `ҒҗҚӢ`, but not `ҔӁ`. Unsupported writing systems and glyphs still need available text-font fallback. No VPS font installation is required for the emoji fix. Licenses and attribution accompany dashboard and bot assets.

`scripts/assets/twemoji-17.0.3.json.gz` is an unmodified SVG filename-to-content map, serialized as UTF-8 JSON and gzip-compressed, from upstream revision `b6b55fef1e8636b540a6d016a4729ca8cdf2e60b`. The preparation script verifies its SHA-256 before extraction. Updating artwork requires replacing this archive from a reviewed upstream release, updating the checksum and attribution, and rerunning pixel and packaging verification. VS-16 lookup aliases use identical artwork.

Only intentional greeting literals and configured subtext accept `<:name:id>` or `<a:name:id>` tags. Member and guild names never authorize custom emoji fetches. Bot requests use constructed Discord CDN PNG URLs from validated snowflakes, refuse redirects, and have a two-second deadline, 256 KiB body limit, 256-pixel dimension limit and at most eight concurrent custom-image requests. The browser bounds custom image dimensions and loading time; trusted packaged SVGs do not inherit the custom-image dimension limit. PNG is also the still-frame policy for animated emoji. Unavailable custom images render their naturally measured `:name:` label before fitting. Positive custom cache entries expire after ten minutes, failures after one minute; the custom cache holds at most 128 entries and the Unicode cache at most 256. Failed Unicode loads are evicted for retry without deleting newer entries.

## Verification

Run the normal Bun workspace tests. Dashboard and bot dev/start scripts prepare assets on fresh checkouts; Discord test and coverage scripts also prepare local assets. The production build prepares `dist/welcome-assets`. Asset preparation validates all inputs before staging and replacing the destination, preserving existing output if inputs are missing. Turbo caches include the generated release and dashboard public assets, and artwork changes are classified as Discord build inputs.

After building the Discord bot:

```sh
DISABLE_SYSTEM_FONTS_LOAD=1 node apps/discord-bot/dist/verifyWelcomeRendering.js \
  welcome-render-verification apps/discord-bot/dist/welcome-assets
```

The verifier compares actual title pixels with local artwork for twelve Unicode fixtures and checks twenty reviewed Linux pixel baselines: every preset/palette combination and four long-name/missing-custom-emoji fitting cases. These cover typography, colours, composition, subtext emoji and extended Cyrillic. It verifies every packaged asset hash and records platform/runtime evidence. With `DISABLE_SYSTEM_FONTS_LOAD=1`, it asserts that the canvas registry has no font families before registering the pinned subsets. Regression CI runs it against the extracted Linux production archive and uploads PNGs and evidence. Baseline changes require visual inspection; `--record-baseline` writes candidate hashes only to the output directory.

After building the dashboard, run `bun run --filter @workspace/dashboard test:welcome:browser`. Chromium and Firefox exercise the real component, including keyboard preset selection, member edits, validation, unavailable resources, cleanup, free-only saving and non-Premium visibility. Desktop and mobile screenshots are saved under `apps/dashboard/test-results/welcome`. The test transport does not contact Clerk, Convex or live guilds, and exposes no JSON in the rendered UI.

JCN-233's Twitch transformations and real Discord/VPS rollout verification remain separate work. This PR does not deploy or send live welcome messages.
