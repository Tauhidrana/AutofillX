function $(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.style.color = isError ? "#d93025" : "";
}

function escapeHtml(s) {
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadRules() {
  const result = await chrome.storage.sync.get(RULES_STORAGE_KEY);
  return normalizeRulesArray(result[RULES_STORAGE_KEY]);
}

async function saveRules(rules) {
  await chrome.storage.sync.set({ [RULES_STORAGE_KEY]: normalizeRulesArray(rules) });
}

function renderRules(rules, reportByRuleIndex) {
  $("rulesCount").textContent = `${rules.length} rule${rules.length === 1 ? "" : "s"}`;

  const root = $("rulesList");
  root.innerHTML = "";

  if (rules.length === 0) {
    root.innerHTML =
      '<div class="muted" style="font-size:12px">No rules yet. Add one above.</div>';
    return;
  }

  rules.forEach((r, idx) => {
    const report = reportByRuleIndex && reportByRuleIndex[idx] ? reportByRuleIndex[idx] : null;
    const pillClass = report ? (report.filledCount > 0 ? "pill ok" : "pill warn") : "pill";
    const pillText = report
      ? report.filledCount > 0
        ? `filled: ${report.filledCount}`
        : "not filled"
      : "status: unknown";

    const wrapper = document.createElement("div");
    wrapper.className = "ruleItem";
    wrapper.dataset.index = String(idx);
    wrapper.innerHTML = `
      <div class="ruleMeta">
        <span class="${pillClass}">${escapeHtml(pillText)}</span>
        <button class="danger" data-action="delete" type="button" style="flex:0 0 auto;padding:7px 10px;border-radius:10px">Delete</button>
      </div>
      <label>
        Question identifier
        <input data-field="question" type="text" value="${escapeHtml(r.question)}" />
      </label>
      <label>
        Value
        <input data-field="value" type="text" value="${escapeHtml(r.value)}" />
      </label>
      <div class="row">
        <button class="secondary" data-action="save" type="button">Save changes</button>
      </div>
    `;
    root.appendChild(wrapper);
  });
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0].id : null;
}

async function requestTestFill() {
  const tabId = await getActiveTabId();
  if (!tabId) throw new Error("No active tab found.");

  return await chrome.tabs.sendMessage(tabId, { type: "SFM_TEST_FILL" });
}

document.addEventListener("DOMContentLoaded", async () => {
  let rules = [];
  let lastReport = null;

  try {
    rules = await loadRules();
    setStatus("Ready. Add a rule or click Test Fill.");
  } catch (e) {
    setStatus("Failed to load rules.", true);
  }

  renderRules(rules, null);

  $("addRuleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("newQuestion").value.trim();
    const v = $("newValue").value;

    if (!q) {
      setStatus("Question identifier is required.", true);
      return;
    }

    const nq = normalizeText(q);
    const hasDup = rules.some((r) => normalizeText(r.question) === nq);
    if (hasDup) {
      setStatus("A rule with the same question identifier already exists.", true);
      return;
    }

    const addBtn = $("addBtn");
    addBtn.disabled = true;
    setStatus("Saving rule...");

    try {
      rules.push({ question: q, value: v });
      await saveRules(rules);
      $("newQuestion").value = "";
      $("newValue").value = "";
      lastReport = null;
      renderRules(rules, null);
      setStatus("Rule added.");
    } catch (err) {
      setStatus("Failed to save rule.", true);
    } finally {
      addBtn.disabled = false;
    }
  });

  $("rulesList").addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    if (!action) return;

    const item = target.closest(".ruleItem");
    const idx = item ? Number(item.dataset.index) : -1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= rules.length) return;

    if (action === "delete") {
      rules.splice(idx, 1);
      await saveRules(rules);
      lastReport = null;
      renderRules(rules, null);
      setStatus("Rule deleted.");
      return;
    }

    if (action === "save") {
      const qInput = item.querySelector('input[data-field="question"]');
      const vInput = item.querySelector('input[data-field="value"]');
      if (!(qInput instanceof HTMLInputElement) || !(vInput instanceof HTMLInputElement)) return;

      const newQ = qInput.value.trim();
      const newV = vInput.value;
      if (!newQ) {
        setStatus("Question identifier cannot be empty.", true);
        return;
      }

      const nq = normalizeText(newQ);
      const conflict = rules.some((r, j) => j !== idx && normalizeText(r.question) === nq);
      if (conflict) {
        setStatus("Conflict: another rule already uses that identifier.", true);
        return;
      }

      rules[idx] = { question: newQ, value: newV };
      await saveRules(rules);
      lastReport = null;
      renderRules(rules, null);
      setStatus("Changes saved.");
    }
  });

  $("testFillBtn").addEventListener("click", async () => {
    $("testFillBtn").disabled = true;
    setStatus("Testing fill on current tab...");

    try {
      lastReport = await requestTestFill();
      rules = await loadRules();
      renderRules(rules, lastReport && lastReport.byRuleIndex ? lastReport.byRuleIndex : null);

      if (!lastReport) {
        setStatus("No report received.", true);
        return;
      }

      const filled = lastReport.totalFilled || 0;
      const matched = lastReport.totalMatched || 0;
      setStatus(`Test Fill done. matched: ${matched}, filled: ${filled}`);
    } catch (err) {
      setStatus(
        "Test Fill failed. Make sure the active tab is a Google Form page.",
        true
      );
    } finally {
      $("testFillBtn").disabled = false;
    }
  });
});
