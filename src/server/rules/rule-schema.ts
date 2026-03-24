import { z } from "zod";

export const ruleInputSchema = z.object({
  name: z.string().min(1),
  percentage: z.number().positive().max(100),
  targetLabel: z.string().min(1),
  targetAccountNumber: z.string().min(1),
});

export type RuleInput = z.infer<typeof ruleInputSchema>;

export function parseRulePayload(body: unknown) {
  const payload = typeof body === "object" && body !== null ? body : {};

  return ruleInputSchema.safeParse({
    name: String(Reflect.get(payload, "name") ?? ""),
    percentage: Number(Reflect.get(payload, "percentage")),
    targetLabel: String(
      Reflect.get(payload, "targetLabel") ?? Reflect.get(payload, "target") ?? "",
    ),
    targetAccountNumber: String(
      Reflect.get(payload, "targetAccountNumber") ?? Reflect.get(payload, "accountNumber") ?? "",
    ),
  });
}
