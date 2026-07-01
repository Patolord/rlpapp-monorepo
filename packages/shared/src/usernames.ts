/** Live input: lowercase, remove whitespace, keep Clerk-safe username chars. */
export function sanitizeUsernameInput(value: string): string {
  return value.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9._-]/g, "");
}

/** Submit: trim then sanitize. */
export function normalizeUsername(value: string): string {
  return sanitizeUsernameInput(value.trim());
}
