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
const WORK_CATS = ["UI/UX", "Illustration & Lottie", "3D", "Motion"];

function $(id) {
  return document.getElementById(id);
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

function syncWorkCatsUI() {
  const wrap = $("workCats");
  if (!wrap) return;
  wrap.querySelectorAll(".cat-chip").forEach((label) => {
    const input = label.querySelector("input[type=\"checkbox\"]");
    if (!input) return;
    label.classList.toggle("checked", input.checked);
  });
}

function getWorkCatsFromForm() {
  const wrap = $("workCats");
  if (!wrap) return ["UI/UX"];
  const checked = Array.from(wrap.querySelectorAll("input[type=\"checkbox\"]"))
    .filter((i) => i.checked)
    .map((i) => i.value)
    .filter(Boolean);
  return checked.length ? checked : ["UI/UX"];
}

function setWorkCatsInForm(cats) {
  const wrap = $("workCats");
  if (!wrap) return;
  const set = new Set(Array.isArray(cats) ? cats : []);
  wrap.querySelectorAll("input[type=\"checkbox\"]").forEach((i) => {
    i.checked = set.size ? set.has(i.value) : i.value === "UI/UX";
  });
  syncWorkCatsUI();
}

function normalizeEmbedInput(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (
    (s.startsWith("`") && s.endsWith("`")) ||
    (s.startsWith("\"") && s.endsWith("\"")) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/^<iframe[\s\S]*?>/i.test(s)) {
    const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
    s = (m?.[1] || "").trim();
  }
  if (!s) return "";
  s = s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  const vimeoId = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1];
  if (vimeoId && !/player\.vimeo\.com\/video\//i.test(s)) {
    s = `https://player.vimeo.com/video/${vimeoId}`;
  }
  const ytId = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i)?.[1];
  if (ytId && !/youtube\.com\/embed\//i.test(s)) {
    s = `https://www.youtube.com/embed/${ytId}`;
  }
  return s;
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
  // 'order' 필드가 있으면 그것으로 정렬, 없으면 createdAt으로 정렬
  list.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
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
    // 새 프로젝트는 가장 마지막 순서로 (현재 프로젝트 개수만큼의 order 부여)
    data.order = projectsCache.length;
    await addDoc(collection(db, "projects"), data);
  }
  await fetchProjectsFromDB();
}

async function saveProjectsOrder(newOrderIds) {
  const batch = []; // Firebase 9에서는 별도의 batch API가 있지만 간단하게 루프로 처리
  for (let i = 0; i < newOrderIds.length; i++) {
    const id = newOrderIds[i];
    const docRef = doc(db, "projects", id);
    await updateDoc(docRef, { order: i });
  }
  await fetchProjectsFromDB();
}

async function migrateWorkCatsDefault() {
  let changed = 0;
  for (const p of projectsCache) {
    const cats = p.workCats;
    if (Array.isArray(cats) && cats.length) continue;
    if (!p.dbId) continue;
    await updateDoc(doc(db, "projects", p.dbId), { workCats: ["UI/UX"] });
    changed += 1;
  }
  if (changed) {
    await fetchProjectsFromDB();
    showToast(`✓ 기존 ${changed}개 프로젝트를 UI/UX로 설정했습니다`);
  }
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
  setWorkCatsInForm(["UI/UX"]);
  $("fYear").value = "";
  $("fClient").value = "";
  $("fSize").value = "normal";
  $("fColor").value = "0";
  $("fShortDesc").value = "";
  $("fDesc").value = "";
  $("fUrl").value = "";
  $("fEmbedUrl").value = "";
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
    row.dataset.id = p.dbId; // 드래그 앤 드롭을 위한 id
    const ci = parseInt(p.color || "0", 10) % 6;
    const thumb = p.thumb || (p.images?.[0] || "");
    const thumbStyle = thumb
      ? `background-image:url('${thumb}');background-size:cover;background-position:center;`
      : `background:${BG[ci]};`;
    row.innerHTML = `
      <div class="project-drag-handle">⋮⋮</div>
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
    row.addEventListener("click", (e) => {
      if (e.target.closest(".btn-edit")) return;
      if (e.target.closest(".btn-delete")) return;
      if (e.target.closest(".project-drag-handle")) return;
      editProject(p.dbId);
    });
    list.appendChild(row);
  });

  // SortableJS 초기화
  if (projectsCache.length > 1) {
    Sortable.create(list, {
      handle: ".project-drag-handle",
      animation: 150,
      onEnd: async () => {
        const rows = list.querySelectorAll(".project-row");
        const newOrderIds = Array.from(rows).map((row) => row.dataset.id);
        try {
          await saveProjectsOrder(newOrderIds);
          showToast("✓ 순서가 저장되었습니다");
        } catch (e) {
          console.error("Order save failed", e);
          alert("순서 저장에 실패했습니다.");
        }
      },
    });
  }

  list.querySelectorAll(".btn-edit").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      editProject(b.dataset.id);
    })
  );
  list.querySelectorAll(".btn-delete").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(b.dataset.id);
    })
  );
  list.querySelectorAll(".project-drag-handle").forEach((h) =>
    h.addEventListener("click", (e) => e.stopPropagation())
  );
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
  setWorkCatsInForm(Array.isArray(p.workCats) ? p.workCats : ["UI/UX"]);
  $("fYear").value = p.year || "";
  $("fClient").value = p.client || "";
  $("fSize").value = p.size || "normal";
  $("fColor").value = p.color || "0";
  $("fShortDesc").value = p.shortDesc || "";
  $("fDesc").value = p.desc || "";
  $("fUrl").value = p.url || "";
  $("fEmbedUrl").value = p.embedUrl || "";
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
    const workCats = getWorkCatsFromForm();
    const data = {
      name,
      tag,
      workCats,
      year: $("fYear").value.trim(),
      client: $("fClient").value.trim(),
      size: $("fSize").value,
      color: $("fColor").value,
      shortDesc: $("fShortDesc").value.trim(),
      desc: $("fDesc").value.trim(),
      images,
      thumb: images[0] || "",
      url: $("fUrl").value.trim(),
      embedUrl: normalizeEmbedInput($("fEmbedUrl").value)
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
  syncWorkCatsUI();
  $("workCats")?.addEventListener("change", syncWorkCatsUI);

  await fetchProjectsFromDB();
  await migrateWorkCatsDefault();
  renderAdminList();

  const about = await fetchAboutFromDB();
  $("adminAboutText").value = about;
}

init();
