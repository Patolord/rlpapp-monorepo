/** Live input: lowercase, remove whitespace, keep Clerk-safe username chars. */
export function sanitizeUsernameInput(value) {
    return value.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9._-]/g, "");
}
/** Submit: trim then sanitize. */
export function normalizeUsername(value) {
    return sanitizeUsernameInput(value.trim());
}
