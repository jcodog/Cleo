export function toOptionalChannelValue(value: string): string | null {
  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

export function toOptionalTextValue(value: string): string | null {
  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}
