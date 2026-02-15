import crypto from 'crypto';

/**
 * Computes a deterministic SHA256 hash of a request body.
 *
 * WHY HASH, NOT RAW PAYLOAD:
 * 1. Privacy: No PII (names, emails, payment info) stored in idempotency table
 * 2. Storage: Fixed 64-char hex string vs. arbitrary-size JSON blob
 * 3. Tamper detection: Hash comparison is constant-time and collision-resistant
 * 4. Determinism: Sorted keys ensure {a:1,b:2} and {b:2,a:1} produce same hash
 *
 * @param body - The request body object to hash
 * @returns 64-character hex SHA256 digest
 */
export function hashRequestBody(body: unknown): string {
  // Sort keys recursively for deterministic serialization
  const normalized = JSON.stringify(sortKeys(body));
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Recursively sorts object keys to ensure deterministic JSON serialization.
 * Arrays preserve order (order matters semantically), objects get sorted keys.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object' && obj !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Validates that a string is a valid UUID v4 format.
 * Used to validate Idempotency-Key header values.
 */
export function isValidUUID(str: string): boolean {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(str);
}