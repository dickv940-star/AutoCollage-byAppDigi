/* =========================================================
   AUTO COLLAGE V1
   ---------------------------------------------------------
   Prinsip:
   1. File sumber tidak pernah diubah.
   2. Foto dijodohkan berdasarkan ID/nama.
   3. Ukuran foto dibaca dari nama file.
   4. Layout hanya menentukan posisi foto.
========================================================= */


"use strict";


/* =========================================================
   GLOBAL STATE
========================================================= */

const state = {

    files: [],

    photos: [],

    pairs: {},

    sizes: {},

    placements: [],

    zoom: 0.5,

    canvasWidthCm: 30,

    canvasHeightCm: 40,

    dpi: 300,

    marginCm: 0.5,

    gapCm: 0.3,

    autoSpacing: true,

    keepAspect: true

};


/* =========================================================
   DOM
========================================================= */

const canvas =
    document.getElementById("collageCanvas");

const ctx =
    canvas.getContext("2d");


const canvasWrapper =
    document.getElementById("canvasWrapper");

const photoInput =
    document.getElementById("photoInput");

const pairList =
    document.getElementById("pairList");

const sizeControls =
    document.getElementById("sizeControls");

const fileWarning =
    document.getElementById("fileWarning");

const photoCounter =
    document.getElementById("photoCounter");

const systemStatus =
    document.getElementById("systemStatus");

const pixelInfo =
    document.getElementById("pixelInfo");

const canvasRatio =
    document.getElementById("canvasRatio");

const previewInfo =
    document.getElementById("previewInfo");

const canvasSizeInfo =
    document.getElementById("canvasSizeInfo");

const resolutionInfo =
    document.getElementById("resolutionInfo");

const placedCount =
    document.getElementById("placedCount");

const layoutStatus =
    document.getElementById("layoutStatus");

const zoomValue =
    document.getElementById("zoomValue");


/* =========================================================
   UTILITY
========================================================= */

function cmToPx(cm) {

    return Math.round(
        cm * state.dpi / 2.54
    );

}


function normalizeName(name) {

    return name
        .replace(/\.[^/.]+$/, "")
        .trim();

}


function normalizeId(name) {

    let value =
        normalizeName(name);

    /*
     * Hapus ukuran dari nama.
     *
     * Contoh:
     *
     * DSCF1123 2x3
     * ->
     * DSCF1123
     */

    value =
        value.replace(
            /\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*$/i,
            ""
        );

    value =
        value.replace(
            /[_-]\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*$/i,
            ""
        );

    return value.trim();

}


function detectSize(name) {

    const match =
        normalizeName(name).match(
            /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i
        );

    if (!match) {

        return null;

    }

    const width =
        parseFloat(
            match[1].replace(",", ".")
        );

    const height =
        parseFloat(
            match[2].replace(",", ".")
        );

    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height)
    ) {

        return null;

    }

    return {

        width,

        height,

        label:
            `${formatNumber(width)}×${formatNumber(height)}`

    };

}


function formatNumber(value) {

    return Number.isInteger(value)
        ? String(value)
        : String(value).replace(".", ",");

}


function gcd(a, b) {

    a = Math.abs(a);

    b = Math.abs(b);

    while (b) {

        const temp = b;

        b = a % b;

        a = temp;

    }

    return a || 1;

}


function ratioText(width, height) {

    const divisor =
        gcd(
            Math.round(width),
            Math.round(height)
        );

    return (
        Math.round(width / divisor) +
        ":" +
        Math.round(height / divisor)
    );

}


/* =========================================================
   IMAGE LOADING
========================================================= */

function loadImage(file) {

    return new Promise(
        (resolve, reject) => {

            const url =
                URL.createObjectURL(file);

            const img =
                new Image();

            img.onload = () => {

                /*
                 * Jangan ubah file.
                 *
                 * Object URL hanya digunakan
                 * untuk membaca gambar.
                 */

                resolve({

                    img,

                    url

                });

            };

            img.onerror = reject;

            img.src = url;

        }
    );

}


/* =========================================================
   INPUT CANVAS
========================================================= */

document
    .getElementById("canvasWidth")
    .addEventListener(
        "input",
        updateCanvasSettings
    );


document
    .getElementById("canvasHeight")
    .addEventListener(
        "input",
        updateCanvasSettings
    );


document
    .getElementById("dpi")
    .addEventListener(
        "input",
        updateCanvasSettings
    );


document
    .getElementById("margin")
    .addEventListener(
        "input",
        () => {

            state.marginCm =
                getNumber(
                    "margin",
                    0.5
                );

        }
    );


document
    .getElementById("gap")
    .addEventListener(
        "input",
        () => {

            state.gapCm =
                getNumber(
                    "gap",
                    0.3
                );

        }
    );


document
    .getElementById("autoSpacing")
    .addEventListener(
        "change",
        event => {

            state.autoSpacing =
                event.target.checked;

        }
    );


document
    .getElementById("keepAspect")
    .addEventListener(
        "change",
        event => {

            state.keepAspect =
                event.target.checked;

        }
    );


function getNumber(id, fallback) {

    const element =
        document.getElementById(id);

    const value =
        parseFloat(element.value);

    return Number.isFinite(value)
        ? value
        : fallback;

}


function updateCanvasSettings() {

    state.canvasWidthCm =
        getNumber(
            "canvasWidth",
            30
        );

    state.canvasHeightCm =
        getNumber(
            "canvasHeight",
            40
        );

    state.dpi =
        getNumber(
            "dpi",
            300
        );

    updateCanvasInfo();

    renderCanvas();

}


/* =========================================================
   CANVAS INFORMATION
========================================================= */

function updateCanvasInfo() {

    const widthPx =
        cmToPx(
            state.canvasWidthCm
        );

    const heightPx =
        cmToPx(
            state.canvasHeightCm
        );

    pixelInfo.textContent =
        `${widthPx} × ${heightPx} px`;

    canvasRatio.textContent =
        ratioText(
            state.canvasWidthCm,
            state.canvasHeightCm
        );

    previewInfo.textContent =
        `${formatNumber(state.canvasWidthCm)} × ${formatNumber(state.canvasHeightCm)} cm`;

    canvasSizeInfo.textContent =
        `${formatNumber(state.canvasWidthCm)} × ${formatNumber(state.canvasHeightCm)} cm`;

    resolutionInfo.textContent =
        `${state.dpi} DPI`;

    /*
     * Untuk preview browser,
     * kita tidak perlu menampilkan
     * canvas pada ukuran asli 300 DPI.
     *
     * Preview menggunakan ukuran yang lebih kecil.
     */

    const maxPreview =
        1000;

    const scale =
        Math.min(
            maxPreview / widthPx,
            maxPreview / heightPx,
            1
        );

    canvasWrapper.style.width =
        `${widthPx * scale * state.zoom / state.zoom}px`;

    canvasWrapper.style.height =
        `${heightPx * scale * state.zoom / state.zoom}px`;

}


/* =========================================================
   UPLOAD
========================================================= */

photoInput.addEventListener(
    "change",
    async event => {

        const incoming =
            Array.from(
                event.target.files
            );

        await addFiles(incoming);

        photoInput.value = "";

    }
);


async function addFiles(files) {

    if (!files.length) {

        return;

    }


    const existingNames =
        new Set(
            state.files.map(
                file =>
                    file.name.toLowerCase()
            )
        );


    const newFiles =
        files.filter(
            file =>
                !existingNames.has(
                    file.name.toLowerCase()
                )
        );


    if (
        state.files.length +
        newFiles.length >
        20
    ) {

        showWarning(
            "Maksimal 20 file foto.",
            true
        );

        return;

    }


    const combined =
        [
            ...state.files,
            ...newFiles
        ];


    state.files =
        combined;


    await processFiles();

}


/* =========================================================
   PROCESS FILES
========================================================= */

async function processFiles() {

    state.photos = [];

    state.pairs = {};

    const uniqueIds =
        new Set();


    for (
        const file of state.files
    ) {

        const size =
            detectSize(
                file.name
            );

        const id =
            normalizeId(
                file.name
            );


        if (!id) {

            continue;

        }


        uniqueIds.add(
            id.toLowerCase()
        );


        if (
            uniqueIds.size >
            10
        ) {

            showWarning(
                "Maksimal 10 foto/ID berbeda.",
                true
            );

            /*
             * Hentikan pemrosesan
             * file ke-11 dan seterusnya.
             */

            break;

        }


        const photo = {

            file,

            id,

            size,

            image: null,

            url: null,

            originalWidth: 0,

            originalHeight: 0

        };


        try {

            const loaded =
                await loadImage(file);

            photo.image =
                loaded.img;

            photo.url =
                loaded.url;

            photo.originalWidth =
                loaded.img.naturalWidth;

            photo.originalHeight =
                loaded.img.naturalHeight;

        }
        catch (error) {

            console.error(
                "Gagal membaca:",
                file.name,
                error
            );

        }


        state.photos.push(
            photo
        );


        const key =
            id.toLowerCase();


        if (!state.pairs[key]) {

            state.pairs[key] = {

                id,

                files: {},

                photos: {}

            };

        }


        if (size) {

            const sizeKey =
                size.label
                    .replace("×", "x");


            state.pairs[key]
                .files[sizeKey] =
                file;

            state.pairs[key]
                .photos[sizeKey] =
                photo;

        }

    }


    buildSizeControls();

    renderPairs();

    updateCounter();

    showWarning("");

    renderCanvas();

}


/* =========================================================
   PAIR RENDER
========================================================= */

function renderPairs() {

    pairList.innerHTML = "";

    const pairKeys =
        Object.keys(
            state.pairs
        );


    if (!pairKeys.length) {

        pairList.innerHTML = `
            <div class="empty-state">
                Belum ada foto
            </div>
        `;

        return;

    }


    pairKeys.forEach(
        key => {

            const pair =
                state.pairs[key];


            const sizes =
                Object.keys(
                    pair.files
                );


            const has2x3 =
                Boolean(
                    pair.files["2x3"]
                );

            const has3x4 =
                Boolean(
                    pair.files["3x4"]
                );


            const complete =
                has2x3 &&
                has3x4;


            const element =
                document.createElement(
                    "div"
                );

            element.className =
                "pair-item";


            element.innerHTML = `

                <div class="pair-head">

                    <span class="pair-id">
                        ${escapeHtml(pair.id)}
                    </span>

                    <span class="pair-status ${
                        complete
                            ? "complete"
                            : "incomplete"
                    }">

                        ${
                            complete
                                ? "Lengkap"
                                : "Tidak lengkap"
                        }

                    </span>

                </div>


                <div class="pair-files">

                    <div class="pair-file ${
                        has2x3
                            ? "available"
                            : "missing"
                    }">

                        2×3 :
                        ${
                            has2x3
                                ? "✓"
                                : "—"
                        }

                    </div>


                    <div class="pair-file ${
                        has3x4
                            ? "available"
                            : "missing"
                    }">

                        3×4 :
                        ${
                            has3x4
                                ? "✓"
                                : "—"
                        }

                    </div>

                </div>

            `;


            pairList.appendChild(
                element
            );

        }
    );

}


/* =========================================================
   SIZE CONTROLS
========================================================= */

function buildSizeControls() {

    sizeControls.innerHTML = "";

    const sizeMap = {};


    state.photos.forEach(
        photo => {

            if (!photo.size) {

                return;

            }


            const key =
                photo.size.label
                    .replace("×", "x");


            if (!sizeMap[key]) {

                sizeMap[key] = {

                    width:
                        photo.size.width,

                    height:
                        photo.size.height,

                    count: 0

                };

            }


            sizeMap[key].count++;

        }
    );


    const sizes =
        Object.keys(
            sizeMap
        );


    if (!sizes.length) {

        sizeControls.innerHTML = `
            <div class="empty-state small">
                Ukuran tidak ditemukan
                dari nama file.
            </div>
        `;

        return;

    }


    sizes.sort(
        (a, b) => {

            const aw =
                sizeMap[a].width *
                sizeMap[a].height;

            const bw =
                sizeMap[b].width *
                sizeMap[b].height;

            return aw - bw;

        }
    );


    sizes.forEach(
        key => {

            if (
                state.sizes[key] === undefined
            ) {

                state.sizes[key] =
                    sizeMap[key].count;

            }


            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "size-row";


            row.innerHTML = `

                <div>

                    <div class="size-name">
                        ${key.replace("x", "×")} cm
                    </div>

                    <div class="size-source">
                        ${
                            sizeMap[key].count
                        } file tersedia
                    </div>

                </div>


                <input
                    type="number"
                    min="0"
                    max="1000"
                    value="${
                        state.sizes[key]
                    }"
                    data-size="${key}"
                >

            `;


            const input =
                row.querySelector(
                    "input"
                );


            input.addEventListener(
                "input",
                event => {

                    state.sizes[key] =
                        Math.max(
                            0,
                            parseInt(
                                event.target.value ||
                                "0",
                                10
                            )
                        );

                }
            );


            sizeControls.appendChild(
                row
            );

        }
    );

}


/* =========================================================
   COUNTER
========================================================= */

function updateCounter() {

    const unique =
        new Set(
            state.photos.map(
                photo =>
                    photo.id.toLowerCase()
            )
        );


    photoCounter.textContent =
        `${state.files.length} / 20`;


    if (unique.size > 10) {

        showWarning(
            "Lebih dari 10 ID foto ditemukan.",
            true
        );

    }

}


/* =========================================================
   WARNING
========================================================= */

function showWarning(
    message,
    error = false
) {

    if (!message) {

        fileWarning.classList.add(
            "hidden"
        );

        fileWarning.textContent = "";

        return;

    }


    fileWarning.classList.remove(
        "hidden"
    );


    fileWarning.classList.toggle(
        "error",
        error
    );


    fileWarning.textContent =
        message;

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   PHOTO SELECTION
========================================================= */

function getPhotosForSize(
    sizeKey
) {

    return state.photos.filter(
        photo => {

            if (!photo.size) {

                return false;

            }


            const key =
                photo.size.label
                    .replace("×", "x");


            return key === sizeKey;

        }
    );

}


/* =========================================================
   CREATE PHOTO QUEUE
========================================================= */

function createPhotoQueue() {

    const queue = [];

    const sizes =
        Object.keys(
            state.sizes
        );


    sizes.forEach(
        sizeKey => {

            const requested =
                Number(
                    state.sizes[sizeKey]
                ) || 0;


            if (requested <= 0) {

                return;

            }


            const available =
                getPhotosForSize(
                    sizeKey
                );


            if (!available.length) {

                return;

            }


            /*
             * Kalau jumlah yang diminta
             * lebih banyak dari foto sumber,
             * kita mengulang foto berdasarkan
             * ID yang tersedia.
             *
             * Ini berguna untuk kebutuhan
             * cetak foto identitas.
             */

            for (
                let i = 0;
                i < requested;
                i++
            ) {

                const photo =
                    available[
                        i % available.length
                    ];


                queue.push({

                    photo,

                    widthCm:
                        photo.size.width,

                    heightCm:
                        photo.size.height,

                    sizeKey

                });

            }

        }
    );


    return queue;

}


/* =========================================================
   LAYOUT ENGINE
========================================================= */

function generateLayout() {

    const queue =
        createPhotoQueue();


    state.placements = [];


    if (!queue.length) {

        placedCount.textContent =
            "0";

        layoutStatus.textContent =
            "Belum ada foto";

        return;

    }


    const margin =
        state.marginCm;


    const gap =
        state.gapCm;


    const availableWidth =
        state.canvasWidthCm -
        margin * 2;


    const availableHeight =
        state.canvasHeightCm -
        margin * 2;


    /*
     * Kita membuat baris berdasarkan
     * kombinasi ukuran foto.
     *
     * Algoritma sederhana V1:
     *
     * - foto besar didahulukan
     * - foto dengan tinggi sama
     *   diusahakan satu baris
     * - kalau penuh, pindah baris
     */


    queue.sort(
        (a, b) => {

            const areaA =
                a.widthCm *
                a.heightCm;

            const areaB =
                b.widthCm *
                b.heightCm;

            return areaB - areaA;

        }
    );


    let x = margin;

    let y = margin;

    let rowHeight = 0;


    queue.forEach(
        item => {

            let width =
                item.widthCm;

            let height =
                item.heightCm;


            /*
             * Kalau foto tidak muat
             * di baris sekarang,
             * pindahkan ke baris berikutnya.
             */

            if (
                x !== margin &&
                x +
                width >
                state.canvasWidthCm -
                margin
            ) {

                x = margin;

                y +=
                    rowHeight +
                    gap;

                rowHeight = 0;

            }


            /*
             * Kalau tinggi melebihi
             * area canvas, tetap letakkan
             * tetapi beri status overflow.
             */

            const placement = {

                photo:
                    item.photo,

                x,

                y,

                widthCm:
                    width,

                heightCm:
                    height,

                sizeKey:
                    item.sizeKey,

                overflow:
                    false

            };


            if (
                y +
                height >
                state.canvasHeightCm -
                margin
            ) {

                placement.overflow =
                    true;

            }


            state.placements.push(
                placement
            );


            x +=
                width +
                gap;


            rowHeight =
                Math.max(
                    rowHeight,
                    height
                );

        }
    );


    /*
     * AUTO SPACING
     *
     * Jika aktif, kita mencoba
     * mendistribusikan baris secara
     * lebih proporsional.
     */

    if (
        state.autoSpacing
    ) {

        optimizeRows();

    }


    placedCount.textContent =
        String(
            state.placements.length
        );


    layoutStatus.textContent =
        state.placements.some(
            item =>
                item.overflow
        )
            ? "Canvas penuh"
            : "Berhasil";


    renderCanvas();

}


/* =========================================================
   AUTO ROW OPTIMIZER
========================================================= */

function optimizeRows() {

    /*
     * V1 menggunakan pengelompokan
     * berdasarkan tinggi foto.
     *
     * Tujuannya menjaga jarak
     * terlihat lebih natural.
     */

    const rows = [];

    let currentRow = [];

    let currentY = null;


    state.placements.forEach(
        placement => {

            if (
                currentY === null
            ) {

                currentY =
                    placement.y;

            }


            if (
                Math.abs(
                    placement.y -
                    currentY
                ) > 0.01
            ) {

                rows.push(
                    currentRow
                );

                currentRow = [];

                currentY =
                    placement.y;

            }


            currentRow.push(
                placement
            );

        }
    );


    if (currentRow.length) {

        rows.push(
            currentRow
        );

    }


    /*
     * Distribusi horizontal.
     */

    rows.forEach(
        row => {

            if (
                row.length < 2
            ) {

                return;

            }


            const totalWidth =
                row.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        item.widthCm,
                    0
                );


            const available =
                state.canvasWidthCm -
                state.marginCm * 2;


            const freeSpace =
                available -
                totalWidth;


            let spacing =
                state.gapCm;


            if (
                state.autoSpacing &&
                freeSpace > 0
            ) {

                spacing =
                    Math.max(
                        state.gapCm,
                        Math.min(
                            1.5,
                            freeSpace /
                            (
                                row.length +
                                1
                            )
                        )
                    );

            }


            let x =
                state.marginCm;


            row.forEach(
                item => {

                    item.x = x;

                    x +=
                        item.widthCm +
                        spacing;

                }
            );

        }
    );

}


/* =========================================================
   RENDER CANVAS
========================================================= */

function renderCanvas() {

    const widthPx =
        cmToPx(
            state.canvasWidthCm
        );

    const heightPx =
        cmToPx(
            state.canvasHeightCm
        );


    /*
     * Canvas internal resolution.
     *
     * Untuk export kita gunakan
     * resolusi sesuai DPI.
     */

    canvas.width =
        widthPx;

    canvas.height =
        heightPx;


    /*
     * Preview size dibatasi agar
     * browser tidak terlalu berat.
     */

    const maxPreviewWidth =
        900;

    const maxPreviewHeight =
        700;


    const scale =
        Math.min(
            maxPreviewWidth /
            widthPx,

            maxPreviewHeight /
            heightPx,

            1
        );


    canvasWrapper.style.width =
        `${widthPx * scale * state.zoom}px`;

    canvasWrapper.style.height =
        `${heightPx * scale * state.zoom}px`;


    /*
     * Background putih.
     */

    ctx.save();

    ctx.fillStyle =
        "#ffffff";

    ctx.fillRect(
        0,
        0,
        widthPx,
        heightPx
    );


    /*
     * Render foto.
     */

    state.placements.forEach(
        placement => {

            drawPlacement(
                placement
            );

        }
    );


    ctx.restore();

}


/* =========================================================
   DRAW PHOTO
========================================================= */

function drawPlacement(
    placement
) {

    const photo =
        placement.photo;


    if (
        !photo ||
        !photo.image
    ) {

        return;

    }


    const x =
        cmToPx(
            placement.x
        );

    const y =
        cmToPx(
            placement.y
        );

    const width =
        cmToPx(
            placement.widthCm
        );

    const height =
        cmToPx(
            placement.heightCm
        );


    ctx.save();


    /*
     * Tidak ada:
     *
     * filter
     * brightness
     * contrast
     * saturation
     * sharpening
     *
     * Foto ditarik ke ukuran
     * layout yang diminta.
     */


    ctx.filter =
        "none";


    /*
     * Untuk V1 kita menggunakan
     * object-fit: contain style.
     *
     * Ini menjaga seluruh foto
     * tetap terlihat.
     */

    const sourceRatio =
        photo.originalWidth /
        photo.originalHeight;


    const targetRatio =
        width /
        height;


    let drawWidth =
        width;

    let drawHeight =
        height;

    let drawX =
        x;

    let drawY =
        y;


    if (
        state.keepAspect
    ) {

        if (
            sourceRatio >
            targetRatio
        ) {

            drawHeight =
                width /
                sourceRatio;

            drawY =
                y +
                (
                    height -
                    drawHeight
                ) /
                2;

        }
        else {

            drawWidth =
                height *
                sourceRatio;

            drawX =
                x +
                (
                    width -
                    drawWidth
                ) /
                2;

        }

    }


    ctx.drawImage(
        photo.image,
        Math.round(drawX),
        Math.round(drawY),
        Math.round(drawWidth),
        Math.round(drawHeight)
    );


    /*
     * Jika overflow,
     * tampilkan garis peringatan
     * hanya di preview.
     */

    if (
        placement.overflow
    ) {

        ctx.strokeStyle =
            "#dc2626";

        ctx.lineWidth =
            Math.max(
                2,
                cmToPx(0.02)
            );

        ctx.strokeRect(
            x,
            y,
            width,
            height
        );

    }


    ctx.restore();

}


/* =========================================================
   GENERATE BUTTON
========================================================= */

document
    .getElementById("generateBtn")
    .addEventListener(
        "click",
        () => {

            state.marginCm =
                getNumber(
                    "margin",
                    0.5
                );

            state.gapCm =
                getNumber(
                    "gap",
                    0.3
                );

            generateLayout();

        }
    );


/* =========================================================
   SHUFFLE
========================================================= */

document
    .getElementById("shuffleBtn")
    .addEventListener(
        "click",
        () => {

            shuffleArray(
                state.photos
            );

            generateLayout();

        }
    );


function shuffleArray(array) {

    for (
        let i = array.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );

        [
            array[i],
            array[j]
        ] = [
            array[j],
            array[i]
        ];

    }

}


/* =========================================================
   RESET
========================================================= */

document
    .getElementById("resetBtn")
    .addEventListener(
        "click",
        () => {

            state.files = [];

            state.photos = [];

            state.pairs = {};

            state.sizes = {};

            state.placements = [];


            pairList.innerHTML = `
                <div class="empty-state">
                    Belum ada foto
                </div>
            `;


            sizeControls.innerHTML = `
                <div class="empty-state small">
                    Upload foto terlebih dahulu.
                </div>
            `;


            photoCounter.textContent =
                "0 / 20";


            placedCount.textContent =
                "0";


            layoutStatus.textContent =
                "Belum dibuat";


            showWarning("");

            renderCanvas();

        }
    );


/* =========================================================
   ZOOM
========================================================= */

document
    .getElementById("zoomInBtn")
    .addEventListener(
        "click",
        () => {

            state.zoom =
                Math.min(
                    2,
                    state.zoom +
                    0.1
                );

            updateZoom();

        }
    );


document
    .getElementById("zoomOutBtn")
    .addEventListener(
        "click",
        () => {

            state.zoom =
                Math.max(
                    0.2,
                    state.zoom -
                    0.1
                );

            updateZoom();

        }
    );


function updateZoom() {

    zoomValue.textContent =
        `${Math.round(
            state.zoom * 100
        )}%`;

    renderCanvas();

}


/* =========================================================
   EXPORT
========================================================= */

document
    .getElementById("exportBtn")
    .addEventListener(
        "click",
        exportPNG
    );


function exportPNG() {

    if (
        !state.placements.length
    ) {

        alert(
            "Buat layout terlebih dahulu."
        );

        return;

    }


    /*
     * Render ulang dengan resolusi
     * output sebenarnya.
     */

    const exportCanvas =
        document.createElement(
            "canvas"
        );


    exportCanvas.width =
        cmToPx(
            state.canvasWidthCm
        );

    exportCanvas.height =
        cmToPx(
            state.canvasHeightCm
        );


    const exportCtx =
        exportCanvas.getContext(
            "2d"
        );


    exportCtx.fillStyle =
        "#ffffff";


    exportCtx.fillRect(
        0,
        0,
        exportCanvas.width,
        exportCanvas.height
    );


    state.placements.forEach(
        placement => {

            const photo =
                placement.photo;


            if (
                !photo ||
                !photo.image
            ) {

                return;

            }


            const x =
                cmToPx(
                    placement.x
                );

            const y =
                cmToPx(
                    placement.y
                );

            const width =
                cmToPx(
                    placement.widthCm
                );

            const height =
                cmToPx(
                    placement.heightCm
                );


            exportCtx.save();

            exportCtx.filter =
                "none";


            const sourceRatio =
                photo.originalWidth /
                photo.originalHeight;


            const targetRatio =
                width /
                height;


            let drawWidth =
                width;

            let drawHeight =
                height;

            let drawX =
                x;

            let drawY =
                y;


            if (
                state.keepAspect
            ) {

                if (
                    sourceRatio >
                    targetRatio
                ) {

                    drawHeight =
                        width /
                        sourceRatio;

                    drawY =
                        y +
                        (
                            height -
                            drawHeight
                        ) /
                        2;

                }
                else {

                    drawWidth =
                        height *
                        sourceRatio;

                    drawX =
                        x +
                        (
                            width -
                            drawWidth
                        ) /
                        2;

                }

            }


            exportCtx.drawImage(
                photo.image,
                Math.round(drawX),
                Math.round(drawY),
                Math.round(drawWidth),
                Math.round(drawHeight)
            );


            exportCtx.restore();

        }
    );


    exportCanvas.toBlob(
        blob => {

            if (!blob) {

                alert(
                    "Gagal membuat file."
                );

                return;

            }


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            link.download =
                `auto-collage-${
                    state.canvasWidthCm
                }x${
                    state.canvasHeightCm
                }cm.png`;


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            URL.revokeObjectURL(
                url
            );

        },

        "image/png"
    );

}


/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {

    state.canvasWidthCm =
        getNumber(
            "canvasWidth",
            30
        );

    state.canvasHeightCm =
        getNumber(
            "canvasHeight",
            40
        );

    state.dpi =
        getNumber(
            "dpi",
            300
        );

    state.marginCm =
        getNumber(
            "margin",
            0.5
        );

    state.gapCm =
        getNumber(
            "gap",
            0.3
        );


    updateCanvasInfo();

    renderCanvas();


    systemStatus.textContent =
        "Ready";

}


initialize();
