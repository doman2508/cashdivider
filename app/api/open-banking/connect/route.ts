import { NextResponse } from "next/server";
import {
  buildMissingConfigCallbackUrl,
  buildOpenBankingAuthUrl,
  createOpenBankingState,
  getOpenBankingSpikeStatus,
  getOpenBankingStateCookieName,
} from "@/src/server/open-banking/open-banking-service";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const status = await getOpenBankingSpikeStatus();

  if (!status.isConfigured) {
    return NextResponse.redirect(await buildMissingConfigCallbackUrl(origin));
  }

  const state = createOpenBankingState();
  const response = NextResponse.redirect(await buildOpenBankingAuthUrl(state));

  response.cookies.set({
    name: getOpenBankingStateCookieName(),
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
