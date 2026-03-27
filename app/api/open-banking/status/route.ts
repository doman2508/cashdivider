import { NextResponse } from "next/server";
import { getOpenBankingSpikeStatus } from "@/src/server/open-banking/open-banking-service";

export async function GET() {
  const data = await getOpenBankingSpikeStatus();
  return NextResponse.json({ data });
}
