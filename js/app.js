/* =========================================================
   AUTO COLLAGE - APPDIGI
   PRINT LAYOUT + PHOTO NUMBER PAIRING
========================================================= */

const MAX_IDS = 10;
const MAX_FILES = 20;

const state = {
    files: [],
    groups: new Map(),
    sizes: new Map(),
    placements: [],
    canvas: null,
    zoom: 0.5,
    generated: false,
    template: null,
    frames: [],
    canvasReady: false,
    drag: {
        active: false,
        placement: null,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0
    },
    crop: {
        item:null,
        aspect:1,
        sourceRect:null,
        zoom:1,
        display:null,
        selectionStage:null,
        imageOffsetX:0,
        imageOffsetY:0,
        movingImage:false,
        movingFrame:false,
        resizing:false,
        resizeHandle:null,
        startX:0,
        startY:0,
        startSelection:null,
        startOffsetX:0,
        startOffsetY:0
    }
};

const $ = s => document.querySelector(s);

const fileInput = $("#photoInput");
const fileList = $("#pairList");
const sizeList = $("#sizeControls");

const canvasWidth = $("#canvasWidth");
const canvasHeight = $("#canvasHeight");
const dpiInput = $("#dpi");
const marginInput = $("#margin");
const gapInput = $("#gap");
const autoSpacing = $("#autoSpacing");

const generateBtn = $("#generateBtn");
const shuffleBtn = $("#shuffleBtn");
const resetBtn = $("#resetBtn");

const previewCanvas = $("#collageCanvas");
const canvasWorkspace = $("#canvasWorkspace");

const zoomValue = $("#zoomValue");
const zoomOutBtn = $("#zoomOutBtn");
const zoomInBtn = $("#zoomInBtn");

const exportPngBtn = $("#exportPngBtn");
const exportJpgBtn = $("#exportJpgBtn");
const exportBtn = $("#exportBtn");

const pixelInfo = $("#pixelInfo");
const canvasRatio = $("#canvasRatio");
const previewInfo = $("#previewInfo");
const placedCount = $("#placedCount");
const photoCounter = $("#photoCounter");
const canvasSizeInfo = $("#canvasSizeInfo");
const resolutionInfo = $("#resolutionInfo");
const layoutStatus = $("#layoutStatus");
const fileWarning = $("#fileWarning");
const createCanvasBtn = $("#createCanvasBtn");
const addFrameBtn = $("#addFrameBtn");
const frameWidthInput = $("#frameWidth");
const frameHeightInput = $("#frameHeight");
const frameXInput = $("#frameX");
const frameYInput = $("#frameY");
const cropModal=$("#cropModal"),cropCanvas=$("#cropCanvas"),cropStage=$("#cropStage"),cropSelection=$("#cropSelection"),cropTitle=$("#cropTitle"),cropSubtitle=$("#cropSubtitle"),cropRatioLabel=$("#cropRatioLabel"),cropZoom=$("#cropZoom"),cropResetBtn=$("#cropResetBtn"),cropCloseBtn=$("#cropCloseBtn"),cropCancelBtn=$("#cropCancelBtn"),cropSaveBtn=$("#cropSaveBtn"),cropCanvasBtn=$("#cropCanvasBtn"),workspaceGenerateBtn=$("#workspaceGenerateBtn");

function cmToPx(cm, dpi) {
    return Number(cm) * Number(dpi) / 2.54;
}

function n(v, fallback = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
}

function esc(v) {
    return String(v)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

/* =========================================================
   FILE NAME PARSER
   PAIRING = NOMOR FOTO YANG SAMA
========================================================= */

function normalizePhotoId(value) {
    let s = String(value || "")
        .replace(/\bcopy\b(?:\s*\d+)?/ig, " ")
        .replace(/[()[\]]/g, " ")
        .trim();

    /*
     * Nomor foto adalah angka yang menempel/berdekatan
     * dengan nama foto, misalnya:
     * DSCF1123 -> 1123
     * DSCF 1123 -> 1123
     * 1123 -> 1123
     */
    const nums = s.match(/\d+/g);

    if (nums && nums.length) {
        return nums[nums.length - 1];
    }

    return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseFilename(filename) {
    const name = filename.replace(/\.[^/.]+$/, "").trim();

    const sizeMatch = name.match(
        /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/i
    );

    if (!sizeMatch) {
        return {
            valid: false,
            id: normalizePhotoId(name),
            displayId: name,
            width: null,
            height: null,
            sizeKey: null
        };
    }

    const width = n(sizeMatch[1].replace(",", "."));
    const height = n(sizeMatch[2].replace(",", "."));

    const beforeSize = name.slice(0, sizeMatch.index).trim();
    const afterSize = name.slice(
        sizeMatch.index + sizeMatch[0].length
    ).trim();

    const rawId = beforeSize || afterSize;

    return {
        valid: true,
        id: normalizePhotoId(rawId),
        displayId: rawId,
        width,
        height,
        sizeKey: `${width}x${height}`
    };
}

/* =========================================================
   LOAD IMAGE
========================================================= */

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Gagal membaca " + file.name));
        };

        img.src = url;
    });
}

/* =========================================================
   UPLOAD
========================================================= */

async function processFiles(fileArray) {
    const files = Array.from(fileArray).slice(0, MAX_FILES);

    state.files = [];
    state.groups.clear();
    state.sizes.clear();
    state.placements = [];
    state.generated = false;

    // Frame/layout tetap dipertahankan saat foto baru di-upload.
    // Foto hanya mengisi frame yang sudah dibuat.
    for (const file of files) {
        const parsed = parseFilename(file.name);

        const item = {
            file,
            name: file.name,
            ...parsed,
            image: null,
            naturalWidth: 0,
            naturalHeight: 0
        };

        try {
            const img = await loadImage(file);
            item.image = img;
            item.naturalWidth = img.naturalWidth;
            item.naturalHeight = img.naturalHeight;
        } catch {
            item.error = true;
        }

        state.files.push(item);
    }

    buildGroups();
    renderPairs();
    renderSizeControls();
    updateInfo();
}

/* =========================================================
   GROUP BY PHOTO NUMBER
========================================================= */

function buildGroups() {
    state.groups.clear();
    state.sizes.clear();

    for (const item of state.files) {
        if (!item.valid || !item.id) continue;

        if (!state.groups.has(item.id)) {
            state.groups.set(item.id, {
                id: item.id,
                displayId: item.displayId,
                files: new Map()
            });
        }

        const group = state.groups.get(item.id);

        if (!group.files.has(item.sizeKey)) {
            group.files.set(item.sizeKey, item);
        }

        if (!state.sizes.has(item.sizeKey)) {
            state.sizes.set(item.sizeKey, {
                key: item.sizeKey,
                width: item.width,
                height: item.height
            });
        }
    }
}

/* =========================================================
   PAIR DISPLAY
========================================================= */

function renderPairs() {
    if (!fileList) return;

    if (!state.files.length) {
        fileList.innerHTML =
            '<div class="empty-state">Belum ada foto</div>';
        return;
    }

    let html = "";

    for (const group of state.groups.values()) {
        const sizeKeys = [...state.sizes.keys()];
        const complete = sizeKeys.every(k => group.files.has(k));

        html += `
            <div class="file-group">
                <div class="file-group-header">
                    <strong>Foto #${esc(group.id)}</strong>
                    <span class="${complete ? "pair-ok" : "pair-warning"}">
                        ${complete ? "✓ Lengkap" : "Tidak lengkap"}
                    </span>
                </div>
                <div class="file-group-files">
        `;

        for (const key of sizeKeys) {
            const item = group.files.get(key);

            html += item
                ? `
                    <div class="file-row file-present">
                        <span>✓</span>
                        <span>${esc(item.name)}</span>
                        <button type="button" class="crop-button${item.crop ? " cropped" : ""}" data-crop-id="${esc(item.id)}" data-crop-size="${esc(item.sizeKey)}">${item.crop ? "Crop ✓" : "Crop"}</button>
                    </div>
                  `
                : `
                    <div class="file-row file-missing">
                        <span>—</span>
                        <span>${esc(key)} belum ada</span>
                    </div>
                  `;
        }

        html += "</div></div>";
    }

    const invalid = state.files.filter(x => !x.valid);

    if (invalid.length) {
        html += `
            <div class="invalid-files">
                <strong>⚠ Format tidak dikenali</strong>
        `;

        for (const item of invalid) {
            html += `
                <div>
                    ${esc(item.name)}
                    <small>Contoh: DSCF1123 2x3.jpg</small>
                </div>
            `;
        }

        html += "</div>";
    }

    fileList.innerHTML = html;

    if (fileWarning) {
        const incomplete = [...state.groups.values()]
            .filter(g => [...state.sizes.keys()].some(k => !g.files.has(k)));

        fileWarning.textContent = incomplete.length
            ? "Ada pasangan foto yang belum lengkap. Foto tidak akan dipasangkan dengan nomor lain."
            : "";

        fileWarning.classList.toggle("hidden", incomplete.length === 0);
    }
}

/* =========================================================
   SIZE CONTROLS
========================================================= */

function renderSizeControls() {
    if (!sizeList) return;

    if (!state.sizes.size) {
        sizeList.innerHTML =
            '<div class="empty-state small">Upload foto terlebih dahulu.</div>';
        return;
    }

    let html = "";

    for (const size of state.sizes.values()) {
        let available = 0;

        for (const group of state.groups.values()) {
            if (group.files.has(size.key)) available++;
        }

        html += `
            <div class="size-row">
                <div>
                    <strong>${esc(size.key)}</strong>
                    <small>${size.width} × ${size.height} cm</small>
                </div>
                <input
                    class="size-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value="${available}"
                    data-size="${esc(size.key)}"
                >
            </div>
        `;
    }

    sizeList.innerHTML = html;
}

function getQuantities() {
    const result = new Map();

    document.querySelectorAll(".size-quantity").forEach(input => {
        result.set(
            input.dataset.size,
            Math.max(0, Math.floor(n(input.value, 0)))
        );
    });

    return result;
}

/* =========================================================
   PRINT QUEUE
========================================================= */

function createPrintQueue() {
    const queue = [];

    for (const [sizeKey, quantity] of getQuantities()) {
        if (quantity <= 0) continue;

        const sources = [];

        for (const group of state.groups.values()) {
            const source = group.files.get(sizeKey);
            if (source) sources.push({ id: group.id, source });
        }

        if (!sources.length) {
            throw new Error("Tidak ada foto " + sizeKey + " yang valid.");
        }

        for (let i = 0; i < quantity; i++) {
            const selected = sources[i % sources.length];

            queue.push({
                id: selected.id,
                sizeKey,
                source: selected.source,
                widthCm: selected.source.width,
                heightCm: selected.source.height
            });
        }
    }

    return queue;
}

/* =========================================================
   PACKING
========================================================= */

function packPhotos(queue, canvasW, canvasH, margin, gap) {
    const sorted = [...queue].sort((a, b) =>
        b.heightCm - a.heightCm || b.widthCm - a.widthCm
    );

    const rows = [];
    let row = null;
    const availableWidth = canvasW - margin * 2;

    for (const item of sorted) {
        if (!row) {
            row = {
                items: [],
                width: 0,
                height: item.heightCm
            };
        }

        const nextWidth =
            row.width +
            (row.items.length ? gap : 0) +
            item.widthCm;

        if (nextWidth <= availableWidth + 0.0001) {
            row.items.push(item);
            row.width = nextWidth;
            row.height = Math.max(row.height, item.heightCm);
        } else {
            rows.push(row);
            row = {
                items: [item],
                width: item.widthCm,
                height: item.heightCm
            };
        }
    }

    if (row && row.items.length) rows.push(row);

    const totalHeight =
        rows.reduce((sum, r) => sum + r.height, 0) +
        Math.max(0, rows.length - 1) * gap;

    if (totalHeight > canvasH - margin * 2 + 0.0001) {
        return {
            success: false,
            reason:
                `Canvas tidak cukup. Diperlukan sekitar ${totalHeight.toFixed(2)} cm, tersedia ${(canvasH - margin * 2).toFixed(2)} cm.`
        };
    }

    const placements = [];
    let y = margin;

    for (const r of rows) {
        let x = margin;

        for (const item of r.items) {
            placements.push({
                ...item,
                x,
                y,
                width: item.widthCm,
                height: item.heightCm
            });

            x += item.widthCm + gap;
        }

        y += r.height + gap;
    }

    return { success: true, placements, rows };
}

function applyAutoSpacing(result, canvasW, margin) {
    if (!result.success) return result;

    const rows = [];

    for (const item of result.placements) {
        let r = rows.find(x => Math.abs(x.y - item.y) < 0.001);

        if (!r) {
            r = { y: item.y, items: [] };
            rows.push(r);
        }

        r.items.push(item);
    }

    for (const r of rows) {
        const minX = Math.min(...r.items.map(x => x.x));
        const maxX = Math.max(...r.items.map(x => x.x + x.width));
        const extra = canvasW - margin * 2 - (maxX - minX);

        if (extra > 0) {
            const offset = extra / 2;
            r.items.forEach(x => x.x += offset);
        }
    }

    return result;
}

function validatePlacements(items, canvasW, canvasH) {
    const EPS = 0.0001;

    for (const a of items) {
        if (
            a.x < -EPS ||
            a.y < -EPS ||
            a.x + a.width > canvasW + EPS ||
            a.y + a.height > canvasH + EPS
        ) {
            return {
                valid: false,
                message: `Foto #${a.id} keluar dari canvas.`
            };
        }
    }

    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const a = items[i];
            const b = items[j];

            const overlapX =
                a.x < b.x + b.width - EPS &&
                a.x + a.width > b.x + EPS;

            const overlapY =
                a.y < b.y + b.height - EPS &&
                a.y + a.height > b.y + EPS;

            if (overlapX && overlapY) {
                return {
                    valid: false,
                    message: `Foto #${a.id} dan #${b.id} bertumpuk.`
                };
            }
        }
    }

    return { valid: true };
}

/* =========================================================
   CANVAS
========================================================= */

function createCanvasState() {
    const widthCm = n(canvasWidth?.value, 30);
    const heightCm = n(canvasHeight?.value, 40);
    const dpi = n(dpiInput?.value, 300);

    const widthPx = Math.round(cmToPx(widthCm, dpi));
    const heightPx = Math.round(cmToPx(heightCm, dpi));

    if ((widthPx * heightPx) / 1000000 > 100) {
        throw new Error("Canvas terlalu besar. Turunkan DPI atau ukuran canvas.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;

    return { canvas, widthCm, heightCm, dpi, widthPx, heightPx };
}

// Keep the actual drawing canvas synchronized with the latest size fields.
// Previously, changing width/height after the first crop left the internal
// canvas at its old dimensions, so generated photos could appear on a stale canvas.
function syncCanvasToInputs() {
    const widthCm = n(canvasWidth?.value, 30);
    const heightCm = n(canvasHeight?.value, 40);
    const dpi = n(dpiInput?.value, 300);
    const current = state.canvas;

    const changed = !current ||
        Math.abs(current.widthCm - widthCm) > 0.0001 ||
        Math.abs(current.heightCm - heightCm) > 0.0001 ||
        current.dpi !== dpi;

    if (!changed) return;

    const next = createCanvasState();
    state.canvas = next;
    state.canvasReady = true;
    state.placements = [];
    state.generated = false;

    // Keep only manual frames that still fit inside the resized canvas.
    state.frames = state.frames.filter(frame =>
        n(frame.x) >= 0 &&
        n(frame.y) >= 0 &&
        n(frame.x) + n(frame.width) <= next.widthCm + 0.0001 &&
        n(frame.y) + n(frame.height) <= next.heightCm + 0.0001
    );
}

function drawPhoto(ctx,item,x,y,w,h){
    if(!item.source.image)return;

    ctx.filter="none";
    ctx.imageSmoothingEnabled=true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality="high";

    const img=item.source.image;
    const c=item.crop || item.source.crop;

    if(c && c.canvas){
        const iw=img.naturalWidth;
        const ih=img.naturalHeight;
        const r=c.canvas.sourceRect;

        // NON-DESTRUCTIVE CANVAS CROP:
        // Foto asli tidak pernah diubah. Canvas/frame hanya
        // menentukan bagian foto mana yang terlihat di slot.
        if(r && r.width>0 && r.height>0){
            const sx=Math.max(0,Math.min(iw-1,n(r.x)*iw));
            const sy=Math.max(0,Math.min(ih-1,n(r.y)*ih));
            const sw=Math.max(1,Math.min(iw-sx,n(r.width)*iw));
            const sh=Math.max(1,Math.min(ih-sy,n(r.height)*ih));

            ctx.save();
            ctx.beginPath();
            ctx.rect(x,y,w,h);
            ctx.clip();
            ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
            ctx.restore();
            return;
        }

        // Backward compatibility untuk template crop lama.
        const cover=Math.max(w/iw,h/ih);
        const scale=cover*(Number(c.zoom)||1);
        const dw=iw*scale;
        const dh=ih*scale;
        const cx=Math.max(0,Math.min(1,Number(c.centerX)||0.5));
        const cy=Math.max(0,Math.min(1,Number(c.centerY)||0.5));
        const dx=x+w/2-(cx*dw);
        const dy=y+h/2-(cy*dh);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x,y,w,h);
        ctx.clip();
        ctx.drawImage(img,dx,dy,dw,dh);
        ctx.restore();
        return;
    }

    const sr=img.naturalWidth/img.naturalHeight,tr=w/h;
    let dw,dh;
    if(sr>tr){dw=w;dh=w/sr}else{dh=h;dw=h*sr}
    ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function renderCollage() {
    if (!state.canvas) return;

    const { canvas, dpi } = state.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawItems = state.placements.length ? state.placements : state.frames;
    for (const item of drawItems) {
        const x = cmToPx(item.x, dpi);
        const y = cmToPx(item.y, dpi);
        const w = cmToPx(item.width, dpi);
        const h = cmToPx(item.height, dpi);

        if (item.source?.image) {
            drawPhoto(ctx, item, x, y, w, h);
        } else {
            ctx.save();
            ctx.fillStyle = "#e9edf2";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#7c8794";
            ctx.lineWidth = Math.max(2, dpi / 150);
            ctx.setLineDash([Math.max(8, dpi / 30), Math.max(5, dpi / 60)]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = "#667085";
            ctx.font = `600 ${Math.max(18, dpi / 18)}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(item.sizeKey || "FRAME", x + w / 2, y + h / 2);
            ctx.restore();
        }
    }

    renderPreview();
}

function renderPreview() {
    if (!previewCanvas || !state.canvas?.canvas) return;

    const source = state.canvas.canvas;
    if (!source.width || !source.height) return;

    // The preview bitmap always retains the exact output pixel dimensions.
    // Only its CSS display size changes; export quality is unaffected.
    if (previewCanvas.width !== source.width) previewCanvas.width = source.width;
    if (previewCanvas.height !== source.height) previewCanvas.height = source.height;

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(source, 0, 0);

    // Fit to the available stage using ONE scale factor for both axes.
    // This prevents width and height constraints from stretching the ratio.
    const stage = document.querySelector(".canvas-stage");
    const stageWidth = Math.max(1, (stage?.clientWidth || window.innerWidth) - 28);
    const stageHeight = Math.max(1, (stage?.clientHeight || window.innerHeight * 0.65) - 28);
    const fitScale = Math.min(stageWidth / source.width, stageHeight / source.height);
    // 50% is the default "fit" view; zoom controls scale relative to that fit.
    const zoomScale = Math.min(3, Math.max(0.3, n(state.zoom, 0.5) / 0.5));
    const displayScale = Math.max(0.001, fitScale * zoomScale);

    previewCanvas.style.setProperty("width", (source.width * displayScale).toFixed(3) + "px");
    previewCanvas.style.setProperty("height", (source.height * displayScale).toFixed(3) + "px");
}

window.addEventListener("resize", renderPreview);

/* =========================================================
   COLLAGE TEMPLATE
   Menyimpan layout, bukan foto.
========================================================= */

const TEMPLATE_KEY = "autocollage-template-v1";

function loadTemplate() {
    try {
        const raw = localStorage.getItem(TEMPLATE_KEY);
        state.template = raw ? JSON.parse(raw) : null;
    } catch {
        state.template = null;
    }
}

function saveTemplate() {
    if (!state.canvas) { alert("Buat atau crop canvas terlebih dahulu."); return; }
    const sourceFrames = state.generated && state.placements.length ? state.placements : state.frames;
    if (!sourceFrames.length) { alert("Buat minimal satu frame atau jalankan Auto Collage sebelum menyimpan contoh."); return; }
    const template = {
        version: 3, widthCm: state.canvas.widthCm, heightCm: state.canvas.heightCm, dpi: state.canvas.dpi,
        frames: sourceFrames.map((p, index) => ({
            index, sizeKey: p.sizeKey || p.source?.sizeKey || `${p.width}x${p.height}`,
            x: n(p.x), y: n(p.y), width: n(p.width), height: n(p.height),
            crop: p.crop ? JSON.parse(JSON.stringify(p.crop)) : null
        }))
    };
    try {
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
        state.template = template; updateTemplateButton(); renderTemplatePreview();
        alert("Contoh collage berhasil disimpan. Contoh ini digunakan untuk upload berikutnya selama ukuran canvas sesuai.");
    } catch (e) { console.error(e); alert("Gagal menyimpan contoh. Penyimpanan browser mungkin penuh."); }
}

function clearTemplate() {
    try { localStorage.removeItem(TEMPLATE_KEY); } catch {}
    state.template = null; state.templateMissing = []; state.templateOverflow = [];
    updateTemplateButton(); renderTemplatePreview();
}

function updateTemplateButton() {
    const btn = document.querySelector("#saveTemplateBtn");
    if (btn) btn.textContent = state.template ? "Contoh Tersimpan ✓" : "Simpan sebagai Contoh";
}

function renderTemplatePreview() {
    const panel = document.querySelector("#templatePanel");
    const canvas = document.querySelector("#templatePreviewCanvas");
    const meta = document.querySelector("#templatePreviewMeta");
    if (!panel || !canvas || !meta) return;
    const t = state.template;
    const hasTemplate = !!(t && t.frames?.length);
    panel.classList.toggle("has-template", hasTemplate);
    const status = document.querySelector("#templateStatus");
    if (status) status.textContent = hasTemplate ? "AKTIF" : "KOSONG";
    if (!hasTemplate) {
        meta.textContent = "Belum ada contoh. Atur canvas, lalu klik Simpan sebagai Contoh.";
        const ctx = canvas.getContext("2d");
        if (ctx) {
            canvas.width = 180; canvas.height = 220;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#f4f6fb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#cbd2df"; ctx.setLineDash([5,4]); ctx.strokeRect(18,18,144,184); ctx.setLineDash([]);
            ctx.fillStyle = "#8993a5"; ctx.font = "12px Arial"; ctx.textAlign = "center"; ctx.fillText("Contoh layout",90,112);
        }
        return;
    }
    const cw = Math.max(1,n(t.widthCm,30)), ch = Math.max(1,n(t.heightCm,40));
    const scale = Math.min(220/cw,260/ch);
    canvas.width = Math.max(1,Math.round(cw*scale)); canvas.height = Math.max(1,Math.round(ch*scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="#b9c2d2"; ctx.lineWidth=1; ctx.strokeRect(.5,.5,canvas.width-1,canvas.height-1);
    t.frames.forEach((p,i)=>{
        const x=n(p.x)*scale,y=n(p.y)*scale,w=n(p.width)*scale,h=n(p.height)*scale;
        ctx.fillStyle=i%2?"#dfe5ff":"#e7ebf2"; ctx.fillRect(x,y,w,h);
        ctx.strokeStyle="#5966b3"; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,h-1));
    });
    meta.textContent = `${cw} × ${ch} cm · ${t.frames.length} posisi foto`;
}

function findFreeTemplateSpot(width,height,occupied,canvasW,canvasH,margin,gap) {
    const xs=new Set([margin]),ys=new Set([margin]);
    for(const p of occupied){
        xs.add(p.x+p.width+gap); ys.add(p.y+p.height+gap);
        xs.add(Math.max(margin,p.x-width-gap)); ys.add(Math.max(margin,p.y-height-gap));
    }
    const candidates=[];
    for(const y of ys) for(const x of xs) candidates.push({x,y});
    candidates.sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const pos of candidates){
        if(pos.x<margin-.0001||pos.y<margin-.0001||pos.x+width>canvasW-margin+.0001||pos.y+height>canvasH-margin+.0001)continue;
        const overlap=occupied.some(p=>pos.x<p.x+p.width-.0001&&pos.x+width>p.x+.0001&&pos.y<p.y+p.height-.0001&&pos.y+height>p.y+.0001);
        if(!overlap)return pos;
    }
    return null;
}

function createTemplatePlacements(queue) {
    const t=state.template; state.templateMissing=[]; state.templateOverflow=[];
    if(!t||Math.abs(n(t.widthCm)-state.canvas.widthCm)>.0001||Math.abs(n(t.heightCm)-state.canvas.heightCm)>.0001)return null;
    const slots=t.frames||t.placements||[]; if(!slots.length)return null;
    const used=new Set(),placements=[],missing=[];
    for(const slot of slots){
        const index=queue.findIndex((item,i)=>!used.has(i)&&item.sizeKey===slot.sizeKey);
        if(index<0){missing.push(slot.sizeKey);continue;}
        used.add(index);
        const item=queue[index];
        placements.push({...item,x:n(slot.x),y:n(slot.y),width:n(slot.width,item.widthCm),height:n(slot.height,item.heightCm),crop:slot.crop||item.crop||null});
    }
    const margin=Math.max(0,n(marginInput?.value,.5)),gap=Math.max(0,n(gapInput?.value,.3));
    for(let i=0;i<queue.length;i++){
        if(used.has(i))continue;
        const item=queue[i],width=n(item.widthCm),height=n(item.heightCm);
        const pos=findFreeTemplateSpot(width,height,placements,state.canvas.widthCm,state.canvas.heightCm,margin,gap);
        if(!pos){state.templateOverflow.push(item);continue;}
        used.add(i); placements.push({...item,...pos,width,height});
    }
    state.templateMissing=missing;
    return placements.length?placements:null;
}

loadTemplate();

/* =========================================================
   GENERATE
========================================================= */

function generateCollage() {
    try {
        if (!state.files.length) {
            alert("Canvas dan frame sudah bisa dibuat tanpa foto. Upload foto terlebih dahulu untuk menjalankan Auto Collage.");
            return;
        }

        if (state.groups.size > MAX_IDS) {
            alert(`Maksimal ${MAX_IDS} nomor foto berbeda.`);
            return;
        }

        const incomplete = [...state.groups.values()]
            .filter(g => [...state.sizes.keys()].some(k => !g.files.has(k)));

        if (incomplete.length) {
            const names = incomplete.map(g => "#" + g.id).join(", ");
            if (!confirm(
                "Pasangan belum lengkap: " + names +
                "\n\nFoto tidak akan dipasangkan dengan nomor lain. Lanjutkan?"
            )) return;
        }

        syncCanvasToInputs();

        const queue = createPrintQueue();
        if (!queue.length) {
            alert("Jumlah foto yang ingin dicetak masih 0.");
            return;
        }

        const margin = Math.max(0, n(marginInput?.value, 0.5));
        const gap = Math.max(0, n(gapInput?.value, 0.3));

        let templatePlacements = createTemplatePlacements(queue);

        // Frame crop tool can create a single empty frame before upload.
        // Do not mistake that one frame for the entire canvas: unless every
        // requested photo fits into explicit frames, auto-pack all photos
        // across the full canvas. A saved example layout still takes priority.
        if (state.frames.length && !templatePlacements) {
            const usedIndexes = new Set();
            const framePlacements = [];

            for (const frame of state.frames) {
                let index = -1;
                const source = frame.source || null;

                if (source) {
                    index = queue.findIndex((item, i) =>
                        !usedIndexes.has(i) && item.source === source
                    );
                } else {
                    index = queue.findIndex((item, i) =>
                        !usedIndexes.has(i) && item.sizeKey === frame.sizeKey
                    );
                }

                if (index < 0) continue;
                usedIndexes.add(index);
                const item = queue[index];
                framePlacements.push({
                    ...item,
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                    crop: frame.crop || item.crop || null
                });
            }

            // Use manual frames only when they account for every requested
            // photo. Otherwise the normal packing algorithm fills the canvas.
            if (framePlacements.length === queue.length) {
                templatePlacements = framePlacements;
            }
        }

        if (state.templateOverflow?.length) {
            alert("Contoh tersimpan tidak memiliki ruang cukup untuk semua foto tambahan. Kurangi jumlah foto, ubah ukuran canvas, atau simpan contoh dengan jumlah posisi yang lebih banyak.");
            return;
        }

        if (templatePlacements?.length) {
            const valid = validatePlacements(
                templatePlacements,
                state.canvas.widthCm,
                state.canvas.heightCm
            );
            if (!valid.valid) {
                alert("Layout frame tidak valid: " + valid.message);
                return;
            }
            state.placements = templatePlacements;
        } else {
            let result = packPhotos(
                queue,
                state.canvas.widthCm,
                state.canvas.heightCm,
                margin,
                gap
            );

            if (!result.success) {
                alert(result.reason);
                return;
            }

            if (autoSpacing?.checked) {
                result = applyAutoSpacing(result, state.canvas.widthCm, margin);
            }

            const valid = validatePlacements(
                result.placements,
                state.canvas.widthCm,
                state.canvas.heightCm
            );
            if (!valid.valid) {
                alert(valid.message);
                return;
            }

            state.placements = result.placements;
        }

        state.generated = true;
        renderCollage();
        updateInfo();

        if (state.templateMissing?.length) {
            alert("Beberapa frame belum terisi karena foto dengan ukuran berikut tidak tersedia: " +
                [...new Set(state.templateMissing)].join(", "));
        }
    } catch (e) {
        console.error(e);
        alert(e.message || "Terjadi kesalahan.");
    }
}

/* =========================================================
   SHUFFLE
========================================================= */

function shuffle(array) {
    const a = [...array];

    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }

    return a;
}

function shuffleLayout() {
    if (!state.generated) {
        generateCollage();
        return;
    }

    const queue = shuffle(state.placements).map(x => ({
        id: x.id,
        sizeKey: x.sizeKey,
        source: x.source,
        widthCm: x.width,
        heightCm: x.height
    }));

    const margin = Math.max(0, n(marginInput?.value, 0.5));
    const gap = Math.max(0, n(gapInput?.value, 0.3));

    let result = packPhotos(
        queue,
        state.canvas.widthCm,
        state.canvas.heightCm,
        margin,
        gap
    );

    if (!result.success) {
        alert(result.reason);
        return;
    }

    if (autoSpacing?.checked) {
        result = applyAutoSpacing(
            result,
            state.canvas.widthCm,
            margin
        );
    }

    state.placements = result.placements;
    renderCollage();
    updateInfo();
}


/* =========================================================
   WORKSPACE DRAG
   Drag foto yang sudah berada di collage.
   Canvas/kertas tetap memiliki ukuran fisik yang sama.
========================================================= */

function workspacePoint(e) {
    const r = previewCanvas.getBoundingClientRect();
    // Use the actual displayed-to-backing-store ratio. state.zoom can differ
    // from the CSS scale after browser resizing or zoom clamping.
    return {
        x: (e.clientX - r.left) * (previewCanvas.width / Math.max(1, r.width)),
        y: (e.clientY - r.top) * (previewCanvas.height / Math.max(1, r.height))
    };
}

function findPlacementAtPoint(px, py) {
    const dpi = state.canvas?.dpi || 300;
    const xCm = px / cmToPx(1, dpi);
    const yCm = py / cmToPx(1, dpi);
    const source = state.generated && state.placements.length
        ? state.placements
        : state.frames;

    for (let i = source.length - 1; i >= 0; i--) {
        const p = source[i];
        if (
            xCm >= p.x &&
            xCm <= p.x + p.width &&
            yCm >= p.y &&
            yCm <= p.y + p.height
        ) {
            return p;
        }
    }
    return null;
}

function startWorkspaceDrag(e) {
    if (!state.canvas || !previewCanvas) return;

    const point = workspacePoint(e);
    const placement = findPlacementAtPoint(point.x, point.y);
    if (!placement) return;

    e.preventDefault();

    state.drag.active = true;
    state.drag.placement = placement;
    state.drag.startX = point.x;
    state.drag.startY = point.y;
    state.drag.startLeft = placement.x;
    state.drag.startTop = placement.y;

    previewCanvas.style.cursor = "grabbing";

    try {
        previewCanvas.setPointerCapture(e.pointerId);
    } catch {}
}

function moveWorkspaceDrag(e) {
    if (!state.drag.active || !state.drag.placement || !state.canvas) return;

    e.preventDefault();

    const point = workspacePoint(e);
    const dpi = state.canvas.dpi;
    const dxCm = (point.x - state.drag.startX) / cmToPx(1, dpi);
    const dyCm = (point.y - state.drag.startY) / cmToPx(1, dpi);

    const p = state.drag.placement;
    p.x = Math.max(
        0,
        Math.min(state.canvas.widthCm - p.width, state.drag.startLeft + dxCm)
    );
    p.y = Math.max(
        0,
        Math.min(state.canvas.heightCm - p.height, state.drag.startTop + dyCm)
    );

    // Keep the saved crop frame in sync with its generated placement.
    // Otherwise a frame can appear to move but jump back on the next render.
    if (state.generated && state.frames.length) {
        const frame = state.frames.find(f =>
            (p._frameId && f._frameId === p._frameId) ||
            (p.source && f.source === p.source)
        );
        if (frame) {
            frame.x = p.x;
            frame.y = p.y;
        }
    }

    renderCollage();
}

function endWorkspaceDrag(e) {
    if (!state.drag.active) return;

    state.drag.active = false;
    state.drag.placement = null;
    if (previewCanvas) previewCanvas.style.cursor = "grab";

    try {
        previewCanvas.releasePointerCapture(e.pointerId);
    } catch {}
}

if (previewCanvas) {
    previewCanvas.addEventListener("pointerdown", startWorkspaceDrag);
    previewCanvas.addEventListener("pointermove", moveWorkspaceDrag, { passive: false });
    previewCanvas.addEventListener("pointerup", endWorkspaceDrag);
    previewCanvas.addEventListener("pointercancel", endWorkspaceDrag);
    previewCanvas.addEventListener("lostpointercapture", endWorkspaceDrag);
}

/* =========================================================
   CROP CANVAS EDITOR
   - Canvas/frame = area that will be used for the photo
   - Source photo is never modified
   - White handles resize the canvas/frame
   - Drag inside the frame moves the frame
   - Drag outside the frame moves the photo
========================================================= */

const cropOrientationBtn=document.querySelector("#cropOrientationBtn");
let cropHasSelection=false;

function cropImageFor(item){
    return item?.image || item?.source?.image || null;
}

function cropDisplay(){
    const image=cropImageFor(state.crop.item);
    if(!image) return null;
    const sw=Math.max(1,cropStage.clientWidth);
    const sh=Math.max(1,cropStage.clientHeight);
    const selection=state.crop.selectionStage;
    const base=selection
        ? Math.max(selection.width/image.naturalWidth,selection.height/image.naturalHeight)
        : Math.min(sw/image.naturalWidth,sh/image.naturalHeight);
    const scale=base*Math.max(1,Number(state.crop.zoom)||1);
    return {
        scale,
        width:image.naturalWidth*scale,
        height:image.naturalHeight*scale,
        left:(sw-image.naturalWidth*scale)/2,
        top:(sh-image.naturalHeight*scale)/2
    };
}

function cropClampFrame(){
    if(!state.crop.selectionStage||!cropStage)return;

    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;
    const ratio=Math.max(.05,state.crop.aspect||1);
    const min=36;

    let r={...state.crop.selectionStage};
    r.width=Math.max(min,r.width);
    r.height=r.width/ratio;

    if(r.height>sh*.94){
        r.height=sh*.94;
        r.width=r.height*ratio;
    }
    if(r.width>sw*.94){
        r.width=sw*.94;
        r.height=r.width/ratio;
    }

    r.x=Math.max(0,Math.min(sw-r.width,r.x));
    r.y=Math.max(0,Math.min(sh-r.height,r.y));

    state.crop.selectionStage=r;
}

function cropClampImage(){
    if(!state.crop.item||!state.crop.selectionStage)return;
    const d=cropDisplay();
    if(!d||!d.scale)return;
    state.crop.display=d;
    const sel=state.crop.selectionStage;
    let left=d.left+(state.crop.imageOffsetX||0)*d.scale;
    let top=d.top+(state.crop.imageOffsetY||0)*d.scale;
    if(d.width>=sel.width) left=Math.max(sel.x+sel.width-d.width,Math.min(left,sel.x));
    else left=sel.x+(sel.width-d.width)/2;
    if(d.height>=sel.height) top=Math.max(sel.y+sel.height-d.height,Math.min(top,sel.y));
    else top=sel.y+(sel.height-d.height)/2;
    state.crop.imageOffsetX=(left-d.left)/d.scale;
    state.crop.imageOffsetY=(top-d.top)/d.scale;
}

function cropRender(){
    if(!state.crop.item||!cropStage||!cropCanvas||!cropSelection)return;
    const image=cropImageFor(state.crop.item);
    const d=image ? cropDisplay() : null;

    if(!d){
        const sw=Math.max(1,cropStage.clientWidth), sh=Math.max(1,cropStage.clientHeight);
        if(cropCanvas.width!==sw) cropCanvas.width=sw;
        if(cropCanvas.height!==sh) cropCanvas.height=sh;
        Object.assign(cropCanvas.style,{position:"absolute",left:"0px",top:"0px",width:sw+"px",height:sh+"px",zIndex:"1"});
        const ctx=cropCanvas.getContext("2d");
        if(ctx){
            ctx.clearRect(0,0,sw,sh);
            ctx.fillStyle="#20252b"; ctx.fillRect(0,0,sw,sh);
            const r=state.crop.selectionStage;
            if(r){
                ctx.save(); ctx.fillStyle="#e9edf2"; ctx.fillRect(r.x,r.y,r.width,r.height);
                ctx.strokeStyle="#667085"; ctx.lineWidth=2; ctx.setLineDash([8,5]);
                ctx.strokeRect(r.x,r.y,r.width,r.height); ctx.setLineDash([]);
                ctx.fillStyle="#667085"; ctx.font="600 18px Arial";
                ctx.textAlign="center"; ctx.textBaseline="middle";
                ctx.fillText("FRAME KOSONG",r.x+r.width/2,r.y+r.height/2); ctx.restore();
            }
        }
    }else{
        state.crop.display=d;
        const cw=Math.max(1,Math.round(d.width)), ch=Math.max(1,Math.round(d.height));
        if(cropCanvas.width!==cw) cropCanvas.width=cw;
        if(cropCanvas.height!==ch) cropCanvas.height=ch;
        Object.assign(cropCanvas.style,{
            position:"absolute",
            left:(d.left+(state.crop.imageOffsetX||0)*d.scale)+"px",
            top:(d.top+(state.crop.imageOffsetY||0)*d.scale)+"px",
            width:d.width+"px",height:d.height+"px",
            pointerEvents:"auto",touchAction:"none",zIndex:"1"
        });
        const ctx=cropCanvas.getContext("2d");
        if(ctx){ctx.clearRect(0,0,cropCanvas.width,cropCanvas.height);ctx.filter="none";ctx.drawImage(image,0,0,cropCanvas.width,cropCanvas.height);}
    }
    const r=state.crop.selectionStage;
    if(r){
        cropSelection.style.left=r.x+"px"; cropSelection.style.top=r.y+"px";
        cropSelection.style.width=r.width+"px"; cropSelection.style.height=r.height+"px";
        cropSelection.style.zIndex="3";
    }
}

function cropInitSelection(){
    const d=cropDisplay();
    if(!d)return;

    const ratio=Math.max(.05,state.crop.aspect||1);
    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;

    let w=Math.min(sw*.70,sh*.70*ratio,d.width*.85);
    let h=w/ratio;

    if(h>sh*.80){
        h=sh*.80;
        w=h*ratio;
    }
    if(w>sw*.80){
        w=sw*.80;
        h=w/ratio;
    }

    state.crop.selectionStage={
        x:(sw-w)/2,
        y:(sh-h)/2,
        width:w,
        height:h
    };

    state.crop.lastStageWidth=sw;
    state.crop.lastStageHeight=sh;
    cropHasSelection=true;
}

function cropSourceRectFromSelection(){
    const image=cropImageFor(state.crop.item), s=state.crop.selectionStage;
    if(!state.crop.item||!image||!s)return null;
    const d=cropDisplay();
    if(!d||!d.scale)return null;
    state.crop.display=d;
    const imageLeft=d.left+(state.crop.imageOffsetX||0)*d.scale;
    const imageTop=d.top+(state.crop.imageOffsetY||0)*d.scale;
    const x=(s.x-imageLeft)/d.scale/image.naturalWidth;
    const y=(s.y-imageTop)/d.scale/image.naturalHeight;
    const w=s.width/d.scale/image.naturalWidth;
    const h=s.height/d.scale/image.naturalHeight;
    const left=Math.max(0,Math.min(1,x)), top=Math.max(0,Math.min(1,y));
    const right=Math.max(left+0.0001,Math.min(1,x+w));
    const bottom=Math.max(top+0.0001,Math.min(1,y+h));
    state.crop.sourceRect={x:left,y:top,width:right-left,height:bottom-top};
    return state.crop.sourceRect;
}
function openCrop(item){
    if(!item)return;
    state.crop.item=item;
    const image=cropImageFor(item);
    const saved=item.crop?.canvas || item.source?.crop?.canvas || null;
    state.crop.zoom=Math.max(1,n(saved?.zoom,1));
    if(cropZoom) cropZoom.value=String(state.crop.zoom);
    state.crop.imageOffsetX=0;
    state.crop.imageOffsetY=0;
    state.crop.sourceRect=saved?.sourceRect ? {...saved.sourceRect} : null;

    const hasImage=!!image;
    cropTitle.textContent=hasImage ? "Atur Frame Canvas" : "Buat / Atur Frame Canvas";
    cropSubtitle.textContent=hasImage ? "Geser foto di dalam frame; foto asli tidak diubah." : "Frame kosong — foto dapat dipasangkan setelahnya.";
    cropZoom.disabled=!hasImage;

    const width=Math.max(.1,n(item.width,item.source?.width||2));
    const height=Math.max(.1,n(item.height,item.source?.height||3));
    state.crop.aspect=width/height;
    cropModal.classList.remove("hidden");

    requestAnimationFrame(()=>{
        const sw=Math.max(1,cropStage.clientWidth), sh=Math.max(1,cropStage.clientHeight);
        const ratio=Math.max(.05,state.crop.aspect);
        let w=Math.min(sw*.62,sh*.62*ratio), h=w/ratio;
        if(h>sh*.62){h=sh*.62;w=h*ratio;}
        state.crop.selectionStage={x:(sw-w)/2,y:(sh-h)/2,width:w,height:h};
        cropRatioLabel.textContent="Rasio: "+(ratio>=1?"Landscape":"Portrait");
        if(frameWidthInput) frameWidthInput.value=width;
        if(frameHeightInput) frameHeightInput.value=height;
        if(frameXInput) frameXInput.value=n(item.x,1);
        if(frameYInput) frameYInput.value=n(item.y,1);

        const d=cropDisplay();
        if(d && image && saved?.sourceRect){
            const sr=saved.sourceRect;
            const imageLeft=state.crop.selectionStage.x-n(sr.x)*image.naturalWidth*d.scale;
            const imageTop=state.crop.selectionStage.y-n(sr.y)*image.naturalHeight*d.scale;
            state.crop.imageOffsetX=(imageLeft-d.left)/d.scale;
            state.crop.imageOffsetY=(imageTop-d.top)/d.scale;
        }
        state.crop.lastStageWidth=sw; state.crop.lastStageHeight=sh;
        cropHasSelection=true;
        cropClampFrame(); cropClampImage(); cropSourceRectFromSelection(); cropRender();
    });
}
function closeCrop(){
    cropModal.classList.add("hidden");
    state.crop.item=null;
    state.crop.sourceRect=null;
    state.crop.selectionStage=null;
    state.crop.movingImage=false;
    state.crop.movingFrame=false;
    state.crop.resizing=false;
    state.crop.resizeHandle=null;
    cropHasSelection=false;
}

function cropPos(e){
    const r=cropStage.getBoundingClientRect();
    return {
        x:e.clientX-r.left,
        y:e.clientY-r.top
    };
}

function cropStartImage(e){
    e.preventDefault(); e.stopPropagation();
    const p=cropPos(e);
    state.crop.startX=p.x; state.crop.startY=p.y;
    state.crop.startOffsetX=state.crop.imageOffsetX||0;
    state.crop.startOffsetY=state.crop.imageOffsetY||0;
    const r=state.crop.selectionStage;
    const inside=r&&p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
    const edge=inside&&(p.x-r.x<12||r.x+r.width-p.x<12||p.y-r.y<12||r.y+r.height-p.y<12);
    if(edge){state.crop.startSelection={...r};state.crop.movingFrame=true;}
    else{state.crop.movingImage=!!cropImageFor(state.crop.item);}
    try{cropStage.setPointerCapture(e.pointerId)}catch{}
}

function cropMoveFrame(e){
    if(!state.crop.movingFrame||!state.crop.selectionStage)return;
    e.preventDefault();

    const p=cropPos(e);
    const s=state.crop.startSelection;
    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;

    let x=s.x+(p.x-state.crop.startX);
    let y=s.y+(p.y-state.crop.startY);

    x=Math.max(0,Math.min(sw-s.width,x));
    y=Math.max(0,Math.min(sh-s.height,y));

    state.crop.selectionStage={x,y,width:s.width,height:s.height};
    cropClampImage();
    cropSourceRectFromSelection();
    cropRender();
}

function cropMoveImage(e){
    if(!state.crop.movingImage)return;
    e.preventDefault();

    const d=state.crop.display||cropDisplay();
    const p=cropPos(e);

    state.crop.imageOffsetX=
        state.crop.startOffsetX+(p.x-state.crop.startX)/d.scale;
    state.crop.imageOffsetY=
        state.crop.startOffsetY+(p.y-state.crop.startY)/d.scale;

    cropClampImage();
    cropSourceRectFromSelection();
    cropRender();
}

function cropStartResize(e,handle){
    e.preventDefault();
    e.stopPropagation();

    const p=cropPos(e);
    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startSelection={...state.crop.selectionStage};
    state.crop.resizing=true;
    state.crop.resizeHandle=handle;

    try{cropStage.setPointerCapture(e.pointerId)}catch{}
}

function cropMoveResize(e){
    if(!state.crop.resizing||!state.crop.startSelection)return;
    e.preventDefault();
    e.stopPropagation();

    const p=cropPos(e);
    const s=state.crop.startSelection;
    const ratio=Math.max(.05,state.crop.aspect||1);
    const h=state.crop.resizeHandle||"se";

    const dx=p.x-state.crop.startX;
    const dy=p.y-state.crop.startY;

    // Use the dragged axis. Corners preserve the canvas ratio.
    let delta;
    if(h==="e"||h==="w"){
        delta=dx*(h==="w"?-1:1);
    }else if(h==="n"||h==="s"){
        delta=dy*(h==="n"?-1:1);
    }else{
        const sx=h.includes("w")?-1:1;
        const sy=h.includes("n")?-1:1;
        const dxOut=dx*sx;
        const dyOut=dy*sy;
        delta=Math.abs(dxOut)>Math.abs(dyOut)?dxOut:dyOut;
    }

    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;
    const minW=36;
    const minH=36;

    let w=s.width+delta;
    let hh=w/ratio;

    // For north/west handles the opposite edge stays fixed.
    if(w<minW){
        w=minW;
        hh=w/ratio;
    }
    if(hh<minH){
        hh=minH;
        w=hh*ratio;
    }

    const maxW=Math.min(sw*.96,sh*.96*ratio);
    const maxH=maxW/ratio;
    if(w>maxW){
        w=maxW;
        hh=maxH;
    }

    let x=h.includes("w")?s.x+s.width-w:s.x;
    let y=h.includes("n")?s.y+s.height-hh:s.y;

    if(x<0){
        x=0;
        w=s.x+s.width;
        hh=w/ratio;
    }
    if(y<0){
        y=0;
        hh=s.y+s.height;
        w=hh*ratio;
    }
    if(x+w>sw){
        w=sw-x;
        hh=w/ratio;
    }
    if(y+hh>sh){
        hh=sh-y;
        w=hh*ratio;
    }

    state.crop.selectionStage={
        x,
        y,
        width:Math.max(minW,w),
        height:Math.max(minH,hh)
    };

    // Handle resize juga mengubah ukuran fisik frame.
    const currentW=Math.max(.1,n(state.crop.item?.width,2));
    const currentH=Math.max(.1,n(state.crop.item?.height,3));
    const startW=Math.max(1,n(s.width));
    const scaleW=Math.max(.1,w/startW);
    const nextW=currentW*scaleW;
    const nextH=currentH*scaleW;
    if(frameWidthInput) frameWidthInput.value=nextW.toFixed(2);
    if(frameHeightInput) frameHeightInput.value=nextH.toFixed(2);

    cropClampFrame();
    cropClampImage();
    cropSourceRectFromSelection();
    cropRender();
}

function cropEnd(e){
    state.crop.movingImage=false;
    state.crop.movingFrame=false;
    state.crop.resizing=false;
    state.crop.resizeHandle=null;
    try{cropStage.releasePointerCapture(e.pointerId)}catch{}
}

function cropToggleOrientation(){
    if(!state.crop.item)return;

    state.crop.aspect=1/Math.max(.05,state.crop.aspect||1);

    if(frameWidthInput && frameHeightInput){
        const w=n(frameWidthInput.value,2);
        const h=n(frameHeightInput.value,3);
        frameWidthInput.value=h.toFixed(2);
        frameHeightInput.value=w.toFixed(2);
    }

    const r=state.crop.selectionStage;
    const cx=r.x+r.width/2;
    const cy=r.y+r.height/2;

    let w=r.height*state.crop.aspect;
    let h=w/state.crop.aspect;

    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;
    const maxW=Math.min(sw*.88,sh*.88*state.crop.aspect);
    const maxH=maxW/state.crop.aspect;

    if(w>maxW){w=maxW;h=w/state.crop.aspect}
    if(h>maxH){h=maxH;w=h*state.crop.aspect}

    state.crop.selectionStage={
        x:Math.max(0,Math.min(sw-w,cx-w/2)),
        y:Math.max(0,Math.min(sh-h,cy-h/2)),
        width:w,
        height:h
    };

    cropRatioLabel.textContent=
        "Rasio: "+(state.crop.aspect>=1?"Landscape":"Portrait");

    cropClampImage();
    cropSourceRectFromSelection();
    cropRender();
}

function saveCrop(){
    if(!state.crop.item||!cropHasSelection)return;
    const item=state.crop.item, image=cropImageFor(state.crop.item);
    const width=Math.max(.1,n(frameWidthInput?.value,item.width||2));
    const height=Math.max(.1,n(frameHeightInput?.value,item.height||3));
    const canvasW=n(state.canvas?.widthCm,30), canvasH=n(state.canvas?.heightCm,40);
    const posX=Math.max(0,Math.min(Math.max(0,canvasW-width),n(frameXInput?.value,item.x||0)));
    const posY=Math.max(0,Math.min(Math.max(0,canvasH-height),n(frameYInput?.value,item.y||0)));

    item._frameId=item._frameId||("frame-"+Date.now()+"-"+Math.random().toString(36).slice(2,7));
    item.x=posX; item.y=posY; item.width=width; item.height=height;
    const source=item.source && item.source.image ? item.source : (item.image ? item : null);
    item.sizeKey=source ? source.sizeKey : (width+"x"+height);

    if(image){
        cropSourceRectFromSelection();
        const sr=state.crop.sourceRect;
        if(sr){
            item.crop={canvas:{
                width,height,ratio:width/height,zoom:Math.max(1,n(state.crop.zoom,1)),
                sourceRect:{x:Math.max(0,Math.min(1,n(sr.x))),y:Math.max(0,Math.min(1,n(sr.y))),
                    width:Math.max(.0001,Math.min(1,n(sr.width))),height:Math.max(.0001,Math.min(1,n(sr.height)))}
            }};
        }
    }else delete item.crop;

    const existing=state.frames.findIndex(x=>x._frameId===item._frameId || (source&&x.source===source));
    const frame={_frameId:item._frameId,sizeKey:item.sizeKey,x:posX,y:posY,width,height,source,crop:image&&item.crop?item.crop:null};
    if(existing>=0){frame._frameId=state.frames[existing]._frameId;Object.assign(state.frames[existing],frame);item._frameId=frame._frameId;}
    else{state.frames.push(frame);item._frameId=frame._frameId;}

    closeCrop(); state.generated=false; state.placements=[];
    renderCollage(); updateInfo();
}

let cropResizeTimer=null;
window.addEventListener("resize",()=>{
    if(!state.crop?.item||cropModal?.classList.contains("hidden"))return;
    clearTimeout(cropResizeTimer);
    cropResizeTimer=setTimeout(()=>{
        const old=state.crop.selectionStage;
        if(!old)return;

        const sw=cropStage.clientWidth;
        const sh=cropStage.clientHeight;
        const oldW=Math.max(1,state.crop.lastStageWidth||sw);
        const oldH=Math.max(1,state.crop.lastStageHeight||sh);

        state.crop.selectionStage={
            x:old.x/oldW*sw,
            y:old.y/oldH*sh,
            width:old.width/oldW*sw,
            height:old.height/oldH*sh
        };

        state.crop.lastStageWidth=sw;
        state.crop.lastStageHeight=sh;
        cropClampFrame();
        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    },30);
});

if(cropStage){
    cropStage.addEventListener("pointerdown",e=>{
        const handle=e.target.closest(".crop-handle");

        if(handle){
            const cls=[...handle.classList]
                .find(x=>x.startsWith("crop-handle-"));

            if(cls){
                cropStartResize(
                    e,
                    cls.replace("crop-handle-","")
                );
                return;
            }
        }

        if(e.target===cropStage||e.target===cropCanvas||e.target.closest("#cropSelection")){
            cropStartImage(e);
        }
    });

    cropStage.addEventListener("pointermove",e=>{
        if(state.crop.resizing)cropMoveResize(e);
        else if(state.crop.movingFrame)cropMoveFrame(e);
        else if(state.crop.movingImage)cropMoveImage(e);
    },{passive:false});

    cropStage.addEventListener("pointerup",cropEnd);
    cropStage.addEventListener("pointercancel",cropEnd);
    cropStage.addEventListener("lostpointercapture",cropEnd);
}

if(cropZoom){
    cropZoom.addEventListener("input",()=>{
        state.crop.zoom=Math.max(1,n(cropZoom.value,1));
        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    });
}

function syncCropFrameRatio(){
    if(!state.crop.item || cropModal?.classList.contains("hidden")) return;
    const width=Math.max(.1,n(frameWidthInput?.value,2));
    const height=Math.max(.1,n(frameHeightInput?.value,3));
    state.crop.aspect=width/height;
    const old=state.crop.selectionStage;
    if(old){
        const sw=Math.max(1,cropStage.clientWidth), sh=Math.max(1,cropStage.clientHeight);
        const cx=old.x+old.width/2, cy=old.y+old.height/2;
        let w=Math.min(old.width,sw*.92,sh*.92*state.crop.aspect);
        let h=w/state.crop.aspect;
        if(h>sh*.92){h=sh*.92;w=h*state.crop.aspect;}
        if(w>sw*.92){w=sw*.92;h=w/state.crop.aspect;}
        state.crop.selectionStage={
            x:Math.max(0,Math.min(sw-w,cx-w/2)),
            y:Math.max(0,Math.min(sh-h,cy-h/2)),
            width:w,height:h
        };
        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    }
    if(cropRatioLabel) cropRatioLabel.textContent="Rasio: "+(state.crop.aspect>=1?"Landscape":"Portrait");
}
[frameWidthInput,frameHeightInput].forEach(input=>{
    if(input) input.addEventListener("input",syncCropFrameRatio);
});

if(cropResetBtn){
    cropResetBtn.addEventListener("click",()=>{
        if(!state.crop.item)return;

        state.crop.zoom=1;
        cropZoom.value="1";
        state.crop.aspect=
            Math.max(.05,n(frameWidthInput?.value,state.crop.item.width||2)/
                Math.max(.1,n(frameHeightInput?.value,state.crop.item.height||3)));
        if(frameWidthInput) frameWidthInput.value=n(state.crop.item.width,2);
        if(frameHeightInput) frameHeightInput.value=n(state.crop.item.height,3);
        state.crop.imageOffsetX=0;
        state.crop.imageOffsetY=0;

        cropInitSelection();
        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    });
}

if(cropOrientationBtn)
    cropOrientationBtn.addEventListener("click",cropToggleOrientation);

if(cropCloseBtn)
    cropCloseBtn.addEventListener("click",closeCrop);

if(cropCancelBtn)
    cropCancelBtn.addEventListener("click",closeCrop);

if(cropSaveBtn)
    cropSaveBtn.addEventListener("click",saveCrop);

document.addEventListener("keydown",e=>{
    if(cropModal?.classList.contains("hidden"))return;

    if(e.key==="Escape"){
        closeCrop();
        return;
    }

    if(e.key==="Enter"){
        e.preventDefault();
        saveCrop();
    }
});

if(fileList){
    fileList.addEventListener("click",e=>{
        const b=e.target.closest("[data-crop-id]");
        if(!b)return;
        e.preventDefault();
        e.stopPropagation();
        const g=state.groups.get(b.dataset.cropId);
        const item=g?.files.get(b.dataset.cropSize);
        if(!item)return;

        let frame=state.frames.find(x=>x.source===item);
        if(!frame){
            const width=Math.max(.1,n(item.width,2)), height=Math.max(.1,n(item.height,3));
            frame={
                _frameId:"frame-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
                sizeKey:item.sizeKey,
                x:Math.max(0,(n(state.canvas?.widthCm,30)-width)/2),
                y:Math.max(0,(n(state.canvas?.heightCm,40)-height)/2),
                width,height,source:item,crop:null
            };
            state.frames.push(frame);
        }
        openCrop(frame);
    });
}

function openFirstCrop(){
    if(!state.canvas){
        ensureCanvas();
    }

    if(state.frames.length){
        openCrop(state.frames[state.frames.length-1]);
        return;
    }

    addEmptyFrame();
}

if(cropCanvasBtn)
    cropCanvasBtn.addEventListener("click",openFirstCrop);

if(workspaceGenerateBtn)
    workspaceGenerateBtn.addEventListener("click",generateCollage);

/* =========================================================
   CANVAS + FRAME FIRST WORKFLOW
========================================================= */

function ensureCanvas(){
    syncCanvasToInputs();
    state.canvasReady=true;
    renderCollage();
    updateInfo();
}

function addEmptyFrame(){
    ensureCanvas();
    const width=Math.max(.1,n(frameWidthInput?.value,2));
    const height=Math.max(.1,n(frameHeightInput?.value,3));
    const frame={
        _frameId:"frame-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
        sizeKey:`${width}x${height}`,
        x:Math.max(0,(state.canvas.widthCm-width)/2),
        y:Math.max(0,(state.canvas.heightCm-height)/2),
        width,
        height,
        source:null
    };
    state.frames.push(frame);
    openCrop(frame);
}

if(createCanvasBtn){
    createCanvasBtn.addEventListener("click",()=>{
        try{
            state.canvas=createCanvasState();
            state.canvasReady=true;
            state.frames=[];
            state.placements=[];
            state.generated=false;
            renderCollage();
            updateInfo();
        }catch(e){alert(e.message||"Gagal membuat canvas.");}
    });
}
if(addFrameBtn) addFrameBtn.addEventListener("click",addEmptyFrame);

/* =========================================================
   TEMPLATE BUTTON
========================================================= */

const saveTemplateBtn = document.querySelector("#saveTemplateBtn");

if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener("click", saveTemplate);
    updateTemplateButton();
}
renderTemplatePreview();

const clearTemplateBtn = document.querySelector("#clearTemplateBtn");
if (clearTemplateBtn) clearTemplateBtn.addEventListener("click", clearTemplate);

/* =========================================================
   EXPORT
========================================================= */

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportImage(type) {
    if (!state.canvas || !state.generated) {
        alert("Buat Auto Collage terlebih dahulu.");
        return;
    }

    const { canvas, widthCm, heightCm, dpi } = state.canvas;

    if (type === "jpg") {
        canvas.toBlob(
            blob => {
                if (!blob) {
                    alert("Gagal membuat JPG.");
                    return;
                }

                downloadBlob(
                    blob,
                    `auto-collage-${widthCm}x${heightCm}cm-${dpi}dpi.jpg`
                );
            },
            "image/jpeg",
            0.95
        );
    } else {
        canvas.toBlob(
            blob => {
                if (!blob) {
                    alert("Gagal membuat PNG.");
                    return;
                }

                downloadBlob(
                    blob,
                    `auto-collage-${widthCm}x${heightCm}cm-${dpi}dpi.png`
                );
            },
            "image/png"
        );
    }
}

/* =========================================================
   INFO
========================================================= */

function updateInfo() {
    const width = n(canvasWidth?.value, 30);
    const height = n(canvasHeight?.value, 40);
    const dpi = n(dpiInput?.value, 300);

    const widthPx = Math.round(cmToPx(width, dpi));
    const heightPx = Math.round(cmToPx(height, dpi));

    if (pixelInfo) {
        pixelInfo.textContent = `${widthPx} × ${heightPx} px`;
    }

    if (canvasRatio) {
        const ratio = height ? width / height : 0;
        canvasRatio.textContent = ratio.toFixed(3);
    }

    if (previewInfo) {
        previewInfo.textContent = `${width} × ${height} cm`;
    }

    if (canvasSizeInfo) {
        canvasSizeInfo.textContent = `${width} × ${height} cm`;
    }

    if (resolutionInfo) {
        resolutionInfo.textContent = `${dpi} DPI`;
    }

    if (photoCounter) {
        photoCounter.textContent =
            `${state.files.length} / ${MAX_FILES}`;
    }

    if (placedCount) {
        placedCount.textContent =
            String(state.generated ? state.placements.length : state.frames.length);
    }

    if (layoutStatus) {
        layoutStatus.textContent =
            state.generated
                ? "Berhasil"
                : "Belum dibuat";
    }
}

/* =========================================================
   ZOOM
========================================================= */

function setZoom(value) {
    state.zoom = Math.min(1.5, Math.max(0.15, value));

    if (zoomValue) {
        zoomValue.textContent =
            Math.round(state.zoom * 100) + "%";
    }

    renderPreview();
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener(
        "click",
        () => setZoom(state.zoom - 0.1)
    );
}

if (zoomInBtn) {
    zoomInBtn.addEventListener(
        "click",
        () => setZoom(state.zoom + 0.1)
    );
}

/* =========================================================
   EVENTS
========================================================= */

if (fileInput) {
    fileInput.addEventListener("change", e => {
        processFiles(e.target.files);
    });
}

if (generateBtn) {
    generateBtn.addEventListener("click", generateCollage);
}

if (shuffleBtn) {
    shuffleBtn.addEventListener("click", shuffleLayout);
}

if (resetBtn) {
    resetBtn.addEventListener("click", () => {
        state.files = [];
        state.groups.clear();
        state.sizes.clear();
        state.placements = [];
        state.frames = [];
        state.canvas = null;
        state.canvasReady = false;
        state.generated = false;

        if (fileInput) fileInput.value = "";
        if (fileList) {
            fileList.innerHTML =
                '<div class="empty-state">Belum ada foto</div>';
        }
        if (sizeList) {
            sizeList.innerHTML =
                '<div class="empty-state small">Upload foto terlebih dahulu.</div>';
        }
        if (fileWarning) fileWarning.classList.add("hidden");

        updateInfo();
    });
}

[
    canvasWidth,
    canvasHeight,
    dpiInput
].forEach(input => {
    if (input) input.addEventListener("input", updateInfo);
});

if (exportPngBtn) {
    exportPngBtn.addEventListener("click", () => exportImage("png"));
}

if (exportJpgBtn) {
    exportJpgBtn.addEventListener("click", () => exportImage("jpg"));
}

/*
 * Fallback jika tombol lama #exportBtn masih ada.
 * Tombol lama akan menjadi Export JPG agar sesuai permintaan.
 */
if (exportBtn) {
    exportBtn.addEventListener("click", () => exportImage("jpg"));
}

updateInfo();
setZoom(state.zoom);



/* =========================================================
   APP BACKGROUND COLOR
========================================================= */

const appBgColor = document.querySelector("#appBgColor");
const appBgColorText = document.querySelector("#appBgColorText");

function normalizeHex(value) {
    const v = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

function applyAppBackground(color) {
    const hex = normalizeHex(color) || "#EEF1F4";

    document.documentElement.style.setProperty(
        "--app-bg",
        hex
    );

    document.body.style.backgroundColor = hex;

    const workspace = document.querySelector(".workspace");
    const canvasArea = document.querySelector(".canvas-workspace");

    if (workspace) workspace.style.backgroundColor = hex;
    if (canvasArea) canvasArea.style.backgroundColor = hex;

    if (appBgColor && appBgColor.value !== hex) {
        appBgColor.value = hex;
    }

    if (appBgColorText && appBgColorText.value !== hex) {
        appBgColorText.value = hex;
    }

    try {
        localStorage.setItem("autocollage-app-bg", hex);
    } catch {}
}

if (appBgColor) {
    appBgColor.addEventListener("input", () => {
        applyAppBackground(appBgColor.value);
    });
}

if (appBgColorText) {
    appBgColorText.addEventListener("input", () => {
        const hex = normalizeHex(appBgColorText.value);
        if (hex) applyAppBackground(hex);
    });

    appBgColorText.addEventListener("change", () => {
        applyAppBackground(appBgColorText.value);
    });
}

let savedAppBg = null;

try {
    savedAppBg = localStorage.getItem("autocollage-app-bg");
} catch {}

applyAppBackground(savedAppBg || "#EEF1F4");

