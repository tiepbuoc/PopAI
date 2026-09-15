/**
 * POP-AI Cloud Functions
 * ----------------------
 * Trợ lý AI THẬT cho học sinh: đọc dữ liệu kế hoạch + nhật ký + tự đánh giá
 * của đúng học sinh đang gọi (context.auth.uid), ghép thành ngữ cảnh, rồi
 * gọi một LLM thật (endpoint kiểu OpenAI Chat Completions) để sinh phản hồi
 * cá nhân hóa — KHÔNG còn if/else cố định.
 *
 * API key được lưu dưới dạng Secret của Firebase Functions (KHÔNG nằm trong
 * code, KHÔNG gửi xuống client) — xem hướng dẫn thiết lập trong README.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ---- Secret: đặt bằng `firebase functions:secrets:set POPAI_API_KEY` ----
const POPAI_API_KEY = defineSecret("POPAI_API_KEY");

// Cấu hình endpoint/model — có thể đổi nếu bạn dùng nhà cung cấp khác,
// miễn là API tương thích chuẩn OpenAI Chat Completions.
const API_URL = "https://api.shopaikey.com/v1/chat/completions";
const MODEL = "gpt-5.4-nano";

const MAX_HISTORY_MESSAGES = 12; // số lượt hội thoại gần nhất giữ lại làm ngữ cảnh
const MAX_USER_MESSAGE_LEN = 1000;

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateKeyOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayKey(d);
}

/**
 * Gom dữ liệu thật của học sinh làm ngữ cảnh cho LLM: kế hoạch hiện tại,
 * nhật ký 7 ngày gần nhất, lần tự đánh giá gần nhất, thời gian xem video
 * ngắn hôm nay. Đây chính là phần khiến phản hồi "cá nhân hóa thật sự"
 * thay vì một template chung cho mọi học sinh.
 */
async function buildStudentContext(uid) {
  const [planSnap, usageSnap, assessSnap, journalDocs] = await Promise.all([
    db.doc(`plans/${uid}`).get(),
    db.doc(`usageData/${uid}/daily/${todayKey()}`).get(),
    db.collection(`assessments/${uid}/entries`).orderBy("createdAt", "desc").limit(1).get(),
    Promise.all(
      Array.from({ length: 7 }, (_, i) => db.doc(`journals/${uid}/entries/${dateKeyOffset(-i)}`).get())
    )
  ]);

  const plan = planSnap.exists ? planSnap.data() : null;
  const todayShortVideoMin = usageSnap.exists ? Math.round((usageSnap.data().totalSeconds || 0) / 60) : null;
  const assessment = assessSnap.empty ? null : assessSnap.docs[0].data();

  const journalLines = [];
  journalDocs.forEach((snap, i) => {
    if (!snap.exists) return;
    const j = snap.data();
    journalLines.push(
      `- ${dateKeyOffset(-i)}: video ngắn ${j.shortVideoMin ?? "?"} phút, ` +
      `tập trung ${j.totalFocusMin ?? "?"} phút (${j.focusSessionsCompleted ?? 0} phiên), ` +
      `gián đoạn ${j.interruptions ?? 0} lần, hoàn thành nhiệm vụ ${j.taskCompletion ?? "?"}/5, ` +
      `cảm nhận tập trung ${j.feeling ?? "?"}/5` +
      (j.wentWell ? `. Điều tốt: "${String(j.wentWell).slice(0, 120)}"` : "") +
      (j.toImprove ? `. Cần cải thiện: "${String(j.toImprove).slice(0, 120)}"` : "")
    );
  });

  const parts = [];
  parts.push("=== DỮ LIỆU THẬT CỦA HỌC SINH NÀY (dùng để cá nhân hóa câu trả lời) ===");
  if (plan) {
    parts.push(
      `Kế hoạch hiện tại: mục tiêu giảm video ngắn xuống ${plan.targetShortVideoMin ?? "?"} phút/ngày ` +
      `(hiện đang ở mức ${plan.currentShortVideoMin ?? "?"} phút/ngày), ` +
      `${plan.sessionsPerDay ?? "?"} phiên tập trung ${plan.sessionLength ?? "?"} phút/phiên, ` +
      (plan.phoneFreeStart ? `không dùng điện thoại từ ${plan.phoneFreeStart} đến ${plan.phoneFreeEnd || "?"}, ` : "") +
      `nhiệm vụ quan trọng nhất: "${plan.topTask || "chưa ghi"}".`
    );
  } else {
    parts.push("Học sinh chưa lập kế hoạch trong mục Tối ưu hóa.");
  }
  if (todayShortVideoMin !== null) {
    parts.push(`Hôm nay đã xem video ngắn: ${todayShortVideoMin} phút (theo tiện ích trình duyệt).`);
  }
  if (assessment) {
    parts.push(`Lần tự đánh giá gần nhất: điểm ${assessment.score}/50, mức nguy cơ "${assessment.riskLevel}".`);
  }
  if (journalLines.length) {
    parts.push("Nhật ký gần đây (mới nhất trước):");
    parts.push(...journalLines);
  } else {
    parts.push("Chưa có nhật ký nào được ghi.");
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = `Bạn là "Trợ lý POP-AI" — một người hướng dẫn đồng hành thân thiện cho học sinh THPT/THCS
trong chương trình POP-AI (Prevent - Optimize - Perform), giúp các em giảm thói quen xem video ngắn
(TikTok/Shorts/Reels) và rèn khả năng tập trung học tập.

Nguyên tắc trả lời:
- Luôn dựa vào DỮ LIỆU THẬT của đúng học sinh được cung cấp bên dưới — không đưa lời khuyên chung chung,
  không bịa số liệu không có trong dữ liệu.
- Giọng văn: gần gũi, khích lệ, không phán xét, không giáo điều. Coi học sinh là người đang cố gắng,
  không phải người đang thất bại.
- Đưa ra tối đa 1-2 gợi ý HÀNH ĐỘNG CỤ THỂ, khả thi trong ngày hôm nay hoặc ngày mai — không liệt kê
  danh sách dài lý thuyết.
- Nếu số liệu cho thấy học sinh đang tiến bộ, hãy công nhận điều đó trước khi góp ý thêm.
- Nếu học sinh hỏi ngoài phạm vi (bài tập môn học, chuyện cá nhân không liên quan), vẫn trả lời tử tế
  và ngắn gọn, rồi nhẹ nhàng lái về mục tiêu tập trung/giảm lướt nếu phù hợp.
- Không đưa ra chẩn đoán y khoa/tâm lý. Đây là công cụ giáo dục, không thay thế chuyên gia.
- Trả lời bằng tiếng Việt, độ dài khoảng 3-6 câu trừ khi học sinh yêu cầu chi tiết hơn.`;

exports.askPopAI = onCall({ secrets: [POPAI_API_KEY], cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập để dùng trợ lý AI.");
  }
  const uid = request.auth.uid;
  const userMessage = String(request.data?.message || "").trim();
  if (!userMessage) {
    throw new HttpsError("invalid-argument", "Thiếu nội dung tin nhắn.");
  }
  if (userMessage.length > MAX_USER_MESSAGE_LEN) {
    throw new HttpsError("invalid-argument", `Tin nhắn quá dài (tối đa ${MAX_USER_MESSAGE_LEN} ký tự).`);
  }

  // Chỉ phục vụ role "student" — trợ lý cá nhân hóa dữ liệu học sinh
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists || userSnap.data().role !== "student") {
    throw new HttpsError("permission-denied", "Trợ lý AI hiện chỉ dành cho học sinh.");
  }

  const chatRef = db.collection(`assistantChats/${uid}/messages`);

  const [studentContext, historySnap] = await Promise.all([
    buildStudentContext(uid),
    chatRef.orderBy("createdAt", "desc").limit(MAX_HISTORY_MESSAGES).get()
  ]);

  const history = historySnap.docs.reverse().map(d => ({
    role: d.data().role,
    content: d.data().content
  }));

  const messages = [
    { role: "system", content: SYSTEM_PROMPT + "\n\n" + studentContext },
    ...history,
    { role: "user", content: userMessage }
  ];

  let replyText;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${POPAI_API_KEY.value()}`
      },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 500 })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("POP-AI LLM lỗi HTTP", res.status, errText);
      throw new HttpsError("internal", "Trợ lý AI đang gặp sự cố, thử lại sau ít phút nhé.");
    }
    const data = await res.json();
    replyText = data.choices?.[0]?.message?.content?.trim();
    if (!replyText) throw new Error("empty completion");
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("POP-AI LLM exception", e);
    throw new HttpsError("internal", "Trợ lý AI đang gặp sự cố, thử lại sau ít phút nhé.");
  }

  // Lưu lại hội thoại để có ngữ cảnh cho lần hỏi sau + giáo viên/nghiên cứu có thể xem xu hướng
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  batch.set(chatRef.doc(), { role: "user", content: userMessage, createdAt: now });
  batch.set(chatRef.doc(), { role: "assistant", content: replyText, createdAt: now });
  await batch.commit();

  return { reply: replyText };
});
