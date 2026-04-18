import { NextResponse } from "next/server";
import { getOpenDaysBatch } from "@/src/server/days/days-service";

export async function GET() {
  const data = await getOpenDaysBatch();
  return NextResponse.json({ data });
}
