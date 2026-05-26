// Forbidden concepts config (per era pack, with defaults)
const DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
  /色[情欲]/,
  /性[行交关]/,
  /强[奸暴]/,
  /杀[人戮害]/,
  /自[杀残]/,
  /虐[待杀]/,
  /毒[品瘾]/,
  /赌[博徒]/,
  /淫[乱秽]/,
  /卖[淫春]/,
  /吸[毒]/,
  /贩[毒]/,
  /爆[炸破]/,
  /血[腥]/,
  /尸[体骸]/,
  /鞭[笞刑打]/,
  /酷[刑]/,
  /裸[体露]/,
  /猥[亵琐]/,
  /迷[幻药]/,
  /致[幻]/,
  /堕[胎]/,
  /乱[伦]/,
];

const DEFAULT_BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "damn",
  "kill yourself", "die", "murder", "rape",
  "porn", "sex", "nude", "naked",
  "drug", "cocaine", "heroin",
];

export type LintResult = {
  passed: boolean;
  reason?: string;
  sanitized?: string;
};

// Check a single piece of text for forbidden content
export function lintContent(text: string, options?: {
  blocklist?: RegExp[];
  blockWords?: string[];
}): LintResult {
  const patterns = options?.blocklist ?? DEFAULT_BLOCKED_PATTERNS;
  const words = options?.blockWords ?? DEFAULT_BLOCKED_WORDS;

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return {
        passed: false,
        reason: `匹配违禁模式: ${pattern.source}`,
        sanitized: text.replace(pattern, "***"),
      };
    }
  }
  for (const word of words) {
    if (text.toLowerCase().includes(word)) {
      return {
        passed: false,
        reason: `包含违禁词: "${word}"`,
        sanitized: text.replace(new RegExp(word, "gi"), "***"),
      };
    }
  }
  return { passed: true };
}

// Filter an array of texts, return only safe ones (with warned replacements)
export function lintArray(items: string[], options?: {
  blocklist?: RegExp[];
  blockWords?: string[];
  onReject?: (item: string, reason: string) => void;
}): string[] {
  const safe: string[] = [];
  for (const item of items) {
    const result = lintContent(item, options);
    if (result.passed) {
      safe.push(item);
    } else {
      options?.onReject?.(item, result.reason ?? "unknown");
      if (result.sanitized) safe.push(result.sanitized);
    }
  }
  return safe;
}
