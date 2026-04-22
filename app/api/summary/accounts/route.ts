import { NextResponse } from "next/server";
import { getAccountBalancesSummary, setSubaccountActualBalance } from "@/src/server/summary/account-balances-service";

export async function GET() {
  const data = await getAccountBalancesSummary();
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    key?: string;
    name?: string;
    targetLabel?: string;
    targetAccountNumber?: string;
    desiredBalance?: number;
    note?: string | null;
  };

  if (
    !body.key ||
    !body.name ||
    !body.targetLabel ||
    !body.targetAccountNumber ||
    typeof body.desiredBalance !== "number" ||
    Number.isNaN(body.desiredBalance)
  ) {
    return NextResponse.json(
      { error: "INVALID_ACCOUNT_BALANCE_UPDATE", message: "Brakuje danych do ustawienia salda subkonta." },
      { status: 400 },
    );
  }

  try {
    const data = await setSubaccountActualBalance({
      key: body.key,
      name: body.name,
      targetLabel: body.targetLabel,
      targetAccountNumber: body.targetAccountNumber,
      desiredBalance: body.desiredBalance,
      note: body.note ?? null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
      return NextResponse.json(
        { error: "ACCOUNT_NOT_FOUND", message: "Nie znaleziono wskazanego subkonta." },
        { status: 404 },
      );
    }

    throw error;
  }
}
