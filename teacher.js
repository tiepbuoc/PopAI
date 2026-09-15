import {
  auth, db, signOut, onAuthStateChanged, doc, getDoc, setDoc, collection,
  addDoc, query, where, getDocs, orderBy, serverTimestamp, genJoinCode, toast, onSnapshot
} from "./firebase.js";

import {
  pairUp, descriptives, pairedTTest, wilcoxonSignedRank,
  recommendTest, interpretEffect, formatP, mean
} from "./stats.js";

let currentUser = null;
let classes = [];
let activeClassId = null;
let liveUnsubscribe = null;
let liveDocs = [];
let liveTickInterval = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "teacher") {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  const name = snap.data().displayName || user.email || "Giáo viên";
  document.getElementById("userName").textContent = name;
  document.getElementById("userInitial").textContent = name.charAt(0).toUpperCase();
  await loadClasses();
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

async function loadClasses() {
  const q = query(collection(db, "classes"), where("teacherId", "==", currentUser.uid));
  const snap = await getDocs(q);
  classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const select = document.getElementById("classSelect");

  if (classes.length === 0) {
    select.innerHTML = `<option>Chưa có lớp nào</option>`;
    document.getElementById("classCodeCard").style.display = "none";
    currentStudents = [];
    renderTable([]);
    updateMetrics([]);
    renderStats();
    return;
  }
  select.innerHTML = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  activeClassId = classes[0].id;
  select.value = activeClassId;
  await loadClassData();
}

document.getElementById("classSelect").addEventListener("change", async (e) => {
  activeClassId = e.target.value;
  await loadClassData();
});

document.getElementById("newClassBtn").addEventListener("click", async () => {
  const name = prompt("Tên lớp (VD: 10A1 - Ngữ văn):");
  if (!name) return;
  const joinCode = genJoinCode();
  const ref = await addDoc(collection(db, "classes"), {
    teacherId: currentUser.uid, name, joinCode, createdAt: serverTimestamp()
  });
  toast("Đã tạo lớp. Mã tham gia: " + joinCode);
  await loadClasses();
  document.getElementById("classSelect").value = ref.id;
  activeClassId = ref.id;
  await loadClassData();
});

async function loadClassData() {
  const cls = classes.find(c => c.id === activeClassId);
  if (!cls) return;
  document.getElementById("classCodeCard").style.display = "block";
  document.getElementById("joinCodeDisplay").textContent = cls.joinCode;

  const studentsSnap = await getDocs(collection(db, "classes", activeClassId, "students"));
  const students = studentsSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
  currentStudents = students;
  renderTable(students);
  updateMetrics(students);
  renderStats();
  watchLiveStatus(activeClassId);
}

// ---------------------------------------------------------------
// (4) KIỂM ĐỊNH THỐNG KÊ NGAY TRÊN DASHBOARD
// Thiết kế pre–post một nhóm: so sánh số liệu ban đầu với số liệu
// sau can thiệp trên cùng những học sinh (dữ liệu ghép cặp).
// ---------------------------------------------------------------
let currentStudents = [];

const OUTCOMES = {
  shortVideo: {
    label: "Thời gian xem video ngắn",
    unit: "phút/ngày",
    beforeKey: "baselineShortVideoMin",
    afterKey: "latestShortVideoMin",
    beforeLabel: "Trước can thiệp (kế hoạch ban đầu)",
    afterLabel: "Sau can thiệp (nhật ký gần nhất)",
    missingHint: "Học sinh cần lưu kế hoạch (mức hiện tại) và ghi ít nhất một nhật ký."
  },
  assessment: {
    label: "Điểm tự đánh giá nguy cơ",
    unit: "điểm",
    beforeKey: "baselineAssessmentScore",
    afterKey: "finalAssessmentScore",
    beforeLabel: "Lần tự đánh giá đầu tiên",
    afterLabel: "Lần tự đánh giá gần nhất",
    missingHint: "Học sinh cần làm bài tự đánh giá ít nhất hai lần (đầu và cuối chương trình)."
  }
};

document.getElementById("outcomeSelect").addEventListener("change", renderStats);

function num(x, digits = 2) {
  return Number.isFinite(x) ? x.toFixed(digits) : "—";
}

function renderStats() {
  const body = document.getElementById("statsBody");
  const outcome = OUTCOMES[document.getElementById("outcomeSelect").value];
  const { before, after } = pairUp(currentStudents, outcome.beforeKey, outcome.afterKey);

  if (before.length < 2) {
    body.innerHTML = `<p class="empty-state">Mới có ${before.length} học sinh đủ cả số liệu trước và sau — cần tối thiểu 2 cặp để kiểm định.<br><span class="muted">${outcome.missingHint}</span></p>`;
    return;
  }

  const dBefore = descriptives(before);
  const dAfter = descriptives(after);
  const diffs = before.map((b, i) => b - after[i]);
  const tt = pairedTTest(before, after);
  const wx = wilcoxonSignedRank(before, after);
  const rec = recommendTest(diffs);
  const improved = diffs.filter(d => d > 0).length;

  const descTable = `
    <table>
      <thead><tr><th>Thời điểm</th><th>n</th><th>Trung bình (M)</th><th>Độ lệch chuẩn (SD)</th><th>Trung vị</th></tr></thead>
      <tbody>
        <tr><td>${outcome.beforeLabel}</td><td>${dBefore.n}</td><td>${num(dBefore.mean)}</td><td>${num(dBefore.sd)}</td><td>${num(dBefore.median)}</td></tr>
        <tr><td>${outcome.afterLabel}</td><td>${dAfter.n}</td><td>${num(dAfter.mean)}</td><td>${num(dAfter.sd)}</td><td>${num(dAfter.median)}</td></tr>
        <tr><td><strong>Thay đổi (trước − sau)</strong></td><td>${diffs.length}</td><td><strong>${num(mean(diffs))}</strong></td><td>${num(tt.ok ? tt.sdDiff : NaN)}</td><td>${num(wx.ok ? wx.medianDiff : NaN)}</td></tr>
      </tbody>
    </table>`;

  const ttBlock = tt.ok ? `
    <div class="test-block ${rec.test === "ttest" ? "primary" : ""}">
      <div class="test-head">
        <strong>Kiểm định t ghép cặp</strong>
        ${rec.test === "ttest" ? '<span class="badge badge-low">Kiểm định chính</span>' : '<span class="badge">Tham khảo</span>'}
      </div>
      <p class="stat-readout">
        t(${tt.df}) = ${num(tt.t)}, ${formatP(tt.p)}<br>
        Chênh lệch trung bình = ${num(tt.meanDiff)} ${outcome.unit}, KTC 95% [${num(tt.ciLow)}; ${num(tt.ciHigh)}]<br>
        Cohen's d<sub>z</sub> = ${num(tt.dz)} (ảnh hưởng ${interpretEffect(tt.dz)}), Hedges' g = ${num(tt.hedgesG)}
      </p>
    </div>` : `<div class="test-block"><strong>Kiểm định t ghép cặp</strong><p class="muted">${tt.reason}</p></div>`;

  const wxBlock = wx.ok ? `
    <div class="test-block ${rec.test === "wilcoxon" ? "primary" : ""}">
      <div class="test-head">
        <strong>Wilcoxon signed-rank</strong>
        ${rec.test === "wilcoxon" ? '<span class="badge badge-low">Kiểm định chính</span>' : '<span class="badge">Tham khảo</span>'}
      </div>
      <p class="stat-readout">
        W = ${num(wx.W, 1)}, Z = ${num(wx.z)}, ${formatP(wx.p)} ${wx.exact ? "(xác suất chính xác)" : "(xấp xỉ chuẩn, có hiệu chỉnh liên tục)"}<br>
        Số cặp có thay đổi = ${wx.n}${wx.zeros ? `, bỏ qua ${wx.zeros} cặp không đổi` : ""}<br>
        Effect size r = ${num(wx.r)} (ảnh hưởng ${interpretEffect(wx.r, "r")})
      </p>
    </div>` : `<div class="test-block"><strong>Wilcoxon signed-rank</strong><p class="muted">${wx.reason}</p></div>`;

  const primary = rec.test === "ttest" ? tt : wx;
  const pVal = primary.ok ? primary.p : NaN;
  const sig = Number.isFinite(pVal) && pVal < 0.05;
  const direction = mean(diffs) > 0 ? "giảm" : "tăng";
  const effect = rec.test === "ttest"
    ? `d<sub>z</sub> = ${num(tt.dz)}`
    : `r = ${num(wx.r)}`;

  const conclusion = !primary.ok
    ? `<p class="muted">Chưa đủ điều kiện để kết luận thống kê.</p>`
    : sig
      ? `<p><strong>Kết luận:</strong> ${outcome.label} ${direction} có ý nghĩa thống kê sau can thiệp
         (${formatP(pVal)} &lt; .05; ${effect}, độ lớn ảnh hưởng ${rec.test === "ttest" ? interpretEffect(tt.dz) : interpretEffect(wx.r, "r")}).
         ${improved}/${diffs.length} học sinh có cải thiện.</p>`
      : `<p><strong>Kết luận:</strong> Chưa đủ bằng chứng thống kê cho thấy ${outcome.label.toLowerCase()} thay đổi sau can thiệp
         (${formatP(pVal)} ≥ .05). ${improved}/${diffs.length} học sinh có cải thiện — có thể do cỡ mẫu còn nhỏ hoặc thời gian can thiệp chưa đủ dài.</p>`;

  body.innerHTML = `
    ${descTable}
    <p class="muted section-gap" style="font-size:0.8rem;">Cơ sở chọn kiểm định: ${rec.reason}</p>
    <div class="test-grid">${ttBlock}${wxBlock}</div>
    <div class="conclusion-box">${conclusion}</div>
    <p class="muted" style="font-size:0.78rem;">
      Lưu ý về thiết kế: đây là nghiên cứu pre–post một nhóm, không có nhóm đối chứng, nên kết quả chưa loại trừ được
      các yếu tố khác (hiệu ứng thời gian, hiệu ứng kỳ vọng, sự kiện trong lớp). Cần phân tích sâu hơn (ANOVA lặp lại,
      hồi quy có biến kiểm soát) thì dùng nút <em>Xuất dữ liệu (.xlsx)</em> ở khối bên dưới rồi nạp vào JASP.
    </p>`;
}

// ---------------------------------------------------------------
// (3) DASHBOARD TRỰC TIẾP — realtime qua onSnapshot
// ---------------------------------------------------------------
const STATUS_LABEL = { entertainment: "Đang xem giải trí", other: "Đang ở trang khác", idle: "Tạm rời máy" };
const OFFLINE_AFTER_MS = 3 * 60 * 1000; // không cập nhật quá 3 phút -> coi như ngoại tuyến

function watchLiveStatus(classId) {
  if (liveUnsubscribe) { liveUnsubscribe(); liveUnsubscribe = null; }
  if (liveTickInterval) { clearInterval(liveTickInterval); liveTickInterval = null; }

  const q = query(collection(db, "liveStatus"), where("classId", "==", classId));
  liveUnsubscribe = onSnapshot(q, (snap) => {
    liveDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderLiveTable();
  }, (err) => console.warn("POP-AI: không nghe được liveStatus", err));

  // Cập nhật lại nhãn "cập nhật cách đây..." và tự chuyển "Ngoại tuyến" mỗi 5 giây,
  // ngay cả khi không có snapshot mới nào tới.
  liveTickInterval = setInterval(renderLiveTable, 5000);
}

function renderLiveTable() {
  const body = document.getElementById("liveTableBody");
  if (!body) return;
  if (liveDocs.length === 0) {
    body.innerHTML = `<tr><td colspan="3" class="empty-state">Chưa có dữ liệu trực tiếp — học sinh cần cài tiện ích và tham gia lớp.</td></tr>`;
    return;
  }
  const now = Date.now();
  body.innerHTML = liveDocs.map(s => {
    const updatedMs = s.updatedAt?.toDate ? s.updatedAt.toDate().getTime() : null;
    const ageSec = updatedMs ? Math.round((now - updatedMs) / 1000) : null;
    const offline = ageSec === null || now - updatedMs > OFFLINE_AFTER_MS;

    const dotClass = offline ? "offline" : s.status;
    const label = offline ? "Ngoại tuyến" : (s.status === "entertainment" ? `Đang xem ${s.sourceLabel || "video ngắn"}` : STATUS_LABEL[s.status] || "—");
    const since = ageSec === null ? "—" : ageSec < 60 ? `${ageSec} giây trước` : `${Math.round(ageSec / 60)} phút trước`;

    return `
      <tr>
        <td><strong>${s.studentCode || s.uid.slice(0, 6)}</strong></td>
        <td><span class="live-dot ${dotClass}"></span>${label}</td>
        <td class="live-since">${since}</td>
      </tr>`;
  }).join("");
}

function renderTable(students) {
  const body = document.getElementById("studentTableBody");
  if (students.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">Chưa có học sinh nào trong lớp này.</td></tr>`;
    return;
  }
  body.innerHTML = students.map(s => {
    const risk = s.riskLevel || "—";
    const badgeClass = risk === "Cao" ? "badge-high" : risk === "Trung bình" ? "badge-mid" : risk === "Thấp" ? "badge-low" : "";
    return `
      <tr>
        <td><strong>${s.studentCode || s.uid.slice(0, 6)}</strong></td>
        <td>${risk !== "—" ? `<span class="badge ${badgeClass}">${risk}</span>` : "—"}</td>
        <td>${s.baselineShortVideoMin ?? "—"} → ${s.latestShortVideoMin ?? "—"} phút</td>
        <td>${s.focusSessionsCount ?? 0}</td>
        <td>${s.interruptionsCount ?? 0}</td>
        <td>${s.completedDays ?? 0}/7</td>
        <td>${s.finalAssessmentScore ?? "—"}</td>
      </tr>`;
  }).join("");
}

function updateMetrics(students) {
  const total = students.length;
  const assessed = students.filter(s => s.riskScore !== undefined).length;
  const journalDone = students.filter(s => (s.completedDays || 0) >= 7).length;
  const avgFocus = total ? (students.reduce((a, s) => a + (s.focusSessionsCount || 0), 0) / total).toFixed(1) : 0;

  document.getElementById("mTotal").textContent = total;
  document.getElementById("mAssessed").textContent = assessed;
  document.getElementById("mJournalRate").textContent = total ? Math.round(journalDone / total * 100) + "%" : "0%";
  document.getElementById("mAvgFocus").textContent = avgFocus;
}

document.getElementById("exportBtn").addEventListener("click", async () => {
  if (!activeClassId) { toast("Chưa chọn lớp."); return; }
  const cls = classes.find(c => c.id === activeClassId);
  const studentsSnap = await getDocs(collection(db, "classes", activeClassId, "students"));
  const rows = studentsSnap.docs.map(d => {
    const s = d.data();
    return {
      "Mã học sinh": s.studentCode || d.id.slice(0, 6),
      "Lớp": cls.name,
      "Điểm nguy cơ ban đầu": s.baselineAssessmentScore ?? "",
      "Mức nguy cơ": s.riskLevel ?? "",
      "Video ngắn ban đầu (phút)": s.baselineShortVideoMin ?? "",
      "Video ngắn sau can thiệp (phút)": s.latestShortVideoMin ?? "",
      "Thời gian tập trung sau can thiệp (phút)": s.latestFocusMin ?? "",
      "Số phiên tập trung": s.focusSessionsCount ?? 0,
      "Số lần gián đoạn": s.interruptionsCount ?? 0,
      "Số ngày hoàn thành": s.completedDays ?? 0,
      "Điểm tự đánh giá cuối chương trình": s.finalAssessmentScore ?? ""
    };
  });
  if (rows.length === 0) { toast("Chưa có dữ liệu để xuất."); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "POP-AI");
  XLSX.writeFile(wb, `pop-ai_${cls.name.replace(/\s+/g, "_")}.xlsx`);
});
