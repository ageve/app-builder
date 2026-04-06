export function getJsonErrorMessage(value: string) {
  try {
    JSON.parse(value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON"
  }
}

export function normalizeJson(value: string) {
  return `${JSON.stringify(JSON.parse(value), null, 2)}\n`
}
