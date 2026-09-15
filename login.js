import {
  auth, db, googleProvider, signInWithPopup, doc, getDoc, setDoc,
  collection, query, where, getDocs, serverTimestamp, genStudentCode,
  toast, onAuthStateChanged
} from "./firebase.js";

let selectedRole = "student";

const roleToggle = document.getElementById("roleToggle");
const studentJoinField = document.getElementById("studentJoinField");
const teacherCodeField = document.getElementById("teacherCodeField");

roleToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-role]");
  if (!btn) return;
  [...roleToggle.children].forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedRole = btn.dataset.role;
  studentJoinField.style.display = selectedRole === "student" ? "block" : "none";
  teacherCodeField.style.display = selectedRole === "teacher" ? "block" : "none";
});

// Nếu đã đăng nhập sẵn, điều hướng luôn
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) redirectByRole(snap.data().role);
});

document.getElementById("googleBtn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const userRef = doc(db, "users", user.uid);
    const existing = await getDoc(userRef);

    if (existing.exists()) {
      redirectByRole(existing.data().role);
      return;
    }

    if (selectedRole === "teacher") {
      const code = document.getElementById("teacherCode").value.trim();
      const ok = await verifyTeacherCode(code);
      if (!ok) {
        toast("Mã xác thực giáo viên không đúng.");
        await auth.signOut();
        return;
      }
      await setDoc(userRef, {
        role: "teacher",
        displayName: user.displayName || "",
        email: user.email || "",
        createdAt: serverTimestamp()
      });
      redirectByRole("teacher");
      return;
    }

    // Học sinh
    let classId = null;
    const joinCode = document.getElementById("joinCode").value.trim().toUpperCase();
    if (joinCode) {
      const q = query(collection(db, "classes"), where("joinCode", "==", joinCode));
      const res = await getDocs(q);
      if (!res.empty) classId = res.docs[0].id;
      else toast("Không tìm thấy mã lớp — bạn vẫn có thể tham gia lớp sau trong phần Cài đặt.");
    }

    await setDoc(userRef, {
      role: "student",
      displayName: user.displayName || "",
      email: user.email || "",
      studentCode: genStudentCode(),
      classId: classId,
      createdAt: serverTimestamp()
    });

    if (classId) {
      await setDoc(doc(db, "classes", classId, "students", user.uid), {
        studentCode: (await getDoc(userRef)).data().studentCode,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    redirectByRole("student");
  } catch (err) {
    console.error(err);
    toast("Đăng nhập thất bại: " + err.message);
  }
});

async function verifyTeacherCode(code) {
  if (!code) return false;
  try {
    const snap = await getDoc(doc(db, "config", "teacherAccess"));
    if (!snap.exists()) return false;
    return snap.data().code === code;
  } catch {
    return false;
  }
}

function redirectByRole(role) {
  window.location.href = role === "teacher" ? "teacher.html" : "app.html";
}
