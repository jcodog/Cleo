// Fixed patterns only. Policy terms are never interpreted as regular expressions.
export const URL_TOKEN_SEPARATORS = /\s+/u
export const LEADING_URL_PUNCTUATION = /^[([{<>"'`*~\u2018\u2019\u201c\u201d]+/u
export const NETWORK_SCHEME = /(?:https?|ftp):\/\//iu
export const DOMAIN_DOT = /[.\u3002\uff0e\uff61]/u
export const TRAILING_URL_PUNCTUATION =
  /[)\]}>"'`*~.,;:!?\u2018\u2019\u201c\u201d]+$/u
export const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u
export const DOMAIN_SUFFIX = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/u
export const CUSTOM_DISCORD_EMOJI = /<a?:[A-Za-z0-9_]{2,32}:[0-9]{17,20}>/gu
export const UNICODE_EMOJI =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u
export const LETTER = /\p{L}/u
export const UPPERCASE_LETTER = /\p{Lu}/u
export const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u
export const INVISIBLE_OR_WHITESPACE = /^[\s\p{Cf}]+$/u
export const WORD_END = /[\p{L}\p{N}\p{M}\p{Pc}]$/u
export const WORD_START = /^[\p{L}\p{N}\p{M}\p{Pc}]/u
export const VISIBLE_TERM = /[\p{L}\p{N}\p{P}\p{S}]/u
