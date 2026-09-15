// Cấu hình Firebase của dự án POP-AI.
// Lấy từ: Firebase Console > Project settings > General > Your apps > Web app.
// Lưu ý: apiKey của Firebase Web KHÔNG phải mật khẩu — nó chỉ định danh dự án.
// Việc bảo vệ dữ liệu phụ thuộc vào firestore.rules, không phụ thuộc vào việc giấu key này.
export const firebaseConfig = {
  apiKey: "AIzaSyDSM2UG4f-jhj4TfdzakkXfB8jPUHY6NxE",
  authDomain: "tuanizz.firebaseapp.com",
  databaseURL: "https://tuanizz-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tuanizz",
  storageBucket: "tuanizz.firebasestorage.app",
  messagingSenderId: "382327990314",
  appId: "1:382327990314:web:3d36bb186e825afb94fb53",
  measurementId: "G-7ME4W4EVT0"
};

// Dùng cho extension (gọi Firestore/Auth qua REST API, không qua SDK)
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_API_KEY = firebaseConfig.apiKey;
