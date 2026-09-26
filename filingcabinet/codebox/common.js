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
      fontSize: 14,
    });
    initializeWindowResize();
    initializePanelResize();
    onReady();
  });
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

  try {
    const result = await executeOnPiston(target.lang, [
      { name: target.filename, content: code },
    ]);

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
    <dt>Shift+T</dt><dd>Run tests</dd>
    <dt>Shift+R</dt><dd>Run</dd>
    <dt>Ctrl/⌘+E</dt><dd>Toggle details</dd>
    <dt>Ctrl/⌘+S</dt><dd>Download code</dd>
    <dt>Ctrl/⌘+F</dt><dd>Search (Study)</dd>
    <dt>Ctrl/⌘+I</dt><dd>This help</dd>
  </dl>`;

document.addEventListener("DOMContentLoaded", () => {
  const popup = document.getElementById("info-popup");
  if (popup) popup.innerHTML = INFO_HTML;
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

let isPanelResizing = false;
let isPanelCollapsed = false;
let panelWidth = 250;

function updateToggleButtonPosition() {
  const toggleButton = document.getElementById("collapse-toggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarWidth = parseInt(
    document.defaultView.getComputedStyle(sidebar).width,
    10,
  );

  if (isPanelCollapsed) {
    toggleButton.style.left = sidebarWidth + 10 + "px";
    toggleButton.classList.add("collapsed");
  } else {
    toggleButton.style.left = sidebarWidth + panelWidth - 30 + "px";
    toggleButton.classList.remove("collapsed");
  }
}

function togglePanel() {
  const panel = document.getElementById("collapsible-panel");
  const icon = document.getElementById("collapse-icon");

  isPanelCollapsed = !isPanelCollapsed;

  if (isPanelCollapsed) {
    panel.classList.add("collapsed");
    icon.className = "bi bi-chevron-right";
  } else {
    panel.classList.remove("collapsed");
    panel.style.width = panelWidth + "px";
    icon.className = "bi bi-chevron-left";
  }

  updateToggleButtonPosition();

  setTimeout(() => {
    if (editor) {
      editor.layout();
    }
  }, 300);
}

function initializePanelResize() {
  const resizeHandle = document.getElementById("panel-resize-handle");
  const panel = document.getElementById("collapsible-panel");

  let startX, startWidth;

  resizeHandle.addEventListener("mousedown", (e) => {
    if (isPanelCollapsed) return;

    isPanelResizing = true;
    startX = e.clientX;
    startWidth = parseInt(
      document.defaultView.getComputedStyle(panel).width,
      10,
    );

    resizeHandle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isPanelResizing) return;

    const width = startWidth + e.clientX - startX;
    const minWidth = 200;
    const maxWidth = 600;

    if (width >= minWidth && width <= maxWidth) {
      panelWidth = width;
      panel.style.width = width + "px";
      updateToggleButtonPosition();
      if (editor) {
        requestAnimationFrame(() => {
          editor.layout();
        });
      }
    }
  });

  document.addEventListener("mouseup", () => {
    if (isPanelResizing) {
      isPanelResizing = false;
      resizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (editor) {
        editor.layout();
      }
    }
  });

  updateToggleButtonPosition();
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
    }
  }

  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r" && !isTypingTarget(e.target)) {
    e.preventDefault();
    runCode();
  }
});
