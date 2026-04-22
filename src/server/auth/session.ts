const SESSION_COOKIE_NAME = "cashdivider_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OWNER_SESSION_PREFIX = "owner";
const LEGACY_SESSION_PREFIX = "legacy";

declare global {
  // eslint-disable-next-line no-var
  var cashdividerLegacySessionTokenCache:
    | {
        key: string;
        tokenPromise: Promise<string>;
      }
    | undefined;
}

export type AccessProtectionMode = "none" | "legacy" | "owner";

function getAppPassword() {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

function getSessionSalt() {
  return process.env.APP_SESSION_SALT?.trim() || "cashdivider";
}

export function getConfiguredOwnerEmail() {
  return process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "";
}

export function getConfiguredOwnerBootstrapPassword() {
  return process.env.OWNER_PASSWORD?.trim() ?? "";
}

export function getAccessProtectionMode(): AccessProtectionMode {
  if (getConfiguredOwnerEmail()) {
    return "owner";
  }

  if (getAppPassword()) {
    return "legacy";
  }

  return "none";
}

export function isAccessProtectionEnabled() {
  return getAccessProtectionMode() !== "none";
}

export function isOwnerAuthEnabled() {
  return getAccessProtectionMode() === "owner";
}

export function isLegacyPasswordAuthEnabled() {
  return getAccessProtectionMode() === "legacy";
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

function getExpectedLegacySessionTokenPromise() {
  const configuredPassword = getAppPassword();
  const cacheKey = getSessionCacheKey();
  const existingCache = globalThis.cashdividerLegacySessionTokenCache;

  if (existingCache?.key === cacheKey) {
    return existingCache.tokenPromise;
  }

  const tokenPromise = createLegacySessionToken(configuredPassword);
  globalThis.cashdividerLegacySessionTokenCache = {
    key: cacheKey,
    tokenPromise,
  };

  return tokenPromise;
}

async function createHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createLegacySessionToken(password: string) {
  const signature = await createHash(`${password}:${getSessionSalt()}`);
  return `${LEGACY_SESSION_PREFIX}:${signature}`;
}

export async function createUserSessionToken(userId: string) {
  const payload = `${OWNER_SESSION_PREFIX}:${userId}`;
  const signature = await createHash(`${payload}:${getSessionSalt()}`);
  return `${payload}:${signature}`;
}

export async function getUserIdFromSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const parts = token.split(":");

  if (parts.length !== 3 || parts[0] !== OWNER_SESSION_PREFIX || !parts[1] || !parts[2]) {
    return null;
  }

  const payload = `${parts[0]}:${parts[1]}`;
  const expectedSignature = await createHash(`${payload}:${getSessionSalt()}`);

  if (parts[2] !== expectedSignature) {
    return null;
  }

  return parts[1];
}

export async function createSessionToken(password: string) {
  return createLegacySessionToken(password);
}

export async function isValidPassword(password: string) {
  const configuredPassword = getAppPassword();

  if (!configuredPassword) {
    return true;
  }

  const [incomingToken, expectedToken] = await Promise.all([
    createLegacySessionToken(password),
    getExpectedLegacySessionTokenPromise(),
  ]);

  return incomingToken === expectedToken;
}

export async function isValidSessionToken(token: string | undefined) {
  switch (getAccessProtectionMode()) {
    case "none":
      return true;
    case "legacy":
      if (!token) {
        return false;
      }

      return token === (await getExpectedLegacySessionTokenPromise());
    case "owner":
      return Boolean(await getUserIdFromSessionToken(token));
  }
}
