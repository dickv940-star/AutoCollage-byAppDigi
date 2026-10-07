/* =========================================================
   AUTO COLLAGE - APPDIGI
   V2 - PRINT SAFE LAYOUT ENGINE
   ========================================================= */

const MAX_IDS = 10;
const MAX_FILES = 20;

const state = {
    files: [],
    groups: new Map(),
    sizes: new Map(),
    placements: [],
    canvas: null,
    zoom: 1,
    generated: false
};


/* =========================================================
   DOM
========================================================= */

const $ = (selector) => document.querySelector(selector);

const fileInput = $("#fileInput");
const fileList = $("#fileList");
const sizeList = $("#sizeList");

const canvasWidth = $("#canvasWidth");
const canvasHeight = $("#canvasHeight");
const dpiInput = $("#dpi");

const marginInput = $("#margin");
const gapInput = $("#gap");

const autoSpacing = $("#autoSpacing");
const keepAspect = $("#keepAspect");

const generateBtn = $("#generateBtn");
const shuffleBtn = $("#shuffleBtn");
const resetBtn = $("#resetBtn");

const previewCanvas = $("#previewCanvas");

const zoomRange = $("#zoomRange");
const zoomValue = $("#zoomValue");

const exportBtn = $("#exportBtn");

const pixelOutput = $("#pixelOutput");
const ratioOutput = $("#ratioOutput");

const statusText = $("#statusText");
const photoCount = $("#photoCount");
const canvasInfo = $("#canvasInfo");
const resolutionInfo = $("#resolutionInfo");


/* =========================================================
   BASIC HELPERS
========================================================= */

function cmToPx(cm, dpi) {
    return (Number(cm) * Number(dpi)) / 2.54;
}

function pxToCm(px, dpi) {
    return (Number(px) * 2.54) / Number(dpi);
}

function cleanNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   FILENAME PARSER
=========================================================

   Contoh:

   DSCF1123 2x3.jpg
   DSCF1123 3x4.jpg
   001 2x3.jpg
   Andi 2x3.jpg

   Hasil:

   ID       : DSCF1123
   SIZE     : 2x3
========================================================= */

function parseFilename(filename) {

    const name = filename
        .replace(/\.[^/.]+$/, "")
        .trim();

    const match = name.match(
        /(?:^|\s)(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*$/
    );

    if (!match) {
        return {
            valid: false,
            id: name,
            width: null,
            height: null,
            sizeKey: null
        };
    }

    const width = Number(match[1].replace(",", "."));
    const height = Number(match[2].replace(",", "."));

    const id = name
        .slice(0, match.index + match[0].length)
        .replace(match[0], "")
        .trim();

    return {
        valid: true,
        id,
        width,
        height,
        sizeKey: `${width}x${height}`
    };
}


/* =========================================================
   FILE LOADING
========================================================= */

function loadImage(file) {

    return new Promise((resolve, reject) => {

        const img = new Image();

        const url = URL.createObjectURL(file);

        img.onload = () => {

            URL.revokeObjectURL(url);

            resolve({
                img,
                width: img.naturalWidth,
                height: img.naturalHeight
            });

        };

        img.onerror = () => {

            URL.revokeObjectURL(url);

            reject(new Error(`Gagal membaca ${file.name}`));

        };

        img.src = url;

    });

}


/* =========================================================
   PROCESS UPLOAD
========================================================= */

async function processFiles(fileArray) {

    const files = Array.from(fileArray);

    if (files.length > MAX_FILES) {

        alert(
            `Maksimal ${MAX_FILES} file.\n` +
            `Artinya maksimal 10 pasangan foto.`
        );

    }

    const limitedFiles = files.slice(0, MAX_FILES);

    state.files = [];
    state.groups.clear();
    state.sizes.clear();
    state.placements = [];
    state.generated = false;

    for (const file of limitedFiles) {

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

            const loaded = await loadImage(file);

            item.image = loaded.img;
            item.naturalWidth = loaded.width;
            item.naturalHeight = loaded.height;

        } catch (error) {

            item.error = true;

        }

        state.files.push(item);

    }

    buildGroups();

    renderFileList();

    renderSizeControls();

    updateCanvasInfo();

}


/* =========================================================
   GROUP BY ID
========================================================= */

function buildGroups() {

    state.groups.clear();

    for (const item of state.files) {

        if (!item.valid) {
            continue;
        }

        if (!state.groups.has(item.id)) {

            state.groups.set(item.id, {
                id: item.id,
                files: new Map()
            });

        }

        const group = state.groups.get(item.id);

        /*
         * Jangan overwrite file dengan size sama.
         * File pertama tetap digunakan.
         */

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
   FILE LIST UI
========================================================= */

function renderFileList() {

    if (!fileList) return;

    if (!state.files.length) {

        fileList.innerHTML = `
            <div class="empty-state">
                Belum ada foto.
            </div>
        `;

        return;
    }

    let html = "";

    for (const group of state.groups.values()) {

        const sizes = Array.from(group.files.keys());

        const available = sizes.length;

        const expected = state.sizes.size;

        let status = "";

        if (available === expected) {

            status = `
                <span class="pair-ok">
                    ✓ Pasangan lengkap
                </span>
            `;

        } else {

            status = `
                <span class="pair-warning">
                    ⚠ Pasangan belum lengkap
                </span>
            `;

        }

        html += `
            <div class="file-group">

                <div class="file-group-header">

                    <strong>
                        ${escapeHtml(group.id)}
                    </strong>

                    ${status}

                </div>

                <div class="file-group-files">
        `;

        for (const size of state.sizes.keys()) {

            const item = group.files.get(size);

            if (item) {

                html += `
                    <div class="file-row file-present">
                        <span>✓</span>
                        <span>${escapeHtml(item.name)}</span>
                    </div>
                `;

            } else {

                html += `
                    <div class="file-row file-missing">
                        <span>⚠</span>
                        <span>
                            ${escapeHtml(group.id)} ${escapeHtml(size)}.jpg
                            — belum ada
                        </span>
                    </div>
                `;

            }

        }

        html += `
                </div>

            </div>
        `;

    }

    /*
     * File dengan nama tidak valid
     */

    const invalidFiles = state.files.filter(
        item => !item.valid
    );

    if (invalidFiles.length) {

        html += `
            <div class="invalid-files">

                <strong>
                    ⚠ File belum dikenali
                </strong>

        `;

        for (const item of invalidFiles) {

            html += `
                <div>
                    ${escapeHtml(item.name)}
                    <small>
                        Gunakan format:
                        Nama 2x3.jpg
                    </small>
                </div>
            `;

        }

        html += `
            </div>
        `;

    }

    fileList.innerHTML = html;

}


/* =========================================================
   SIZE CONTROLS
========================================================= */

function renderSizeControls() {

    if (!sizeList) return;

    sizeList.innerHTML = "";

    for (const size of state.sizes.values()) {

        /*
         * Default quantity = jumlah source yang tersedia.
         */

        let availableCount = 0;

        for (const group of state.groups.values()) {

            if (group.files.has(size.key)) {
                availableCount++;
            }

        }

        const row = document.createElement("div");

        row.className = "size-row";

        row.innerHTML = `
            <div class="size-name">
                ${escapeHtml(size.key)}
            </div>

            <div class="size-description">
                ${size.width} × ${size.height} cm
            </div>

            <input
                type="number"
                min="0"
                step="1"
                value="${availableCount}"
                data-size="${escapeHtml(size.key)}"
                class="size-quantity"
            >
        `;

        sizeList.appendChild(row);

    }

}


/* =========================================================
   READ QUANTITIES
========================================================= */

function getQuantities() {

    const result = new Map();

    document
        .querySelectorAll(".size-quantity")
        .forEach(input => {

            const size = input.dataset.size;

            const quantity = Math.max(
                0,
                Math.floor(
                    cleanNumber(input.value, 0)
                )
            );

            result.set(size, quantity);

        });

    return result;

}


/* =========================================================
   CREATE PRINT QUEUE
=========================================================

   IMPORTANT:

   Jika quantity lebih banyak daripada jumlah source,
   source boleh diulang.

   Tetapi:

   SOURCE SELALU berasal dari ID yang benar.

   Tidak pernah mengambil foto ID lain.
========================================================= */

function createPrintQueue() {

    const quantities = getQuantities();

    const queue = [];

    for (const [sizeKey, quantity] of quantities.entries()) {

        if (quantity <= 0) {
            continue;
        }

        const available = [];

        for (const group of state.groups.values()) {

            const source = group.files.get(sizeKey);

            if (source) {

                available.push({
                    group,
                    source
                });

            }

        }

        if (!available.length) {

            throw new Error(
                `Tidak ada foto ${sizeKey} yang valid.`
            );

        }

        for (let i = 0; i < quantity; i++) {

            const selected =
                available[i % available.length];

            queue.push({
                id: selected.group.id,
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
   EXACT PHOTO DIMENSIONS
========================================================= */

function getPhotoDimensions(item, dpi) {

    return {
        widthPx: cmToPx(item.widthCm, dpi),
        heightPx: cmToPx(item.heightCm, dpi)
    };

}


/* =========================================================
   PACKING ENGINE
=========================================================

   Tujuan:

   - tidak overlap
   - tidak keluar canvas
   - ukuran fisik tidak berubah
   - margin tetap
   - gap tetap

   Algorithm:

   Simple row/strip packing.

   Foto diurutkan dari yang paling tinggi.

   Setiap foto dimasukkan ke row selama masih muat.

   Kalau tidak muat → row baru.

========================================================= */

function packPhotos(queue, canvasW, canvasH, margin, gap) {

    const sorted = [...queue].sort((a, b) => {

        const ah = a.heightCm;
        const bh = b.heightCm;

        if (bh !== ah) {
            return bh - ah;
        }

        return b.widthCm - a.widthCm;

    });

    const rows = [];

    let currentRow = null;

    for (const item of sorted) {

        if (!currentRow) {

            currentRow = {
                items: [],
                width: 0,
                height: item.heightCm
            };

        }

        const proposedWidth =
            currentRow.width +
            (currentRow.items.length ? gap : 0) +
            item.widthCm;

        const availableWidth =
            canvasW - (margin * 2);

        if (
            proposedWidth <= availableWidth + 0.0001
        ) {

            currentRow.items.push(item);

            currentRow.width = proposedWidth;

            currentRow.height = Math.max(
                currentRow.height,
                item.heightCm
            );

        } else {

            rows.push(currentRow);

            currentRow = {
                items: [item],
                width: item.widthCm,
                height: item.heightCm
            };

        }

    }

    if (currentRow && currentRow.items.length) {
        rows.push(currentRow);
    }


    /*
     * Hitung tinggi total.
     */

    let totalHeight = 0;

    rows.forEach((row, index) => {

        totalHeight += row.height;

        if (index > 0) {
            totalHeight += gap;
        }

    });


    const availableHeight =
        canvasH - (margin * 2);

    if (totalHeight > availableHeight + 0.0001) {

        return {
            success: false,
            reason:
                `Canvas tidak cukup tinggi. ` +
                `Diperlukan sekitar ${totalHeight.toFixed(2)} cm, ` +
                `tersedia ${availableHeight.toFixed(2)} cm.`
        };

    }


    /*
     * Buat placement.
     */

    const placements = [];

    let y = margin;

    for (const row of rows) {

        let x = margin;

        for (const item of row.items) {

            placements.push({

                ...item,

                x,
                y,

                width: item.widthCm,
                height: item.heightCm

            });

            x += item.widthCm + gap;

        }

        y += row.height + gap;

    }


    /*
     * Auto spacing:
     *
     * Extra horizontal / vertical space dibagi
     * tanpa mengubah ukuran foto.
     */

    return {
        success: true,
        rows,
        placements,
        totalHeight
    };

}


/* =========================================================
   CENTER ROWS / AUTO SPACING
========================================================= */

function applyAutoSpacing(result, canvasW, canvasH, margin, gap) {

    if (!result.success) {
        return result;
    }

    const placements = result.placements;

    /*
     * Group berdasarkan Y.
     */

    const rows = [];

    for (const item of placements) {

        let row = rows.find(
            r => Math.abs(r.y - item.y) < 0.001
        );

        if (!row) {

            row = {
                y: item.y,
                items: []
            };

            rows.push(row);

        }

        row.items.push(item);

    }


    /*
     * Center setiap row secara horizontal.
     */

    for (const row of rows) {

        const minX =
            Math.min(...row.items.map(item => item.x));

        const maxX =
            Math.max(
                ...row.items.map(
                    item => item.x + item.width
                )
            );

        const rowWidth = maxX - minX;

        const availableWidth =
            canvasW - margin * 2;

        const extra =
            availableWidth - rowWidth;

        if (extra > 0) {

            const offset = extra / 2;

            row.items.forEach(item => {
                item.x += offset;
            });

        }

    }

    return result;

}


/* =========================================================
   VALIDATE PLACEMENTS
========================================================= */

function validatePlacements(
    placements,
    canvasW,
    canvasH
) {

    const EPS = 0.0001;

    /*
     * Check boundaries.
     */

    for (const item of placements) {

        if (item.x < -EPS) {
            return {
                valid: false,
                message: `Foto ${item.id} keluar dari sisi kiri.`
            };
        }

        if (item.y < -EPS) {
            return {
                valid: false,
                message: `Foto ${item.id} keluar dari sisi atas.`
            };
        }

        if (
            item.x + item.width >
            canvasW + EPS
        ) {

            return {
                valid: false,
                message: `Foto ${item.id} keluar dari sisi kanan.`
            };

        }

        if (
            item.y + item.height >
            canvasH + EPS
        ) {

            return {
                valid: false,
                message: `Foto ${item.id} keluar dari sisi bawah.`
            };

        }

    }


    /*
     * Check overlap.
     */

    for (let i = 0; i < placements.length; i++) {

        for (
            let j = i + 1;
            j < placements.length;
            j++
        ) {

            const a = placements[i];
            const b = placements[j];

            const overlapX =
                a.x < b.x + b.width - EPS &&
                a.x + a.width > b.x + EPS;

            const overlapY =
                a.y < b.y + b.height - EPS &&
                a.y + a.height > b.y + EPS;

            if (overlapX && overlapY) {

                return {
                    valid: false,
                    message:
                        `Foto ${a.id} dan ${b.id} saling bertumpuk.`
                };

            }

        }

    }

    return {
        valid: true
    };

}


/* =========================================================
   RENDER PHOTO
=========================================================

   PENTING:

   Tidak menggunakan:

   ctx.filter
   brightness
   contrast
   saturation
   sharpening
   AI
   color adjustment

   Foto hanya diposisikan.

========================================================= */

function drawPhoto(
    ctx,
    item,
    x,
    y,
    width,
    height
) {

    const img = item.source.image;

    if (!img) {
        return;
    }

    /*
     * Jangan menggunakan filter apa pun.
     */

    ctx.filter = "none";

    /*
     * Kita menggunakan contain.
     *
     * Artinya seluruh source image tetap terlihat.
     * Tidak ada crop otomatis.
     */

    const sourceRatio =
        img.naturalWidth / img.naturalHeight;

    const targetRatio =
        width / height;

    let drawWidth;
    let drawHeight;

    if (sourceRatio > targetRatio) {

        drawWidth = width;
        drawHeight = width / sourceRatio;

    } else {

        drawHeight = height;
        drawWidth = height * sourceRatio;

    }

    const offsetX =
        x + (width - drawWidth) / 2;

    const offsetY =
        y + (height - drawHeight) / 2;

    ctx.drawImage(
        img,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
    );

}


/* =========================================================
   CREATE CANVAS
========================================================= */

function createCanvas() {

    const widthCm =
        cleanNumber(canvasWidth?.value, 30);

    const heightCm =
        cleanNumber(canvasHeight?.value, 40);

    const dpi =
        cleanNumber(dpiInput?.value, 300);

    const widthPx =
        Math.round(cmToPx(widthCm, dpi));

    const heightPx =
        Math.round(cmToPx(heightCm, dpi));

    /*
     * Prevent browser memory disaster.
     */

    const megapixels =
        (widthPx * heightPx) / 1000000;

    if (megapixels > 100) {

        throw new Error(
            `Canvas terlalu besar: ` +
            `${megapixels.toFixed(1)} MP.\n` +
            `Turunkan DPI atau ukuran canvas.`
        );

    }

    const canvas =
        document.createElement("canvas");

    canvas.width = widthPx;
    canvas.height = heightPx;

    return {
        canvas,
        widthCm,
        heightCm,
        dpi,
        widthPx,
        heightPx
    };

}


/* =========================================================
   RENDER COLLAGE
========================================================= */

function renderCollage() {

    if (!state.canvas) {
        return;
    }

    const {
        canvas,
        widthCm,
        heightCm,
        dpi
    } = state.canvas;

    const ctx =
        canvas.getContext("2d", {
            alpha: false
        });

    /*
     * Putih bersih sebagai media dasar.
     */

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    /*
     * Render setiap foto.
     */

    for (const item of state.placements) {

        const x =
            cmToPx(item.x, dpi);

        const y =
            cmToPx(item.y, dpi);

        const width =
            cmToPx(item.width, dpi);

        const height =
            cmToPx(item.height, dpi);

        drawPhoto(
            ctx,
            item,
            x,
            y,
            width,
            height
        );

    }


    /*
     * Preview.
     */

    renderPreview();

}


/* =========================================================
   PREVIEW
========================================================= */

function renderPreview() {

    if (!previewCanvas || !state.canvas) {
        return;
    }

    const source =
        state.canvas.canvas;

    const ctx =
        previewCanvas.getContext("2d");

    const zoom =
        state.zoom;

    previewCanvas.width =
        Math.round(source.width * zoom);

    previewCanvas.height =
        Math.round(source.height * zoom);

    ctx.clearRect(
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );

    ctx.drawImage(
        source,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );

}


/* =========================================================
   GENERATE
========================================================= */

function generateCollage() {

    try {

        if (!state.files.length) {

            alert(
                "Upload foto terlebih dahulu."
            );

            return;

        }

        /*
         * Minimal 1 ID valid.
         */

        if (!state.groups.size) {

            alert(
                "Tidak ditemukan foto dengan format nama yang benar.\n\n" +
                "Contoh:\n" +
                "DSCF1123 2x3.jpg"
            );

            return;

        }


        /*
         * Check jumlah ID.
         */

        if (state.groups.size > MAX_IDS) {

            alert(
                `Maksimal ${MAX_IDS} ID foto.\n` +
                `Foto kelebihan tidak akan diproses.`
            );

            return;

        }


        /*
         * Check pasangan.
         */

        const incomplete = [];

        for (const group of state.groups.values()) {

            const missing = [];

            for (const size of state.sizes.keys()) {

                if (!group.files.has(size)) {
                    missing.push(size);
                }

            }

            if (missing.length) {

                incomplete.push(
                    `${group.id}: ${missing.join(", ")}`
                );

            }

        }

        /*
         * Tidak menghentikan seluruh proses,
         * tetapi memberi peringatan jelas.
         */

        if (incomplete.length) {

            const proceed = confirm(
                "Ada pasangan foto yang belum lengkap:\n\n" +
                incomplete.join("\n") +
                "\n\n" +
                "Foto yang tidak ada TIDAK akan dipasangkan dengan ID lain.\n\n" +
                "Lanjutkan?"
            );

            if (!proceed) {
                return;
            }

        }


        /*
         * Canvas.
         */

        state.canvas =
            createCanvas();


        /*
         * Queue.
         */

        const queue =
            createPrintQueue();

        if (!queue.length) {

            alert(
                "Jumlah foto yang akan dicetak masih 0."
            );

            return;

        }


        /*
         * Margin dan gap dalam CM.
         */

        const margin =
            Math.max(
                0,
                cleanNumber(
                    marginInput?.value,
                    0.3
                )
            );

        const gap =
            Math.max(
                0,
                cleanNumber(
                    gapInput?.value,
                    0.2
                )
            );


        /*
         * Packing.
         */

        let result =
            packPhotos(
                queue,
                state.canvas.widthCm,
                state.canvas.heightCm,
                margin,
                gap
            );

        if (!result.success) {

            alert(
                "Layout tidak dapat dibuat.\n\n" +
                result.reason +
                "\n\n" +
                "Coba:\n" +
                "• kurangi jumlah foto\n" +
                "• kecilkan margin\n" +
                "• kecilkan gap\n" +
                "• gunakan canvas lebih besar"
            );

            return;

        }


        /*
         * Auto spacing.
         */

        if (autoSpacing?.checked) {

            result =
                applyAutoSpacing(
                    result,
                    state.canvas.widthCm,
                    state.canvas.heightCm,
                    margin,
                    gap
                );

        }


        /*
         * Final validation.
         */

        const validation =
            validatePlacements(
                result.placements,
                state.canvas.widthCm,
                state.canvas.heightCm
            );

        if (!validation.valid) {

            alert(
                "Layout dibatalkan.\n\n" +
                validation.message
            );

            return;

        }


        state.placements =
            result.placements;

        state.generated = true;

        renderCollage();

        updateStatus();

    } catch (error) {

        console.error(error);

        alert(
            "Terjadi kesalahan:\n\n" +
            error.message
        );

    }

}


/* =========================================================
   SHUFFLE
========================================================= */

function shuffleArray(array) {

    const result = [...array];

    for (
        let i = result.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [
            result[i],
            result[j]
        ] =
        [
            result[j],
            result[i]
        ];

    }

    return result;

}


function shuffleLayout() {

    if (!state.generated) {

        generateCollage();

        return;

    }

    state.placements =
        shuffleArray(state.placements);

    /*
     * Re-pack berdasarkan urutan baru.
     */

    const queue =
        state.placements.map(item => ({
            id: item.id,
            sizeKey: item.sizeKey,
            source: item.source,
            widthCm: item.width,
            heightCm: item.height
        }));

    const margin =
        Math.max(
            0,
            cleanNumber(
                marginInput?.value,
                0.3
            )
        );

    const gap =
        Math.max(
            0,
            cleanNumber(
                gapInput?.value,
                0.2
            )
        );

    const result =
        packPhotos(
            queue,
            state.canvas.widthCm,
            state.canvas.heightCm,
            margin,
            gap
        );

    if (!result.success) {

        alert(
            "Susun ulang gagal karena canvas tidak cukup."
        );

        return;

    }

    state.placements =
        result.placements;

    if (autoSpacing?.checked) {

        applyAutoSpacing(
            result,
            state.canvas.widthCm,
            state.canvas.heightCm,
            margin,
            gap
        );

    }

    renderCollage();

}


/* =========================================================
   RESET
========================================================= */

function resetApp() {

    state.files = [];
    state.groups.clear();
    state.sizes.clear();
    state.placements = [];
    state.canvas = null;
    state.generated = false;

    if (fileInput) {
        fileInput.value = "";
    }

    if (fileList) {

        fileList.innerHTML = `
            <div class="empty-state">
                Belum ada foto.
            </div>
        `;

    }

    if (sizeList) {
        sizeList.innerHTML = "";
    }

    if (previewCanvas) {

        const ctx =
            previewCanvas.getContext("2d");

        ctx.clearRect(
            0,
            0,
            previewCanvas.width,
            previewCanvas.height
        );

    }

    updateCanvasInfo();
    updateStatus();

}


/* =========================================================
   EXPORT PNG
========================================================= */

function exportPNG() {

    if (!state.canvas || !state.generated) {

        alert(
            "Buat collage terlebih dahulu."
        );

        return;

    }

    const {
        canvas,
        widthCm,
        heightCm,
        dpi
    } = state.canvas;

    const filename =
        `auto-collage-${widthCm}x${heightCm}cm-${dpi}dpi.png`;

    canvas.toBlob(
        blob => {

            if (!blob) {

                alert(
                    "Gagal membuat file PNG."
                );

                return;

            }

            const url =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = url;
            link.download = filename;

            document.body.appendChild(link);

            link.click();

            link.remove();

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);

        },
        "image/png"
    );

}


/* =========================================================
   CANVAS INFO
========================================================= */

function updateCanvasInfo() {

    const width =
        cleanNumber(
            canvasWidth?.value,
            30
        );

    const height =
        cleanNumber(
            canvasHeight?.value,
            40
        );

    const dpi =
        cleanNumber(
            dpiInput?.value,
            300
        );

    const widthPx =
        Math.round(
            cmToPx(width, dpi)
        );

    const heightPx =
        Math.round(
            cmToPx(height, dpi)
        );

    const ratio =
        height !== 0
            ? width / height
            : 0;

    if (pixelOutput) {

        pixelOutput.textContent =
            `${widthPx} × ${heightPx} px`;

    }

    if (ratioOutput) {

        ratioOutput.textContent =
            ratio.toFixed(3);

    }

    if (canvasInfo) {

        canvasInfo.textContent =
            `Canvas ${width}×${height} cm`;

    }

    if (resolutionInfo) {

        resolutionInfo.textContent =
            `Resolusi ${dpi} DPI`;

    }

}


/* =========================================================
   STATUS
========================================================= */

function updateStatus() {

    const totalFiles =
        state.files.length;

    const totalIds =
        state.groups.size;

    if (photoCount) {

        photoCount.textContent =
            `Foto ${totalFiles}`;

    }

    if (!statusText) {
        return;
    }

    if (state.generated) {

        statusText.textContent =
            `Berhasil — ${state.placements.length} foto ditempatkan`;

    } else {

        statusText.textContent =
            `Siap — ${totalIds} ID / ${totalFiles} file`;

    }

}


/* =========================================================
   ZOOM
========================================================= */

function updateZoom() {

    if (!zoomRange) {
        return;
    }

    state.zoom =
        cleanNumber(
            zoomRange.value,
            1
        );

    if (zoomValue) {

        zoomValue.textContent =
            `${Math.round(state.zoom * 100)}%`;

    }

    if (state.canvas) {
        renderPreview();
    }

}


/* =========================================================
   EVENTS
========================================================= */

if (fileInput) {

    fileInput.addEventListener(
        "change",
        event => {

            processFiles(
                event.target.files
            );

        }
    );

}


if (generateBtn) {

    generateBtn.addEventListener(
        "click",
        generateCollage
    );

}


if (shuffleBtn) {

    shuffleBtn.addEventListener(
        "click",
        shuffleLayout
    );

}


if (resetBtn) {

    resetBtn.addEventListener(
        "click",
        resetApp
    );

}


if (exportBtn) {

    exportBtn.addEventListener(
        "click",
        exportPNG
    );

}


if (zoomRange) {

    zoomRange.addEventListener(
        "input",
        updateZoom
    );

}


[
    canvasWidth,
    canvasHeight,
    dpiInput
].forEach(input => {

    if (!input) return;

    input.addEventListener(
        "input",
        updateCanvasInfo
    );

});


/* =========================================================
   INITIALIZE
========================================================= */

updateCanvasInfo();
updateStatus();
updateZoom();
