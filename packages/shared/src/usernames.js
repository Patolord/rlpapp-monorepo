/** Live input: lowercase, remove whitespace, keep Clerk-safe username chars. */
export function sanitizeUsernameInput(value) {
    return value.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9._-]/g, "");
}
/** Submit: trim then sanitize. */
export function normalizeUsername(value) {
    return sanitizeUsernameInput(value.trim());
}
/** First letter uppercase, rest untouched. */
export function capitalizeFirst(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
/** Display: first letter uppercase (the stored/login value stays lowercase for Clerk). */
export function formatUsername(value) {
    return capitalizeFirst(value);
}
/**
 * Display name: users created from a username (sem nome no Clerk) ficaram com o
 * nome todo em minúsculas; na tela a inicial vai em maiúscula.
 */
export function formatDisplayName(value) {
    return capitalizeFirst(value);
}
