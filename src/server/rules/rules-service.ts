import { Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";
import type { RuleInput } from "@/src/server/rules/rule-schema";

function serializeRule(rule: {
  id: string;
  name: string;
  percentage: Prisma.Decimal;
  targetLabel: string;
  targetAccountNumber: string;
  position: number;
  isActive: boolean;
}) {
  return {
    id: rule.id,
    name: rule.name,
    percentage: Number(rule.percentage),
    targetLabel: rule.targetLabel,
    targetAccountNumber: rule.targetAccountNumber,
    position: rule.position,
    isActive: rule.isActive,
  };
}

export async function listRules() {
  const user = await ensureDemoUser();
  const rules = await db.allocationRule.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return rules.map(serializeRule);
}

export async function createRule(input: RuleInput) {
  const user = await ensureDemoUser();
  const percentage = new Prisma.Decimal(input.percentage);
  const currentRules = await db.allocationRule.findMany({
    where: { userId: user.id, isActive: true },
    select: { percentage: true, position: true },
  });

  const currentPercentage = currentRules.reduce((sum, rule) => sum + Number(rule.percentage), 0);
  if (currentPercentage + input.percentage > 100) {
    throw new Error("RULE_PERCENTAGE_OVERFLOW");
  }

  const nextPosition = currentRules.length
    ? Math.max(...currentRules.map((rule) => rule.position)) + 1
    : 0;

  const rule = await db.allocationRule.create({
    data: {
      userId: user.id,
      name: input.name,
      percentage,
      targetLabel: input.targetLabel,
      targetAccountNumber: input.targetAccountNumber,
      position: nextPosition,
    },
  });

  return serializeRule(rule);
}

export async function updateRule(ruleId: string, input: RuleInput) {
  const user = await ensureDemoUser();
  const existingRule = await db.allocationRule.findFirst({
    where: { id: ruleId, userId: user.id },
    select: { id: true },
  });

  if (!existingRule) {
    throw new Error("RULE_NOT_FOUND");
  }

  const rules = await db.allocationRule.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, percentage: true },
  });

  const currentPercentageExcludingRule = rules
    .filter((rule) => rule.id !== ruleId)
    .reduce((sum, rule) => sum + Number(rule.percentage), 0);

  if (currentPercentageExcludingRule + input.percentage > 100) {
    throw new Error("RULE_PERCENTAGE_OVERFLOW");
  }

  const rule = await db.allocationRule.update({
    where: { id: ruleId },
    data: {
      name: input.name,
      percentage: new Prisma.Decimal(input.percentage),
      targetLabel: input.targetLabel,
      targetAccountNumber: input.targetAccountNumber,
    },
  });

  return serializeRule(rule);
}

export async function deleteRule(ruleId: string) {
  const user = await ensureDemoUser();
  const existingRule = await db.allocationRule.findFirst({
    where: { id: ruleId, userId: user.id },
    select: { id: true },
  });

  if (!existingRule) {
    throw new Error("RULE_NOT_FOUND");
  }

  await db.allocationRule.delete({
    where: { id: ruleId },
  });
}
