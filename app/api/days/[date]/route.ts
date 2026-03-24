import { NextResponse } from "next/server";
import { getDayDetail } from "@/src/server/days/days-service";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { date } = await context.params;
  const data = await getDayDetail(date);

  if (!data) {
    return NextResponse.json({ error: "DAY_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
