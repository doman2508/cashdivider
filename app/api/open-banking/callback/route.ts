import { NextResponse } from "next/server";
import {
  getOpenBankingSpikeStatus,
  getOpenBankingStateCookieName,
  importTrueLayerData,
} from "@/src/server/open-banking/open-banking-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const error = url.searchParams.get("error") ?? "";
  const provider = (await getOpenBankingSpikeStatus()).provider;
  const callbackPageUrl = new URL("/imports/open-banking/callback", url.origin);

  callbackPageUrl.searchParams.set("provider", provider);
  callbackPageUrl.searchParams.set("mode", "truelayer");

  if (error) {
    callbackPageUrl.searchParams.set("status", "provider_error");
    callbackPageUrl.searchParams.set("error", error);
    return NextResponse.redirect(callbackPageUrl);
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${getOpenBankingStateCookieName()}=`))
    ?.split("=")[1];

  if (!expectedState || state !== expectedState) {
    callbackPageUrl.searchParams.set("status", "invalid_state");
    return NextResponse.redirect(callbackPageUrl);
  }

  if (!code) {
    callbackPageUrl.searchParams.set("status", "missing_code");
    return NextResponse.redirect(callbackPageUrl);
  }

  try {
    const result = await importTrueLayerData(code);
    callbackPageUrl.searchParams.set("status", "imported");
    callbackPageUrl.searchParams.set("added", String(result.addedCount));
    callbackPageUrl.searchParams.set("skipped", String(result.skippedCount));
    callbackPageUrl.searchParams.set("accounts", String(result.accountCount));
    callbackPageUrl.searchParams.set("transactions", String(result.transactionCount));
    callbackPageUrl.searchParams.set("dates", result.affectedDates.join(","));

    const response = NextResponse.redirect(callbackPageUrl);
    response.cookies.set({
      name: getOpenBankingStateCookieName(),
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (caughtError) {
    const errorCode =
      caughtError instanceof Error ? caughtError.message : "TRUELAYER_IMPORT_FAILED";
    callbackPageUrl.searchParams.set("status", "import_failed");
    callbackPageUrl.searchParams.set("error", encodeURIComponent(errorCode));
    return NextResponse.redirect(callbackPageUrl);
  }
}
