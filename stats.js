/**
 * POP-AI — Module kiểm định thống kê (thiết kế pre–post trên cùng một nhóm)
 * -----------------------------------------------------------------------
 * Dùng cho dashboard giáo viên: so sánh số liệu TRƯỚC và SAU can thiệp trên
 * cùng những học sinh (dữ liệu ghép cặp).
 *
 *  - pairedTTest        : kiểm định t ghép cặp (tham số) + Cohen's dz + Hedges' g + KTC 95%
 *  - wilcoxonSignedRank : kiểm định Wilcoxon signed-rank (phi tham số) + effect size r
 *                         (exact khi n nhỏ & không có hạng trùng, xấp xỉ chuẩn khi n lớn)
 *  - recommendTest      : gợi ý nên đọc kiểm định nào, kèm lý do (cỡ mẫu / độ lệch phân phối)
 *
 * Phân phối t và chuẩn lấy từ thư viện jStat (nạp qua CDN trong teacher.html).
 * Mọi hàm đều nhận hai mảng số cùng độ dài: before[i] và after[i] là của cùng
 * một học sinh.
 */

function jstatLib() {
  const j = typeof window !== "undefined" ? (window.jStat || window.jstat) : null;
  if (!j) throw new Error("Chưa nạp được thư viện jStat (kiểm tra thẻ <script> CDN trong teacher.html).");
  return j;
}

/** Ghép cặp: chỉ giữ những học sinh có ĐỦ cả số liệu trước và sau. */
export function pairUp(rows, beforeKey, afterKey) {
  const before = [], after = [], labels = [];
  rows.forEach(r => {
    const b = Number(r[beforeKey]);
    const a = Number(r[afterKey]);
    if (Number.isFinite(b) && Number.isFinite(a)) {
      before.push(b); after.push(a); labels.push(r.studentCode || r.uid?.slice(0, 6) || "");
    }
  });
  return { before, after, labels };
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Độ lệch chuẩn mẫu (chia n-1). */
export function sd(xs) {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
}

export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hệ số bất đối xứng (skewness) — dùng để đánh giá mức lệch của phân phối hiệu số. */
export function skewness(xs) {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs), s = sd(xs);
  if (!s) return 0;
  const g1 = xs.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n;
  return Math.sqrt(n * (n - 1)) / (n - 2) * g1; // hiệu chỉnh cho mẫu nhỏ
}

export function descriptives(xs) {
  return { n: xs.length, mean: mean(xs), sd: sd(xs), median: median(xs), min: Math.min(...xs), max: Math.max(...xs) };
}

/* ------------------------------------------------------------------ */
/* 1. Kiểm định t ghép cặp                                             */
/* ------------------------------------------------------------------ */
/**
 * H0: trung bình hiệu số (before − after) bằng 0.
 * Hiệu số được tính là before − after nên giá trị DƯƠNG = có giảm sau can thiệp
 * (phù hợp với biến "số phút xem video ngắn" và "điểm nguy cơ": càng thấp càng tốt).
 */
export function pairedTTest(before, after) {
  const jStat = jstatLib();
  const n = before.length;
  if (n < 2) return { ok: false, reason: "Cần ít nhất 2 học sinh có đủ số liệu trước và sau." };

  const diffs = before.map((b, i) => b - after[i]);
  const md = mean(diffs);
  const sdd = sd(diffs);
  if (!sdd) {
    return { ok: false, reason: "Mọi học sinh đều thay đổi giống hệt nhau (phương sai hiệu số bằng 0) — không tính được kiểm định t." };
  }

  const se = sdd / Math.sqrt(n);
  const df = n - 1;
  const t = md / se;
  const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
  const tCrit = jStat.studentt.inv(0.975, df);

  const dz = md / sdd;                                   // Cohen's dz cho thiết kế ghép cặp
  const g = dz * (1 - 3 / (4 * n - 5));                  // hiệu chỉnh Hedges cho mẫu nhỏ

  return {
    ok: true, n, df, diffs,
    meanDiff: md, sdDiff: sdd, se, t, p,
    ciLow: md - tCrit * se,
    ciHigh: md + tCrit * se,
    dz, hedgesG: g
  };
}

/* ------------------------------------------------------------------ */
/* 2. Kiểm định Wilcoxon signed-rank                                   */
/* ------------------------------------------------------------------ */
/** Xếp hạng với hạng trung bình cho các giá trị bằng nhau. */
function rankWithTies(values) {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  const tieGroups = [];
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, tieGroups };
}

/** Xác suất chính xác P(W+ <= w) bằng quy hoạch động trên tập hạng 1..n. */
function exactWilcoxonTailProb(n, w) {
  const maxSum = n * (n + 1) / 2;
  const counts = new Float64Array(maxSum + 1);
  counts[0] = 1;
  for (let r = 1; r <= n; r++) {
    for (let s = maxSum; s >= r; s--) counts[s] += counts[s - r];
  }
  let cum = 0;
  for (let s = 0; s <= Math.min(w, maxSum); s++) cum += counts[s];
  return cum / Math.pow(2, n);
}

/**
 * H0: phân phối hiệu số đối xứng quanh 0.
 * Cặp có hiệu số bằng 0 bị loại (quy ước Wilcoxon cổ điển) — số cặp còn lại là nEffective.
 */
export function wilcoxonSignedRank(before, after) {
  const jStat = jstatLib();
  const rawDiffs = before.map((b, i) => b - after[i]);
  const nonZero = rawDiffs.filter(d => d !== 0);
  const zeros = rawDiffs.length - nonZero.length;
  const n = nonZero.length;
  if (n < 5) {
    return { ok: false, reason: `Chỉ có ${n} học sinh thay đổi khác 0 — quá ít để kiểm định Wilcoxon có ý nghĩa (cần tối thiểu 5).` };
  }

  const { ranks, tieGroups } = rankWithTies(nonZero.map(Math.abs));
  let wPlus = 0, wMinus = 0;
  nonZero.forEach((d, i) => { if (d > 0) wPlus += ranks[i]; else wMinus += ranks[i]; });
  const W = Math.min(wPlus, wMinus);

  const muW = n * (n + 1) / 4;
  const tieCorrection = tieGroups.reduce((a, t) => a + (t ** 3 - t), 0) / 48;
  const varW = n * (n + 1) * (2 * n + 1) / 24 - tieCorrection;
  const sdW = Math.sqrt(varW);
  // Hiệu chỉnh liên tục 0.5 khi xấp xỉ phân phối rời rạc bằng phân phối chuẩn
  const z = sdW ? (wPlus - muW - Math.sign(wPlus - muW) * 0.5) / sdW : 0;

  const hasTies = tieGroups.length > 0;
  const useExact = n <= 20 && !hasTies;
  const p = useExact
    ? Math.min(1, 2 * exactWilcoxonTailProb(n, W))
    : 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

  return {
    ok: true,
    n, zeros, wPlus, wMinus, W, z, p,
    exact: useExact, hasTies,
    r: Math.abs(z) / Math.sqrt(n),   // effect size r = |Z| / √n
    medianDiff: median(rawDiffs)
  };
}

/* ------------------------------------------------------------------ */
/* 3. Chọn kiểm định phù hợp                                           */
/* ------------------------------------------------------------------ */
/**
 * Quy tắc thực dụng cho quy mô lớp học: t ghép cặp giả định hiệu số phân phối
 * xấp xỉ chuẩn. Với n nhỏ hoặc hiệu số lệch mạnh, Wilcoxon đáng tin cậy hơn.
 */
export function recommendTest(diffs) {
  const n = diffs.length;
  const sk = skewness(diffs);
  if (n < 15) {
    return { test: "wilcoxon", reason: `Cỡ mẫu nhỏ (n = ${n} < 15) nên chưa đủ căn cứ cho giả định phân phối chuẩn của hiệu số.` };
  }
  if (Number.isFinite(sk) && Math.abs(sk) > 1) {
    return { test: "wilcoxon", reason: `Hiệu số lệch mạnh (skewness = ${sk.toFixed(2)}, |giá trị| > 1) nên vi phạm giả định chuẩn của kiểm định t.` };
  }
  return { test: "ttest", reason: `n = ${n} và hiệu số phân phối tương đối cân đối (skewness = ${sk.toFixed(2)}) — đủ điều kiện dùng kiểm định t ghép cặp.` };
}

/** Diễn giải độ lớn ảnh hưởng theo quy ước Cohen (1988). */
export function interpretEffect(value, kind = "d") {
  const v = Math.abs(value);
  if (kind === "r") {
    if (v < 0.1) return "không đáng kể";
    if (v < 0.3) return "nhỏ";
    if (v < 0.5) return "trung bình";
    return "lớn";
  }
  if (v < 0.2) return "không đáng kể";
  if (v < 0.5) return "nhỏ";
  if (v < 0.8) return "trung bình";
  return "lớn";
}

/** Định dạng p-value theo chuẩn trình bày trong báo cáo khoa học. */
export function formatP(p) {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "p < .001";
  return "p = " + p.toFixed(3).replace(/^0/, "");
}
