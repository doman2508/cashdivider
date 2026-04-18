import { NextResponse } from "next/server";
import { reopenDay } from "@/src/server/days/days-service";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { date } = await context.params;

  try {
    const data = await reopenDay(date);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "DAY_NOT_FOUND") {
      return NextResponse.json({ error: "DAY_NOT_FOUND" }, { status: 404 });
    }

    throw error;
  }
}
