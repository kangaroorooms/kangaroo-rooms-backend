/**
 * Canonical normalization utilities.
 *
 * SINGLE SOURCE OF TRUTH for identifier normalization.
 * Use these instead of inline .toLowerCase() / .toUpperCase() calls.
 */

/**
 * Normalize a city identifier to lowercase canonical form.
 *
 * @param city - Raw city string from user input, DB, or API
 * @returns Lowercase, trimmed city string
 * @throws Error if city is falsy or not a string
 *
 * Examples:
 *   normalizeCity('Jaipur')    → 'jaipur'
 *   normalizeCity('  Mumbai ') → 'mumbai'
 *   normalizeCity('DELHI')     → 'delhi'
 */
export const normalizeCity = (city: string): string => {
  if (!city || typeof city !== 'string') {
    throw new Error('Invalid city value');
  }
  return city.trim().toLowerCase();
};