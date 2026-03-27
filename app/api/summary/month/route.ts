import { NextResponse } from "next/server";
import { getMonthSummary } from "@/src/server/summary/month-summary-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? undefined;

  try {
    const data = await getMonthSummary(month);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_MONTH") {
      return NextResponse.json(
        { error: "INVALID_MONTH", message: "Podaj miesiac w formacie RRRR-MM." },
        { status: 400 },
      );
    }

    throw error;
  }
}
