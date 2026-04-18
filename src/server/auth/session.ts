const SESSION_COOKIE_NAME = "cashdivider_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

declare global {
  // eslint-disable-next-line no-var
  var cashdividerSessionTokenCache:
    | {
        key: string;
        tokenPromise: Promise<string>;
      }
    | undefined;
}

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

function getSessionCacheKey() {
  return `${getAppPassword()}::${getSessionSalt()}`;
}

function getExpectedSessionTokenPromise() {
  const configuredPassword = getAppPassword();
  const cacheKey = getSessionCacheKey();
  const existingCache = globalThis.cashdividerSessionTokenCache;

  if (existingCache?.key === cacheKey) {
    return existingCache.tokenPromise;
  }

  const tokenPromise = createSessionToken(configuredPassword);
  globalThis.cashdividerSessionTokenCache = {
    key: cacheKey,
    tokenPromise,
  };

  return tokenPromise;
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

  const [incomingToken, expectedToken] = await Promise.all([createSessionToken(password), getExpectedSessionTokenPromise()]);

  return incomingToken === expectedToken;
}

export async function isValidSessionToken(token: string | undefined) {
  if (!isAccessProtectionEnabled()) {
    return true;
  }

  if (!token) {
    return false;
  }

  const expectedToken = await getExpectedSessionTokenPromise();
  return token === expectedToken;
}
