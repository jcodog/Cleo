export function now() {
  return Date.now()
}

export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function addDays(timestamp: number, days: number) {
  return timestamp + days * 24 * 60 * 60 * 1000
}
