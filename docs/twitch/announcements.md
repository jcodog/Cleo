# Twitch chat announcements

Defaults, supported tags, payload parsing and example values live in `packages/shared/src/twitchEventSub.ts`. `/twitch` uses that same registry for the editor, tag buttons and fake-data live preview. These settings affect Twitch chat only; the Discord live card is separate.

| Announcement         | EventSub and version                 | Extra broadcaster scope      | Supported tags                                               | Cleo default                                                              |
| -------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| New follow           | `channel.follow` v2                  | `moderator:read:followers`   | `{user}`, `{channel}`                                        | Thanks for the follow, {user}! 💜                                         |
| New subscriber       | `channel.subscribe` v1               | `channel:read:subscriptions` | `{user}`, `{channel}`, `{tier}`                              | Thanks for subscribing, {user}! 💜                                        |
| Resubscription       | `channel.subscription.message` v1    | `channel:read:subscriptions` | `{user}`, `{channel}`, `{tier}`, `{months}`                  | {user} just resubscribed for {months} months! 💜                          |
| Gifted subscriptions | `channel.subscription.gift` v1       | `channel:read:subscriptions` | `{user}`, `{channel}`, `{tier}`, `{count}`, `{total}`        | {user} gifted {count} subs! That's {total} gifted in total! 💜            |
| Bits cheered         | `channel.cheer` v1                   | `bits:read`                  | `{user}`, `{channel}`, `{bits}`                              | Thanks {user} for cheering {bits} Bits! 💜                                |
| Incoming raid        | `channel.raid` v1                    | None                         | `{user}`, `{channel}`, `{viewers}`                           | Welcome raiders! {user} raided with {viewers} viewers! 💜                 |
| Hype Train started   | `channel.hype_train.begin` v2        | `channel:read:hype_train`    | `{channel}`, `{level}`, `{total}`                            | 🚂 Hype Train started! Let's go!                                          |
| Hype Train ended     | `channel.hype_train.end` v2          | `channel:read:hype_train`    | `{channel}`, `{level}`, `{total}`                            | 🚂 Hype Train ended at level {level} with {total} contribution points! 💜 |
| Charity donation     | `channel.charity_campaign.donate` v1 | `channel:read:charity`       | `{user}`, `{channel}`, `{amount}`, `{currency}`, `{charity}` | {user} donated {amount} to {charity}! 💜                                  |

The registry also supports `stream.online` v1 and `channel.chat.message` v1. They have no announcement template. Incoming raids use `to_broadcaster_user_id`; follows use the broadcaster as the authorized moderator. Every feature retains Cleo's base `channel:bot` permission. No Host, `channel.bits.use` or Hype Train progress subscription is added.

## Tag meanings and safe fallbacks

- `{user}` is the event user's display name. Anonymous gifts/Bits always use `An anonymous viewer`, even if an unexpected identity is present.
- `{channel}` is the payload's broadcaster display name, or incoming raid destination.
- `{tier}` is Tier 1, Tier 2 or Tier 3.
- `{months}` is cumulative subscription months.
- Gift `{count}` is this event's gift count; gift `{total}` is the cumulative gifted subscription count. When Twitch omits cumulative total, custom templates receive the literal `not available`. The built-in default omits the entire cumulative-total sentence. No numerical value is invented.
- `{bits}` is cheered Bits; `{viewers}` is incoming raid viewers.
- Hype Train `{level}` and `{total}` use the current v2 payload's level and total contribution points. Total is not a subscription count or currency.
- `{amount}` is already currency-formatted from Twitch's integer value divided by 10 to the power of `decimal_places`; `{currency}` is the ISO code and `{charity}` is the charity name.

Gifted recipients are suppressed in `channel.subscribe` where `is_gift` is true, preventing a second announcement. Viewer resub messages are never echoed.

## Editing and sending

Each independent toggle subscribes/unsubscribes immediately. Enabling with an edited template saves that template and enabled state atomically before subscribing. Disabling preserves the saved custom template. Editing or resetting a message marks its row dirty; Save is enabled only for a changed valid template and does not touch EventSub. A missing override means use the central default. Reset to default removes the override on Save; text identical to the default also collapses to no override.

Only simple event-specific `{tag}` tokens are allowed. Unknown tags, tags belonging to another event, malformed braces, expressions, traversal and blank messages are rejected. Source limit: 400 Unicode code points, shown by the editor counter. Final rendered limit: 500. A custom expansion over the final limit falls back to the Cleo default; if even that cannot fit, the handler logs failure and sends nothing. Controls/newlines/unprintable content normalize to one-line plain text. Text is outbound chat only and never executes commands.

One durable receipt/template lookup supplies the current override for each notification. A central send reservation checks current enabled configuration and trusted authority before outbound chat; completion records sent or uncertain. Pending receipts resume after lost responses or startup; a potentially executed send is never replayed. No template cache, restart or config polling is required. A template edit cannot create a new external subscription or replay an old EventSub message ID.

The shared normalizer removes control, bidi and invisible directional characters from templates and interpolated Twitch values. Literal template punctuation remains usable. If the first rendered value starts with `/`, `.`, `!` or `@`, Cleo prefixes it with `Announcement: ` so untrusted data cannot become a leading command or mention. Punctuation elsewhere is preserved. The Twitch API receives plain outbound text; Cleo never feeds it into its command parser.
