const PERMISSIONS: Array<[bigint, string]> = [
  [1n << 0n, 'CREATE_INSTANT_INVITE'],
  [1n << 1n, 'KICK_MEMBERS'],
  [1n << 2n, 'BAN_MEMBERS'],
  [1n << 3n, 'ADMINISTRATOR'],
  [1n << 4n, 'MANAGE_CHANNELS'],
  [1n << 5n, 'MANAGE_GUILD'],
  [1n << 6n, 'ADD_REACTIONS'],
  [1n << 7n, 'VIEW_AUDIT_LOG'],
  [1n << 8n, 'PRIORITY_SPEAKER'],
  [1n << 9n, 'STREAM'],
  [1n << 10n, 'VIEW_CHANNEL'],
  [1n << 11n, 'SEND_MESSAGES'],
  [1n << 12n, 'SEND_TTS_MESSAGES'],
  [1n << 13n, 'MANAGE_MESSAGES'],
  [1n << 14n, 'EMBED_LINKS'],
  [1n << 15n, 'ATTACH_FILES'],
  [1n << 16n, 'READ_MESSAGE_HISTORY'],
  [1n << 17n, 'MENTION_EVERYONE'],
  [1n << 18n, 'USE_EXTERNAL_EMOJIS'],
  [1n << 19n, 'VIEW_GUILD_INSIGHTS'],
  [1n << 20n, 'CONNECT'],
  [1n << 21n, 'SPEAK'],
  [1n << 22n, 'MUTE_MEMBERS'],
  [1n << 23n, 'DEAFEN_MEMBERS'],
  [1n << 24n, 'MOVE_MEMBERS'],
  [1n << 25n, 'USE_VAD'],
  [1n << 26n, 'CHANGE_NICKNAME'],
  [1n << 27n, 'MANAGE_NICKNAMES'],
  [1n << 28n, 'MANAGE_ROLES'],
  [1n << 29n, 'MANAGE_WEBHOOKS'],
  [1n << 30n, 'MANAGE_GUILD_EXPRESSIONS'],
  [1n << 31n, 'USE_APPLICATION_COMMANDS'],
  [1n << 32n, 'REQUEST_TO_SPEAK'],
  [1n << 33n, 'MANAGE_EVENTS'],
  [1n << 34n, 'MANAGE_THREADS'],
  [1n << 35n, 'CREATE_PUBLIC_THREADS'],
  [1n << 36n, 'CREATE_PRIVATE_THREADS'],
  [1n << 37n, 'USE_EXTERNAL_STICKERS'],
  [1n << 38n, 'SEND_MESSAGES_IN_THREADS'],
  [1n << 39n, 'USE_EMBEDDED_ACTIVITIES'],
  [1n << 40n, 'MODERATE_MEMBERS'],
  [1n << 41n, 'VIEW_CREATOR_MONETIZATION_ANALYTICS'],
  [1n << 42n, 'USE_SOUNDBOARD'],
  [1n << 43n, 'CREATE_GUILD_EXPRESSIONS'],
  [1n << 44n, 'CREATE_EVENTS'],
  [1n << 45n, 'USE_EXTERNAL_SOUNDS'],
  [1n << 46n, 'SEND_VOICE_MESSAGES'],
  [1n << 49n, 'SEND_POLLS'],
  [1n << 50n, 'USE_EXTERNAL_APPS'],
  [1n << 51n, 'PIN_MESSAGES'],
  [1n << 52n, 'BYPASS_SLOWMODE'],
];

export function decodePermissions(value: string | number | bigint | null | undefined): string[] {
  let bits = 0n;
  try {
    bits = BigInt(value ?? 0);
  } catch {
    return [];
  }
  return PERMISSIONS.filter(([bit]) => (bits & bit) === bit).map(([, name]) => name);
}

export function combinePermissions(values: Array<string | number | bigint>): bigint {
  return values.reduce((total, value) => total | BigInt(value), 0n);
}
