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
    crop: { item:null, aspect:1, sourceRect:null, zoom:1, display:null, dragging:false, resizing:false, resizeHandle:null, startX:0, startY:0, startRect:null }
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

function drawPhoto(ctx,item,x,y,w,h){if(!item.source.image)return;ctx.filter="none";ctx.imageSmoothingEnabled=true;const img=item.source.image;if(item.source.crop){const c=item.source.crop;ctx.drawImage(img,c.x,c.y,c.width,c.height,x,y,w,h);return;}const sr=img.naturalWidth/img.naturalHeight,tr=w/h;let dw,dh;if(sr>tr){dw=w;dh=w/sr}else{dh=h;dw=h*sr}ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
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
    return{x:(w-rw)/2,y:(h-rh)/2,width:rw,height:rh}
}

function cropDisplay(){
    const i=state.crop.item.image;
    const sw=cropStage.clientWidth;
    const sh=cropStage.clientHeight;
    const s=Math.min(sw/i.naturalWidth,sh/i.naturalHeight)*state.crop.zoom;
    return{
        scale:s,
        width:i.naturalWidth*s,
        height:i.naturalHeight*s,
        left:(sw-i.naturalWidth*s)/2,
        top:(sh-i.naturalHeight*s)/2
    };
}

function cropRender(){
    if(!state.crop.item)return;

    const d=cropDisplay();
    const i=state.crop.item.image;
    const r=state.crop.sourceRect;
    const ox=state.crop.imageOffsetX||0;
    const oy=state.crop.imageOffsetY||0;

    state.crop.display=d;

    cropCanvas.width=Math.max(1,Math.round(d.width));
    cropCanvas.height=Math.max(1,Math.round(d.height));

    cropCanvas.style.cssText=
        "position:absolute;"+
        "left:"+(d.left+ox*d.scale)+"px;"+
        "top:"+(d.top+oy*d.scale)+"px;"+
        "width:"+d.width+"px;"+
        "height:"+d.height+"px;"+
        "pointer-events:auto;"+
        "touch-action:none;";

    const ctx=cropCanvas.getContext("2d");
    ctx.clearRect(0,0,cropCanvas.width,cropCanvas.height);
    ctx.drawImage(i,0,0,cropCanvas.width,cropCanvas.height);

    cropSelection.style.display=cropHasSelection?"block":"none";

    if(cropHasSelection){
        cropSelection.style.left=(d.left+(r.x+ox)*d.scale)+"px";
        cropSelection.style.top=(d.top+(r.y+oy)*d.scale)+"px";
        cropSelection.style.width=(r.width*d.scale)+"px";
        cropSelection.style.height=(r.height*d.scale)+"px";
    }
}

function cropClamp(r){
    const i=state.crop.item.image;
    const min=20/Math.max(state.crop.display.scale,.0001);

    r.width=Math.max(min,r.width);
    r.height=r.width/state.crop.aspect;

    if(r.width>i.naturalWidth){
        r.width=i.naturalWidth;
        r.height=r.width/state.crop.aspect;
    }

    if(r.height>i.naturalHeight){
        r.height=i.naturalHeight;
        r.width=r.height*state.crop.aspect;
    }

    r.x=Math.max(0,Math.min(r.x,i.naturalWidth-r.width));
    r.y=Math.max(0,Math.min(r.y,i.naturalHeight-r.height));

    return r;
}

function cropImageOffsetClamp(){
    const d=state.crop.display;
    const r=state.crop.sourceRect;
    const i=state.crop.item.image;
    const stageW=cropStage.clientWidth;
    const stageH=cropStage.clientHeight;

    const cropLeft=(stageW-r.width*d.scale)/2;
    const cropTop=(stageH-r.height*d.scale)/2;
    const cropRight=cropLeft+r.width*d.scale;
    const cropBottom=cropTop+r.height*d.scale;

    let left=d.left+(state.crop.imageOffsetX||0)*d.scale;
    let top=d.top+(state.crop.imageOffsetY||0)*d.scale;
    let right=left+d.width;
    let bottom=top+d.height;

    const minLeft=cropRight-d.width;
    const maxLeft=cropLeft;
    const minTop=cropBottom-d.height;
    const maxTop=cropTop;

    if(d.width>=r.width*d.scale){
        left=Math.max(minLeft,Math.min(left,maxLeft));
    }

    if(d.height>=r.height*d.scale){
        top=Math.max(minTop,Math.min(top,maxTop));
    }

    state.crop.imageOffsetX=(left-d.left)/d.scale;
    state.crop.imageOffsetY=(top-d.top)/d.scale;
}

function cropCreateSelection(){
    const i=state.crop.item.image;
    state.crop.sourceRect=cropFitRect(
        i.naturalWidth,
        i.naturalHeight,
        state.crop.aspect
    );

    const r=state.crop.sourceRect;

    state.crop.imageOffsetX=0;
    state.crop.imageOffsetY=0;

    /*
     * Posisikan area crop di tengah stage.
     * Foto kemudian dapat digeser di belakang area ini.
     */
    state.crop.sourceRect={
        x:r.x,
        y:r.y,
        width:r.width,
        height:r.height
    };

    cropHasSelection=true;
    cropRender();
    cropImageOffsetClamp();
    cropRender();
}

function openCrop(item){
    if(!item?.image)return;

    state.crop.item=item;
    state.crop.aspect=item.width/item.height;
    state.crop.zoom=1;

    if(item.crop){
        state.crop.sourceRect={...item.crop};
    }else{
        state.crop.sourceRect=cropFitRect(
            item.image.naturalWidth,
            item.image.naturalHeight,
            state.crop.aspect
        );
    }

    cropHasSelection=true;
    state.crop.imageOffsetX=0;
    state.crop.imageOffsetY=0;

    cropTitle.textContent="Crop Foto #"+item.id;
    cropSubtitle.textContent=item.name+" · "+item.sizeKey;
    cropRatioLabel.textContent=
        "Rasio cetak: "+item.width+" × "+item.height+" cm";

    cropZoom.value="1";
    cropModal.classList.remove("hidden");

    requestAnimationFrame(()=>{
        cropRender();
        cropImageOffsetClamp();
        cropRender();
    });
}

function closeCrop(){
    cropModal.classList.add("hidden");
    state.crop.item=null;
    state.crop.sourceRect=null;
    state.crop.dragging=false;
    state.crop.resizing=false;
    state.crop.movingImage=false;
    cropHasSelection=false;
}

function cropPos(e){
    const r=cropStage.getBoundingClientRect();
    return{x:e.clientX-r.left,y:e.clientY-r.top};
}

function cropStartImageMove(e){
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

    const p=cropPos(e);
    const d=state.crop.display;

    state.crop.imageOffsetX=
        state.crop.startOffsetX+(p.x-state.crop.startX)/d.scale;

    state.crop.imageOffsetY=
        state.crop.startOffsetY+(p.y-state.crop.startY)/d.scale;

    cropImageOffsetClamp();
    cropRender();
}

function cropStartResize(e,h){
    if(!state.crop.item)return;

    e.preventDefault();
    e.stopPropagation();

    const p=cropPos(e);

    state.crop.startX=p.x;
    state.crop.startY=p.y;
    state.crop.startRect={...state.crop.sourceRect};
    state.crop.resizing=true;
    state.crop.resizeHandle=h;

    try{cropStage.setPointerCapture(e.pointerId)}catch{}
}

function cropMoveResize(e){
    if(!state.crop.resizing)return;

    e.preventDefault();

    const p=cropPos(e);
    const d=state.crop.display;
    const s=state.crop.startRect;
    const dx=(p.x-state.crop.startX)/d.scale;
    const dy=(p.y-state.crop.startY)/d.scale;
    const h=state.crop.resizeHandle;

    let x=s.x,y=s.y,w=s.width,hgt=s.height;

    if(h.includes("e"))w=s.width+dx;
    if(h.includes("w")){w=s.width-dx;x=s.x+dx}
    if(h.includes("s"))hgt=s.height+dy;
    if(h.includes("n")){hgt=s.height-dy;y=s.y+dy}

    /*
     * Sudut mempertahankan rasio.
     * Sisi juga tetap menjaga rasio cetak agar hasil aman untuk print.
     */
    if(h==="n"||h==="s"){
        w=hgt*state.crop.aspect;
        x=s.x;
        if(h==="n")y=s.y+s.height-hgt;
    }else{
        hgt=w/state.crop.aspect;
        if(h.includes("n"))y=s.y+s.height-hgt;
    }

    if(h==="w"||h==="e"){
        hgt=w/state.crop.aspect;
        if(h.includes("n"))y=s.y+s.height-hgt;
    }

    state.crop.sourceRect=cropClamp({
        x:x,
        y:y,
        width:w,
        height:hgt
    });

    cropImageOffsetClamp();
    cropRender();
}

function cropEnd(e){
    state.crop.dragging=false;
    state.crop.resizing=false;
    state.crop.movingImage=false;
    state.crop.resizeHandle=null;

    try{cropStage.releasePointerCapture(e.pointerId)}catch{}
}

function cropToggleOrientation(){
    if(!state.crop.item)return;

    const oldAspect=state.crop.aspect;
    state.crop.aspect=1/oldAspect;

    const i=state.crop.item.image;
    const old=state.crop.sourceRect;

    const cx=old.x+old.width/2;
    const cy=old.y+old.height/2;

    let w=old.height;
    let h=w/state.crop.aspect;

    if(w>i.naturalWidth){
        w=i.naturalWidth;
        h=w/state.crop.aspect;
    }

    if(h>i.naturalHeight){
        h=i.naturalHeight;
        w=h*state.crop.aspect;
    }

    state.crop.sourceRect=cropClamp({
        x:cx-w/2,
        y:cy-h/2,
        width:w,
        height:h
    });

    cropRatioLabel.textContent=
        "Rasio: "+(state.crop.aspect>=1?"Landscape":"Portrait");

    cropImageOffsetClamp();
    cropRender();
}

function saveCrop(){
    if(!state.crop.item||!cropHasSelection)return;

    state.crop.item.crop={
        x:state.crop.sourceRect.x,
        y:state.crop.sourceRect.y,
        width:state.crop.sourceRect.width,
        height:state.crop.sourceRect.height
    };

    closeCrop();
    renderPairs();

    if(state.generated)renderCollage();
}

/*
 * FOTO = bisa digeser.
 * GARIS CROP = tetap sebagai area pemotongan.
 */
if(cropCanvas){
    cropCanvas.addEventListener("pointerdown",e=>{
        cropStartImageMove(e);
    });
}

if(cropSelection){
    cropSelection.addEventListener("pointerdown",e=>{
        if(e.target.classList.contains("crop-handle"))return;
        cropStartImageMove(e);
    });
}

if(cropSelection){
    cropSelection.querySelectorAll(".crop-handle").forEach(handle=>{
        handle.addEventListener("pointerdown",e=>{
            const cls=[...handle.classList]
                .find(x=>x.startsWith("crop-handle-"));

            if(!cls)return;

            const h=cls.replace("crop-handle-","");
            cropStartResize(e,h);
        });
    });
}

if(cropStage){
    cropStage.addEventListener("pointermove",e=>{
        if(state.crop.resizing){
            cropMoveResize(e);
        }else if(state.crop.movingImage){
            cropMoveImage(e);
        }
    });

    cropStage.addEventListener("pointerup",cropEnd);
    cropStage.addEventListener("pointercancel",cropEnd);
}

if(cropZoom){
    cropZoom.addEventListener("input",()=>{
        state.crop.zoom=n(cropZoom.value,1);
        cropImageOffsetClamp();
        cropRender();
    });
}

if(cropResetBtn){
    cropResetBtn.addEventListener("click",()=>{
        if(!state.crop.item)return;

        state.crop.zoom=1;
        cropZoom.value="1";
        state.crop.aspect=
            state.crop.item.width/state.crop.item.height;

        cropCreateSelection();
    });
}

if(cropOrientationBtn){
    cropOrientationBtn.addEventListener("click",cropToggleOrientation);
}

if(cropCloseBtn)cropCloseBtn.addEventListener("click",closeCrop);
if(cropCancelBtn)cropCancelBtn.addEventListener("click",closeCrop);
if(cropSaveBtn)cropSaveBtn.addEventListener("click",saveCrop);

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

        const g=state.groups.get(b.dataset.cropId);
        const item=g?.files.get(b.dataset.cropSize);

        if(item)openCrop(item);
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

