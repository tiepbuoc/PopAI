const consentBox = document.getElementById("consentBox");
const loginBtn = document.getElementById("loginBtn");
const statusMsg = document.getElementById("statusMsg");

consentBox.addEventListener("change", () => {
  loginBtn.disabled = !consentBox.checked;
});

loginBtn.addEventListener("click", () => {
  loginBtn.disabled = true;
  loginBtn.textContent = "Đang đăng nhập...";
  chrome.runtime.sendMessage({ type: "LOGIN" }, (res) => {
    if (res && res.ok) {
      refreshView();
    } else {
      statusMsg.textContent = "Đăng nhập thất bại: " + (res?.error || "vui lòng thử lại.");
      loginBtn.disabled = false;
      loginBtn.textContent = "Đăng nhập bằng Google";
    }
  });
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "LOGOUT" }, () => refreshView());
});

function refreshView() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
    if (res && res.loggedIn) {
      document.getElementById("loggedOutView").style.display = "none";
      document.getElementById("loggedInView").style.display = "block";
      document.getElementById("accountEmail").textContent = res.email || res.displayName || "";
      document.getElementById("todayMin").textContent = res.todayMinutes;
    } else {
      document.getElementById("loggedOutView").style.display = "block";
      document.getElementById("loggedInView").style.display = "none";
    }
  });
}

refreshView();
