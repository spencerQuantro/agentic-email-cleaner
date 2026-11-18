export function parseFrom(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1]?.trim() || match[2]!, address: match[2]!.toLowerCase() };
  return { name: from.trim(), address: from.trim().toLowerCase() };
}

const SENDER_ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function isValidSenderAddress(address: string) {
  return SENDER_ADDRESS.test(address);
}

/**
 * Gmail query for "has the user ever emailed this sender". The address comes from an
 * untrusted `From` header, so an unquoted or unvalidated value could inject Gmail search
 * operators (e.g. `x@y.com OR in:sent`) and fake `repliedTo`. Invalid addresses are not
 * searched at all; valid ones are quoted.
 */
export function sentMailQuery(address: string) {
  return isValidSenderAddress(address) ? `in:sent to:"${address}"` : undefined;
}
