const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const pattern = /^(?:[0-9A-HJKMNP-TV-Z]{9}|[0-9A-HJKMNP-TV-Z]{12})$/;

export function normalizeInvitationCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}

export function formatInvitationCode(value) {
  const code = normalizeInvitationCode(value);
  if (!pattern.test(code)) return code;
  const groupSize = code.length === 9 ? 3 : 4;
  return code.match(new RegExp(`.{${groupSize}}`, "g"))?.join("-") || code;
}

export function createInvitationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const code = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
  return formatInvitationCode(code);
}

export async function hashInvitationCode(value) {
  const code = normalizeInvitationCode(value);
  if (!pattern.test(code)) throw new Error("Le code d’invitation n’est pas valide.");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

