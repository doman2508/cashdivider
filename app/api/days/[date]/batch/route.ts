import { NextResponse } from "next/server";
import { toggleDayBatchInclusion } from "@/src/server/days/days-service";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { date } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { includeInBatch?: boolean };

  try {
    const data = await toggleDayBatchInclusion(date, body.includeInBatch !== false);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_NOT_FOUND") {
      return NextResponse.json({ error: "DAY_NOT_FOUND" }, { status: 404 });
    }

    throw error;
  }
}
