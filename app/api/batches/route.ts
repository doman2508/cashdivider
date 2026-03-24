import { NextResponse } from "next/server";
import { listBatches } from "@/src/server/audit/audit-service";

export async function GET() {
  const data = await listBatches();
  return NextResponse.json({ data });
}
