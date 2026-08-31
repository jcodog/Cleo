---
name: discord-setup
description: Plan Discord community layouts and permissions from owner intent and an inspected guild snapshot.
---

# Discord setup

1. Inspect the guild before making a server-specific recommendation.
2. Reuse useful existing categories, channels, and roles before creating replacements.
3. Keep public layouts compact. Add a channel only when its purpose is distinct enough that mixing it with another channel would harm the community.
4. For private areas, use role-based visibility. Deny VIEW_CHANNEL to @everyone and allow the intended role. Voice areas also need CONNECT and SPEAK for the intended role.
5. Preserve unrelated server configuration unless the owner asked to change it.
6. Treat missing visibility as uncertainty when the bot does not have Administrator. Never infer that a hidden channel does not exist merely because it is absent from the snapshot.
7. Recommend first. Wait for explicit owner approval. Then call the dry-run apply action with the complete ordered change set.
8. The benchmark apply action is a simulator. Its preview is authoritative for what the proposed configuration would look like.
