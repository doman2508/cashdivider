import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "cashdivider-api",
    timestamp: new Date().toISOString(),
  });
}
