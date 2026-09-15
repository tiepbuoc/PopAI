// POP-AI — content script "behavioral friction"
// Không chặn cứng trang: chỉ hiện một lớp phủ mờ hỏi học sinh có muốn dừng lại
// không, kèm lối thoát rõ ràng (đóng / xem thêm 10 phút / mở Đồng hồ tập trung).
// Chạy trong ISOLATED world, dùng Shadow DOM để không bị CSS của trang đè lên.

const SNOOZE_KEY = "pop_ai_friction_snoozed_until";
const HOST_ID = "pop-ai-friction-host";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "FRICTION_SHOW") {
    maybeShowOverlay(msg.minutes, msg.target, msg.appUrl);
  }
});

async function maybeShowOverlay(minutes, target, appUrl) {
  if (document.getElementById(HOST_ID)) return; // đã hiện rồi, tránh trùng

  const { [SNOOZE_KEY]: snoozeUntil } = await chrome.storage.local.get(SNOOZE_KEY);
  if (snoozeUntil && Date.now() < snoozeUntil) return; // học sinh vừa bấm "xem thêm 10 phút"

  renderOverlay(minutes, target, appUrl);
}

function renderOverlay(minutes, target, appUrl) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      .backdrop{
        position:fixed;inset:0;
        background:rgba(20,24,22,0.55);
        backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        animation:fadeIn .18s ease;
      }
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      .card{
        width:min(380px,90vw);
        background:#FFFFFF;color:#1F2A24;
        border-radius:20px;padding:26px 24px;
        box-shadow:0 20px 60px rgba(0,0,0,0.35);
        position:relative;
      }
      .close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:18px;color:#5B6961;cursor:pointer;}
      .eyebrow{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#B5533C;margin-bottom:8px;}
      h2{font-size:18px;margin:0 0 10px;line-height:1.4;}
      p{font-size:13.5px;line-height:1.55;color:#5B6961;margin:0 0 18px;}
      .actions{display:flex;flex-direction:column;gap:10px;}
      button.primary, button.secondary{
        border:none;border-radius:999px;padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;width:100%;
      }
      button.primary{background:#3E7C6B;color:#fff;}
      button.secondary{background:#EDEFEA;color:#1F2A24;}
    </style>
    <div class="backdrop">
      <div class="card">
        <button class="close" title="Đóng">✕</button>
        <div class="eyebrow">POP-AI • Nhắc nhở đúng lúc</div>
        <h2>Bạn đã xem ${minutes} phút hôm nay, vượt mục tiêu ${target} phút trong kế hoạch.</h2>
        <p>Đây chỉ là một lời nhắc — bạn tự quyết định. Tiếp tục xem, hay dừng lại và bắt đầu một phiên tập trung ngắn?</p>
        <div class="actions">
          <button class="primary" data-action="focus">Dừng lại — Mở Đồng hồ tập trung</button>
          <button class="secondary" data-action="snooze">Xem thêm 10 phút nữa</button>
        </div>
      </div>
    </div>
  `;

  const remove = () => host.remove();

  shadow.querySelector(".close").addEventListener("click", () => {
    // đóng nhanh cũng coi như "xem thêm" ngắn để không làm phiền liên tục
    chrome.storage.local.set({ [SNOOZE_KEY]: Date.now() + 5 * 60 * 1000 });
    remove();
  });
  shadow.querySelector('[data-action="snooze"]').addEventListener("click", () => {
    chrome.storage.local.set({ [SNOOZE_KEY]: Date.now() + 10 * 60 * 1000 });
    remove();
  });
  shadow.querySelector('[data-action="focus"]').addEventListener("click", () => {
    chrome.storage.local.set({ [SNOOZE_KEY]: Date.now() + 25 * 60 * 1000 }); // đủ 1 phiên tập trung, khỏi nhắc lại
    try { document.querySelectorAll("video").forEach(v => v.pause()); } catch (e) {}
    window.open(appUrl.replace(/\/?$/, "/") + "app.html?focus=1", "_blank");
    remove();
  });
}
