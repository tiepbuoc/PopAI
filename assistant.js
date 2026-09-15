import { auth, functions, httpsCallable, onAuthStateChanged, toast } from "./firebase.js";

const chatMessagesEl = document.getElementById("chatMessages");
const chatInputEl = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");

// Callable Cloud Function — key của LLM nằm ở server (functions/index.js), không lộ ra client.
const askPopAI = httpsCallable(functions, "askPopAI");

let ready = false;
onAuthStateChanged(auth, (user) => { ready = !!user; });

function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg " + role;
  const label = document.createElement("span");
  label.className = "chat-label";
  label.textContent = role === "user" ? "Bạn" : "Trợ lý POP-AI";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  wrap.appendChild(label);
  wrap.appendChild(bubble);
  chatMessagesEl.appendChild(wrap);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return bubble;
}

async function sendChat() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  if (!ready) { toast("Đang tải phiên đăng nhập, thử lại sau 1 giây."); return; }

  addBubble("user", text);
  chatInputEl.value = "";
  autoGrow();
  chatSendBtn.disabled = true;
  const thinkingBubble = addBubble("assistant", "Đang suy nghĩ...");

  try {
    const res = await askPopAI({ message: text });
    thinkingBubble.textContent = res.data.reply;
  } catch (e) {
    thinkingBubble.textContent = "Xin lỗi, trợ lý đang gặp sự cố (" + (e.message || "lỗi không rõ") + "). Thử lại sau nhé.";
  } finally {
    chatSendBtn.disabled = false;
  }
}

chatSendBtn.addEventListener("click", sendChat);
chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
function autoGrow() {
  chatInputEl.style.height = "auto";
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 140) + "px";
}
chatInputEl.addEventListener("input", autoGrow);
