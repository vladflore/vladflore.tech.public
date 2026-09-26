// Solve page (solve.html): structured problems from problems/,
// tested via harness/runner.py on Piston. Links: solve.html#<slug>.

const DRAFT_KEY_PREFIX = "codebox:draft:";
const SLUG_PATTERN = /^[a-z0-9-]+$/;

let practiceProblems = [];
// Selected filter values; an empty set means "all". Kept per browser (localStorage).
const FILTER_OPTIONS = { kind: ["implement", "fix", "refactor"], difficulty: ["easy", "medium", "hard"] };
const FILTERS_KEY = "codebox:filters";
const filters = loadFilters();
// Names of collapsed tracks, kept per browser like the filters.
const COLLAPSED_KEY = "codebox:collapsed-tracks";
const collapsedTracks = loadCollapsedTracks();
let currentProblem = null; // { slug, meta, problemJson, starter }
const lastTestReports = {}; // slug -> parsed test report, sent to the mentor (chat.js)
let harnessSource = null;

initEditor(() => {
  editor.onDidChangeModelContent(saveDraft);
  fetchPracticeProblems();
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
});

function openFromHash() {
  const slug = normalizeTag(getHashTag());
  if (slug) loadProblem(slug);
}

// Selecting a problem goes through the URL hash, so reload and links keep it.
function selectProblem(slug) {
  if (normalizeTag(getHashTag()) === slug) {
    loadProblem(slug);
  } else {
    window.location.hash = slug;
  }
}

async function fetchPracticeProblems() {
  try {
    const response = await fetch("problems/index.json");
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const { problems } = await response.json();
    // One broken problem must not hide the others.
    const loaded = await Promise.allSettled(
      problems.map(async (slug) => {
        const meta = JSON.parse(await fetchText(`problems/${slug}/problem.json`));
        return { slug, title: meta.title, difficulty: meta.difficulty, kind: meta.kind, language: meta.language, track: meta.track, draft: meta.draft === true };
      }),
    );
    loaded
      .filter((r) => r.status === "rejected")
      .forEach((r) => console.warn("Skipping practice problem:", r.reason));
    practiceProblems = loaded
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((p) => !p.draft);
    renderPracticeList();
  } catch (error) {
    console.error("Error fetching practice problems:", error);
    document.getElementById("practice").innerHTML =
      '<div class="empty">Failed to load problems</div>';
  }
}

function difficultyBadge(difficulty) {
  return `<span class="difficulty difficulty-${escapeHtml(difficulty)}">${escapeHtml(difficulty)}</span>`;
}

// Exercise language (problem.json "language", default python); same logos as the Study page.
const LANGUAGE_ICONS = {
  python: { name: "Python", src: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  java: { name: "Java", src: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" },
};

function languageIcon(language = "python") {
  const { name, src } = LANGUAGE_ICONS[language] ?? LANGUAGE_ICONS.python;
  return `<img class="language-icon" src="${src}" alt="${name}" title="${name}">`;
}

// Drafts (problem.json "draft": true) are never listed or counted; their #slug link still opens them.
function draftBadge(draft) {
  return draft ? '<span class="draft-badge">draft</span>' : "";
}

// Exercise kind (problem.json "kind"): implement | fix | refactor.
function kindBadge(kind = "implement") {
  return `<span class="kind kind-${escapeHtml(kind)}">${escapeHtml(kind)}</span>`;
}

function loadFilters() {
  const empty = { kind: new Set(), difficulty: new Set() };
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY)) ?? {};
    for (const group of Object.keys(empty)) {
      (saved[group] ?? [])
        .filter((value) => FILTER_OPTIONS[group].includes(value))
        .forEach((value) => empty[group].add(value));
    }
  } catch {
    // No storage or bad data: start unfiltered.
  }
  return empty;
}

function saveFilters() {
  try {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ kind: [...filters.kind], difficulty: [...filters.difficulty] }),
    );
  } catch (error) {
    console.warn("Could not save filters:", error);
  }
}

function loadCollapsedTracks() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function toggleTrack(track) {
  collapsedTracks.has(track) ? collapsedTracks.delete(track) : collapsedTracks.add(track);
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedTracks]));
  } catch (error) {
    console.warn("Could not save collapsed tracks:", error);
  }
  renderPracticeList();
}

function trackHeading(track) {
  const collapsed = collapsedTracks.has(track);
  const heading = document.createElement("div");
  heading.className = `track-heading${collapsed ? " collapsed" : ""}`;
  heading.setAttribute("role", "button");
  heading.setAttribute("tabindex", "0");
  heading.setAttribute("aria-expanded", String(!collapsed));
  heading.innerHTML = `<span>${escapeHtml(track)}</span><i class="bi bi-chevron-down"></i>`;
  heading.onclick = () => toggleTrack(track);
  heading.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTrack(track);
    }
  };
  return heading;
}

function matchesFilters(p) {
  const kind = p.kind ?? "implement";
  return (
    (filters.kind.size === 0 || filters.kind.has(kind)) &&
    (filters.difficulty.size === 0 || filters.difficulty.has(p.difficulty))
  );
}

function toggleFilter(group, value) {
  const selected = filters[group];
  selected.has(value) ? selected.delete(value) : selected.add(value);
  saveFilters();
  renderPracticeList();
}

function clearFilters() {
  filters.kind.clear();
  filters.difficulty.clear();
  saveFilters();
  renderPracticeList();
}

function renderFilters(shown) {
  const container = document.getElementById("practice-filters");
  const chips = (group) =>
    FILTER_OPTIONS[group]
      .map((value) => {
        const on = filters[group].has(value);
        return `<button class="filter-chip filter-${value}${on ? " on" : ""}" aria-pressed="${on}" onclick="toggleFilter('${group}', '${value}')">${value}</button>`;
      })
      .join("");
  const active = filters.kind.size + filters.difficulty.size > 0;
  container.innerHTML = `
    <div class="filter-row"><span class="filter-label">Kind</span>${chips("kind")}</div>
    <div class="filter-row"><span class="filter-label">Level</span>${chips("difficulty")}</div>
    <div class="filter-status">${shown} of ${practiceProblems.length}${active ? ' · <a href="#" onclick="clearFilters(); return false;">clear</a>' : ""}</div>`;
}

function renderPracticeList() {
  const container = document.getElementById("practice");
  container.innerHTML = "";

  if (practiceProblems.length === 0) {
    document.getElementById("practice-filters").innerHTML = "";
    container.innerHTML = '<div class="empty">No problems</div>';
    return;
  }

  const visible = practiceProblems.filter(matchesFilters);
  renderFilters(visible.length);
  if (visible.length === 0) {
    container.innerHTML = '<div class="empty">No problems match these filters</div>';
    return;
  }

  let track;
  visible.forEach((p) => {
    // Problems are listed in index.json order; a heading starts each track.
    if ((p.track ?? "") !== track) {
      track = p.track ?? "";
      if (track) {
        container.appendChild(trackHeading(track));
      }
    }
    if (collapsedTracks.has(track)) return;
    const btn = document.createElement("button");
    btn.innerHTML = `${languageIcon(p.language)}<span class="practice-title">${escapeHtml(p.title)}</span>${kindBadge(p.kind)}${difficultyBadge(p.difficulty)}`;
    btn.onclick = () => selectProblem(p.slug);
    btn.title = p.slug;

    if (currentProblem && currentProblem.slug === p.slug) {
      btn.classList.add("active");
    }
    container.appendChild(btn);
  });
}

async function loadProblem(slug) {
  if (!SLUG_PATTERN.test(slug)) {
    showNotification(`Unknown problem: ${escapeHtml(slug)}`, "warning");
    return;
  }

  try {
    document.getElementById("currentFile").innerHTML =
      `<i class="bi bi-hourglass-split"></i> Loading ${escapeHtml(slug)}...`;

    const base = `problems/${slug}`;
    const [problemJson, description, starter] = await Promise.all([
      fetchText(`${base}/problem.json`),
      fetchText(`${base}/description.html`),
      fetchText(`${base}/starter.py`),
    ]);
    const meta = JSON.parse(problemJson);

    // Set before setValue, so the change event saves into the right draft.
    currentProblem = { slug, meta, problemJson, starter };
    renderPracticeList();
    renderChat();

    editor.setValue(loadDraft(slug) ?? starter);
    monaco.editor.setModelLanguage(editor.getModel(), "python");

    document.getElementById("currentFile").innerHTML =
      `${languageIcon(meta.language)}${escapeHtml(meta.title)}${draftBadge(meta.draft === true)}${kindBadge(meta.kind)}${difficultyBadge(meta.difficulty)}`;
    document.getElementById("output").textContent = "";
    document.getElementById("file-info").innerHTML = `
      <div style="background: #333; padding: 12px; border-radius: 6px; font-size: 14px;">
        ${description}
      </div>
    `;
  } catch (error) {
    console.error("Error loading practice problem:", error);
    document.getElementById("currentFile").innerHTML =
      `<i class="bi bi-exclamation-triangle"></i> Error loading ${escapeHtml(slug)}`;
    showNotification(`Failed to load problem: ${escapeHtml(error.message)}`, "error");
  }
}

function getRunTarget() {
  return currentProblem ? { lang: "python", filename: "solution.py" } : null;
}

function getDownloadName() {
  return currentProblem ? `${currentProblem.slug}.py` : null;
}

function loadDraft(slug) {
  try {
    return localStorage.getItem(DRAFT_KEY_PREFIX + slug);
  } catch {
    return null;
  }
}

function saveDraft() {
  if (!currentProblem) return;
  const key = DRAFT_KEY_PREFIX + currentProblem.slug;
  const code = editor.getValue();
  try {
    if (code === currentProblem.starter) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, code);
    }
  } catch (error) {
    console.warn("Could not save draft:", error);
  }
}

function getResetTarget() {
  return currentProblem ? { code: currentProblem.starter, message: "Code reset to starter" } : null;
}

async function getHarnessSource() {
  if (!harnessSource) {
    harnessSource = await fetchText("harness/runner.py");
  }
  return harnessSource;
}

async function runTests() {
  if (!currentProblem) {
    showNotification("⚠️ Open a problem first", "warning");
    return;
  }

  const problem = currentProblem;
  const outputElement = document.getElementById("output");
  const testButton = document.getElementById("test-btn");

  outputElement.textContent = "⏳ Running tests...";
  testButton.disabled = true;
  testButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Running...';

  try {
    const result = await executeOnPiston("python", [
      { name: "main.py", content: await getHarnessSource() },
      { name: "solution.py", content: editor.getValue() },
      { name: "problem.json", content: problem.problemJson },
    ]);

    // User switched problems while tests were running.
    if (currentProblem !== problem) return;

    const report = parseHarnessOutput(result.run);
    lastTestReports[problem.slug] = report;
    outputElement.innerHTML = renderTestReport(report, problem.meta);
    notifyTestReport(report);
  } catch (error) {
    console.error("Test execution error:", error);
    if (currentProblem === problem) {
      outputElement.innerHTML = `<div style="color: #ff6b6b;">❌ Network Error: ${escapeHtml(error.message)}</div>`;
    }
    showNotification("Failed to run tests", "error");
  } finally {
    testButton.disabled = false;
    testButton.innerHTML = '<i class="bi bi-check2-square"></i> Run tests';
  }
}

// Parses the harness protocol (see harness/runner.py): @@RESULT / @@SUMMARY / @@ERROR
// lines; everything else is the user's own top-level output.
function parseHarnessOutput(run) {
  const report = { results: [], summary: null, error: null, output: [] };

  for (const line of (run.stdout || "").split("\n")) {
    const match = line.match(/^@@(RESULT|SUMMARY|ERROR) (.*)$/);
    let payload = null;
    if (match) {
      try {
        payload = JSON.parse(match[2]);
      } catch {
        payload = null;
      }
    }
    if (!payload) {
      report.output.push(line);
    } else if (match[1] === "RESULT") {
      report.results.push(payload);
    } else if (match[1] === "SUMMARY") {
      report.summary = payload;
    } else {
      report.error = payload;
    }
  }

  while (report.output.length && !report.output.at(-1).trim()) {
    report.output.pop();
  }

  // No summary and no error: Piston killed the run (time/output limit) or the harness crashed.
  if (!report.summary && !report.error) {
    report.cutOff =
      [run.message, run.stderr].filter(Boolean).join("\n") ||
      `Process ended unexpectedly (signal: ${run.signal}, status: ${run.status})`;
  }

  return report;
}

// Python-style repr of a JSON value: [3, 2, 4], None, True, "abc".
function formatValue(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "object") {
    const items = Object.entries(value).map(
      ([k, v]) => `${JSON.stringify(k)}: ${formatValue(v)}`,
    );
    return `{${items.join(", ")}}`;
  }
  return JSON.stringify(value);
}

// What a test runs: a call of the problem's function, or setup + expression.
function testInput(test, functionName) {
  if (test.expr === undefined) {
    return `${functionName}(${test.args.map(formatValue).join(", ")})`;
  }
  return test.setup ? `${test.setup.replace(/\n$/, "")}\n${test.expr}` : test.expr;
}

function renderTestCase(result, test, functionName) {
  const status = result.skipped ? "skipped" : result.passed ? "pass" : "fail";
  const icon = result.skipped
    ? "bi-skip-forward"
    : result.passed
      ? "bi-check-circle-fill"
      : "bi-x-circle-fill";

  const detail = (label, value, extraClass = "") =>
    `<div class="test-detail ${extraClass}"><span>${label}:</span> ${escapeHtml(value)}</div>`;

  let html = `<div class="test-case ${status}"><i class="bi ${icon}"></i> <span class="test-name">${escapeHtml(result.name)}</span>`;
  if (!result.skipped) {
    html += `<span class="test-ms">${result.ms} ms</span>`;
  }

  if (result.skipped) {
    html += `<div class="test-detail">${escapeHtml(result.error)}</div>`;
  } else if (!result.passed) {
    if (test) {
      html += detail("Input", testInput(test, functionName));
    }
    html += detail("Expected", result.raises ? `raises ${result.raises}` : formatValue(result.expected));
    if (result.expected_output != null) {
      html += detail("Expected output", result.expected_output.replace(/\n$/, ""));
    }
    if (!result.error) {
      html += detail("Actual", formatValue(result.actual));
    } else {
      html += `<div class="test-detail test-error">${escapeHtml(result.error)}</div>`;
    }
  }
  if (result.stdout) {
    html += detail("Stdout", result.stdout.replace(/\n$/, ""));
  }
  return html + "</div>";
}

// Built without whitespace between tags: #output is a <pre>.
function renderTestReport(report, meta) {
  let html = "";

  if (report.error) {
    const title =
      report.error.kind === "missing_function"
        ? "Function not found"
        : "Could not load your code";
    html += `<div class="test-summary fail">❌ ${title}</div><div class="test-error">${escapeHtml(report.error.error)}</div>`;
  } else if (report.summary) {
    const { passed, total } = report.summary;
    const allPassed = passed === total;
    html += `<div class="test-summary ${allPassed ? "pass" : "fail"}">${allPassed ? "✅" : "❌"} ${passed}/${total} tests passed</div>`;
  } else {
    html += `<div class="test-summary fail">⚠️ Run was cut off</div><div class="test-error">${escapeHtml(report.cutOff)}</div>`;
  }

  for (const result of report.results) {
    const test = meta.tests.find((t) => t.name === result.name);
    html += renderTestCase(result, test, meta.function);
  }

  if (report.output.length) {
    html += `<div class="test-detail raw-output"><span>Output:</span>\n${escapeHtml(report.output.join("\n"))}</div>`;
  }

  return html;
}

function notifyTestReport(report) {
  if (report.summary && report.summary.passed === report.summary.total) {
    showNotification("All tests passed!", "success");
  } else if (report.summary) {
    const { passed, total } = report.summary;
    showNotification(`${passed}/${total} tests passed`, "warning");
  } else {
    showNotification("Tests could not complete", "error");
  }
}

document.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;

  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    runTests();
  }
});
