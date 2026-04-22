import { NextResponse } from "next/server";
import {
  createLegacySessionToken,
  createUserSessionToken,
  getAccessProtectionMode,
  getConfiguredOwnerEmail,
  getSessionCookieName,
  getSessionTtlSeconds,
  isAccessProtectionEnabled,
  isValidPassword,
} from "@/src/server/auth/session";
import { verifyStoredPassword } from "@/src/server/auth/password";
import { ensureOwnerUser } from "@/src/server/demo-user";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!isAccessProtectionEnabled()) {
    return NextResponse.json({ ok: true, unprotected: true });
  }

  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password?.trim() ?? "";

  if (!password) {
    return NextResponse.json({ error: "PASSWORD_REQUIRED", message: "Podaj haslo." }, { status: 400 });
  }

  let sessionToken = "";

  if (getAccessProtectionMode() === "owner") {
    if (!email) {
      return NextResponse.json({ error: "EMAIL_REQUIRED", message: "Podaj adres email." }, { status: 400 });
    }

    const ownerUser = await ensureOwnerUser().catch((error) => {
      console.error("OWNER_AUTH_BOOTSTRAP_FAILED", error);
      return null;
    });

    if (!ownerUser?.passwordHash || !ownerUser?.passwordSalt) {
      return NextResponse.json(
        { error: "OWNER_AUTH_NOT_READY", message: "Logowanie wlasciciela nie jest jeszcze poprawnie skonfigurowane." },
        { status: 500 },
      );
    }

    const isValid =
      email === getConfiguredOwnerEmail() &&
      email === ownerUser.email &&
      (await verifyStoredPassword(password, {
        passwordHash: ownerUser.passwordHash,
        passwordSalt: ownerUser.passwordSalt,
      }));

    if (!isValid) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", message: "Nieprawidlowy email lub haslo." },
        { status: 401 },
      );
    }

    sessionToken = await createUserSessionToken(ownerUser.id);
  } else {
    const isValid = await isValidPassword(password);

    if (!isValid) {
      return NextResponse.json({ error: "INVALID_PASSWORD", message: "Nieprawidlowe haslo." }, { status: 401 });
    }

    sessionToken = await createLegacySessionToken(password);
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionTtlSeconds(),
  });

  return response;
}
