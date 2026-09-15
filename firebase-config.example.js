// ĐIỀN THÔNG TIN FIREBASE PROJECT CỦA BẠN VÀO ĐÂY, SAU ĐÓ:
// 1. Đổi tên file này thành firebase-config.js
// 2. Copy file firebase-config.js vào CẢ HAI nơi:
//      - web/js/firebase-config.js
//      - extension/firebase-config.js
//
// Lấy các giá trị này ở: Firebase Console > Project settings > General > Your apps > Web app (SDK setup and configuration)
export const firebaseConfig = {
  apiKey: "AIzaSy...........................",
  authDomain: "ten-du-an-cua-ban.firebaseapp.com",
  projectId: "ten-du-an-cua-ban",
  storageBucket: "ten-du-an-cua-ban.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// Dùng cho extension (gọi Firestore/Auth qua REST API, không qua SDK)
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_API_KEY = firebaseConfig.apiKey;
