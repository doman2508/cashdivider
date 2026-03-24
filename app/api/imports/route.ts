import { NextResponse } from "next/server";
import { z } from "zod";
import { importTransactions } from "@/src/server/imports/imports-service";

const importPayloadSchema = z.object({
  sourceType: z.enum(["ING_CSV", "MANUAL"]),
  sourceName: z.string().min(1),
  content: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = importPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_IMPORT",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const data = await importTransactions(parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IMPORT_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "IMPORT_ALREADY_EXISTS", message: "Ten import byl juz wczesniej dodany." },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "NO_TRANSACTIONS_FOUND") {
      return NextResponse.json(
        { error: "NO_TRANSACTIONS_FOUND", message: "Nie znaleziono dodatnich uznan do importu." },
        { status: 400 },
      );
    }

    throw error;
  }
}
