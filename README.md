# POP-AI — Web app (GitHub Pages) + Chrome Extension (Firebase)

Dự án gồm **2 phần độc lập**, không gọi trực tiếp lẫn nhau — chỉ "gặp nhau" tại Firestore.

```
pop-ai/
├── index.html, app.html, teacher.html      PHẦN 1 — Web app: file tĩnh nằm NGAY Ở GỐC repo
├── css/, js/, icons/, manifest.json          (bắt buộc — GitHub Pages kiểu "Deploy from a
│                                              branch" chỉ phục vụ được từ gốc repo, không
│                                              chọn được thư mục con tuỳ ý)
│
├── extension/                               PHẦN 2 — Chrome Extension, cài trên máy học sinh
│   └── manifest.json, background.js, content-overlay.js, firebase-rest.js, ...
│
├── firebase/                                Cấu hình backend dùng chung — KHÔNG lên GitHub
│   └── firebase.json, firestore.rules, functions/, ...   Pages, deploy riêng bằng Firebase CLI
│
├── .nojekyll                                Báo GitHub Pages bỏ qua bước xử lý Jekyll
└── README.md
```

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│  PHẦN 1 — Web app            │          │  PHẦN 2 — Chrome Extension    │
│  file tĩnh ở gốc repo        │          │  thư mục extension/           │
│  (index.html, app.html...)   │          │  Cài trên trình duyệt của     │
│  → deploy lên GitHub Pages   │          │  từng học sinh (Load unpacked │
│  (Settings → Pages → Branch) │          │  hoặc đăng Chrome Web Store)  │
└──────────────┬────────────────┘          └───────────────┬────────────────┘
               │  Firebase JS SDK                           │  Firestore REST API
               │  (auth, firestore, functions)               │  (vì Service Worker MV3
               ▼                                             │   không dùng được SDK)
        ┌───────────────────────────────────────────────────▼─────────┐
        │                      Firebase (backend chung)                │
        │  Authentication (Google Sign-In) · Firestore · Cloud Functions│
        └────────────────────────────────────────────────────────────┘
```

- **Web app** (`index.html`, `app.html`, `teacher.html`, `css/`, `js/`, `icons/`, `manifest.json`) nằm
  ngay ở gốc repo — chỉ vậy thôi thì tính năng **"Deploy from a branch"** của GitHub Pages (Settings →
  Pages → chọn Branch, không cần workflow gì thêm) đã tự phục vụ được, không cần biết GitHub Actions là gì.
- **`firebase/`** gom `firebase.json`, `firestore.rules`, `functions/` (Cloud Function Trợ lý AI) —
  KHÔNG phải file web, chỉ dùng khi chạy `firebase deploy` từ máy, GitHub Pages không đụng tới (nhưng vì
  nằm trong cùng repo public nên thư mục này về mặt kỹ thuật vẫn xem được qua link trực tiếp — không có
  gì bí mật trong đó, API key thật nằm ở Secret Manager chứ không phải trong code).
- **Extension** chạy hoàn toàn độc lập trên máy học sinh, tự đăng nhập Google riêng (`chrome.identity`),
  tự đọc/ghi Firestore qua REST — **không** cần web app đang mở, không postMessage.
- Hai phần chỉ chia sẻ **cùng một Firebase project** (Authentication + Firestore + Cloud Functions) làm
  điểm đồng bộ dữ liệu. Học sinh đăng nhập cùng một tài khoản Google ở cả hai nơi là đủ để dữ liệu khớp
  nhau — không cần cấu hình gì thêm giữa hai phần.

Extension chỉ theo dõi được video ngắn xem **qua trình duyệt trên máy tính** (YouTube Shorts, TikTok,
Instagram Reels, Facebook Reels dạng web) — không đọc được app trên điện thoại.

---

## 1. Tạo Firebase project (dùng chung cho cả 2 phần)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên (VD: `pop-ai-truong-x`).
2. Vào **Build → Authentication → Sign-in method** → bật **Google**.
3. Vào **Build → Authentication → Settings → Authorized domains** → bấm **Add domain**, thêm domain
   GitHub Pages sẽ dùng ở Phần 1, ví dụ `TEN-TAI-KHOAN.github.io`. **Bỏ qua bước này thì nút "Đăng nhập
   Google" trên web app sẽ báo lỗi `auth/unauthorized-domain`.**
4. Vào **Build → Firestore Database** → **Create database** → chọn chế độ **Production**.
5. Vào **Project settings → General → Your apps** → bấm biểu tượng `</>` để tạo **Web app** → copy đoạn
   `firebaseConfig`.

## 2. Điền cấu hình

**Đã điền sẵn cho project `tuanizz`** — cấu hình nằm ở hai file giống hệt nhau:
`js/firebase-config.js` và `extension/firebase-config.js`. Project mặc định đã khai trong
`firebase/.firebaserc`.

Nếu sau này đổi sang project Firebase khác, sửa `firebase/firebase-config.example.js` rồi copy đè
vào cả hai nơi:
```bash
cp firebase/firebase-config.example.js js/firebase-config.js
cp firebase/firebase-config.example.js extension/firebase-config.js
```
(hai file phải giống hệt nhau)

> `apiKey` của Firebase Web không phải mật khẩu — nó chỉ định danh project và luôn lộ ra trong mã nguồn
> trình duyệt, dù host ở GitHub Pages hay bất kỳ đâu. Thứ thật sự bảo vệ dữ liệu là `firestore.rules`
> (xem phần Giới hạn cần biết ở cuối).

## 3. Thiết lập mã xác thực giáo viên

Vào **Firestore Database → Start collection**:
- Collection ID: `config`
- Document ID: `teacherAccess`
- Field: `code` (string) → đặt một mã bí mật, ví dụ `GV2026-POPAI`

Giáo viên nhập đúng mã này khi đăng ký tài khoản lần đầu để được cấp vai trò "giáo viên".

## 4. Deploy PHẦN 1 — Web app lên GitHub Pages (upload thủ công, không cần Git)

1. Vào https://github.com/new → đặt tên repo (VD: `pop-ai`) → **tick "Add a README file"** → Create
   repository.
2. Trong repo vừa tạo → **Add file → Upload files**.
3. Mở thư mục dự án trên máy, chọn **tất cả file và thư mục ở gốc** (`index.html`, `app.html`,
   `teacher.html`, `manifest.json`, `.nojekyll`, và các thư mục `css/`, `js/`, `icons/`, `extension/`,
   `firebase/`) rồi kéo thả hết vào khung upload — kéo thả cả thư mục thì GitHub tự giữ đúng cấu trúc
   con bên trong. **Lưu ý:** README.md đã tick tạo sẵn ở bước 1 nên bỏ qua, không upload đè.
4. Cuộn xuống, bấm **Commit changes**.
5. Vào tab **Settings** (trên cùng repo) → mục **Pages** (menu bên trái) → ở **Branch** đổi từ **None**
   thành **main**, giữ nguyên thư mục **/ (root)** → **Save**.
6. Đợi khoảng 1 phút, tải lại trang Settings → Pages sẽ hiện dòng **"Your site is live at
   `https://TEN-TAI-KHOAN.github.io/pop-ai/`"** — đó là link cho học sinh/giáo viên truy cập.
7. Quay lại **Firebase Console → Authentication → Settings → Authorized domains → Add domain**, thêm
   đúng `TEN-TAI-KHOAN.github.io` (chỉ domain gốc, không cần `/pop-ai/`). **Bỏ qua bước này thì nút
   "Đăng nhập Google" trên web sẽ báo lỗi `auth/unauthorized-domain`.**

Từ lần sau, mỗi khi sửa file: vào đúng file trên GitHub (hoặc kéo thả file mới đè lên qua **Add file →
Upload files**) → Commit changes — Pages tự cập nhật lại sau khoảng nửa phút, không cần làm lại bước 5-6.

> Muốn dùng Git dòng lệnh (nhanh hơn khi sửa nhiều lần) thay vì kéo-thả tay: xem khối lệnh Git ở cuối
> mục này trong bản README trước, hoặc hỏi lại — cách kéo-thả ở trên là đủ dùng cho một trang tĩnh nhỏ
> thế này.

Muốn chạy thử trên máy trước khi upload: mở `index.html` bằng một local server bất kỳ, ví dụ
`npx serve .` hoặc `python3 -m http.server` (chạy ngay tại thư mục gốc dự án). Firebase Auth popup cần
chạy trên `http://localhost` hoặc domain đã khai ở Authorized domains — không mở trực tiếp bằng `file://`.

## 5. Deploy Firestore Rules + Cloud Functions (backend dùng chung)

Cấu hình backend (`firebase.json`, `firestore.rules`, `functions/`) nằm gọn trong `firebase/` — tách
khỏi phần tĩnh ở gốc để không lẫn vào GitHub Pages. Cần Node.js + Firebase CLI, **không còn `firebase
deploy --only hosting`** vì web app giờ nằm ở GitHub Pages:
```bash
npm install -g firebase-tools
firebase login
cd pop-ai/firebase
firebase use tuanizz        # project đã khai sẵn trong .firebaserc
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## 6. Deploy PHẦN 2 — Chrome Extension + tạo OAuth Client ID

Extension cần một OAuth Client ID riêng (loại **Chrome Extension**) để `chrome.identity` hoạt động —
đây là bước tách biệt hoàn toàn với việc deploy web app ở trên:

1. Mở `extension/config.js`, sửa `APP_URL` thành đúng link GitHub Pages vừa deploy ở bước 4 (dùng cho nút
   "Mở POP-AI" trong popup của extension — chỉ là một liên kết, không ảnh hưởng tới đồng bộ dữ liệu).
2. Vào https://console.cloud.google.com/apis/credentials (chọn đúng project Firebase ở trên, vì Firebase
   project = GCP project).
3. **Create credentials → OAuth client ID → Application type: Chrome Extension**.
4. Trước tiên cần **Extension ID**: mở `chrome://extensions`, bật **Developer mode**, bấm **Load
   unpacked**, chọn thư mục `extension/` → Chrome sẽ cấp một Extension ID (chuỗi 32 ký tự). Copy ID này.
5. Quay lại Google Cloud Console, dán Extension ID vào ô yêu cầu, tạo client → copy **Client ID**.
6. Mở `extension/manifest.json`, thay:
   ```json
   "oauth2": { "client_id": "CLIENT_ID_VUA_TAO.apps.googleusercontent.com", ... }
   ```
7. Vào `chrome://extensions`, bấm **Reload** trên extension POP-AI Tracker.

Muốn phân phối cho nhiều học sinh mà không bắt từng em bật Developer mode + Load unpacked: nén thư mục
`extension/` rồi đăng lên **Chrome Web Store** (cần tài khoản nhà phát triển, phí một lần ~$5) — khi đó
Extension ID cố định ngay từ lúc tạo mục trên Store, tạo OAuth Client ID theo ID đó trước khi publish.

## 7. Dùng thử

1. Mở web app (link GitHub Pages) → đăng nhập Google (chọn "Tôi là học sinh").
2. Cài extension, đăng nhập **bằng cùng tài khoản Google**, tick đồng ý điều khoản, bấm "Đăng nhập bằng
   Google".
3. Mở một tab TikTok/YouTube Shorts, để nguyên vài phút (extension cập nhật mỗi 1 phút khi tab đang
   active).
4. Quay lại web app → mục **Cài đặt** sẽ hiện "Đã kết nối", và màn hình **Hôm nay** sẽ hiện số phút đã
   ghi nhận — đây chính là lúc thấy rõ 2 phần đang "nói chuyện" với nhau qua Firestore.
5. Giáo viên: đăng nhập, chọn "Tôi là giáo viên", nhập mã xác thực đã tạo ở bước 3 → tạo lớp → chia sẻ
   **mã lớp** cho học sinh nhập ở mục Cài đặt.

## 8. (Mới) Bật Trợ lý AI thật — Cloud Functions

Trợ lý trong mục "Trợ lý AI" của web app giờ gọi một LLM thật (đọc kế hoạch + nhật ký của đúng học sinh
đang chat), thay vì if/else cố định. API key được giấu ở server bằng Cloud Functions Secret.

1. Cloud Functions cần gói thanh toán **Blaze** (pay-as-you-go) của Firebase — vẫn có hạn mức miễn phí
   hằng tháng, dự án quy mô lớp học/đồ án gần như không tốn phí. Bật ở **Project settings → Usage and billing**.
2. Cài dependencies:
   ```bash
   cd pop-ai/firebase/functions
   npm install
   ```
   > `npm install` tạo ra thư mục `node_modules/` khá nặng — nếu bạn dùng cách upload kéo-thả ở mục 4
   > (không dùng Git), **đừng kéo `node_modules/` lên GitHub** (không cần thiết, `firebase deploy` tự cài
   > lại phụ thuộc trên server). Dùng Git thì `.gitignore` đã loại trừ sẵn thư mục này.
3. Đặt API key làm **secret** (KHÔNG đặt trong code, KHÔNG commit lên git):
   ```bash
   cd pop-ai/firebase
   firebase functions:secrets:set POPAI_API_KEY
   # dán API key khi được hỏi, ví dụ: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   > Key trong `chatbot.html` bạn dùng để test local **đã lộ ra ngoài** (nằm thẳng trong source).
   > Nên đổi/thu hồi key đó ở `shopaikey.com` và tạo key mới riêng để đặt vào secret này.
4. Deploy:
   ```bash
   firebase deploy --only functions,firestore:rules
   ```
5. Vào web app → mục **Trợ lý AI** → chat thử. Nếu đổi endpoint/model khác (không phải
   `api.shopaikey.com` / `gpt-5.4-nano`), sửa 2 hằng số `API_URL`, `MODEL` đầu file
   `firebase/functions/index.js` rồi deploy lại.

## 9. (Mới) Can thiệp hành vi đúng lúc (friction nudge)

Khi học sinh xem video ngắn vượt **mục tiêu đã đặt trong kế hoạch** (mục Tối ưu hóa → Kế hoạch → "Mức
muốn giảm xuống còn ... phút/ngày"), tiện ích sẽ chèn một lớp phủ mờ hỏi có muốn dừng lại không — không
chặn cứng, luôn có nút đóng/xem thêm 10 phút.

1. `extension/config.js` cần đặt đúng `APP_URL` là link GitHub Pages đã deploy ở bước 4 (Phần 1) — dùng
   để nút "Mở Đồng hồ tập trung" mở đúng web app. Chỉ cần sửa nếu bạn đổi tên repo/tài khoản hoặc dùng
   tên miền riêng.
2. Học sinh cần đã lưu kế hoạch với mục tiêu > 0 phút thì ngưỡng mới có tác dụng.
3. Reload lại tiện ích ở `chrome://extensions` sau khi sửa `config.js`.

Đây là "friction" — nhắc đúng lúc dựa trên ngưỡng tự đặt, không phải chặn truy cập — nên vẫn tôn trọng
quyền tự quyết của học sinh, đúng tinh thần một can thiệp hành vi có cơ sở khoa học chứ không phải kiểm duyệt.

## 10. (Mới) Dashboard trực tiếp cho giáo viên

Mục **Đang diễn ra trong lớp (trực tiếp)** trên trang giáo viên tự cập nhật theo thời gian thực (Firestore
`onSnapshot`), hiển thị mỗi học sinh đang: xem nền tảng giải trí nào, đang ở trang khác, tạm rời máy, hay
ngoại tuyến (không cập nhật quá 3 phút). Không có bước cài đặt thêm — hoạt động ngay sau khi deploy
`firestore.rules` mới và học sinh dùng tiện ích đã tham gia lớp.

Vì lý do quyền riêng tư, hệ thống **chỉ ghi tên nền tảng giải trí** (TikTok/YouTube Shorts/...) khi khớp,
**không ghi lại URL cụ thể** của các trang không phải giải trí — dashboard chỉ biết "đang ở trang khác",
không biết trang nào. Nên thông báo rõ với học sinh/phụ huynh về tính năng này trước khi triển khai.

## 11. (Mới) Kiểm định thống kê ngay trên dashboard giáo viên

Khối **Kiểm định hiệu quả can thiệp** trên trang giáo viên tự tính toán ngay trong trình duyệt, không
cần xuất dữ liệu sang phần mềm khác:

- Thống kê mô tả trước/sau (M, SD, trung vị) và mức thay đổi trung bình.
- **Kiểm định t ghép cặp**: t(df), p, khoảng tin cậy 95% của chênh lệch, Cohen's d<sub>z</sub> và Hedges' g.
- **Wilcoxon signed-rank**: W, Z, p (xác suất *chính xác* khi n ≤ 20 và không có hạng trùng, xấp xỉ chuẩn
  có hiệu chỉnh liên tục trong các trường hợp còn lại), effect size r.
- Hệ thống tự gợi ý nên đọc kiểm định nào làm kết quả chính: Wilcoxon khi n < 15 hoặc hiệu số lệch mạnh
  (|skewness| > 1), còn lại dùng t ghép cặp. Kiểm định kia vẫn hiển thị để đối chiếu.

Hai biến kết quả có sẵn trong ô chọn:

| Biến | Trước | Sau |
|---|---|---|
| Thời gian xem video ngắn (phút/ngày) | mức hiện tại học sinh khai trong kế hoạch | nhật ký gần nhất |
| Điểm tự đánh giá nguy cơ (0–50) | lần tự đánh giá đầu tiên | lần tự đánh giá gần nhất |

Không có bước cài đặt riêng — chỉ cần upload lại file lên GitHub (Add file → Upload files → Commit), Pages sẽ tự cập nhật sau khoảng nửa phút. Thư viện thống kê `jstat` được nạp qua CDN trong
`teacher.html`; phần tính toán nằm ở `js/stats.js` (thuần hàm, tách riêng để dễ kiểm chứng).

Nút **Xuất dữ liệu (.xlsx)** vẫn giữ nguyên cho các phân tích sâu hơn trong JASP (ANOVA đo lặp, hồi quy có
biến kiểm soát...). Cần lưu ý về mặt phương pháp: đây là thiết kế **pre–post một nhóm, không có nhóm đối
chứng**, nên p-value chỉ cho biết mức thay đổi khó xảy ra do ngẫu nhiên đến đâu, chưa chứng minh được quan
hệ nhân quả — dashboard có ghi rõ giới hạn này ngay dưới kết luận.

## 12. (Mới) Mục tiêu tự điều chỉnh (adaptive goal-setting)

Nếu học sinh **vượt mục tiêu 2 ngày gần nhất liên tiếp**, POP-AI hiện một thẻ đề xuất ngay ở trang
**Hôm nay**: hạ mục tiêu xuống mức bằng khoảng 90% hành vi thực tế hai ngày đó (làm tròn 5 phút), kèm
chính số liệu hai ngày làm căn cứ. Ngược lại, nếu **đạt mục tiêu 3 ngày liên tiếp**, hệ thống đề xuất hạ
thêm một bậc để tiến bộ không chững lại.

Cơ sở thiết kế: mục tiêu bị trượt liên tục thường là dấu hiệu mục tiêu đặt quá xa mức hành vi hiện tại,
chứ không phải học sinh thiếu ý chí — và chuỗi thất bại liên tiếp là một trong những lý do phổ biến khiến
người dùng bỏ giữa chừng. Việc điều chỉnh mục tiêu theo dữ liệu thực tế (SMART goals thích ứng) giữ cho
mục tiêu luôn nằm trong vùng khả thi.

Chi tiết vận hành:
- Luôn có nút **Giữ nguyên mục tiêu** — quyền quyết định thuộc về học sinh. Khi chọn giữ nguyên (hoặc sau
  khi đã điều chỉnh), hệ thống tạm ngừng đề xuất 3 ngày để không nhắc dai.
- Không đề xuất mục tiêu dưới 10 phút/ngày, và không đề xuất nếu mức mới không thực sự dễ hơn mục tiêu cũ
  (tức là học sinh đã rất sát đích — chỉ cần thêm một ngày nữa).
- Mỗi lần điều chỉnh được ghi vào `plans/{uid}.goalHistory` (tối đa 20 mốc gần nhất: thời điểm, mục tiêu
  cũ, mục tiêu mới, lý do). Đây cũng là dữ liệu định tính hữu ích cho phần bàn luận của đề tài: mục tiêu
  có được điều chỉnh thích ứng hay không, điều chỉnh bao nhiêu lần.
- Ngưỡng mới tự động trở thành mốc nhắc nhở của tiện ích trình duyệt (mục 9) ở lần đồng bộ kế tiếp
  (~15 phút), không cần thao tác gì thêm.

Không có bước cài đặt riêng — chỉ cần upload lại file lên GitHub (Add file → Upload files → Commit).

## Giới hạn cần biết

- Vì web app và extension là hai phần triển khai độc lập, đổi domain GitHub Pages (đổi tên repo, chuyển sang tài khoản khác...) đòi hỏi cập nhật **hai chỗ thủ công**: Authorized domains trong Firebase Auth (bước 1.3) và `extension/config.js` (bước 6.1). Quên một trong hai sẽ không làm hỏng đồng bộ dữ liệu (vẫn qua Firestore bình thường), chỉ làm nút đăng nhập hoặc nút "Mở POP-AI" trỏ sai.
- Chỉ đo được hành vi trên **trình duyệt máy tính**, không đo được app điện thoại (do giới hạn hệ điều hành, xem phần trao đổi trước).
- Nếu một học sinh dùng nhiều máy tính khác nhau, mỗi máy ghi đè dữ liệu "hôm nay" của máy đó — dữ liệu tổng hợp giữa nhiều thiết bị chưa được cộng dồn (đủ dùng cho quy mô lớp học/nghiên cứu nhỏ; muốn chính xác hơn cần chuyển sang cộng dồn qua Cloud Functions).
- Trước khi phát hành rộng rãi (Chrome Web Store), cần thêm Privacy Policy công khai vì extension xin quyền `identity` + theo dõi hoạt động duyệt web.
- Trợ lý AI (mục 8) gọi API bên thứ ba (`api.shopaikey.com`) — nếu dịch vụ này đổi định dạng phản hồi hoặc ngừng hoạt động, cần cập nhật `firebase/functions/index.js`. Nội dung chat được lưu lại trong Firestore (`assistantChats`) để giữ ngữ cảnh; cân nhắc thêm chính sách xoá dữ liệu định kỳ nếu triển khai thật.
- Kiểm định thống kê (mục 11) dùng biến "sau can thiệp" là nhật ký/tự đánh giá **gần nhất**, không phải giá
  trị trung bình cả tuần — khi báo cáo chính thức nên nêu rõ điều này, hoặc sửa `student.js` để lưu thêm
  trung bình 3 ngày cuối vào `classes/{id}/students`.
- Mục tiêu tự điều chỉnh (mục 12) dựa trên `shortVideoMin` trong nhật ký do học sinh tự khai (có thể đã được
  tiện ích điền sẵn). Nếu học sinh không ghi nhật ký thì không có đề xuất nào được kích hoạt.
- Ngưỡng friction (mục 9) hiện dùng chung một con số `targetShortVideoMin` cho tất cả nền tảng cộng lại, chưa tách riêng theo từng nền tảng (TikTok/YouTube/...).
- Dashboard trực tiếp (mục 10) cập nhật mỗi ~1 phút (giới hạn `chrome.alarms`), không phải theo giây thực; đủ cho mục đích trình diễn/nghiên cứu lớp học, không phải giám sát an ninh.
