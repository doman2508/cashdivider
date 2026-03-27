import { NextResponse } from "next/server";
import { getDataSourcesSummary } from "@/src/server/data-sources/data-sources-service";

export async function GET() {
  const data = getDataSourcesSummary();
  return NextResponse.json({ data });
}
