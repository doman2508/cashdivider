import { NextResponse } from "next/server";
import { settleOpenDaysBatch } from "@/src/server/days/days-service";

export async function POST() {
  const data = await settleOpenDaysBatch();
  return NextResponse.json({ data });
}
