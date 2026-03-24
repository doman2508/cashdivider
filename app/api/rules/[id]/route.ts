import { NextResponse } from "next/server";
import { deleteRule, updateRule } from "@/src/server/rules/rules-service";
import { parseRulePayload } from "@/src/server/rules/rule-schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
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
    const data = await updateRule(id, parsed.data);
    return NextResponse.json({ data });
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

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteRule(id);
  return new NextResponse(null, { status: 204 });
}
