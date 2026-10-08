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

function drawPhoto(ctx,item,x,y,w,h){
    if(!item.source.image)return;

    ctx.filter="none";
    ctx.imageSmoothingEnabled=true;

    const img=item.source.image;
    const c=item.source.crop;

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
    if (!previewCanvas || !state.canvas) return;

    const source = state.canvas.canvas;
    const scale = state.zoom;

    previewCanvas.width = Math.max(1, Math.round(source.width * scale));
    previewCanvas.height = Math.max(1, Math.round(source.height * scale));

    const ctx = previewCanvas.getContext("2d");
    ctx.drawImage(
        source,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );

    previewCanvas.style.width = previewCanvas.width + "px";
    previewCanvas.style.height = previewCanvas.height + "px";
}

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
    if (!state.canvas) {
        alert("Buat Canvas terlebih dahulu.");
        return;
    }

    const sourceFrames = state.frames.length
        ? state.frames
        : state.placements;

    if (!sourceFrames.length) {
        alert("Tambahkan minimal satu frame foto.");
        return;
    }

    const template = {
        version: 2,
        widthCm: state.canvas.widthCm,
        heightCm: state.canvas.heightCm,
        dpi: state.canvas.dpi,
        frames: sourceFrames.map((p, index) => ({
            index,
            sizeKey: p.sizeKey || `${p.width}x${p.height}`,
            x: n(p.x),
            y: n(p.y),
            width: n(p.width),
            height: n(p.height)
        }))
    };

    try {
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
        state.template = template;
        updateTemplateButton();
        alert("Contoh collage berhasil disimpan.");
    } catch (e) {
        console.error(e);
        alert("Gagal menyimpan contoh collage.");
    }
}

function clearTemplate() {
    try {
        localStorage.removeItem(TEMPLATE_KEY);
    } catch {}
    state.template = null;
    updateTemplateButton();
}

function updateTemplateButton() {
    const btn = document.querySelector("#saveTemplateBtn");
    if (!btn) return;
    btn.textContent = state.template
        ? "Contoh Tersimpan ✓"
        : "Simpan sebagai Contoh";
}

function createTemplatePlacements(queue) {
    const t = state.template;
    if (!t) return null;

    if (
        Math.abs(n(t.widthCm) - state.canvas.widthCm) > 0.0001 ||
        Math.abs(n(t.heightCm) - state.canvas.heightCm) > 0.0001
    ) return null;

    const slots = t.frames || t.placements || [];
    if (!slots.length) return null;

    const bySize = new Map();
    for (const item of queue) {
        if (!bySize.has(item.sizeKey)) bySize.set(item.sizeKey, []);
        bySize.get(item.sizeKey).push(item);
    }

    const used = new Map();
    const placements = [];
    const missing = [];

    for (const slot of slots) {
        const list = bySize.get(slot.sizeKey) || [];
        const index = used.get(slot.sizeKey) || 0;

        if (!list.length || index >= list.length) {
            missing.push(slot.sizeKey);
            continue;
        }

        const item = list[index];
        used.set(slot.sizeKey, index + 1);

        placements.push({
            ...item,
            x: n(slot.x),
            y: n(slot.y),
            width: n(slot.width, item.widthCm),
            height: n(slot.height, item.heightCm)
        });
    }

    state.templateMissing = missing;
    return placements.length ? placements : null;
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

        if (!state.canvas) state.canvas = createCanvasState();

        const queue = createPrintQueue();
        if (!queue.length) {
            alert("Jumlah foto yang ingin dicetak masih 0.");
            return;
        }

        const margin = Math.max(0, n(marginInput?.value, 0.5));
        const gap = Math.max(0, n(gapInput?.value, 0.3));

        let templatePlacements = createTemplatePlacements(queue);

        // Jika frame sudah dibuat pada canvas aktif, gunakan layout tersebut.
        if (!templatePlacements && state.frames.length) {
            const bySize = new Map();
            for (const item of queue) {
                if (!bySize.has(item.sizeKey)) bySize.set(item.sizeKey, []);
                bySize.get(item.sizeKey).push(item);
            }

            const used = new Map();
            templatePlacements = [];
            for (const frame of state.frames) {
                const list = bySize.get(frame.sizeKey) || [];
                const index = used.get(frame.sizeKey) || 0;
                if (!list[index]) continue;

                const item = list[index];
                used.set(frame.sizeKey, index + 1);
                templatePlacements.push({
                    ...item,
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height
                });
            }
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
    return {
        x: (e.clientX - r.left) / Math.max(0.0001, state.zoom),
        y: (e.clientY - r.top) / Math.max(0.0001, state.zoom)
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

function cropDisplay(){
    if(!state.crop.item?.image) return null;

    const i=state.crop.item.image;
    const sw=Math.max(1,cropStage.clientWidth);
    const sh=Math.max(1,cropStage.clientHeight);
    const base=Math.min(sw/i.naturalWidth,sh/i.naturalHeight);
    const scale=base*Math.max(1,Number(state.crop.zoom)||1);

    return {
        scale,
        width:i.naturalWidth*scale,
        height:i.naturalHeight*scale,
        left:(sw-i.naturalWidth*scale)/2,
        top:(sh-i.naturalHeight*scale)/2
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

    const d=state.crop.display||cropDisplay();
    if(!d||!d.scale)return;

    const sel=state.crop.selectionStage;
    const iw=d.width;
    const ih=d.height;

    let left=d.left+(state.crop.imageOffsetX||0)*d.scale;
    let top=d.top+(state.crop.imageOffsetY||0)*d.scale;

    if(iw>=sel.width){
        left=Math.max(sel.x+sel.width-iw,Math.min(left,sel.x));
    }else{
        left=sel.x+(sel.width-iw)/2;
    }

    if(ih>=sel.height){
        top=Math.max(sel.y+sel.height-ih,Math.min(top,sel.y));
    }else{
        top=sel.y+(sel.height-ih)/2;
    }

    state.crop.imageOffsetX=(left-d.left)/d.scale;
    state.crop.imageOffsetY=(top-d.top)/d.scale;
}

function cropRender(){
    if(!state.crop.item||!cropStage)return;

    const d=state.crop.item.image ? cropDisplay() : null;

    if(!d){
        const sw=Math.max(1,cropStage.clientWidth);
        const sh=Math.max(1,cropStage.clientHeight);
        cropCanvas.width=sw;
        cropCanvas.height=sh;
        cropCanvas.style.position="absolute";
        cropCanvas.style.left="0px";
        cropCanvas.style.top="0px";
        cropCanvas.style.width=sw+"px";
        cropCanvas.style.height=sh+"px";
        cropCanvas.style.zIndex="1";

        const ctx=cropCanvas.getContext("2d");
        ctx.clearRect(0,0,sw,sh);
        ctx.fillStyle="#20252b";
        ctx.fillRect(0,0,sw,sh);

        const r=state.crop.selectionStage;
        if(r){
            ctx.save();
            ctx.fillStyle="#e9edf2";
            ctx.fillRect(r.x,r.y,r.width,r.height);
            ctx.strokeStyle="#667085";
            ctx.lineWidth=2;
            ctx.setLineDash([8,5]);
            ctx.strokeRect(r.x,r.y,r.width,r.height);
            ctx.setLineDash([]);
            ctx.fillStyle="#667085";
            ctx.font="600 18px Arial";
            ctx.textAlign="center";
            ctx.textBaseline="middle";
            ctx.fillText("FRAME KOSONG",r.x+r.width/2,r.y+r.height/2);
            ctx.restore();
        }
    }else{
        state.crop.display=d;
        cropCanvas.width=Math.max(1,Math.round(d.width));
        cropCanvas.height=Math.max(1,Math.round(d.height));
        cropCanvas.style.position="absolute";
        cropCanvas.style.left=(d.left+(state.crop.imageOffsetX||0)*d.scale)+"px";
        cropCanvas.style.top=(d.top+(state.crop.imageOffsetY||0)*d.scale)+"px";
        cropCanvas.style.width=d.width+"px";
        cropCanvas.style.height=d.height+"px";
        cropCanvas.style.pointerEvents="auto";
        cropCanvas.style.touchAction="none";
        cropCanvas.style.zIndex="1";

        const ctx=cropCanvas.getContext("2d");
        ctx.clearRect(0,0,cropCanvas.width,cropCanvas.height);
        ctx.filter="none";
        ctx.drawImage(state.crop.item.image,0,0,cropCanvas.width,cropCanvas.height);
    }

    cropSelection.style.left=state.crop.selectionStage.x+"px";
    cropSelection.style.top=state.crop.selectionStage.y+"px";
    cropSelection.style.width=state.crop.selectionStage.width+"px";
    cropSelection.style.height=state.crop.selectionStage.height+"px";
    cropSelection.style.zIndex="3";
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
    const i=state.crop.item;
    const s=state.crop.selectionStage;
    if(!i||!s)return null;

    if(!i.image){
        state.crop.sourceRect=null;
        return null;
    }

    const d=state.crop.display||cropDisplay();
    if(!d||!d.scale)return null;

    const x=((s.x-d.left)/d.scale)/i.image.naturalWidth;
    const y=((s.y-d.top)/d.scale)/i.image.naturalHeight;
    const w=(s.width/d.scale)/i.image.naturalWidth;
    const h=(s.height/d.scale)/i.image.naturalHeight;

    state.crop.sourceRect={
        x:Math.max(0,Math.min(1,x)),
        y:Math.max(0,Math.min(1,y)),
        width:Math.max(.0001,Math.min(1,w)),
        height:Math.max(.0001,Math.min(1,h))
    };
    return state.crop.sourceRect;
}
function openCrop(item){
    if(!item)return;

    state.crop.item=item;
    state.crop.zoom=1;
    state.crop.imageOffsetX=0;
    state.crop.imageOffsetY=0;
    state.crop.sourceRect=null;

    const hasImage=!!item.image;
    cropTitle.textContent=hasImage ? "Atur Canvas Foto" : "Buat / Atur Frame Foto";
    cropSubtitle.textContent=hasImage
        ? "Geser foto di dalam frame. Foto asli tidak diubah."
        : "Frame kosong — foto dapat dimasukkan setelahnya.";
    cropZoom.disabled=!hasImage;

    const ratio=Math.max(.05,n(item.width,2)/Math.max(.05,n(item.height,3)));
    state.crop.aspect=ratio;

    cropModal.classList.remove("hidden");

    requestAnimationFrame(()=>{
        const sw=Math.max(1,cropStage.clientWidth);
        const sh=Math.max(1,cropStage.clientHeight);

        let w=Math.min(sw*.62, sh*.62*ratio);
        let h=w/ratio;

        if(h>sh*.62){h=sh*.62;w=h*ratio;}

        const saved=item.crop?.canvas;
        state.crop.selectionStage={
            x:(sw-w)/2,
            y:(sh-h)/2,
            width:w,
            height:h
        };

        if(saved?.sourceRect && hasImage){
            state.crop.sourceRect={...saved.sourceRect};
        }

        cropRatioLabel.textContent="Rasio: "+(ratio>=1?"Landscape":"Portrait");

        if(frameWidthInput) frameWidthInput.value=n(item.width,2);
        if(frameHeightInput) frameHeightInput.value=n(item.height,3);

        cropHasSelection=true;
        cropRender();
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
    e.preventDefault();
    e.stopPropagation();

    const p=cropPos(e);
    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startOffsetX=state.crop.imageOffsetX||0;
    state.crop.startOffsetY=state.crop.imageOffsetY||0;

    // Di dalam frame = pindahkan Canvas.
    // Di luar frame = pindahkan foto.
    const r=state.crop.selectionStage;
    const inside=r&&p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;

    if(inside){
        state.crop.startSelection={...r};
        state.crop.movingFrame=true;
    }else{
        state.crop.movingImage=true;
    }

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

    const item=state.crop.item;
    const width=Math.max(.1,n(frameWidthInput?.value,item.width||2));
    const height=Math.max(.1,n(frameHeightInput?.value,item.height||3));

    item.width=width;
    item.height=height;
    item.widthCm=width;
    item.heightCm=height;
    item.sizeKey=`${width}x${height}`;

    if(item.image){
        cropSourceRectFromSelection();
        const sr=state.crop.sourceRect;
        if(sr){
            item.crop={
                canvas:{
                    width,
                    height,
                    ratio:state.crop.aspect,
                    zoom:Math.max(1,Number(state.crop.zoom)||1),
                    sourceRect:{
                        x:Math.max(0,Math.min(1,n(sr.x))),
                        y:Math.max(0,Math.min(1,n(sr.y))),
                        width:Math.max(.0001,Math.min(1,n(sr.width))),
                        height:Math.max(.0001,Math.min(1,n(sr.height)))
                    },
                    centerX:Math.max(0,Math.min(1,n(sr.x)+n(sr.width)/2)),
                    centerY:Math.max(0,Math.min(1,n(sr.y)+n(sr.height)/2)),
                    frameRatio:state.crop.selectionStage.width/
                        Math.max(1,state.crop.selectionStage.height)
                }
            };
        }
    }

    // Empty frame dibuat/diubah tanpa membutuhkan foto.
    const existing=state.frames.findIndex(x=>x._frameId===item._frameId);
    const frame={
        _frameId:item._frameId||("frame-"+Date.now()+"-"+Math.random().toString(36).slice(2,7)),
        sizeKey:item.sizeKey,
        x:n(item.x,1),
        y:n(item.y,1),
        width,
        height,
        source:item.image?item.source||item:null
    };

    if(existing>=0) state.frames[existing]={...state.frames[existing],...frame};
    else state.frames.push(frame);

    closeCrop();
    renderCollage();
    updateInfo();
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

if(cropResetBtn){
    cropResetBtn.addEventListener("click",()=>{
        if(!state.crop.item)return;

        state.crop.zoom=1;
        cropZoom.value="1";
        state.crop.aspect=
            Math.max(.05,state.crop.item.width/state.crop.item.height);
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

        if(item)openCrop(item);
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
    if(!state.canvas) state.canvas=createCanvasState();
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

