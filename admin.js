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
let mediaState = [];
let dragFromIndex = null;
const WORK_CATS = ["UI/UX", "Illustration & Lottie", "3D", "Motion", "Promotion", "Editing"];
let selectedMedia = new Set();
let embedState = [];
let gridLinkEditingIndex = null;
let gridLinkDraft = [];

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

function normalizeLinkInput(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (
    (s.startsWith("`") && s.endsWith("`")) ||
    (s.startsWith("\"") && s.endsWith("\"")) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/^<a[\s\S]*?>/i.test(s)) {
    const m = s.match(/href\s*=\s*["']([^"']+)["']/i);
    s = (m?.[1] || "").trim();
  }
  s = s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {}
  return "";
}

function renderEmbedList() {
  const wrap = $("embedList");
  if (!wrap) return;
  wrap.innerHTML = "";
  embedState.forEach((v, idx) => {
    const row = document.createElement("div");
    row.className = "embed-row";
    row.dataset.idx = String(idx);
    row.innerHTML = `
      <input class="form-input" type="text" placeholder="https://player.vimeo.com/video/... 또는 <iframe ...>" value="">
      <button class="embed-remove" type="button" aria-label="Remove">×</button>
    `;
    const input = row.querySelector("input");
    const del = row.querySelector("button");
    input.value = v || "";
    input.addEventListener("input", () => {
      embedState[idx] = input.value;
    });
    del.addEventListener("click", () => {
      embedState = embedState.filter((_, i) => i !== idx);
      renderEmbedList();
    });
    wrap.appendChild(row);
  });
}

function initEmbeds() {
  const addBtn = $("addEmbedBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      embedState = Array.isArray(embedState) ? embedState : [];
      embedState.push("");
      renderEmbedList();
      const wrap = $("embedList");
      const inputs = wrap ? wrap.querySelectorAll("input") : [];
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    });
  }

  const wrap = $("embedList");
  if (wrap && window.Sortable) {
    Sortable.create(wrap, {
      animation: 150,
      onEnd: (evt) => {
        const from = evt.oldIndex;
        const to = evt.newIndex;
        if (from === undefined || to === undefined) return;
        if (from === to) return;
        const next = embedState.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        embedState = next;
        renderEmbedList();
      },
    });
  }

  renderEmbedList();
}

function openGridLinkEditor(idx) {
  const overlay = $("gridLinkOverlay");
  const list = $("gridLinkList");
  if (!overlay || !list) return;
  const blocks = normalizeMediaBlocks(mediaState);
  const b = blocks[idx];
  if (!b || b.type !== "grid") return;
  gridLinkEditingIndex = idx;
  gridLinkDraft = (b.items || []).map((it) => ({
    url: String(it?.url || ""),
    linkUrl: it?.linkUrl ? String(it.linkUrl) : ""
  }));
  list.innerHTML = "";
  gridLinkDraft.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "gridlink-row";
    row.innerHTML = `
      <div class="gridlink-thumb"></div>
      <input class="form-input" type="text" placeholder="https://... (새창)" value="">
    `;
    const thumb = row.querySelector(".gridlink-thumb");
    const input = row.querySelector("input");
    thumb.style.backgroundImage = it.url ? `url('${it.url}')` : "";
    input.value = it.linkUrl || "";
    input.addEventListener("input", () => {
      gridLinkDraft[i].linkUrl = input.value;
    });
    list.appendChild(row);
  });
  overlay.classList.add("open");
}

function closeGridLinkEditor() {
  const overlay = $("gridLinkOverlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  gridLinkEditingIndex = null;
  gridLinkDraft = [];
}

function saveGridLinkEditor() {
  if (gridLinkEditingIndex === null) return;
  const blocks = normalizeMediaBlocks(mediaState);
  const b = blocks[gridLinkEditingIndex];
  if (!b || b.type !== "grid") return;
  b.items = gridLinkDraft.map((it) => {
    const linkUrl = normalizeLinkInput(it.linkUrl);
    return { url: it.url, ...(linkUrl ? { linkUrl } : {}) };
  });
  mediaState = blocks;
  renderImageList();
  updateImageToolbar();
  closeGridLinkEditor();
}

function isMediaBlock(v) {
  return v && typeof v === "object" && (v.type === "image" || v.type === "grid");
}

function normalizeMediaBlocks(blocks) {
  const raw = Array.isArray(blocks) ? blocks : [];
  const out = [];
  raw.forEach((b) => {
    if (!b) return;
    if (typeof b === "string") {
      out.push({ type: "image", url: b });
      return;
    }
    if (b.type === "image" && b.url) {
      const linkUrl = b.linkUrl ? normalizeLinkInput(b.linkUrl) : "";
      out.push({ type: "image", url: String(b.url), ...(linkUrl ? { linkUrl } : {}) });
      return;
    }
    if (b.type === "grid") {
      const cols = b.cols === 3 ? 3 : 2;
      const items = Array.isArray(b.items)
        ? b.items
            .map((it) => {
              if (!it) return null;
              if (typeof it === "string") return { url: String(it) };
              if (typeof it === "object" && it.url) {
                const linkUrl = it.linkUrl ? normalizeLinkInput(it.linkUrl) : "";
                return { url: String(it.url), ...(linkUrl ? { linkUrl } : {}) };
              }
              return null;
            })
            .filter(Boolean)
        : [];
      if (items.length) out.push({ type: "grid", cols, items });
    }
  });
  return out;
}

function mediaBlocksFromImages(images) {
  const list = Array.isArray(images) ? images : [];
  return list.filter(Boolean).map((url) => ({ type: "image", url: String(url) }));
}

function flattenMediaBlocks(blocks) {
  const out = [];
  normalizeMediaBlocks(blocks).forEach((b) => {
    if (b.type === "image") out.push(b.url);
    else out.push(...(b.items || []).map((it) => (typeof it === "string" ? it : it?.url)));
  });
  return out.filter(Boolean);
}

function getCoverUrlFromBlocks(blocks) {
  const flat = flattenMediaBlocks(blocks);
  return flat[0] || "";
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
  const blocks = Array.isArray(p.mediaBlocks) ? normalizeMediaBlocks(p.mediaBlocks) : [];
  const rawImages = flattenMediaBlocks(blocks).length
    ? flattenMediaBlocks(blocks)
    : (Array.isArray(p.images) ? p.images : [p.img1, p.img2].filter(Boolean)).slice().filter(Boolean);
  const img = rawImages.slice().filter(Boolean);
  const thumb = p.thumb || "";
  if (!img.length && thumb) img.push(thumb);
  if (thumb && img[0] !== thumb) img.unshift(thumb);
  const mediaBlocks = blocks.length ? blocks : mediaBlocksFromImages(img);
  const nextThumb = img[0] || thumb || "";
  return { ...p, hidden: !!p.hidden, images: img, mediaBlocks, thumb: nextThumb };
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

  const blocks = normalizeMediaBlocks(mediaState);
  mediaState = blocks;

  blocks.forEach((b, idx) => {
    const item = document.createElement("div");
    item.className = "image-item";
    item.draggable = true;
    item.dataset.idx = String(idx);
    item.classList.toggle("selected", selectedMedia.has(idx));

    const badge = document.createElement("div");
    badge.className = "image-badge";
    if (idx === 0) badge.textContent = "Cover";
    else badge.textContent = b.type === "grid" ? `Grid ${b.cols}` : `#${idx + 1}`;

    const actions = document.createElement("div");
    actions.className = "image-actions";

    if (b.type === "image") {
      const linkBtn = document.createElement("button");
      linkBtn.type = "button";
      linkBtn.className = "image-btn dim";
      linkBtn.textContent = "Link";
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const next = prompt("Image Link URL (새창)", b.linkUrl || "");
        const linkUrl = normalizeLinkInput(next);
        const nextBlocks = normalizeMediaBlocks(mediaState);
        nextBlocks[idx] = { type: "image", url: b.url, ...(linkUrl ? { linkUrl } : {}) };
        mediaState = nextBlocks;
        renderImageList();
        updateImageToolbar();
      });
      actions.appendChild(linkBtn);
    } else if (b.type === "grid") {
      const linksBtn = document.createElement("button");
      linksBtn.type = "button";
      linksBtn.className = "image-btn dim";
      linksBtn.textContent = "Links";
      linksBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openGridLinkEditor(idx);
      });
      actions.appendChild(linksBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "image-btn danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mediaState = blocks.filter((_, i) => i !== idx);
      selectedMedia = new Set(Array.from(selectedMedia).filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
      renderImageList();
      updateImageToolbar();
    });

    actions.appendChild(removeBtn);

    item.addEventListener("click", (e) => {
      if (e.target.closest(".image-actions")) return;
      if (selectedMedia.has(idx)) selectedMedia.delete(idx);
      else selectedMedia.add(idx);
      renderImageList();
      updateImageToolbar();
    });

    if (b.type === "grid") {
      const grid = document.createElement("div");
      grid.className = "image-thumb-grid";
      const items = (b.items || []).slice(0, 4).map((it) => (typeof it === "string" ? { url: it } : it));
      while (items.length < 4) items.push({ url: "" });
      items.forEach((it) => {
        const cell = document.createElement("span");
        const u = it?.url || "";
        if (u) cell.style.backgroundImage = `url('${u}')`;
        grid.appendChild(cell);
      });
      item.appendChild(grid);
    } else {
      const thumb = document.createElement("div");
      thumb.className = "image-thumb";
      thumb.style.backgroundImage = `url('${b.url}')`;
      item.appendChild(thumb);
    }

    if (b.type === "image" && b.linkUrl) {
      const lb = document.createElement("div");
      lb.className = "image-link-badge";
      lb.textContent = "LINK";
      item.appendChild(lb);
    }

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
      const next = blocks.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      mediaState = next;
      dragFromIndex = null;
      selectedMedia = new Set();
      renderImageList();
      updateImageToolbar();
    });

    list.appendChild(item);
  });
}

function updateImageToolbar() {
  const g2 = $("group2Btn");
  const g3 = $("group3Btn");
  const ug = $("ungroupBtn");
  const selected = Array.from(selectedMedia).sort((a, b) => a - b);
  const blocks = normalizeMediaBlocks(mediaState);
  const canGroup = selected.length >= 2;
  const canUngroup = selected.some((i) => blocks[i]?.type === "grid");
  if (g2) g2.disabled = !canGroup;
  if (g3) g3.disabled = !canGroup;
  if (ug) ug.disabled = !canUngroup;
}

function groupSelected(cols) {
  const selected = Array.from(selectedMedia).sort((a, b) => a - b);
  if (selected.length < 2) return;
  const blocks = normalizeMediaBlocks(mediaState);
  const items = [];
  selected.forEach((i) => {
    const b = blocks[i];
    if (!b) return;
    if (b.type === "image") items.push({ url: b.url, ...(b.linkUrl ? { linkUrl: b.linkUrl } : {}) });
    else items.push(...(b.items || []).map((it) => (typeof it === "string" ? { url: it } : it)));
  });
  const min = selected[0];
  const next = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === min) next.push({ type: "grid", cols: cols === 3 ? 3 : 2, items: items.filter((it) => it?.url) });
    if (selected.includes(i)) continue;
    next.push(blocks[i]);
  }
  mediaState = next;
  selectedMedia = new Set();
  renderImageList();
  updateImageToolbar();
}

function ungroupSelected() {
  const selected = Array.from(selectedMedia).sort((a, b) => b - a);
  const blocks = normalizeMediaBlocks(mediaState);
  selected.forEach((i) => {
    const b = blocks[i];
    if (!b || b.type !== "grid") return;
    const items = (b.items || [])
      .filter(Boolean)
      .map((it) => (typeof it === "string" ? { url: it } : it))
      .filter((it) => it?.url)
      .map((it) => ({ type: "image", url: it.url, ...(it.linkUrl ? { linkUrl: it.linkUrl } : {}) }));
    blocks.splice(i, 1, ...items);
  });
  mediaState = blocks;
  selectedMedia = new Set();
  renderImageList();
  updateImageToolbar();
}

async function addImagesFromFiles(files) {
  const saveBtn = $("saveBtn");
  const original = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Uploading...";

  try {
    for (const file of files) {
      const url = await uploadToCloudinary(file);
      mediaState = normalizeMediaBlocks(mediaState);
      mediaState.push({ type: "image", url });
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
  $("fCustomHtml").value = "";
  $("fHidden").checked = false;
  embedState = [];
  renderEmbedList();
  $("imageFileInput").value = "";
  mediaState = [];
  selectedMedia = new Set();
  renderImageList();
  updateImageToolbar();
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
    const hiddenPill = p.hidden ? ` <span class="hidden-pill">HIDDEN</span>` : "";
    row.innerHTML = `
      <div class="project-drag-handle">⋮⋮</div>
      <div class="project-row-thumb" style="${thumbStyle}">${!thumb ? "no img" : ""}</div>
      <div class="project-row-info">
        <div class="project-row-name">${p.name || ""}</div>
        <div class="project-row-tag">${p.tag || ""}${p.year ? " · " + p.year : ""}${p.size === "large" ? " · LARGE" : ""}${hiddenPill}</div>
      </div>
      <div class="project-row-actions">
        <button class="btn-toggle" data-id="${p.dbId}">${p.hidden ? "Show" : "Hide"}</button>
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
  list.querySelectorAll(".btn-toggle").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      const p = projectsCache.find((x) => x.dbId === id);
      if (!p) return;
      const nextHidden = !p.hidden;
      try {
        await updateDoc(doc(db, "projects", id), { hidden: nextHidden });
        await fetchProjectsFromDB();
        renderAdminList();
        showToast(nextHidden ? "✓ 숨김 처리되었습니다" : "✓ 공개 처리되었습니다");
      } catch {
        alert("저장 중 오류가 발생했습니다.");
      }
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
  $("fHidden").checked = !!p.hidden;
  $("fYear").value = p.year || "";
  $("fClient").value = p.client || "";
  $("fSize").value = p.size || "normal";
  $("fColor").value = p.color || "0";
  $("fShortDesc").value = p.shortDesc || "";
  $("fDesc").value = p.desc || "";
  $("fUrl").value = p.url || "";
  $("fCustomHtml").value = p.customHtml || "";
  embedState = Array.isArray(p.embedUrls) ? p.embedUrls.slice() : (p.embedUrl ? [p.embedUrl] : []);
  renderEmbedList();
  mediaState = Array.isArray(p.mediaBlocks) ? normalizeMediaBlocks(p.mediaBlocks) : mediaBlocksFromImages(Array.isArray(p.images) ? p.images : []);
  selectedMedia = new Set();
  renderImageList();
  updateImageToolbar();
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
  const g2 = $("group2Btn");
  const g3 = $("group3Btn");
  const ug = $("ungroupBtn");

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

  if (g2) g2.addEventListener("click", () => groupSelected(2));
  if (g3) g3.addEventListener("click", () => groupSelected(3));
  if (ug) ug.addEventListener("click", () => ungroupSelected());
  updateImageToolbar();
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
    const mediaBlocks = normalizeMediaBlocks(mediaState);
    const images = flattenMediaBlocks(mediaBlocks);
    const workCats = getWorkCatsFromForm();
    const embedUrls = (Array.isArray(embedState) ? embedState : []).map(normalizeEmbedInput).filter(Boolean);
    const data = {
      name,
      tag,
      workCats,
      hidden: $("fHidden").checked,
      year: $("fYear").value.trim(),
      client: $("fClient").value.trim(),
      size: $("fSize").value,
      color: $("fColor").value,
      shortDesc: $("fShortDesc").value.trim(),
      desc: $("fDesc").value.trim(),
      customHtml: $("fCustomHtml").value || "",
      images,
      mediaBlocks,
      thumb: images[0] || "",
      url: $("fUrl").value.trim(),
      embedUrls,
      embedUrl: embedUrls[0] || ""
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

function initGridLinkEditor() {
  const closeBtn = $("gridLinkClose");
  const cancelBtn = $("gridLinkCancel");
  const saveBtn = $("gridLinkSave");
  const overlay = $("gridLinkOverlay");
  if (closeBtn) closeBtn.addEventListener("click", closeGridLinkEditor);
  if (cancelBtn) cancelBtn.addEventListener("click", closeGridLinkEditor);
  if (saveBtn) saveBtn.addEventListener("click", saveGridLinkEditor);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeGridLinkEditor();
    });
  }
}

async function init() {
  initPinGate();
  initMenu();
  initImages();
  initEmbeds();
  initGridLinkEditor();
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
