# Welcome cards

The free welcome enable switch, destination, subtext, mention policy and text-only delivery fallback remain available. Unicode and custom emoji rendering fixes apply to free cards.

The dashboard offers Cleo Classic plus Aurora, Spotlight and Ribbon previews. Four bounded palettes, left or centre alignment, and greeting templates using `{member}` and `{server}` share the bot's drawing and fitting code. The example member name is editable. Canvas pixels can differ slightly between browser and Skia text rasterisation.

Premium styling is preview-only. Save Welcome persists only existing free settings. The Convex mutation validates any submitted style and rejects every paid alteration with `PREMIUM_WELCOME_UNAVAILABLE`, after the existing guild-management checks. The production delivery entrypoint always renders the free style. No client flag, subscription claim, billing integration or entitlement grant activates it.

Before enabling production Premium use, JCN-57 must supply verified guild entitlements to the save mutation and bot runtime projection. Persist styles without erasing them on downgrade, render Classic while access is inactive, and verify cross-guild isolation, trial/grace/expiry, refund/revocation and cache invalidation. These lifecycle scenarios remain outstanding because this PR deliberately does not implement billing or the entitlement resolver.

## Rendering and assets

The previous renderer used host `sans-serif`, which depended on Linux font availability. Emoji now use local Twemoji 17.0.3 SVG images independently of host colour-font support. Grapheme segmentation preserves tones, flags, ZWJ sequences, presentation selectors, keycaps and combining marks. Fitting measures shaped text runs, reduces the font size, then ellipsizes whole graphemes instead of overflowing at minimum size. Missing avatars use a whole grapheme as their initial.

The build packages pinned Geist Latin, Latin Extended and Cyrillic fonts from `@fontsource/geist` and checksummed Twemoji artwork. Other writing systems still use available text-font fallback. No VPS font installation is required for the emoji fix. Licenses and attribution accompany dashboard and bot assets.

`scripts/assets/twemoji-17.0.3.json.gz` is an unmodified SVG filename-to-content map, serialized as UTF-8 JSON and gzip-compressed, from upstream revision `b6b55fef1e8636b540a6d016a4729ca8cdf2e60b`. The preparation script verifies its SHA-256 before extraction. Updating artwork requires replacing this archive from a reviewed upstream release, updating the checksum and attribution, and rerunning pixel and packaging verification. VS-16 lookup aliases use identical artwork.

Only intentional greeting literals and configured subtext accept `<:name:id>` or `<a:name:id>` tags. Member and guild names never authorize custom emoji fetches. Requests use constructed Discord CDN PNG URLs from validated snowflakes, refuse redirects, and have a two-second deadline, 256 KiB body limit, 256-pixel dimension limit and at most eight concurrent custom-image requests. PNG is also the still-frame policy for animated emoji. Unavailable images render their `:name:` label. Positive cache entries expire after ten minutes, failures after one minute; the custom cache holds at most 128 entries and the Unicode cache at most 256.

## Verification

Run the normal Bun workspace tests. Discord test and coverage scripts prepare local assets first; the production build prepares `dist/welcome-assets`. Turbo caches include the generated release and dashboard public assets, and artwork changes are classified as Discord build inputs.

After building the Discord bot:

```sh
DISABLE_SYSTEM_FONTS_LOAD=1 node apps/discord-bot/dist/verifyWelcomeRendering.js \
  welcome-render-verification apps/discord-bot/dist/welcome-assets
```

The verifier compares actual title pixels with local artwork for twelve Unicode fixtures, emits all four preset PNGs, verifies every packaged asset hash and records platform/runtime evidence. Regression CI runs it against the extracted Linux production archive and uploads the PNGs and evidence. Local verification used Ubuntu 24.04, Node 24.15.0 and Bun 1.3.14, with system fonts disabled.

JCN-233's Twitch transformations and real Discord/VPS rollout verification remain separate work. This PR does not deploy or send live welcome messages.
