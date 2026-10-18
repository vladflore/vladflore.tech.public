// Shared by solve.html and study.html. runcodebox.html is the home page.
// Each page script defines getRunTarget(), getDownloadName(), getResetTarget() and calls initEditor(onReady).

function showNotification(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon =
    type === "success"
      ? "bi-check-circle"
      : type === "error"
        ? "bi-exclamation-triangle"
        : type === "warning"
          ? "bi-exclamation-circle"
          : "bi-info-circle";

  toast.innerHTML = `
    <i class="bi ${icon}"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

let editor;

function initEditor(onReady) {
  require.config({
    paths: { vs: "https://unpkg.com/monaco-editor@0.56.0/min/vs" },
  });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor"), {
      value: "",
      language: "plaintext",
      theme: "vs-dark",
      ...editorOptions(loadEditorSettings()),
    });
    addRunCommands(editor);
    // A new file (setValue) drops the error marks of the old one and leaves the diff view.
    editor.onDidChangeModelContent((e) => {
      if (e.isFlush) {
        clearErrorMarkers();
        closeDiffView();
      }
    });
    initializeWindowResize();
    initializePanelResize();
    initEditorSettings();
    onReady();
  });
}

// Monaco binds Ctrl/⌘+Enter to "insert line below"; here it runs the code instead.
// CtrlCmd is ⌘ on macOS, WinCtrl is Ctrl there: bind both so Ctrl+Enter works everywhere.
function addRunCommands(codeEditor) {
  for (const mod of [monaco.KeyMod.CtrlCmd, monaco.KeyMod.WinCtrl]) {
    codeEditor.addCommand(mod | monaco.KeyCode.Enter, runPrimary);
    codeEditor.addCommand(mod | monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCode);
  }
}

// Ctrl/⌘+Enter: Run tests on Solve, Run on Study (no tests there).
function runPrimary() {
  if (typeof runTests === "function") {
    runTests();
  } else {
    runCode();
  }
}

// ---------------------------------------------------------------------------
// Editor settings: kept per browser (localStorage).
// ---------------------------------------------------------------------------

const EDITOR_SETTINGS_KEY = "codebox-editor-settings";
const DEFAULT_EDITOR_SETTINGS = { fontSize: 14, wordWrap: false, minimap: false };
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;

function loadEditorSettings() {
  try {
    return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(localStorage.getItem(EDITOR_SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

function saveEditorSettings(settings) {
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Could not save editor settings:", error);
  }
}

function editorOptions(settings) {
  return {
    fontSize: settings.fontSize,
    wordWrap: settings.wordWrap ? "on" : "off",
    minimap: { enabled: settings.minimap },
  };
}

// Fills the page's #editor-settings popover and wires the gear button.
function initEditorSettings() {
  const popover = document.getElementById("editor-settings");
  const button = document.getElementById("settings-btn");
  if (!popover || !button) return;

  let settings = loadEditorSettings();
  popover.innerHTML = `
    <label>Font size
      <span class="font-size">
        <button type="button" data-step="-1" aria-label="Smaller font"><i class="bi bi-dash"></i></button>
        <span id="font-size-value"></span>
        <button type="button" data-step="1" aria-label="Larger font"><i class="bi bi-plus"></i></button>
      </span>
    </label>
    <label><input type="checkbox" id="word-wrap-setting" /> Word wrap</label>
    <label><input type="checkbox" id="minimap-setting" /> Minimap</label>`;

  const apply = (changes) => {
    settings = { ...settings, ...changes };
    saveEditorSettings(settings);
    editor.updateOptions(editorOptions(settings));
    diffEditor?.updateOptions(editorOptions(settings));
    render();
  };
  const render = () => {
    document.getElementById("font-size-value").textContent = settings.fontSize;
    document.getElementById("word-wrap-setting").checked = settings.wordWrap;
    document.getElementById("minimap-setting").checked = settings.minimap;
  };

  popover.querySelectorAll("[data-step]").forEach((stepButton) => {
    stepButton.onclick = () => {
      const size = settings.fontSize + Number(stepButton.dataset.step);
      apply({ fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size)) });
    };
  });
  document.getElementById("word-wrap-setting").onchange = (e) => apply({ wordWrap: e.target.checked });
  document.getElementById("minimap-setting").onchange = (e) => apply({ minimap: e.target.checked });
  render();

  button.onclick = () => popover.classList.toggle("open");
  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && !button.contains(e.target)) {
      popover.classList.remove("open");
    }
  });
}

// ---------------------------------------------------------------------------
// Diff view: the page's original code (getResetTarget(), the starter on Solve) next to
// the editor's model. Both sides share the model, so edits made in the diff view stay.
// ---------------------------------------------------------------------------

let diffEditor = null;

function toggleDiffView() {
  if (diffEditor) {
    closeDiffView();
  } else {
    openDiffView();
  }
}

function openDiffView() {
  const target = getResetTarget();
  if (!target) {
    showNotification("⚠️ Please select a problem first", "warning");
    return;
  }
  const container = document.getElementById("diff-editor");
  document.getElementById("editor").hidden = true;
  container.hidden = false;
  document.getElementById("diff-btn").classList.add("active");

  diffEditor = monaco.editor.createDiffEditor(container, {
    theme: "vs-dark",
    automaticLayout: true,
    ...editorOptions(loadEditorSettings()),
  });
  diffEditor.setModel({
    original: monaco.editor.createModel(target.code, editor.getModel().getLanguageId()),
    modified: editor.getModel(),
  });
  addRunCommands(diffEditor.getModifiedEditor());
  diffEditor.getModifiedEditor().focus();
}

function closeDiffView() {
  if (!diffEditor) return;
  const original = diffEditor.getModel().original;
  diffEditor.dispose();
  original.dispose();  // the modified side is the editor's own model: keep it
  diffEditor = null;
  document.getElementById("diff-editor").hidden = true;
  document.getElementById("editor").hidden = false;
  document.getElementById("diff-btn").classList.remove("active");
  editor.layout();
  editor.focus();
}

// ---------------------------------------------------------------------------
// Error marks: lines named in a Python traceback or a Java compile error get a
// red squiggle in the editor, with the error message on hover.
// ---------------------------------------------------------------------------

const ERROR_MARKER_OWNER = "codebox-run";

// Errors in `text` that point into `filename`: [{ line, message }], one per line.
// Python: the innermost `File ".../name", line N` frame, message = last line of the
// traceback. Java: `Name.java:N: error: message` (filename is sent without ".java").
function findErrorLines(text, filename) {
  const found = new Map();
  const lines = text.split("\n");

  let pythonLine = null;
  for (const line of lines) {
    const frame = line.match(/^\s*File "([^"]*)", line (\d+)/);
    if (frame && extractFilename(frame[1]) === filename) {
      pythonLine = Number(frame[2]);
    }
  }
  const message = lines.map((line) => line.trim()).filter(Boolean).at(-1);
  if (pythonLine && message) {
    found.set(pythonLine, message);
  }

  const javaName = filename.replace(/\.java$/, "") + ".java";
  for (const line of lines) {
    const java = line.match(/^(?:.*\/)?([^/:]+\.java):(\d+): error: (.*)$/);
    if (java && java[1] === javaName && !found.has(Number(java[2]))) {
      found.set(Number(java[2]), java[3]);
    }
  }

  return [...found].map(([line, message]) => ({ line, message }));
}

// Marks the lines of every error text in `texts` (stderr, test errors) that point into `filename`.
function showErrorMarkers(texts, filename) {
  const model = editor.getModel();
  const byLine = new Map();
  for (const text of texts) {
    if (!text) continue;
    for (const { line, message } of findErrorLines(text, filename)) {
      if (line <= model.getLineCount() && !byLine.has(line)) byLine.set(line, message);
    }
  }
  const markers = [...byLine].map(([line, message]) => ({
    severity: monaco.MarkerSeverity.Error,
    message,
    startLineNumber: line,
    startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
    endLineNumber: line,
    endColumn: model.getLineMaxColumn(line),
  }));
  monaco.editor.setModelMarkers(model, ERROR_MARKER_OWNER, markers);
}

function clearErrorMarkers() {
  if (editor) monaco.editor.setModelMarkers(editor.getModel(), ERROR_MARKER_OWNER, []);
}

function initializeWindowResize() {
  let resizeTimeout;

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (editor) {
        editor.layout();
      }
    }, 100);
  });
}

function getHashTag() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}

function extractFilename(filePath) {
  return filePath.split("/").pop();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

const PISTON_EXECUTE_URL = window.location.hostname === "localhost"
  ? "/api/v2/execute"
  : "https://piston.vladflore.tech/api/v2/execute";

const RUNTIME_VERSIONS = { python: "3.12.0", java: "15.0.2" };

async function executeOnPiston(lang, files) {
  const response = await fetch(PISTON_EXECUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: lang,
      version: RUNTIME_VERSIONS[lang],
      files,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = "";
    try {
      detail = "\n" + JSON.parse(text).message;
    } catch {
      if (text) detail = "\n" + text;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}${detail}`);
  }

  return response.json();
}

let resetConfirmTimeout;

function restoreResetButton() {
  const btn = document.getElementById("reset-btn");
  btn.classList.remove("confirm");
  btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Reset';
}

// Puts back the page's original code: getResetTarget() returns { code, message } or null.
function resetCode() {
  const target = getResetTarget();
  if (!target) return;

  // Two-click confirm instead of a blocking confirm() dialog.
  const btn = document.getElementById("reset-btn");
  if (!btn.classList.contains("confirm")) {
    btn.classList.add("confirm");
    btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Confirm reset';
    resetConfirmTimeout = setTimeout(restoreResetButton, 3000);
    return;
  }

  clearTimeout(resetConfirmTimeout);
  restoreResetButton();

  // executeEdits keeps the undo stack, so Ctrl/⌘+Z brings the code back.
  const model = editor.getModel();
  editor.pushUndoStop();
  editor.executeEdits("reset-code", [{ range: model.getFullModelRange(), text: target.code }]);
  editor.pushUndoStop();
  clearErrorMarkers();
  document.getElementById("output").textContent = "";
  showNotification(`${target.message} (undo with Ctrl/⌘+Z)`, "info");
}

// Saves the editor contents as a file. getDownloadName() returns the file name, or null
// when nothing is open.
function downloadCode() {
  const name = getDownloadName();
  if (!name) {
    showNotification("⚠️ Please select a problem first", "warning");
    return;
  }
  const url = URL.createObjectURL(new Blob([editor.getValue()], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Plain run output; self-checking solutions print "PASS ..." / "FAIL ..." lines and an
// "N/M passed" summary, which get coloured.
function renderRunOutput(text) {
  const lines = text.replace(/\n$/, "").split("\n");
  const failed = lines.some((line) => line.startsWith("FAIL"));
  const lineClass = (line) => {
    if (line.startsWith("PASS")) return "run-pass";
    if (line.startsWith("FAIL")) return "run-fail";
    const summary = line.match(/^(\d+)\/(\d+) passed$/);
    if (summary) return summary[1] === summary[2] ? "run-pass run-summary" : "run-fail run-summary";
    return "";
  };
  const body = lines
    .map((line) => `<span class="${lineClass(line)}">${escapeHtml(line)}</span>`)
    .join("\n");
  const title = failed ? "❌ Output (some checks failed):" : "✅ Output:";
  return `<div class="run-output${failed ? " has-failures" : ""}">${title}\n${body}</div>`;
}

// Runs the editor contents as a plain script. The page's getRunTarget()
// returns { lang, filename } or null when nothing is open.
async function runCode() {
  const target = getRunTarget();
  if (!target) {
    showNotification("⚠️ Please select a problem first", "warning");
    return;
  }

  const code = editor.getValue().trim();
  if (!code) {
    showNotification("⚠️ No code to execute", "warning");
    return;
  }

  if (!target.lang) {
    document.getElementById("output").textContent = "❌ Unsupported file type";
    return;
  }

  const outputElement = document.getElementById("output");
  const runButton = document.getElementById("run-btn");

  outputElement.textContent = "⏳ Executing code...";
  runButton.disabled = true;
  runButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Running...';
  clearErrorMarkers();

  try {
    const result = await executeOnPiston(target.lang, [
      { name: target.filename, content: code },
    ]);

    // Java compile errors come back in the compile stage, not the run stage.
    showErrorMarkers([result.compile?.stderr, result.run?.stderr], target.filename);

    if (result.run.stderr) {
      outputElement.innerHTML = `<div style="color: #ff6b6b;">❌ Error:\n${escapeHtml(result.run.stderr)}</div>`;
      showNotification("Code execution failed", "error");
    } else if (result.run.output) {
      outputElement.innerHTML = renderRunOutput(result.run.output);
    } else {
      outputElement.textContent = "✅ Code executed successfully (no output)";
    }
  } catch (error) {
    console.error("Execution error:", error);
    outputElement.innerHTML = `<div style="color: #ff6b6b;">❌ Network Error: ${escapeHtml(error.message)}</div>`;
    showNotification("Failed to execute code", "error");
  } finally {
    runButton.disabled = false;
    runButton.innerHTML = '<i class="bi bi-play-fill"></i> Run';
  }
}

// One help text for Solve and Study; each page has an empty #info-popup.
const INFO_HTML = `
  <button class="close-btn" onclick="hideInfoPopup()" aria-label="Close"><i class="bi bi-x"></i></button>
  <h4>Solve</h4>
  <p>Practice exercises. <b>Run tests</b> checks your code, <b>Run</b> just runs it.
  Code is saved in this browser. The <b>Mentor</b> gives hints, not answers.</p>
  <h4>Study</h4>
  <p>Solved problems in Python and Java with explanations. Edits aren't saved.</p>
  <h4><i class="bi bi-keyboard"></i> Shortcuts</h4>
  <dl class="shortcuts">
    <dt>Ctrl/⌘+Enter</dt><dd>Run tests (Solve), Run (Study)</dd>
    <dt>Ctrl/⌘+Shift+Enter</dt><dd>Run</dd>
    <dt>Shift+T</dt><dd>Run tests (outside the editor)</dd>
    <dt>Shift+R</dt><dd>Run (outside the editor)</dd>
    <dt>Ctrl/⌘+E</dt><dd>Toggle details</dd>
    <dt>Ctrl/⌘+S</dt><dd>Download code</dd>
    <dt>Ctrl/⌘+F</dt><dd>Search (Study)</dd>
    <dt>Ctrl/⌘+I</dt><dd>This help</dd>
  </dl>`;

// Stamped into the page by tools/build.py; "0.0.0-dev" when served unbuilt.
const APP_VERSION = document.querySelector('meta[name="codebox-version"]')?.content ?? "";

document.addEventListener("DOMContentLoaded", () => {
  const popup = document.getElementById("info-popup");
  if (popup) {
    popup.innerHTML = INFO_HTML + `<p class="info-version">CodeBox v${escapeHtml(APP_VERSION)}</p>`;
  }
});

function toggleInfoPopup() {
  const popup = document.getElementById("info-popup");
  if (popup.style.display === "none" || popup.style.display === "") {
    showInfoPopup();
  } else {
    hideInfoPopup();
  }
}

function showInfoPopup() {
  document.getElementById("info-popup").style.display = "block";
}

function hideInfoPopup() {
  document.getElementById("info-popup").style.display = "none";
}

document.addEventListener("click", function (event) {
  const popup = document.getElementById("info-popup");
  const icon = document.getElementById("info-icon");

  if (
    popup.style.display === "block" &&
    !popup.contains(event.target) &&
    !icon.contains(event.target)
  ) {
    hideInfoPopup();
  }
});

let isPanelCollapsed = false;
const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 600;

function togglePanel() {
  isPanelCollapsed = document.getElementById("collapsible-panel").classList.toggle("collapsed");
}

function initializePanelResize() {
  const handle = document.getElementById("panel-resize-handle");
  const panel = document.getElementById("collapsible-panel");
  let startX, startWidth, nextWidth;
  let frame = 0;

  // One width change per animation frame; Monaco's automaticLayout follows on its own.
  const applyWidth = () => {
    frame = 0;
    panel.style.width = nextWidth + "px";
  };

  handle.addEventListener("pointerdown", (e) => {
    if (isPanelCollapsed || e.button !== 0) return;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    // The width transition is for collapse/expand; while dragging it makes the panel lag the pointer.
    panel.classList.add("resizing");
    document.body.classList.add("panel-resizing");
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    nextWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + e.clientX - startX));
    if (!frame) frame = requestAnimationFrame(applyWidth);
  });

  const stop = (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    panel.classList.remove("resizing");
    document.body.classList.remove("panel-resizing");
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

// True while the user is typing: form fields, and the editor (Monaco types into a
// contenteditable DIV, not a textarea). Plain-key shortcuts like Shift+R must not fire there.
function isTypingTarget(target) {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest?.(".monaco-editor") != null
  );
}

// Shortcuts shared by both pages; page scripts add their own listeners.
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  // Ctrl/⌘ shortcuts also work inside the editor (e.g. Ctrl+S to download).
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "e":
        e.preventDefault();
        togglePanel();
        break;
      case "i":
        e.preventDefault();
        toggleInfoPopup();
        break;
      case "s":
        e.preventDefault();
        downloadCode();
        break;
      case "enter":
        // Inside the editor, its own commands handle these (see initEditor).
        if (e.target.closest?.(".monaco-editor")) break;
        e.preventDefault();
        if (e.shiftKey) {
          runCode();
        } else {
          runPrimary();
        }
        break;
    }
  }

  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r" && !isTypingTarget(e.target)) {
    e.preventDefault();
    runCode();
  }
});
