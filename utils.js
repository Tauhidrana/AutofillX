const RULES_STORAGE_KEY = "smartFormMapperAutofill.rules";

function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "")
    .trim();
}

function normalizeRule(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    question: typeof p.question === "string" ? p.question : "",
    value: typeof p.value === "string" ? p.value : ""
  };
}

function normalizeRulesArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeRule)
    .map((r) => ({ question: r.question.trim(), value: r.value }))
    .filter((r) => r.question.length > 0);
}

function isRuleMatch(questionText, ruleQuestionText) {
  const q = normalizeText(questionText);
  const r = normalizeText(ruleQuestionText);
  if (!q || !r) return false;
  return q.includes(r) || r.includes(q);
}

function pickBestRuleForQuestion(questionText, rules) {
  const matches = [];
  for (const rule of rules) {
    if (isRuleMatch(questionText, rule.question)) {
      matches.push(rule);
    }
  }
  if (matches.length === 0) return null;

  matches.sort((a, b) => normalizeText(b.question).length - normalizeText(a.question).length);
  return matches[0];
}
