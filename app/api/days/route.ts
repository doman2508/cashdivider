import { NextResponse } from "next/server";
import { listDays } from "@/src/server/days/days-service";

export async function GET() {
  const data = await listDays();
  return NextResponse.json({ data });
}
