import { NextResponse } from "next/server";
import { getAccountBalancesSummary } from "@/src/server/summary/account-balances-service";

export async function GET() {
  const data = await getAccountBalancesSummary();
  return NextResponse.json({ data });
}
