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

const GITHUB_USER = "vladflore";
const GITHUB_REPO = "coding-challenges";
const GITHUB_BRANCH = "refactor";

let currentFile = null;
let files = [];
let filteredFiles = [];
let editor;
let searchTerm = "";

require.config({
  paths: { vs: "https://unpkg.com/monaco-editor@latest/min/vs" },
});
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    fontSize: 14,
  });
  fetchRepoFiles();
  initializeWindowResize();
  initializePanelResize();
});

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

async function fetchRepoFiles() {
  try {
    showNotification("Loading repository files...", "info");

    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    files = data.tree.filter(
      (f) =>
        f.type === "blob" &&
        (f.path.endsWith(".py") || f.path.endsWith(".java"))
    );

    filteredFiles = [...files];
    renderFileList();

    showNotification(`Loaded ${files.length} files from repository`, "success");
  } catch (error) {
    console.error("Error fetching repository files:", error);
    showNotification(`Failed to load repository: ${error.message}`, "error");

    const container = document.getElementById("files");
    container.innerHTML = `
      <div style="color: #ff6b6b; padding: 10px; text-align: center;">
        <i class="bi bi-exclamation-triangle"></i><br>
        Failed to load files<br>
        <small>${error.message}</small><br><br>
        <button onclick="fetchRepoFiles()" style="background: #444; border: 1px solid #666; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
          <i class="bi bi-arrow-clockwise"></i> Retry
        </button>
      </div>
    `;
  }
}

function extractFilename(filePath) {
  return filePath.split("/").pop();
}

function updateFileCounts() {
  const pythonFiles = filteredFiles.filter((f) =>
    f.path.endsWith(".py")
  ).length;
  const javaFiles = filteredFiles.filter((f) =>
    f.path.endsWith(".java")
  ).length;
  const totalFiles = filteredFiles.length;

  const countsElement = document.getElementById("file-counts");
  if (totalFiles === 0) {
    countsElement.innerHTML = `<span style="background: #444; padding: 3px 8px; border-radius: 12px; font-size: 13px; color: #aaa;">0 files</span>`;
  } else {
    const pythonIcon =
      '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" style="width: 14px; height: 14px; margin-right: 4px; vertical-align: middle;" alt="Python">';
    const javaIcon =
      '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" style="width: 14px; height: 14px; margin-right: 4px; vertical-align: middle;" alt="Java">';

    countsElement.innerHTML = `
      <span style="background: #444; padding: 3px 8px; border-radius: 12px; font-size: 13px; color: #e0e0e0; margin-left: 8px; display: inline-flex; align-items: center; gap: 6px;">
        <span style="display: flex; align-items: center;">${pythonIcon}${pythonFiles}</span>
        <span style="display: flex; align-items: center;">${javaIcon}${javaFiles}</span>
        <span style="color: #ccc;">•</span>
        <span style="color: #4CAF50; font-weight: 500;">${totalFiles} total</span>
      </span>
    `;
  }
}

function renderFileList() {
  const container = document.getElementById("files");
  container.innerHTML = "";

  filteredFiles.forEach((f) => {
    const btn = document.createElement("button");
    const filename = extractFilename(f.path);

    let iconHtml;
    if (f.path.endsWith(".py")) {
      iconHtml =
        '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" style="width: 18px; height: 18px; margin-right: 10px; filter: drop-shadow(0 0 2px rgba(255,255,255,0.3));" alt="Python">';
    } else if (f.path.endsWith(".java")) {
      iconHtml =
        '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" style="width: 18px; height: 18px; margin-right: 10px; filter: drop-shadow(0 0 2px rgba(255,255,255,0.3));" alt="Java">';
    } else {
      iconHtml =
        '<i class="bi bi-file-earmark" style="margin-right: 10px; color: #4CAF50; font-size: 16px;"></i>';
    }

    btn.innerHTML = `${iconHtml}${filename}`;
    btn.onclick = () => loadFile(f.path);
    btn.title = f.path;

    if (f.path === currentFile) btn.classList.add("active");
    container.appendChild(btn);
  });

  if (filteredFiles.length === 0 && searchTerm) {
    const noResults = document.createElement("div");
    noResults.style.cssText =
      "color: #888; padding: 10px 0; font-size: 14px; text-align: center;";
    noResults.innerHTML = '<i class="bi bi-search"></i><br>No files found';
    container.appendChild(noResults);
  }

  updateFileCounts();
}

async function loadFile(path) {
  try {
    currentFile = path;
    document.getElementById(
      "currentFile"
    ).innerHTML = `<i class="bi bi-hourglass-split"></i> Loading ${path}...`;
    renderFileList();

    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to load file: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();

    editor.setValue(content);
    const lang = path.endsWith(".py")
      ? "python"
      : path.endsWith(".java")
      ? "java"
      : "plaintext";
    monaco.editor.setModelLanguage(editor.getModel(), lang);

    let iconHtml;
    if (path.endsWith(".py")) {
      iconHtml =
        '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" style="width: 16px; height: 16px; margin-right: 8px;" alt="Python">';
    } else if (path.endsWith(".java")) {
      iconHtml =
        '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" style="width: 16px; height: 16px; margin-right: 8px;" alt="Java">';
    } else {
      iconHtml =
        '<i class="bi bi-file-earmark-code" style="margin-right: 8px; color: #4CAF50;"></i>';
    }

    document.getElementById("currentFile").innerHTML = `${iconHtml}${path}`;

    document.getElementById("output").textContent = "";

    await loadProblemInfo(path);
  } catch (error) {
    console.error("Error loading file:", error);
    document.getElementById(
      "currentFile"
    ).innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error loading ${path}`;
    showNotification(`Failed to load file: ${error.message}`, "error");
  }
}

async function loadProblemInfo(filePath) {
  try {
    const pathParts = filePath.split("/");
    const filename = pathParts[pathParts.length - 1];
    const nameWithoutExt = filename.replace(/\.(py|java)$/, "");
    const infoFileName = nameWithoutExt + ".html";

    const infoPath = pathParts.slice(0, -1).concat(infoFileName).join("/");

    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${infoPath}`;

    const response = await fetch(rawUrl);
    if (!response.ok) {
      document.getElementById("file-info").innerHTML =
        "<p><em>No details available for this problem</em></p>";
      return;
    }

    const infoContent = await response.text();

    document.getElementById("file-info").innerHTML = `
      <div style="background: #333; padding: 12px; border-radius: 6px; font-size: 14px;">
        <pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${infoContent}</pre>
      </div>
    `;
  } catch (error) {
    console.error("Error loading problem info:", error);
    document.getElementById("file-info").innerHTML =
      "<p><em>Failed to load problem info</em></p>";
  }
}

async function runCode() {
  if (!currentFile) {
    showNotification("⚠️ Please select a file first", "warning");
    return;
  }

  const code = editor.getValue().trim();
  if (!code) {
    showNotification("⚠️ No code to execute", "warning");
    return;
  }

  const lang = currentFile.endsWith(".py")
    ? "python"
    : currentFile.endsWith(".java")
    ? "java"
    : null;

  if (!lang) {
    document.getElementById("output").textContent = "❌ Unsupported file type";
    return;
  }

  const outputElement = document.getElementById("output");
  const runButton = document.querySelector("#controls button");

  outputElement.textContent = "⏳ Executing code...";
  runButton.disabled = true;
  runButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Running...';

  try {
    const version = lang === "java" ? "15.0.2" : "3.10.0";

    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: lang,
        version,
        files: [{ name: extractFilename(currentFile), content: code }],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.run.stderr) {
      outputElement.innerHTML = `<div style="color: #ff6b6b;">❌ Error:\n${result.run.stderr}</div>`;
      showNotification("Code execution failed", "error");
    } else if (result.run.output) {
      outputElement.innerHTML = `<div style="color: #51cf66;">✅ Output:\n${result.run.output}</div>`;
    } else {
      outputElement.textContent = "✅ Code executed successfully (no output)";
    }
  } catch (error) {
    console.error("Execution error:", error);
    outputElement.innerHTML = `<div style="color: #ff6b6b;">❌ Network Error: ${error.message}</div>`;
    showNotification("Failed to execute code", "error");
  } finally {
    runButton.disabled = false;
    runButton.innerHTML = '<i class="bi bi-play-fill"></i> Run';
  }
}

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

function searchFiles() {
  const searchInput = document.getElementById("search-input");
  searchTerm = searchInput.value.trim().toLowerCase();

  if (searchTerm === "") {
    filteredFiles = [...files];
  } else {
    filteredFiles = files.filter((file) => {
      const filename = extractFilename(file.path).toLowerCase();
      return filename.includes(searchTerm);
    });
  }

  renderFileList();
  updateSearchUI();
}

function clearSearch() {
  const searchInput = document.getElementById("search-input");
  searchInput.value = "";
  searchTerm = "";
  filteredFiles = [...files];
  renderFileList();
  updateSearchUI();
  searchInput.focus();
}

function handleSearchKeyup(event) {
  if (event.key === "Enter") {
    searchFiles();
  } else if (event.key === "Escape") {
    clearSearch();
  }
}

function handleSearchInput() {
  const searchInput = document.getElementById("search-input");
  const currentValue = searchInput.value.trim();

  if (currentValue.length >= 3 || currentValue.length === 0) {
    searchFiles();
  }
}

function updateSearchUI() {
  const clearBtn = document.getElementById("clear-search");
  if (searchTerm) {
    clearBtn.classList.add("visible");
  } else {
    clearBtn.classList.remove("visible");
  }
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
    10
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
      10
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("search-input").blur();
    return;
  }

  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "f":
        e.preventDefault();
        document.getElementById("search-input").focus();
        break;
      case "e":
        e.preventDefault();
        togglePanel();
        break;
      case "i":
        e.preventDefault();
        toggleInfoPopup();
        break;
    }
  }

  if (e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    runCode();
  }
});
