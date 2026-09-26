// Study page (study.html): browse and run solved problems
// from the coding-challenges GitHub repository.

const GITHUB_USER = "vladflore";
const GITHUB_REPO = "coding-challenges";
const GITHUB_BRANCH = "refactor";

let currentFile = null;
let originalCode = null; // the file as loaded, for Reset
let files = [];
let filteredFiles = [];
let searchTerm = "";
let pendingHashOpen = null;
let loadCounter = 0; // bumped by every loadFile(); responses for an older click are ignored

initEditor(() => {
  fetchRepoFiles();
  initializeHashNavigation();
});

async function fetchRepoFiles() {
  try {
    showNotification("Loading repository files...", "info");

    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    files = data.tree.filter(
      (f) =>
        f.type === "blob" &&
        (f.path.endsWith(".py") || f.path.endsWith(".java")),
    );

    files.sort((a, b) =>
      a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
    );

    filteredFiles = [...files];
    renderFileList();
    openFromHash();

    showNotification(`Loaded ${files.length} files from repository`, "success");
  } catch (error) {
    console.error("Error fetching repository files:", error);
    showNotification(`Failed to load repository: ${escapeHtml(error.message)}`, "error");

    const container = document.getElementById("files");
    container.innerHTML = `
      <div style="color: #ff6b6b; padding: 10px; text-align: center;">
        <i class="bi bi-exclamation-triangle"></i><br>
        Failed to load files<br>
        <small>${escapeHtml(error.message)}</small><br><br>
        <button onclick="fetchRepoFiles()" style="background: #444; border: 1px solid #666; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
          <i class="bi bi-arrow-clockwise"></i> Retry
        </button>
      </div>
    `;
  }
}

function initializeHashNavigation() {
  window.addEventListener("hashchange", () => {
    if (files.length === 0) {
      pendingHashOpen = getHashTag();
      return;
    }
    openFromHash();
  });
}

function findFileByTag(tag) {
  if (!tag) return null;

  const normalizedTag = normalizeTag(tag);
  const exactPathMatch = files.find(
    (f) => normalizeTag(f.path) === normalizedTag,
  );
  if (exactPathMatch) return exactPathMatch;

  return (
    files.find((f) => {
      const filename = extractFilename(f.path);
      const nameWithoutExt = filename.replace(/\.(py|java)$/i, "");
      return normalizeTag(nameWithoutExt) === normalizedTag;
    }) || null
  );
}

function openFromHash() {
  const tag = pendingHashOpen || getHashTag();
  pendingHashOpen = null;

  if (!tag) return;

  const match = findFileByTag(tag);
  if (match) {
    loadFile(match.path);
  } else {
    showNotification(`No problem found for tag: ${escapeHtml(tag)}`, "warning");
  }
}

function updateFileCounts() {
  const pythonFiles = filteredFiles.filter((f) =>
    f.path.endsWith(".py"),
  ).length;
  const javaFiles = filteredFiles.filter((f) =>
    f.path.endsWith(".java"),
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

    btn.innerHTML = `${iconHtml}${escapeHtml(filename)}`;
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

function rawFileUrl(path) {
  return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
}

// Title above the editor for the open file (or the empty state).
function renderCurrentTitle() {
  const title = document.getElementById("currentFile");
  if (!currentFile) {
    title.textContent = "No file selected";
    return;
  }
  let iconHtml;
  if (currentFile.endsWith(".py")) {
    iconHtml =
      '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" style="width: 16px; height: 16px; margin-right: 8px;" alt="Python">';
  } else if (currentFile.endsWith(".java")) {
    iconHtml =
      '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" style="width: 16px; height: 16px; margin-right: 8px;" alt="Java">';
  } else {
    iconHtml =
      '<i class="bi bi-file-earmark-code" style="margin-right: 8px; color: #4CAF50;"></i>';
  }
  title.innerHTML = `${iconHtml}${escapeHtml(currentFile)}`;
}

// The open file only changes once the new one has loaded, so a failed load leaves the
// previous file (editor, Run, Reset) consistent, and a slow response can't overwrite a newer click.
async function loadFile(path) {
  const loadId = ++loadCounter;
  document.getElementById("currentFile").innerHTML =
    `<i class="bi bi-hourglass-split"></i> Loading ${escapeHtml(path)}...`;

  try {
    const response = await fetch(rawFileUrl(path));
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const content = await response.text();
    if (loadId !== loadCounter) return;

    currentFile = path;
    originalCode = content;
    renderFileList();
    editor.setValue(content);
    const lang = path.endsWith(".py")
      ? "python"
      : path.endsWith(".java")
        ? "java"
        : "plaintext";
    monaco.editor.setModelLanguage(editor.getModel(), lang);
    renderCurrentTitle();
    document.getElementById("output").textContent = "";

    await loadProblemInfo(path, loadId);
  } catch (error) {
    if (loadId !== loadCounter) return;
    console.error("Error loading file:", error);
    renderCurrentTitle();
    showNotification(`Failed to load ${escapeHtml(path)}: ${escapeHtml(error.message)}`, "error");
  }
}

async function loadProblemInfo(filePath, loadId) {
  try {
    const pathParts = filePath.split("/");
    const filename = pathParts[pathParts.length - 1];
    const nameWithoutExt = filename.replace(/\.(py|java)$/, "");
    const infoFileName = nameWithoutExt + ".html";

    const infoPath = pathParts.slice(0, -1).concat(infoFileName).join("/");

    const response = await fetch(rawFileUrl(infoPath));
    if (loadId !== loadCounter) return;
    if (!response.ok) {
      document.getElementById("file-info").innerHTML =
        "<p><em>No details available for this problem</em></p>";
      return;
    }

    const infoContent = await response.text();
    if (loadId !== loadCounter) return;

    document.getElementById("file-info").innerHTML = `
      <div style="background: #333; padding: 12px; border-radius: 6px; font-size: 14px;">
      <div style="margin: 0; font-family: inherit;">
        <style>
        #file-info * { margin: 1 !important; }
        </style>
        ${infoContent}
      </div>
      </div>
    `;
  } catch (error) {
    if (loadId !== loadCounter) return;
    console.error("Error loading problem info:", error);
    document.getElementById("file-info").innerHTML =
      "<p><em>Failed to load problem info</em></p>";
  }
}

function getRunTarget() {
  if (!currentFile) return null;
  const lang = currentFile.endsWith(".py")
    ? "python"
    : currentFile.endsWith(".java")
      ? "java"
      : null;
  const filename = extractFilename(currentFile);
  // Piston's Java runner renames the file to "<name>.java" itself; sending "X.java"
  // would make compile errors mention "X.java.java".
  return { lang, filename: lang === "java" ? filename.replace(/\.java$/, "") : filename };
}

function getResetTarget() {
  return originalCode === null ? null : { code: originalCode, message: "Code reset to the original solution" };
}

function getDownloadName() {
  return currentFile ? extractFilename(currentFile) : null;
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("search-input").blur();
    return;
  }

  // In the editor Ctrl/⌘+F opens the editor's own find box.
  if (isTypingTarget(e.target)) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    document.getElementById("search-input").focus();
  }
});
