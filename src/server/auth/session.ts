const SESSION_COOKIE_NAME = "cashdivider_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getAppPassword() {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

function getSessionSalt() {
  return process.env.APP_SESSION_SALT?.trim() || "cashdivider";
}

export function isAccessProtectionEnabled() {
  return getAppPassword().length > 0;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

export async function createSessionToken(password: string) {
  const value = `${password}:${getSessionSalt()}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidPassword(password: string) {
  const configuredPassword = getAppPassword();

  if (!configuredPassword) {
    return true;
  }

  const [incomingToken, expectedToken] = await Promise.all([
    createSessionToken(password),
    createSessionToken(configuredPassword),
  ]);

  return incomingToken === expectedToken;
}

export async function isValidSessionToken(token: string | undefined) {
  if (!isAccessProtectionEnabled()) {
    return true;
  }

  if (!token) {
    return false;
  }

  const expectedToken = await createSessionToken(getAppPassword());
  return token === expectedToken;
}
