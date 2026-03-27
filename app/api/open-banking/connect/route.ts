import { NextResponse } from "next/server";
import {
  buildMissingConfigCallbackUrl,
  buildTrueLayerAuthUrl,
  createOpenBankingState,
  getOpenBankingSpikeStatus,
  getOpenBankingStateCookieName,
} from "@/src/server/open-banking/open-banking-service";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const status = await getOpenBankingSpikeStatus();

  if (!status.isConfigured) {
    return NextResponse.redirect(buildMissingConfigCallbackUrl(origin));
  }

  const state = createOpenBankingState();
  const response = NextResponse.redirect(buildTrueLayerAuthUrl(state));

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
