import { NextResponse } from "next/server";
import { createRule, listRules } from "@/src/server/rules/rules-service";
import { parseRulePayload } from "@/src/server/rules/rule-schema";

export async function GET() {
  const data = await listRules();
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = parseRulePayload(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_RULE",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const data = await createRule(parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "RULE_PERCENTAGE_OVERFLOW") {
      return NextResponse.json(
        { error: "RULE_PERCENTAGE_OVERFLOW", message: "Suma procentow nie moze przekroczyc 100%." },
        { status: 400 },
      );
    }

    throw error;
  }
}
