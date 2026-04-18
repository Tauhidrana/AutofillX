(() => {
  const filledQuestionSignatures = new Set();
  let lastReport = null;

  function getNativeValueSetter(el) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    return desc && typeof desc.set === "function" ? desc.set : null;
  }

  function isAlreadyFilled(el) {
    const v = (el && "value" in el ? String(el.value || "") : "").trim();
    return v.length > 0;
  }

  function setTextLikeValue(el, value) {
    if (isAlreadyFilled(el)) return false;
    if (typeof value !== "string") return false;

    const setter = getNativeValueSetter(el);
    if (setter) setter.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function visibleQuestionItems() {
    const candidates = Array.from(document.querySelectorAll("div[role='listitem']"));
    return candidates.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    });
  }

  function getQuestionTitle(questionEl) {
    const titleEl =
      questionEl.querySelector('[role="heading"]') ||
      questionEl.querySelector(".M7eMe") ||
      questionEl.querySelector(".HoXoMd") ||
      questionEl.querySelector(".cTDvob");

    const titleText = titleEl ? titleEl.textContent : "";
    if (normalizeText(titleText)) return titleText;

    const aria = questionEl.getAttribute("aria-label") || "";
    return aria;
  }

  function getQuestionSignature(questionEl) {
    const title = normalizeText(getQuestionTitle(questionEl));
    const idx = Array.from(questionEl.parentElement?.children || []).indexOf(questionEl);
    return `${title}::${idx}`;
  }

  function findTextInput(questionEl) {
    return (
      questionEl.querySelector('input[type="text"]') ||
      questionEl.querySelector('input:not([type])') ||
      questionEl.querySelector('input[type="email"]') ||
      questionEl.querySelector("textarea")
    );
  }

  async function loadRules() {
    const result = await chrome.storage.sync.get(RULES_STORAGE_KEY);
    return normalizeRulesArray(result[RULES_STORAGE_KEY]);
  }

  function initReport(ruleCount) {
    return {
      totalMatched: 0,
      totalFilled: 0,
      byRuleIndex: Array.from({ length: ruleCount }, () => ({ matchedCount: 0, filledCount: 0 }))
    };
  }

  async function fillOnce({ forceReport = false } = {}) {
    const rules = await loadRules();
    if (!rules || rules.length === 0) {
      if (forceReport) lastReport = initReport(0);
      return lastReport;
    }

    const questions = visibleQuestionItems();
    if (questions.length === 0) return;

    const toFill = questions.slice(0, -1);

    const report = initReport(rules.length);

    for (const q of toFill) {
      const signature = getQuestionSignature(q);
      if (filledQuestionSignatures.has(signature)) continue;

      const title = getQuestionTitle(q);
      if (!normalizeText(title)) continue;

      const bestRule = pickBestRuleForQuestion(title, rules);
      if (!bestRule) continue;

      const matchedIdx = rules.indexOf(bestRule);
      if (matchedIdx >= 0) {
        report.totalMatched += 1;
        report.byRuleIndex[matchedIdx].matchedCount += 1;
      }

      const textEl = findTextInput(q);
      if (textEl) {
        const didFill = setTextLikeValue(textEl, bestRule.value);
        if (didFill) {
          filledQuestionSignatures.add(signature);
          report.totalFilled += 1;
          if (matchedIdx >= 0) report.byRuleIndex[matchedIdx].filledCount += 1;
        }
      }
    }

    lastReport = report;
    return report;
  }

  function debounce(fn, waitMs) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), waitMs);
    };
  }

  const scheduleFill = debounce(() => {
    fillOnce().catch(() => {});
  }, 250);

  scheduleFill();

  const observer = new MutationObserver(() => scheduleFill());
  observer.observe(document.documentElement, { childList: true, subtree: true });

 
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "SFM_TEST_FILL") {
      fillOnce({ forceReport: true })
        .then((report) => sendResponse(report || { totalMatched: 0, totalFilled: 0, byRuleIndex: [] }))
        .catch(() => sendResponse({ totalMatched: 0, totalFilled: 0, byRuleIndex: [] }));
      return true;
    }

    if (msg.type === "SFM_GET_STATUS") {
      sendResponse(lastReport || { totalMatched: 0, totalFilled: 0, byRuleIndex: [] });
    }
  });
})();

// Kazi Tauhid Rana