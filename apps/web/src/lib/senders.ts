const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export type SenderResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Trims and lowercases a protected sender, which is an email address
 * (local@domain.tld) or a bare domain (domain.tld), and rejects duplicates.
 */
export function normalizeSender(input: string, existing: readonly string[]): SenderResult {
  const value = input.trim().toLowerCase();
  if (!EMAIL.test(value) && !DOMAIN.test(value)) {
    return {
      ok: false,
      error: "Enter an email address or a domain, like name@example.com or example.com.",
    };
  }
  if (existing.includes(value)) return { ok: false, error: `${value} is already protected.` };
  return { ok: true, value };
}
