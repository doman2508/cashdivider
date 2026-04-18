import { NextResponse } from "next/server";
import { toggleTransactionExclusion } from "@/src/server/transactions/transactions-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { exclude?: boolean };

  try {
    const data = await toggleTransactionExclusion(id, body.exclude !== false);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSACTION_NOT_FOUND") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Could not update transaction" }, { status: 500 });
  }
}
