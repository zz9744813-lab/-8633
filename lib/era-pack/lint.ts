import { EraPack } from "./loader";

export type LintResult = {
  ok: boolean;
  violations: string[];
};

// Pure function: check text against era pack's forbiddenConcepts
export function lintEraOutput(text: string, eraPack: EraPack): LintResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  for (const concept of eraPack.forbiddenConcepts) {
    const conceptLower = concept.toLowerCase();
    if (lower.includes(conceptLower)) {
      violations.push(concept);
    }
  }

  return { ok: violations.length === 0, violations };
}

// Build a retry prompt suffix with the forbidden concepts
export function buildRetrySuffix(violations: string[]): string {
  return `\n\n【注意】你刚才的输出包含了以下禁用词：${violations.join("、")}。请重写，完全避免这些词。`;
}
