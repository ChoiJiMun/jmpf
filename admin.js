import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF4mQWQ8Ic9exTEjUe6Mqh_h8asOVXouU",
  authDomain: "jimpf-portfolio.firebaseapp.com",
  projectId: "jimpf-portfolio",
  storageBucket: "jimpf-portfolio.firebasestorage.app",
  messagingSenderId: "582573005559",
  appId: "1:582573005559:web:aa4ce22c9b1aab2b08d1f2",
  measurementId: "G-0R83M2GVLH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/ddhkzppo2/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "jimportfolio";

let projectsCache = [];
let imagesState = [];
let dragFromIndex = null;

function $(id) {
  return document.getElementById(id);
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
  if (!response.ok) {
    let detail = "";
    try {
      const errorData = await response.json();
      detail = errorData?.error?.message || "";
    } catch {}
    throw new Error(detail || "Upload failed");
  }
  const data = await response.json();
  return data.secure_url;
}

function normalizeProject(p) {
  const rawImages = Array.isArray(p.images) ? p.images : [p.img1, p.img2].filter(Boolean);
  const img = rawImages.slice().filter(Boolean);
  const thumb = p.thumb || "";
  if (!img.length && thumb) img.push(thumb);
  if (thumb && img[0] !== thumb) img.unshift(thumb);
  return { ...p, images: img, thumb: img[0] || thumb || "" };
}

async function fetchProjectsFromDB() {
  const querySnapshot = await getDocs(collection(db, "projects"));
  const list = [];
  querySnapshot.forEach((d) => list.push({ dbId: d.id, ...d.data() }));
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  projectsCache = list.map(normalizeProject);
  return projectsCache;
}

async function saveProjectToDB(data) {
  if (data.dbId) {
    const docRef = doc(db, "projects", data.dbId);
    const { dbId, ...updateData } = data;
    await updateDoc(docRef, updateData);
  } else {
    data.createdAt = Date.now();
    await addDoc(collection(db, "projects"), data);
  }
  await fetchProjectsFromDB();
}

async function deleteProjectFromDB(dbId) {
  await deleteDoc(doc(db, "projects", dbId));
  await fetchProjectsFromDB();
}

async function fetchAboutFromDB() {
  const aboutRef = doc(db, "site", "about");
  const snap = await getDoc(aboutRef);
  const html = snap.exists() ? (snap.data()?.html || "") : "";
  return html;
}

async function saveAboutToDB(html) {
  const aboutRef = doc(db, "site", "about");
  await setDoc(aboutRef, { html, updatedAt: Date.now() }, { merge: true });
}

function switchTab(tab) {
  document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".admin-nav-item").forEach((n) => n.classList.remove("active"));
  $("tab-" + tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
}

function renderImageList() {
  const list = $("imageList");
  list.innerHTML = "";

  imagesState.forEach((url, idx) => {
    const item = document.createElement("div");
    item.className = "image-item";
    item.draggable = true;
    item.dataset.idx = String(idx);

    const thumb = document.createElement("div");
    thumb.className = "image-thumb";
    thumb.style.backgroundImage = `url('${url}')`;

    const badge = document.createElement("div");
    badge.className = "image-badge";
    badge.textContent = idx === 0 ? "Cover" : `#${idx + 1}`;

    const actions = document.createElement("div");
    actions.className = "image-actions";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "image-btn danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      imagesState = imagesState.filter((_, i) => i !== idx);
      renderImageList();
    });

    actions.appendChild(removeBtn);
    item.appendChild(thumb);
    item.appendChild(badge);
    item.appendChild(actions);

    item.addEventListener("dragstart", (e) => {
      dragFromIndex = idx;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = idx;
      const from = dragFromIndex;
      if (from === null || from === undefined) return;
      if (from === to) return;
      const next = imagesState.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      imagesState = next;
      dragFromIndex = null;
      renderImageList();
    });

    list.appendChild(item);
  });
}

async function addImagesFromFiles(files) {
  const saveBtn = $("saveBtn");
  const original = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Uploading...";

  try {
    for (const file of files) {
      const url = await uploadToCloudinary(file);
      imagesState.push(url);
      renderImageList();
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = original;
  }
}

function resetForm() {
  $("editId").value = "";
  $("fName").value = "";
  $("fTag").value = "";
  $("fYear").value = "";
  $("fClient").value = "";
  $("fSize").value = "normal";
  $("fColor").value = "0";
  $("fShortDesc").value = "";
  $("fDesc").value = "";
  $("fUrl").value = "";
  $("imageFileInput").value = "";
  imagesState = [];
  renderImageList();
}

function openAdd() {
  resetForm();
  $("formTitle").textContent = "Add Project";
  $("formSub").textContent = "새 프로젝트 정보를 입력하세요.";
  switchTab("add");
}

function renderAdminList() {
  const list = $("adminProjectList");
  list.innerHTML = "";

  if (!projectsCache.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><p>No projects. Click "Add Project" to start.</p></div>`;
    return;
  }

  const BG = ["#1a2d1a", "#1a1a2d", "#2d1a0a", "#0a1a2d", "#1a0d1a", "#0a2d1a"];
  projectsCache.forEach((p) => {
    const row = document.createElement("div");
    row.className = "project-row";
    const ci = parseInt(p.color || "0", 10) % 6;
    const thumb = p.thumb || (p.images?.[0] || "");
    const thumbStyle = thumb
      ? `background-image:url('${thumb}');background-size:cover;background-position:center;`
      : `background:${BG[ci]};`;
    row.innerHTML = `
      <div class="project-row-thumb" style="${thumbStyle}">${!thumb ? "no img" : ""}</div>
      <div class="project-row-info">
        <div class="project-row-name">${p.name || ""}</div>
        <div class="project-row-tag">${p.tag || ""}${p.year ? " · " + p.year : ""}${p.size === "large" ? " · LARGE" : ""}</div>
      </div>
      <div class="project-row-actions">
        <button class="btn-edit" data-id="${p.dbId}">Edit</button>
        <button class="btn-delete" data-id="${p.dbId}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".btn-edit").forEach((b) => b.addEventListener("click", () => editProject(b.dataset.id)));
  list.querySelectorAll(".btn-delete").forEach((b) => b.addEventListener("click", () => deleteProject(b.dataset.id)));
}

async function deleteProject(dbId) {
  if (!confirm("이 프로젝트를 삭제하시겠습니까?")) return;
  await deleteProjectFromDB(dbId);
  renderAdminList();
  showToast("프로젝트가 삭제되었습니다");
}

function editProject(dbId) {
  const p = projectsCache.find((x) => x.dbId === dbId);
  if (!p) return;
  $("editId").value = p.dbId;
  $("fName").value = p.name || "";
  $("fTag").value = p.tag || "";
  $("fYear").value = p.year || "";
  $("fClient").value = p.client || "";
  $("fSize").value = p.size || "normal";
  $("fColor").value = p.color || "0";
  $("fShortDesc").value = p.shortDesc || "";
  $("fDesc").value = p.desc || "";
  $("fUrl").value = p.url || "";
  imagesState = Array.isArray(p.images) ? p.images.slice() : [];
  renderImageList();
  $("formTitle").textContent = "Edit Project";
  $("formSub").textContent = `수정 중: ${p.name || ""}`;
  switchTab("add");
}

function initMenu() {
  document.querySelectorAll(".admin-nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(item.dataset.tab);
    });
  });

  $("goAddBtn").addEventListener("click", openAdd);
  $("cancelEditBtn").addEventListener("click", () => {
    resetForm();
    switchTab("projects");
  });
}

function initImages() {
  const dropzone = $("imageDropzone");
  const input = $("imageFileInput");

  const openPicker = () => input.click();
  dropzone.addEventListener("click", openPicker);
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    await addImagesFromFiles(files);
  });

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    await addImagesFromFiles(files);
    input.value = "";
  });
}

function initSave() {
  $("saveBtn").addEventListener("click", async () => {
    const name = $("fName").value.trim();
    const tag = $("fTag").value.trim();
    if (!name || !tag) {
      alert("프로젝트 이름과 카테고리는 필수입니다.");
      return;
    }

    const editId = $("editId").value.trim();
    const images = imagesState.slice();
    const data = {
      name,
      tag,
      year: $("fYear").value.trim(),
      client: $("fClient").value.trim(),
      size: $("fSize").value,
      color: $("fColor").value,
      shortDesc: $("fShortDesc").value.trim(),
      desc: $("fDesc").value.trim(),
      images,
      thumb: images[0] || "",
      url: $("fUrl").value.trim()
    };
    if (editId) data.dbId = editId;

    const saveBtn = $("saveBtn");
    const original = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await saveProjectToDB(data);
      renderAdminList();
      resetForm();
      showToast(editId ? "✓ 프로젝트가 수정되었습니다" : "✓ 프로젝트가 추가되었습니다");
      switchTab("projects");
    } catch (e) {
      alert("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  });
}

function initAbout() {
  $("saveAboutBtn").addEventListener("click", async () => {
    const btn = $("saveAboutBtn");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      await saveAboutToDB($("adminAboutText").value);
      showToast("✓ About이 저장되었습니다");
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function initPinGate() {
  const ADMIN_PW = "1234";
  const overlay = $("pwOverlay");
  const cancel = $("pwCancel");
  const keypad = overlay.querySelector(".pw-keypad");
  const errorEl = $("pwError");
  let input = "";

  function updateDots() {
    for (let i = 0; i < 4; i++) {
      $("d" + i).classList.toggle("filled", i < input.length);
    }
  }

  function open() {
    input = "";
    updateDots();
    errorEl.textContent = "";
    overlay.classList.add("open");
  }

  function close() {
    overlay.classList.remove("open");
  }

  cancel.addEventListener("click", () => {
    window.location.href = "./";
  });

  keypad.addEventListener("click", (e) => {
    const k = e.target.closest(".pw-key");
    if (!k) return;
    const v = k.dataset.k;
    if (v === "del") {
      input = input.slice(0, -1);
      updateDots();
      errorEl.textContent = "";
      return;
    }
    if (input.length >= 4) return;
    input += v;
    updateDots();
    if (input.length === 4) {
      if (input === ADMIN_PW) {
        sessionStorage.setItem("admin_ok", "1");
        close();
      } else {
        errorEl.textContent = "❌ Wrong PIN";
        setTimeout(() => {
          input = "";
          updateDots();
          errorEl.textContent = "";
        }, 900);
      }
    }
  });

  if (sessionStorage.getItem("admin_ok") === "1") {
    overlay.classList.remove("open");
    return;
  }
  open();
}

async function init() {
  initPinGate();
  initMenu();
  initImages();
  initSave();
  initAbout();

  await fetchProjectsFromDB();
  renderAdminList();

  const about = await fetchAboutFromDB();
  $("adminAboutText").value = about;
}

init();
