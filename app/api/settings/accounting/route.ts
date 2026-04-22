import { NextResponse } from "next/server";
import { getAccountingSettings, updateAccountingSettings } from "@/src/server/settings/accounting-settings-service";

export async function GET() {
  const data = await getAccountingSettings();
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { accountingStartDate?: string | null };

  try {
    const data = await updateAccountingSettings(body.accountingStartDate ?? null);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ACCOUNTING_START_DATE") {
      return NextResponse.json(
        { error: "INVALID_ACCOUNTING_START_DATE", message: "Podaj date startu rozliczen w formacie RRRR-MM-DD." },
        { status: 400 },
      );
    }

    throw error;
  }
}
