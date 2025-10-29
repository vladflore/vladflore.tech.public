const GITHUB_USER = "vladflore";
const GITHUB_REPO = "coding-challenges";
const GITHUB_BRANCH = "refactor";

let currentFile = null;
let files = [];
let filteredFiles = [];
let editor;
let isResizing = false;
let searchTerm = "";

function initializeResize() {
  const resizeHandle = document.getElementById("resize-handle");
  const sidebar = document.getElementById("sidebar");

  let startX, startWidth;

  resizeHandle.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(
      document.defaultView.getComputedStyle(sidebar).width,
      10
    );

    resizeHandle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const width = startWidth + e.clientX - startX;
    const minWidth = 100;
    const maxWidth = 600;

    if (width >= minWidth && width <= maxWidth) {
      sidebar.style.width = width + "px";
      if (editor) {
        requestAnimationFrame(() => {
          editor.layout();
        });
      }
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (editor) {
        editor.layout();
      }
    }
  });
}

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
  initializeResize();
  initializeWindowResize();
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
  const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  files = data.tree.filter(
    (f) =>
      f.type === "blob" && (f.path.endsWith(".py") || f.path.endsWith(".java"))
  );
  filteredFiles = [...files];
  renderFileList();
}

function extractFilename(filePath) {
  return filePath.split("/").pop();
}

function renderFileList() {
  const container = document.getElementById("files");
  container.innerHTML = "";
  filteredFiles.forEach((f) => {
    const btn = document.createElement("button");
    btn.textContent = extractFilename(f.path);
    btn.onclick = () => loadFile(f.path);
    if (f.path === currentFile) btn.classList.add("active");
    container.appendChild(btn);
  });

  if (filteredFiles.length === 0 && searchTerm) {
    const noResults = document.createElement("div");
    noResults.style.color = "#888";
    noResults.style.padding = "10px 0";
    noResults.style.fontSize = "14px";
    noResults.textContent = "No files found";
    container.appendChild(noResults);
  }
}

async function loadFile(path) {
  currentFile = path;
  document.getElementById("currentFile").textContent = path;
  renderFileList();

  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
  const content = await fetch(rawUrl).then((r) => r.text());

  editor.setValue(content);
  const lang = path.endsWith(".py")
    ? "python"
    : path.endsWith(".java")
    ? "java"
    : "plaintext";
  monaco.editor.setModelLanguage(editor.getModel(), lang);
}

async function runCode() {
  if (!currentFile) {
    alert("Select a file first!");
    return;
  }

  const code = editor.getValue();
  const lang = currentFile.endsWith(".py")
    ? "python"
    : currentFile.endsWith(".java")
    ? "java"
    : null;
  if (!lang) {
    document.getElementById("output").textContent = "❌ Unsupported file type";
    return;
  }

  document.getElementById("output").textContent = "⏳ Running...";
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

  const result = await response.json();
  document.getElementById("output").textContent =
    result.run.output || "✅ No output";
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
