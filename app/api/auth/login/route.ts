import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionTtlSeconds,
  isAccessProtectionEnabled,
  isValidPassword,
} from "@/src/server/auth/session";

type LoginBody = {
  password?: string;
};

export async function POST(request: Request) {
  if (!isAccessProtectionEnabled()) {
    return NextResponse.json({ ok: true, unprotected: true });
  }

  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const password = body?.password?.trim() ?? "";

  if (!password) {
    return NextResponse.json({ error: "PASSWORD_REQUIRED", message: "Podaj haslo." }, { status: 400 });
  }

  const isValid = await isValidPassword(password);

  if (!isValid) {
    return NextResponse.json({ error: "INVALID_PASSWORD", message: "Nieprawidlowe haslo." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const sessionToken = await createSessionToken(password);

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
