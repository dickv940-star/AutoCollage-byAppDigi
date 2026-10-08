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
    crop: { item:null, aspect:1, sourceRect:null, zoom:1, display:null, dragging:false, resizing:false, resizeHandle:null, startX:0, startY:0, startRect:null, mode:"modal", canvasSelection:null, canvasResizing:false, canvasDragging:false }
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
const canvasWrapper = $("#canvasWrapper");
const canvasCropOverlay = $("#canvasCropOverlay");
const canvasCropSelection = $("#canvasCropSelection");

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
const cropModal=$("#cropModal"),cropCanvas=$("#cropCanvas"),cropStage=$("#cropStage"),cropSelection=$("#cropSelection"),cropTitle=$("#cropTitle"),cropSubtitle=$("#cropSubtitle"),cropRatioLabel=$("#cropRatioLabel"),cropZoom=$("#cropZoom"),cropResetBtn=$("#cropResetBtn"),cropCloseBtn=$("#cropCloseBtn"),cropCancelBtn=$("#cropCancelBtn"),cropSaveBtn=$("#cropSaveBtn");

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

        // CROP CANVAS:
        // foto asli tidak dipotong/diedit. Kita hanya membuat
        // frame/canvas tempat foto ditempatkan lalu melakukan
        // clipping pada area tujuan.
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

    for (const item of state.placements) {
        drawPhoto(
            ctx,
            item,
            cmToPx(item.x, dpi),
            cmToPx(item.y, dpi),
            cmToPx(item.width, dpi),
            cmToPx(item.height, dpi)
        );
    }

    renderPreview();
}

function renderPreview() {
    if (!previewCanvas || !state.canvas) return;

    const source = state.canvas.canvas;
    const desiredScale = Math.min(1.5, Math.max(0.15, Number(state.zoom) || 0.5));

    // Responsive: pada layar sempit, preview otomatis mengecil agar
    // seluruh canvas tetap terlihat di area kerja. Ukuran bitmap/output
    // tetap mengikuti Lebar x Tinggi + DPI dari panel kiri.
    let scale = desiredScale;
    if (canvasWorkspace) {
        const cs = getComputedStyle(canvasWorkspace);
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const availableW = Math.max(1, canvasWorkspace.clientWidth - padX);
        const availableH = Math.max(1, canvasWorkspace.clientHeight - padY);

        const fitScale = Math.min(
            availableW / Math.max(1, source.width),
            availableH / Math.max(1, source.height)
        );

        // Jangan mengecilkan canvas pada desktop jika zoom memang lebih besar;
        // fit hanya membatasi ketika viewport terlalu sempit.
        if (fitScale > 0 && fitScale < scale) {
            scale = fitScale;
        }
    }

    // Jangan mengubah ukuran bitmap preview saat zoom.
    // Bitmap tetap mengikuti resolusi output sehingga preview tidak
    // terus membuat canvas baru yang besar dan tidak menjadi blur.
    if (
        previewCanvas.width !== source.width ||
        previewCanvas.height !== source.height
    ) {
        previewCanvas.width = source.width;
        previewCanvas.height = source.height;
    }

    const ctx = previewCanvas.getContext("2d", { alpha: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(source, 0, 0);

    previewCanvas.style.width = Math.max(1, Math.round(source.width * scale)) + "px";
    previewCanvas.style.height = Math.max(1, Math.round(source.height * scale)) + "px";
}

/* =========================================================
   GENERATE
========================================================= */

function generateCollage() {
    try {
        if (!state.files.length) {
            alert("Upload foto terlebih dahulu.");
            return;
        }

        if (state.groups.size > MAX_IDS) {
            alert(`Maksimal ${MAX_IDS} nomor foto berbeda.`);
            return;
        }

        const incomplete = [...state.groups.values()]
            .filter(g =>
                [...state.sizes.keys()].some(k => !g.files.has(k))
            );

        if (incomplete.length) {
            const names = incomplete
                .map(g => "#" + g.id)
                .join(", ");

            if (!confirm(
                "Pasangan belum lengkap: " + names +
                "\n\nFoto tidak akan dipasangkan dengan nomor lain. Lanjutkan?"
            )) return;
        }

        state.canvas = createCanvasState();

        const queue = createPrintQueue();

        if (!queue.length) {
            alert("Jumlah foto yang ingin dicetak masih 0.");
            return;
        }

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
        state.generated = true;

        renderCollage();
        updateInfo();

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


/* PHOTO CROP EDITOR */
const cropOrientationBtn=document.querySelector("#cropOrientationBtn");
let cropHasSelection=false;

function cropFitRect(w,h,a){
    let rw=w,rh=rw/a;
    if(rh>h){rh=h;rw=rh*a}
    return{x:(w-rw)/2,y:(h-rh)/2,width:rw,height:rh};
}

function cropDisplay(){
    const i=state.crop.item.image;
    const sw=cropStage.clientWidth, sh=cropStage.clientHeight;
    const s=Math.min(sw/i.naturalWidth,sh/i.naturalHeight)*state.crop.zoom;
    return{scale:s,width:i.naturalWidth*s,height:i.naturalHeight*s,left:(sw-i.naturalWidth*s)/2,top:(sh-i.naturalHeight*s)/2};
}

function cropRender(){
    if(!state.crop.item)return;
    const d=cropDisplay(),i=state.crop.item.image;
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

    const ctx=cropCanvas.getContext("2d");
    ctx.clearRect(0,0,cropCanvas.width,cropCanvas.height);
    ctx.drawImage(i,0,0,cropCanvas.width,cropCanvas.height);

    if(cropHasSelection){
        const r=state.crop.selectionStage;
        cropSelection.style.display="block";
        cropSelection.style.left=r.x+"px";
        cropSelection.style.top=r.y+"px";
        cropSelection.style.width=r.width+"px";
        cropSelection.style.height=r.height+"px";
    }else{
        cropSelection.style.display="none";
    }
}

function cropInitSelection(){
    const d=cropDisplay();
    const ratio=state.crop.aspect;
    const maxW=Math.min(d.width,d.height*ratio);
    const w=maxW*.72;
    const h=w/ratio;

    state.crop.selectionStage={
        x:(cropStage.clientWidth-w)/2,
        y:(cropStage.clientHeight-h)/2,
        width:w,
        height:h
    };

    cropHasSelection=true;
}

function cropSourceRectFromSelection(){
    const d=state.crop.display;
    const sel=state.crop.selectionStage;
    const ox=state.crop.imageOffsetX||0;
    const oy=state.crop.imageOffsetY||0;

    let x=(sel.x-d.left)/d.scale-ox;
    let y=(sel.y-d.top)/d.scale-oy;
    let w=sel.width/d.scale;
    let h=sel.height/d.scale;

    const i=state.crop.item.image;

    x=Math.max(0,Math.min(x,i.naturalWidth-w));
    y=Math.max(0,Math.min(y,i.naturalHeight-h));

    state.crop.sourceRect={x,y,width:w,height:h};
}

function cropClampImage(){
    const d=state.crop.display;
    const sel=state.crop.selectionStage;
    const w=state.crop.item.image.naturalWidth*d.scale;
    const h=state.crop.item.image.naturalHeight*d.scale;

    const baseLeft=d.left+(state.crop.imageOffsetX||0)*d.scale;
    const baseTop=d.top+(state.crop.imageOffsetY||0)*d.scale;

    let left=baseLeft;
    let top=baseTop;

    const minLeft=sel.x+sel.width-w;
    const maxLeft=sel.x;
    const minTop=sel.y+sel.height-h;
    const maxTop=sel.y;

    if(w>=sel.width)left=Math.max(minLeft,Math.min(left,maxLeft));
    if(h>=sel.height)top=Math.max(minTop,Math.min(top,maxTop));

    state.crop.imageOffsetX=(left-d.left)/d.scale;
    state.crop.imageOffsetY=(top-d.top)/d.scale;
}

function openCrop(item){
    if(!item?.image)return;

    if(state.generated){
        const placement=state.placements.find(p=>p.source===item);
        if(placement){
            showCanvasCrop(placement);
            return;
        }
    }

    if(!cropModal || !cropStage)return;

    // Pastikan nilai ukuran valid sebelum modal dibuka.
    const w=Number(item.width);
    const h=Number(item.height);
    if(!(w>0) || !(h>0)) return;

    state.crop.item=item;
    state.crop.aspect=w/h;

    const saved=item.crop?.canvas;
    state.crop.zoom=Number(saved?.zoom)||1;
    state.crop.imageOffsetX=0;
    state.crop.imageOffsetY=0;

    cropTitle.textContent="Canvas Foto #"+item.id;
    cropSubtitle.textContent=item.name+" · "+item.sizeKey;
    cropRatioLabel.textContent="Canvas: "+item.width+" × "+item.height+" cm";
    cropZoom.value=String(state.crop.zoom);

    cropModal.classList.remove("hidden");

    requestAnimationFrame(()=>{
        cropInitSelection();

        if(saved){
            const d=cropDisplay();
            const sel=state.crop.selectionStage;
            const iw=item.image.naturalWidth;
            const ih=item.image.naturalHeight;

            const targetCx=(Number(saved.centerX)||0.5)*iw;
            const targetCy=(Number(saved.centerY)||0.5)*ih;
            const selCx=sel.x+sel.width/2;
            const selCy=sel.y+sel.height/2;

            state.crop.imageOffsetX=(selCx-d.left)/d.scale-targetCx;
            state.crop.imageOffsetY=(selCy-d.top)/d.scale-targetCy;
        }

        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    });
}

function closeCrop(){
    cropModal.classList.add("hidden");
    state.crop.item=null;
    state.crop.sourceRect=null;
    state.crop.selectionStage=null;
    state.crop.dragging=false;
    state.crop.resizing=false;
    state.crop.movingImage=false;
    cropHasSelection=false;
}

function cropPos(e){
    const r=cropStage.getBoundingClientRect();
    return{x:e.clientX-r.left,y:e.clientY-r.top};
}

function cropStartImage(e){
    e.preventDefault();
    e.stopPropagation();

    const p=cropPos(e);
    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startOffsetX=state.crop.imageOffsetX||0;
    state.crop.startOffsetY=state.crop.imageOffsetY||0;
    state.crop.movingImage=true;

    try{cropStage.setPointerCapture(e.pointerId)}catch{}
}

function cropMoveImage(e){
    if(!state.crop.movingImage)return;
    e.preventDefault();

    const p=cropPos(e),d=state.crop.display;

    state.crop.imageOffsetX=state.crop.startOffsetX+(p.x-state.crop.startX)/d.scale;
    state.crop.imageOffsetY=state.crop.startOffsetY+(p.y-state.crop.startY)/d.scale;

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
    if(!state.crop.resizing)return;
    e.preventDefault();

    const p=cropPos(e);
    const d=state.crop.display;
    const s=state.crop.startSelection;
    const dx=p.x-state.crop.startX;
    const dy=p.y-state.crop.startY;
    const h=state.crop.resizeHandle;
    const ratio=state.crop.aspect;

    let x=s.x,y=s.y,w=s.width,hh=s.height;

    if(h.includes("e"))w=s.width+dx;
    if(h.includes("w")){w=s.width-dx;x=s.x+dx}
    if(h.includes("s"))hh=s.height+dy;
    if(h.includes("n")){hh=s.height-dy;y=s.y+dy}

    if(Math.abs(dx)>=Math.abs(dy)){
        hh=w/ratio;
    }else{
        w=hh*ratio;
    }

    if(h.includes("w"))x=s.x+s.width-w;
    if(h.includes("n"))y=s.y+s.height-hh;

    const min=35;
    if(w<min){w=min;hh=w/ratio;if(h.includes("w"))x=s.x+s.width-w;if(h.includes("n"))y=s.y+s.height-hh}
    if(hh<min){hh=min;w=hh*ratio;if(h.includes("w"))x=s.x+s.width-w;if(h.includes("n"))y=s.y+s.height-hh}

    const sw=cropStage.clientWidth,sh=cropStage.clientHeight;
    if(x<0){x=0;w=s.x+s.width}
    if(y<0){y=0;hh=s.y+s.height}
    if(x+w>sw){w=sw-x;hh=w/ratio}
    if(y+hh>sh){hh=sh-y;w=hh*ratio}

    state.crop.selectionStage={x,y,width:w,height:hh};
    cropClampImage();
    cropSourceRectFromSelection();
    cropRender();
}

function cropEnd(e){
    state.crop.movingImage=false;
    state.crop.resizing=false;
    state.crop.resizeHandle=null;
    try{cropStage.releasePointerCapture(e.pointerId)}catch{}
}

function cropToggleOrientation(){
    if(!state.crop.item)return;

    state.crop.aspect=1/state.crop.aspect;

    const sel=state.crop.selectionStage;
    const cx=sel.x+sel.width/2,cy=sel.y+sel.height/2;
    let w=sel.height*state.crop.aspect;
    let h=sel.height;

    if(w>cropStage.clientWidth*.9){w=cropStage.clientWidth*.9;h=w/state.crop.aspect}
    if(h>cropStage.clientHeight*.9){h=cropStage.clientHeight*.9;w=h*state.crop.aspect}

    state.crop.selectionStage={
        x:cx-w/2,y:cy-h/2,width:w,height:h
    };

    const sw=cropStage.clientWidth,sh=cropStage.clientHeight;
    state.crop.selectionStage.x=Math.max(0,Math.min(state.crop.selectionStage.x,sw-w));
    state.crop.selectionStage.y=Math.max(0,Math.min(state.crop.selectionStage.y,sh-h));

    cropClampImage();
    cropSourceRectFromSelection();
    cropRatioLabel.textContent="Rasio: "+(state.crop.aspect>=1?"Landscape":"Portrait");
    cropRender();
}


/* =========================================================
   DIRECT CROP ON MAIN CANVAS
   Canvas size always follows the LEFT PANEL dimensions.
========================================================= */

function getPreviewScale(){
    if(!state.canvas || !previewCanvas) return 1;
    return previewCanvas.clientWidth / Math.max(1,state.canvas.widthPx);
}

function placementToCanvasRect(item){
    const scale=getPreviewScale();
    return {
        x:item.x * state.canvas.dpi / 2.54 * scale,
        y:item.y * state.canvas.dpi / 2.54 * scale,
        width:item.width * state.canvas.dpi / 2.54 * scale,
        height:item.height * state.canvas.dpi / 2.54 * scale
    };
}

function showCanvasCrop(item){
    if(!state.generated || !state.canvas || !item?.source?.image || !canvasCropOverlay || !canvasCropSelection) return;

    state.crop.item=item.source;
    state.crop.mode="canvas";
    state.crop.aspect=item.width/item.height;
    state.crop.zoom=Number(item.source.crop?.canvas?.zoom)||1;

    const r=placementToCanvasRect(item);
    const saved=item.source.crop?.canvas;

    // Selection mengikuti ukuran foto yang sudah ditempatkan.
    // Ukuran lembar utama tidak pernah diubah.
    let w=r.width, h=r.height;
    let x=r.x, y=r.y;

    if(saved){
        const savedZoom=Math.max(1,Number(saved.zoom)||1);
        const savedCx=Math.max(0,Math.min(1,Number(saved.centerX) || 0.5));
        const savedCy=Math.max(0,Math.min(1,Number(saved.centerY) || 0.5));

        w=r.width/savedZoom;
        h=r.height/savedZoom;
        x=r.x+r.width*savedCx-w/2;
        y=r.y+r.height*savedCy-h/2;

        // Clamp agar crop box tetap berada di dalam foto.
        x=Math.max(r.x,Math.min(r.x+r.width-w,x));
        y=Math.max(r.y,Math.min(r.y+r.height-h,y));
    }

    state.crop.canvasSelection={x,y,width:w,height:h,photoRect:{...r}};
    canvasCropOverlay.classList.remove("hidden");
    renderCanvasCropOverlay();

    // Fokuskan crop tanpa membuka modal.
    try{canvasCropOverlay.scrollIntoView({block:"nearest",inline:"nearest"})}catch{}
}

function hideCanvasCrop(){
    if(canvasCropOverlay) canvasCropOverlay.classList.add("hidden");
    state.crop.mode="modal";
    state.crop.canvasSelection=null;
    state.crop.item=null;
    state.crop.canvasDragging=false;
    state.crop.canvasResizing=false;
}

function renderCanvasCropOverlay(){
    if(!canvasCropOverlay || !canvasCropSelection || !state.crop.canvasSelection) return;

    const s=state.crop.canvasSelection;
    canvasCropSelection.style.left=s.x+"px";
    canvasCropSelection.style.top=s.y+"px";
    canvasCropSelection.style.width=s.width+"px";
    canvasCropSelection.style.height=s.height+"px";

    canvasCropOverlay.style.width=previewCanvas.clientWidth+"px";
    canvasCropOverlay.style.height=previewCanvas.clientHeight+"px";
}

function canvasCropPos(e){
    const r=canvasCropOverlay.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
}

function beginCanvasCropResize(e,handle){
    if(!state.crop.canvasSelection)return;
    e.preventDefault();
    e.stopPropagation();

    const p=canvasCropPos(e);
    state.crop.canvasResizing=true;
    state.crop.resizeHandle=handle;
    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startSelection={...state.crop.canvasSelection};

    try{canvasCropOverlay.setPointerCapture(e.pointerId)}catch{}
}

function moveCanvasCropResize(e){
    if(!state.crop.canvasResizing || !state.crop.canvasSelection)return;
    e.preventDefault();

    const p=canvasCropPos(e);
    const s=state.crop.startSelection;
    const dx=p.x-state.crop.startX;
    const dy=p.y-state.crop.startY;
    const h=state.crop.resizeHandle;
    const ratio=state.crop.aspect;

    let x=s.x,y=s.y,w=s.width,hh=s.height;

    if(h.includes("e")) w=s.width+dx;
    if(h.includes("w")) { w=s.width-dx; x=s.x+dx; }
    if(h.includes("s")) hh=s.height+dy;
    if(h.includes("n")) { hh=s.height-dy; y=s.y+dy; }

    // Photoshop-like fixed aspect ratio.
    if(Math.abs(dx)>=Math.abs(dy)) hh=w/ratio;
    else { w=hh*ratio; }

    if(h.includes("w")) x=s.x+s.width-w;
    if(h.includes("n")) y=s.y+s.height-hh;

    const min=24;
    if(w<min){w=min;hh=w/ratio;if(h.includes("w"))x=s.x+s.width-w;if(h.includes("n"))y=s.y+s.height-hh}
    if(hh<min){hh=min;w=hh*ratio;if(h.includes("w"))x=s.x+s.width-w;if(h.includes("n"))y=s.y+s.height-hh}

    // Keep crop box inside the selected photo frame.
    const pr=s.photoRect;
    if(x<pr.x){x=pr.x;w=s.x+s.width-pr.x;hh=w/ratio}
    if(y<pr.y){y=pr.y;hh=s.y+s.height-pr.y;w=hh*ratio}
    if(x+w>pr.x+pr.width){w=pr.x+pr.width-x;hh=w/ratio}
    if(y+hh>pr.y+pr.height){hh=pr.y+pr.height-y;w=hh*ratio}

    state.crop.canvasSelection={...s,x,y,width:w,height:hh};
    renderCanvasCropOverlay();
}

function beginCanvasCropDrag(e){
    if(!state.crop.canvasSelection)return;
    e.preventDefault();
    e.stopPropagation();

    const p=canvasCropPos(e);
    state.crop.canvasDragging=true;
    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startSelection={...state.crop.canvasSelection};

    try{canvasCropOverlay.setPointerCapture(e.pointerId)}catch{}
}

function moveCanvasCropDrag(e){
    if(!state.crop.canvasDragging || !state.crop.canvasSelection)return;
    e.preventDefault();

    const p=canvasCropPos(e);
    const s=state.crop.startSelection;
    const dx=p.x-state.crop.startX;
    const dy=p.y-state.crop.startY;
    const pr=s.photoRect;

    state.crop.canvasSelection={
        ...s,
        x:Math.max(pr.x,Math.min(pr.x+pr.width-s.width,s.x+dx)),
        y:Math.max(pr.y,Math.min(pr.y+pr.height-s.height,s.y+dy))
    };

    renderCanvasCropOverlay();
}

function endCanvasCropPointer(e){
    state.crop.canvasDragging=false;
    state.crop.canvasResizing=false;
    state.crop.resizeHandle=null;
    try{canvasCropOverlay.releasePointerCapture(e.pointerId)}catch{}
}

function applyCanvasCrop(){
    if(state.crop.mode!=="canvas" || !state.crop.item || !state.crop.canvasSelection) return;

    const item=state.crop.item;
    const s=state.crop.canvasSelection;
    const pr=s.photoRect;

    // Frame output tetap ukuran filename / placement.
    // Besar crop box menentukan zoom; posisi tengah menentukan fokus.
    const relCx=((s.x+s.width/2)-pr.x)/pr.width;
    const relCy=((s.y+s.height/2)-pr.y)/pr.height;
    const zoom=Math.max(
        1,
        pr.width/Math.max(1,s.width),
        pr.height/Math.max(1,s.height)
    );

    item.crop={
        canvas:{
            width:item.width,
            height:item.height,
            zoom,
            centerX:Math.max(0,Math.min(1,relCx)),
            centerY:Math.max(0,Math.min(1,relCy))
        }
    };

    hideCanvasCrop();
    renderPairs();
    renderCollage();
}

function saveCrop(){
    if(!state.crop.item||!cropHasSelection)return;

    const d=state.crop.display;
    const sel=state.crop.selectionStage;
    const ox=state.crop.imageOffsetX||0;
    const oy=state.crop.imageOffsetY||0;
    const iw=state.crop.item.image.naturalWidth;
    const ih=state.crop.item.image.naturalHeight;

    // Simpan posisi foto di dalam CANVAS, bukan potongan sumber foto.
    const imageLeft=d.left+ox*d.scale;
    const imageTop=d.top+oy*d.scale;
    const centerX=((sel.x+sel.width/2)-imageLeft)/d.scale;
    const centerY=((sel.y+sel.height/2)-imageTop)/d.scale;

    state.crop.item.crop={
        canvas:{
            width:state.crop.item.width,
            height:state.crop.item.height
        },
        zoom:Number(state.crop.zoom)||1,
        centerX:Math.max(0,Math.min(1,centerX/iw)),
        centerY:Math.max(0,Math.min(1,centerY/ih))
    };

    closeCrop();
    renderPairs();

    if(state.generated)renderCollage();
}

if(canvasCropOverlay){
    canvasCropOverlay.addEventListener("pointerdown",e=>{
        const handle=e.target.closest(".canvas-crop-handle");
        if(handle){
            const cls=[...handle.classList].find(x=>x.startsWith("canvas-crop-handle-"));
            if(cls) beginCanvasCropResize(e,cls.replace("canvas-crop-handle-",""));
            return;
        }
        if(e.target.closest("#canvasCropSelection")) beginCanvasCropDrag(e);
    });

    canvasCropOverlay.addEventListener("pointermove",e=>{
        if(state.crop.canvasResizing) moveCanvasCropResize(e);
        else if(state.crop.canvasDragging) moveCanvasCropDrag(e);
    });

    canvasCropOverlay.addEventListener("pointerup",endCanvasCropPointer);
    canvasCropOverlay.addEventListener("pointercancel",endCanvasCropPointer);
    canvasCropOverlay.addEventListener("lostpointercapture",endCanvasCropPointer);
}

if(cropStage){
    cropStage.addEventListener("pointerdown",e=>{
        const handle=e.target.closest(".crop-handle");
        if(handle){
            const cls=[...handle.classList].find(x=>x.startsWith("crop-handle-"));
            if(cls){
                cropStartResize(e,cls.replace("crop-handle-",""));
                return;
            }
        }

        if(e.target.closest("#cropSelection") || e.target===cropCanvas || e.target===cropStage){
            cropStartImage(e);
        }
    });

    cropStage.addEventListener("pointermove",e=>{
        if(state.crop.resizing)cropMoveResize(e);
        else if(state.crop.movingImage)cropMoveImage(e);
    });

    cropStage.addEventListener("pointerup",cropEnd);
    cropStage.addEventListener("pointercancel",cropEnd);
    cropStage.addEventListener("lostpointercapture",cropEnd);
}

if(cropZoom){
    cropZoom.addEventListener("input",()=>{
        state.crop.zoom=n(cropZoom.value,1);
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
        state.crop.aspect=state.crop.item.width/state.crop.item.height;
        cropInitSelection();
        state.crop.imageOffsetX=0;
        state.crop.imageOffsetY=0;
        cropClampImage();
        cropSourceRectFromSelection();
        cropRender();
    });
}

if(cropOrientationBtn)cropOrientationBtn.addEventListener("click",cropToggleOrientation);
if(cropCloseBtn)cropCloseBtn.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    closeCrop();
});
if(cropCancelBtn)cropCancelBtn.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    closeCrop();
});
if(cropSaveBtn)cropSaveBtn.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    saveCrop();
});

document.addEventListener("keydown",e=>{
    if(state.crop.mode==="canvas"){
        if(e.key==="Escape"){e.preventDefault();hideCanvasCrop();return}
        if(e.key==="Enter"){e.preventDefault();applyCanvasCrop();return}
        return;
    }

    if(cropModal?.classList.contains("hidden"))return;
    if(e.key==="Escape"){closeCrop();return}
    if(e.key==="Enter"){e.preventDefault();saveCrop()}
});

if(fileList){
    fileList.addEventListener("click",e=>{
        const b=e.target.closest(".crop-button[data-crop-id]");
        if(!b)return;

        e.preventDefault();
        e.stopPropagation();

        const id=String(b.dataset.cropId || "");
        const sizeKey=String(b.dataset.cropSize || "");
        const g=state.groups.get(id);
        const item=g?.files.get(sizeKey);

        if(item?.image){
            openCrop(item);
        }
    });
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
            String(state.generated ? state.placements.length : 0);
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
    if(state.crop.mode==="canvas" && state.crop.item){
        const placement=state.placements.find(p=>p.source===state.crop.item);
        if(placement){
            const old=state.crop.canvasSelection;
            showCanvasCrop(placement);
            if(old && state.crop.canvasSelection){
                state.crop.canvasSelection.x=old.x*(previewCanvas.clientWidth/Math.max(1,previewCanvas.width));
                state.crop.canvasSelection.y=old.y*(previewCanvas.clientHeight/Math.max(1,previewCanvas.height));
                renderCanvasCropOverlay();
            }
        }
    }
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

/* Recalculate responsive preview whenever the viewport changes. */
let previewResizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(previewResizeTimer);
    previewResizeTimer = setTimeout(() => {
        if (!state.canvas) return;
        renderPreview();

        if (state.crop.mode === "canvas" && state.crop.item) {
            const placement = state.placements.find(
                p => p.source === state.crop.item
            );
            if (placement) {
                showCanvasCrop(placement);
            }
        }
    }, 50);
});


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
        state.canvas = null;
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

    // Background picker controls the app surface only.
    // Keep the navy workspace from the supplied design intact.

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

