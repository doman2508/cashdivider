import { NextResponse } from "next/server";
import { listImports } from "@/src/server/audit/audit-service";

export async function GET() {
  const data = await listImports();
  return NextResponse.json({ data });
}
