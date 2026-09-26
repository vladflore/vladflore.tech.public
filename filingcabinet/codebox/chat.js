// Mentor chat on the Solve page. Talks to POST /api/chat on the local server
// (server/chat.py). The public site has no server yet, so it shows a teaser instead.

// How the Mentor panel behaves on this host:
//   "live"   working chat (needs /api/chat, i.e. the local server)
//   "teaser" the panel with a "coming soon" overlay; nothing is ever sent
//   "off"    no panel at all
// Switch the public value to "live" once the public Mentor exists (docs/PLAN.md, Milestone 6).
// Locally, ?mentor=teaser (or live / off) previews another mode, e.g. solve.html?mentor=teaser#two-sum.
const MENTOR_MODE = mentorMode();

function mentorMode() {
  if (window.location.hostname !== "localhost") return "teaser";
  const requested = new URLSearchParams(window.location.search).get("mentor");
  return ["live", "teaser", "off"].includes(requested) ? requested : "live";
}
const CHAT_AVAILABLE = MENTOR_MODE === "live";

const chats = {}; // slug -> [{ role: "user" | "assistant" | "error", content, hintLevel?, pending?, stopped? }]
const hintLevels = {}; // slug -> highest hint level unlocked (0-5), sent with every message
const MAX_HINT_LEVEL = 5;
const HINT_REQUEST = "Give me a hint.";
let chatController = null; // AbortController of the reply being streamed
const CHAT_COLLAPSED_KEY = "codebox:chat-collapsed";

function initChat() {
  if (MENTOR_MODE === "off") {
    document.body.classList.add("no-chat");
    return;
  }
  try {
    document.body.classList.toggle("chat-collapsed", localStorage.getItem(CHAT_COLLAPSED_KEY) === "1");
  } catch {
    // No storage: start expanded.
  }
  document.getElementById("chat-panel").addEventListener("transitionend", layoutEditor);
  if (MENTOR_MODE === "teaser") {
    renderMentorTeaser();
    return;
  }
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  renderChat();
}

// Collapses the panel to a strip on the right edge, or expands it back; remembered per browser.
function toggleChatPanel() {
  const collapsed = document.body.classList.toggle("chat-collapsed");
  try {
    localStorage.setItem(CHAT_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (error) {
    console.warn("Could not save mentor panel state:", error);
  }
  if (!collapsed) document.getElementById("chat-input").focus();
  layoutEditor();
}

function layoutEditor() {
  if (typeof editor !== "undefined" && editor) editor.layout();
}

// Sample exchange shown blurred behind the teaser card: what the Mentor will feel like.
const TEASER_SAMPLE = [
  { role: "user", content: "Why does my code fail on [3, 3] with target 6?" },
  {
    role: "assistant",
    content:
      "Look at the failing test: your inner loop starts at `i`, so each number is paired with itself. What should `j` start from?",
  },
  { role: "user", content: "Give me a hint.", hintLevel: 1 },
  {
    role: "assistant",
    content: "Could you remember the numbers you've already seen? Which data structure gives fast lookups?",
  },
];

function renderMentorTeaser() {
  document.body.classList.add("mentor-teaser");
  const soon = '<span class="soon-badge">soon</span>';
  document.querySelector("#chat-header > span").insertAdjacentHTML("beforeend", soon);
  document.querySelector("#chat-expand > span").insertAdjacentHTML("beforeend", soon);

  document.getElementById("chat-messages").innerHTML = `
    <div class="teaser-sample" aria-hidden="true">${TEASER_SAMPLE.map(renderChatMessage).join("")}</div>
    <div class="teaser-card">
      <i class="bi bi-mortarboard"></i>
      <h4>AI Mentor</h4>
      <p class="teaser-soon">Coming soon</p>
      <ul>
        <li>sees your code and your test results</li>
        <li>hints step by step, never the full answer</li>
        <li>reviews your solution when you're done</li>
      </ul>
    </div>`;

  const input = document.getElementById("chat-input");
  input.disabled = true;
  input.placeholder = "The mentor is coming soon";
  for (const id of ["chat-send", "chat-hint", "chat-clear"]) {
    document.getElementById(id).disabled = true;
  }
  document.getElementById("chat-hint").title = "Coming soon";
}

function currentChat() {
  if (!currentProblem) return null;
  chats[currentProblem.slug] ??= [];
  return chats[currentProblem.slug];
}

// Replies are model output: sanitize, and drop tags that could load remote content
// (images can leak data via their URL) or restyle the page.
const CHAT_FORBIDDEN_TAGS = ["img", "style", "form", "input", "button", "iframe"];

// Links in replies open in a new tab, so the page (code, chat) stays.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

function currentHintLevel() {
  return currentProblem ? (hintLevels[currentProblem.slug] ?? 0) : 0;
}

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text), { FORBID_TAGS: CHAT_FORBIDDEN_TAGS });
}

function renderChatMessage(message) {
  if (message.role === "error") {
    return `<div class="chat-msg error"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(message.content)}</div>`;
  }
  if (message.role === "user" && message.hintLevel) {
    return `<div class="chat-msg user hint"><i class="bi bi-lightbulb"></i> Hint ${message.hintLevel} of ${MAX_HINT_LEVEL}</div>`;
  }
  if (message.role === "user") {
    return `<div class="chat-msg user">${escapeHtml(message.content)}</div>`;
  }
  const body = message.content
    ? renderMarkdown(message.content)
    : '<span class="chat-typing">Thinking…</span>';
  const note = message.stopped ? '<div class="chat-note">Stopped</div>' : "";
  return `<div class="chat-msg assistant">${body}${note}</div>`;
}

function renderChat() {
  if (!CHAT_AVAILABLE) return;

  const container = document.getElementById("chat-messages");
  const input = document.getElementById("chat-input");
  const messages = currentChat();

  input.disabled = !messages;
  if (!messages) {
    container.innerHTML =
      '<div class="chat-empty">Open a problem to talk to the mentor.</div>';
  } else if (messages.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <p>Stuck, or want feedback? The mentor sees your code and your last test run.</p>
        <p>It guides you with questions and hints rather than handing you the answer.</p>
        <p>Try: <em>"How should I approach this?"</em> or <em>"Why does my code fail?"</em></p>
      </div>`;
  } else {
    container.innerHTML = messages.map(renderChatMessage).join("");
  }
  container.scrollTop = container.scrollHeight;
  updateChatControls();
}

function updateChatControls() {
  const busy = chatController !== null;
  const sendButton = document.getElementById("chat-send");
  sendButton.innerHTML = busy
    ? '<i class="bi bi-stop-fill"></i>'
    : '<i class="bi bi-send"></i>';
  sendButton.title = busy ? "Stop" : "Send";
  sendButton.classList.toggle("stop", busy);
  sendButton.disabled = !busy && !currentProblem;
  document.getElementById("chat-clear").disabled = busy;

  const level = currentHintLevel();
  const hintButton = document.getElementById("chat-hint");
  hintButton.disabled = busy || !currentProblem || level >= MAX_HINT_LEVEL;
  hintButton.title =
    level >= MAX_HINT_LEVEL
      ? "All hints unlocked"
      : "Unlock the next, stronger hint";
  document.getElementById("chat-hint-level").textContent = `${level}/${MAX_HINT_LEVEL}`;
}

function onChatSendClick() {
  if (chatController) {
    chatController.abort();
  } else {
    sendChatMessage();
  }
}

// Each click unlocks one more level of the hint ladder (server/chat.py, HINT_LEVELS).
function requestHint() {
  if (!CHAT_AVAILABLE || !currentProblem || chatController) return;
  const level = currentHintLevel();
  if (level >= MAX_HINT_LEVEL) return;
  hintLevels[currentProblem.slug] = level + 1;
  sendChatMessage(HINT_REQUEST, level + 1);
}

function clearChat() {
  if (!CHAT_AVAILABLE || !currentProblem || chatController) return;
  chats[currentProblem.slug] = [];
  renderChat();
}

// Only real turns go to the server; error notes and the reply being written stay local.
function chatHistoryForServer(messages) {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m.pending && m.content)
    .map(({ role, content }) => ({ role, content }));
}

// Sends the chat input, or a hint request when hintLevel is given (see requestHint).
async function sendChatMessage(hintRequest = null, hintLevel = null) {
  const input = document.getElementById("chat-input");
  const text = hintRequest ?? input.value.trim();
  if (!CHAT_AVAILABLE || !text || !currentProblem || chatController) return;

  const problem = currentProblem;
  const messages = currentChat();
  messages.push({ role: "user", content: text, hintLevel });
  const history = chatHistoryForServer(messages);
  const reply = { role: "assistant", content: "", pending: true };
  messages.push(reply);
  if (!hintRequest) input.value = "";

  chatController = new AbortController();
  renderChat();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem_id: problem.slug,
        code: editor.getValue(),
        last_test_results: lastTestReports[problem.slug] ?? null,
        hint_level: hintLevels[problem.slug] ?? 0,
        messages: history,
      }),
      signal: chatController.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        detail = JSON.stringify(JSON.parse(text).detail);
      } catch {}
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    await readChatStream(response, (event) => {
      if (event.type === "text") {
        reply.content += event.text;
        if (currentProblem === problem) renderChat();
      } else if (event.type === "error") {
        throw new Error(event.message);
      } else if (event.type === "done" && event.stop_reason === "max_tokens") {
        reply.content += "\n\n*(reply cut off: too long)*";
      }
    });
    if (!reply.content) throw new Error("The mentor sent an empty reply.");
  } catch (error) {
    if (error.name === "AbortError") {
      reply.stopped = true;
    } else {
      console.error("Chat error:", error);
      messages.push({ role: "error", content: error.message });
    }
  } finally {
    reply.pending = false;
    if (!reply.content) {
      messages.splice(messages.indexOf(reply), 1);
      // No hint was delivered, so the level isn't spent.
      if (hintLevel) hintLevels[problem.slug] = hintLevel - 1;
    }
    chatController = null;
    if (currentProblem === problem) renderChat();
    else updateChatControls();
  }
}

// Server-sent events over a POST response: "data: {json}\n\n" per event.
async function readChatStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (chunk.startsWith("data: ")) {
        onEvent(JSON.parse(chunk.slice(6)));
      }
    }
  }
}

// Last, so every constant above is initialised before the panel is set up.
initChat();
