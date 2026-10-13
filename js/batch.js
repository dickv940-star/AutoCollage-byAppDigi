/* =========================================================
   BATCH AUTO COLLAGE
   Local-only queue/history; source photos are never modified.
========================================================= */
(() => {
  "use strict";
  const DB_NAME = "autocollage-batch-db-v1";
  const DB_VERSION = 1;
  const STORES = { pending: "pending", history: "history", failures: "failures" };
  const el = id => document.getElementById(id);
  const folderInput = el("batchFolderInput");
  const startBtn = el("batchStartBtn");
  const retryBtn = el("batchRetryBtn");
  const notice = el("batchNotice");
  const progress = el("batchProgress");
  const progressLabel = el("batchProgressLabel");
  const progressCount = el("batchProgressCount");
  const pendingList = el("batchPendingList");
  const failedList = el("batchFailedList");
  const historyList = el("batchHistoryList");
  let dbPromise = null;
  let running = false;
  let pendingCache = [];
  let historyCache = [];
  let failureCache = [];

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("Browser ini tidak mendukung penyimpanan lokal yang dibutuhkan.")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.pending)) db.createObjectStore(STORES.pending, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORES.history)) db.createObjectStore(STORES.history, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.failures)) db.createObjectStore(STORES.failures, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Tidak bisa membuka penyimpanan batch."));
    });
    return dbPromise;
  }
  async function allRecords(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function putRecord(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Gagal menyimpan data."));
      tx.onabort = () => reject(tx.error || new Error("Penyimpanan dibatalkan."));
    });
  }
  async function deleteRecord(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Gagal memperbarui antrean."));
    });
  }
  async function completeGroup(historyRecord, sourceRecords, groupId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.history, STORES.pending, STORES.failures], "readwrite");
      tx.objectStore(STORES.history).put(historyRecord);
      const pending = tx.objectStore(STORES.pending);
      const failures = tx.objectStore(STORES.failures);
      for (const record of sourceRecords) {
        pending.delete(record.key);
        failures.delete("source:" + record.key);
      }
      failures.delete("group:" + groupId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Hasil tidak dapat disimpan dengan aman."));
      tx.onabort = () => reject(tx.error || new Error("Penyimpanan hasil dibatalkan; file tetap berada di antrean."));
    });
  }
  async function clearStore(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Gagal menghapus data."));
    });
  }
  function setNotice(message, isError = false) {
    if (!notice) return;
    notice.textContent = message;
    notice.classList.toggle("batch-notice-error", isError);
  }
  function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function parseStored(item) {
    return item.parsed || parseFilename(item.name || "");
  }
  function fileKey(file, relPath) {
    return [relPath || file.name, file.size, file.lastModified || 0].join("|");
  }
  function safeBaseName(value) {
    return String(value || "Auto-Collage").replace(/[<>:"/\\|?*]/g, "_").replace(/[\u0000-\u001F]/g, "").trim().replace(/[. ]+$/g, "") || "Auto-Collage";
  }
  function baseNameForGroup(group) {
    const first = group.files.find(x => parseStored(x).sizeKey === "2x3") || group.files[0];
    const parsed = parseStored(first);
    return safeBaseName(parsed.displayId || first.name.replace(/\.[^.]+$/, ""));
  }
  function renderItem(item, status, actions = "") {
    return '<div class="batch-item ' + (status === "Gagal" ? "batch-failed" : status === "Berhasil" ? "batch-success" : "") + '">' +
      '<strong>' + safeText(item.title || item.name || item.id || "Foto") + '</strong>' +
      '<small>' + safeText(item.detail || item.relativePath || item.fileName || "") + '</small>' +
      '<span class="batch-item-status">' + safeText(status) + '</span>' + actions + '</div>';
  }
  function groupPending(records) {
    const groups = new Map();
    const invalid = [];
    for (const record of records) {
      const p = parseStored(record);
      if (!p.valid || !p.id) { invalid.push({ ...record, failureReason: "Nama file tidak memuat ukuran seperti 2x3 atau 3x4." }); continue; }
      if (!groups.has(p.id)) groups.set(p.id, { id: p.id, files: [], label: p.displayId || p.id });
      groups.get(p.id).files.push(record);
    }
    return { groups: [...groups.values()], invalid };
  }
  function classifyGroup(group) {
    const bySize = new Map();
    for (const file of group.files) {
      const p = parseStored(file);
      if (!bySize.has(p.sizeKey)) bySize.set(p.sizeKey, []);
      bySize.get(p.sizeKey).push(file);
    }
    const a = bySize.get("2x3") || [];
    const b = bySize.get("3x4") || [];
    const unsupported = group.files.filter(file => !["2x3", "3x4"].includes(parseStored(file).sizeKey));
    if (unsupported.length) return { ok: false, reason: "Ukuran tidak didukung. Batch memerlukan pasangan 2x3 dan 3x4." };
    if (a.length !== 1 || b.length !== 1) return { ok: false, reason: a.length > 1 || b.length > 1 ? "Ada file ukuran yang duplikat untuk nomor ini; pastikan hanya satu 2x3 dan satu 3x4." : "Pasangan belum lengkap; diperlukan satu file 2x3 dan satu file 3x4." };
    return { ok: true, files: [a[0], b[0]] };
  }
  async function refresh() {
    try {
      [pendingCache, historyCache, failureCache] = await Promise.all([
        allRecords(STORES.pending), allRecords(STORES.history), allRecords(STORES.failures)
      ]);
      pendingCache.sort((a,b) => String(a.relativePath || a.name).localeCompare(String(b.relativePath || b.name)));
      historyCache.sort((a,b) => String(a.completedAt || "").localeCompare(String(b.completedAt || "")));
      failureCache.sort((a,b) => String(a.title || "").localeCompare(String(b.title || "")));
      renderLists();
    } catch (err) {
      setNotice("Penyimpanan batch tidak tersedia: " + (err.message || err), true);
    }
  }
  function renderLists() {
    const grouped = groupPending(pendingCache);
    const failedKeys = new Set(failureCache.map(f => f.key));
    const pendingGroups = grouped.groups.map(g => {
      const stateLabel = classifyGroup(g);
      const hasFail = failureCache.some(f => f.groupId === g.id || g.files.some(file => f.sourceKey === file.key));
      return { ...g, reason: stateLabel.ok ? (hasFail ? "Gagal sebelumnya — gunakan Coba Ulang Gagal." : "Pasangan lengkap siap diproses.") : stateLabel.reason, failed: hasFail || !stateLabel.ok };
    });
    const pendingCount = el("batchPendingCount");
    const failedCount = el("batchFailedCount");
    const historyCount = el("batchHistoryCount");
    if (pendingCount) pendingCount.textContent = String(pendingCache.length);
    if (failedCount) failedCount.textContent = String(failureCache.length);
    if (historyCount) historyCount.textContent = String(historyCache.length);
    if (el("batchPendingLabel")) el("batchPendingLabel").textContent = pendingCache.length + " file";
    if (el("batchFailedLabel")) el("batchFailedLabel").textContent = failureCache.length + " masalah";
    if (el("batchHistoryLabel")) el("batchHistoryLabel").textContent = historyCache.length + " hasil";
    if (pendingList) {
      const blocks = pendingGroups.map(g => renderItem({ title: "Nomor " + g.label, detail: g.files.length + " file · " + g.reason }, g.failed ? "Perlu diperiksa" : "Menunggu"));
      for (const bad of grouped.invalid) blocks.push(renderItem({ title: bad.name, detail: bad.failureReason }, "Gagal"));
      pendingList.innerHTML = blocks.join("") || '<p class="batch-empty">Tidak ada file yang menunggu. File berhasil sudah dikeluarkan dari antrean.</p>';
    }
    if (failedList) {
      const blocks = failureCache.map(f => {
        const retry = '<div class="batch-item-actions"><button type="button" class="btn btn-secondary" data-batch-retry="' + safeText(f.key) + '">Coba ulang</button></div>';
        return renderItem({ title: f.title, detail: f.reason + (f.sourceNames?.length ? " · " + f.sourceNames.join(", ") : "") }, "Gagal", retry);
      });
      failedList.innerHTML = blocks.join("") || '<p class="batch-empty">Belum ada kegagalan.</p>';
    }
    if (historyList) {
      const blocks = historyCache.slice().reverse().map(h => {
        const button = '<div class="batch-item-actions"><button type="button" class="btn btn-secondary" data-batch-download="' + safeText(h.id) + '">Unduh JPG</button></div>';
        return renderItem({ title: h.fileName, detail: h.sourceNames.join(" + ") + " · " + new Date(h.completedAt).toLocaleString("id-ID") }, "Berhasil", button);
      });
      historyList.innerHTML = blocks.join("") || '<p class="batch-empty">Belum ada hasil berhasil.</p>';
    }
    const zip = el("batchDownloadZipBtn");
    if (zip) zip.disabled = !historyCache.length || running;
    if (startBtn) startBtn.disabled = running || !pendingCache.length;
    if (retryBtn) retryBtn.disabled = running || !failureCache.length;
  }
  async function importFolder(fileListValue) {
    const files = Array.from(fileListValue || []);
    if (!files.length) return;

    // A new folder is a new batch: remove stale pending/failure records first,
    // but preserve History so previously completed JPGs remain downloadable.
    await refresh();
    if (pendingCache.length || failureCache.length) {
      const ok = confirm(
        "Antrean masih berisi file dari folder sebelumnya (" + pendingCache.length +
        " file belum diproses, " + failureCache.length +
        " masalah). Ganti antrean dengan folder baru? History hasil yang sudah berhasil tetap disimpan."
      );
      if (!ok) {
        if (folderInput) folderInput.value = "";
        setNotice("Folder baru dibatalkan. Antrean lama tetap dipertahankan.");
        return;
      }
    }
    await Promise.all([clearStore(STORES.pending), clearStore(STORES.failures)]);

    let added = 0;
    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const key = fileKey(file, relativePath);
      await putRecord(STORES.pending, {
        key, name: file.name, relativePath, size: file.size,
        lastModified: file.lastModified || 0, type: file.type || "application/octet-stream",
        blob: file, parsed: parseFilename(file.name), importedAt: new Date().toISOString()
      });
      added++;
    }
    await refresh();
    setNotice("Folder baru dimasukkan: " + added + " file. Antrean lama sudah diganti; History hasil sebelumnya tetap tersimpan.");
    if (folderInput) folderInput.value = "";
  }
  function makeCanvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Browser gagal membuat file JPG.")), "image/jpeg", 1.0));
  }
  async function loadBatchImage(record) {
    const blob = record.blob instanceof Blob ? record.blob : new Blob([record.blob], { type: record.type || "image/jpeg" });
    const file = new File([blob], record.name, { type: record.type || blob.type || "image/jpeg", lastModified: record.lastModified || Date.now() });
    const image = await loadImage(file);
    const parsed = parseStored(record);
    return { file, name: record.name, ...parsed, image, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
  }
  async function makeBatchJpg(group, pair) {
    // A saved template owns its canvas dimensions. The visible inputs reset to
    // defaults after a page reload, so using createCanvasState() directly can
    // silently bypass a template saved at another size.
    const template = state.template;
    let canvasState;
    if (template && Array.isArray(template.frames) && template.frames.length) {
      const widthCm = n(template.widthCm, n(canvasWidth?.value, 30));
      const heightCm = n(template.heightCm, n(canvasHeight?.value, 40));
      const dpi = n(template.dpi, n(dpiInput?.value, 300));
      const widthPx = Math.round(cmToPx(widthCm, dpi));
      const heightPx = Math.round(cmToPx(heightCm, dpi));
      if ((widthPx * heightPx) / 1000000 > 100) {
        throw new Error("Canvas pada contoh tersimpan terlalu besar. Turunkan DPI atau simpan ulang contoh dengan ukuran lebih kecil.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;
      canvasState = { canvas, widthCm, heightCm, dpi, widthPx, heightPx };
    } else {
      canvasState = createCanvasState();
    }
    const oldCanvas = state.canvas;
    const oldMissing = state.templateMissing;
    const oldOverflow = state.templateOverflow;
    try {
      state.canvas = canvasState;
      state.templateMissing = [];
      state.templateOverflow = [];
      // The saved example stores one frame per printed copy. Repeat each
      // source photo to match every frame of its size (e.g. 2x3 × 2 and
      // 3x4 × 5), rather than always producing only one copy of each size.
      const templateMatchesCanvas = template &&
        Array.isArray(template.frames) && template.frames.length &&
        Math.abs(n(template.widthCm) - canvasState.widthCm) <= 0.0001 &&
        Math.abs(n(template.heightCm) - canvasState.heightCm) <= 0.0001;
      let queue;
      if (templateMatchesCanvas) {
        const bySize = new Map(pair.map(source => [source.sizeKey, source]));
        const frameCounts = {};
        for (const slot of template.frames) {
          const key = String(slot.sizeKey || (n(slot.width) + "x" + n(slot.height)));
          frameCounts[key] = (frameCounts[key] || 0) + 1;
        }
        // Version 4 templates preserve the quantity fields explicitly. For
        // older templates, infer counts from the saved frame list.
        const savedCounts = template.quantities && typeof template.quantities === "object"
          ? template.quantities : frameCounts;
        queue = [];
        for (const sizeKey of ["2x3", "3x4"]) {
          const source = bySize.get(sizeKey);
          const count = Math.max(0, Math.floor(n(savedCounts[sizeKey], frameCounts[sizeKey] || 0)));
          if (count > 0 && !source) {
            throw new Error("Contoh tersimpan memerlukan ukuran " + sizeKey +
              " tetapi pasangan sumber tidak memilikinya.");
          }
          for (let i = 0; i < count; i++) {
            queue.push({ id: group.id, sizeKey, source, widthCm: source?.width, heightCm: source?.height });
          }
        }
        if (!queue.length) throw new Error("Contoh tersimpan tidak memiliki jumlah cetak 2x3 atau 3x4. Buka aplikasi utama, isi jumlah, lalu klik Simpan sebagai Contoh lagi.");
      } else {
        queue = pair.map(source => ({ id: group.id, sizeKey: source.sizeKey, source, widthCm: source.width, heightCm: source.height }));
      }
      let placements = createTemplatePlacements(queue);
      if (!placements || placements.length !== queue.length || state.templateOverflow?.length) {
        if (template && Array.isArray(template.frames) && template.frames.length) {
          throw new Error("Contoh tersimpan tidak memiliki posisi yang cocok untuk kedua ukuran foto. Pastikan contoh memiliki posisi 2x3 dan 3x4, lalu simpan ulang contoh.");
        }
        const margin = Math.max(0, n(marginInput?.value, .5));
        const gap = Math.max(0, n(gapInput?.value, .3));
        let packed = packPhotos(queue, canvasState.widthCm, canvasState.heightCm, margin, gap);
        if (!packed.success) throw new Error(packed.reason);
        if (autoSpacing?.checked) packed = applyAutoSpacing(packed, canvasState.widthCm, margin);
        placements = packed.placements;
      }
      const valid = validatePlacements(placements, canvasState.widthCm, canvasState.heightCm);
      if (!valid.valid) throw new Error(valid.message);
      const ctx = canvasState.canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Tidak bisa membuat canvas hasil.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasState.canvas.width, canvasState.canvas.height);
      for (const p of placements) {
        if (!p.source?.image) throw new Error("Ada foto yang gagal dimuat.");
        drawPhoto(ctx, p, cmToPx(p.x, canvasState.dpi), cmToPx(p.y, canvasState.dpi), cmToPx(p.width, canvasState.dpi), cmToPx(p.height, canvasState.dpi));
      }
      const blob = await makeCanvasBlob(canvasState.canvas);
      return { blob, canvasState: { widthCm: canvasState.widthCm, heightCm: canvasState.heightCm, widthPx: canvasState.widthPx, heightPx: canvasState.heightPx, dpi: canvasState.dpi } };
    } finally {
      state.canvas = oldCanvas;
      state.templateMissing = oldMissing;
      state.templateOverflow = oldOverflow;
    }
  }
  async function processOne(group) {
    const classified = classifyGroup(group);
    if (!classified.ok) throw new Error(classified.reason);
    const pair = [];
    for (const record of classified.files) {
      try { pair.push(await loadBatchImage(record)); }
      catch (err) { throw new Error("Tidak dapat membaca " + record.name + ": " + (err.message || err)); }
    }
    const made = await makeBatchJpg(group, pair);
    const fileName = baseNameForGroup(group) + ".jpg";
    const historyRecord = {
      id: group.id, fileName, blob: made.blob,
      width: made.canvasState.widthPx, height: made.canvasState.heightPx, dpi: made.canvasState.dpi,
      sourceNames: classified.files.map(x => x.name),
      sourceKeys: classified.files.map(x => x.key),
      completedAt: new Date().toISOString()
    };
    // Save the result and remove its source pair in one IndexedDB transaction.
    // If storage fails, the transaction rolls back and the source files stay queued.
    await completeGroup(historyRecord, classified.files, group.id);
  }
  async function markFailure(group, reason, records = group.files) {
    const key = "group:" + group.id;
    await putRecord(STORES.failures, {
      key, groupId: group.id, title: "Nomor " + (group.label || group.id), reason,
      sourceNames: records.map(x => x.name), sourceKeys: records.map(x => x.key),
      failedAt: new Date().toISOString()
    });
  }
  async function runBatch(onlyFailed = false) {
    if (running) return;
    await refresh();
    if (!pendingCache.length) { setNotice("Antrean kosong. Pilih folder foto terlebih dahulu."); return; }
    running = true;
    renderLists();
    const { groups, invalid } = groupPending(pendingCache);
    const targets = onlyFailed
      ? groups.filter(g => failureCache.some(f => f.groupId === g.id))
      : groups.filter(g => !failureCache.some(f => f.groupId === g.id));
    let done = 0, success = 0, failed = 0;
    const total = targets.length + invalid.length;
    if (progress) { progress.max = Math.max(1, total); progress.value = 0; }
    if (progressLabel) progressLabel.textContent = "Memulai batch…";
    if (progressCount) progressCount.textContent = "0 / " + total;
    try {
      for (const group of targets) {
        if (progressLabel) progressLabel.textContent = "Memproses nomor " + group.label;
        try { await processOne(group); success++; }
        catch (err) { failed++; await markFailure(group, err.message || "Gagal membuat kolase."); }
        done++;
        if (progress) progress.value = done;
        if (progressCount) progressCount.textContent = done + " / " + total;
        await refresh();
      }
      for (const record of invalid) {
        const key = "source:" + record.key;
        if (!onlyFailed || failureCache.some(f => f.key === key)) {
          await putRecord(STORES.failures, { key, title: record.name, reason: record.failureReason || "Nama file tidak valid.", sourceNames: [record.name], sourceKey: record.key, failedAt: new Date().toISOString() });
        }
        done++;
        if (progress) progress.value = done;
        if (progressCount) progressCount.textContent = done + " / " + total;
      }
      await refresh();
      if (progressLabel) progressLabel.textContent = "Selesai";
      setNotice("Batch selesai. Berhasil: " + success + " nomor; gagal/perlu diperiksa: " + (failed + invalid.length) + ". File gagal tetap ada di antrean dan tidak masuk History.");
    } catch (err) {
      setNotice("Batch berhenti: " + (err.message || err), true);
    } finally {
      running = false;
      renderLists();
    }
  }
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function downloadOne(id) {
    const item = historyCache.find(x => x.id === id) || (await allRecords(STORES.history)).find(x => x.id === id);
    if (!item?.blob) { setNotice("Hasil tidak ditemukan di History.", true); return; }
    downloadBlob(item.blob, item.fileName);
  }
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function write16(view, offset, value) { view.setUint16(offset, value, true); }
  function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
  async function makeZip(records) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const encoder = new TextEncoder();
    for (const item of records) {
      const nameBytes = encoder.encode(item.fileName);
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      write32(lv,0,0x04034b50); write16(lv,4,20); write16(lv,6,0x0800); write16(lv,8,0);
      write16(lv,10,0); write16(lv,12,0x21); write32(lv,14,crc); write32(lv,18,bytes.length); write32(lv,22,bytes.length);
      write16(lv,26,nameBytes.length); write16(lv,28,0); local.set(nameBytes,30);
      chunks.push(local, bytes);
      const c = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(c.buffer);
      write32(cv,0,0x02014b50); write16(cv,4,20); write16(cv,6,20); write16(cv,8,0x0800); write16(cv,10,0);
      write16(cv,12,0); write16(cv,14,0x21); write32(cv,16,crc); write32(cv,20,bytes.length); write32(cv,24,bytes.length);
      write16(cv,28,nameBytes.length); write16(cv,30,0); write16(cv,32,0); write16(cv,34,0); write16(cv,36,0); write32(cv,38,0); write32(cv,42,offset); c.set(nameBytes,46);
      central.push(c);
      offset += local.length + bytes.length;
    }
    const centralOffset = offset;
    let centralSize = 0;
    for (const chunk of central) { chunks.push(chunk); centralSize += chunk.length; }
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    write32(ev,0,0x06054b50); write16(ev,4,0); write16(ev,6,0); write16(ev,8,central.length); write16(ev,10,central.length);
    write32(ev,12,centralSize); write32(ev,16,centralOffset); write16(ev,20,0); chunks.push(end);
    return new Blob(chunks, { type: "application/zip" });
  }
  async function downloadAllZip() {
    const records = await allRecords(STORES.history);
    if (!records.length) { setNotice("Belum ada hasil untuk diunduh."); return; }
    if (records.length > 65535) { setNotice("Terlalu banyak file untuk satu ZIP standar.", true); return; }
    setNotice("Menyiapkan ZIP berisi " + records.length + " JPG…");
    try {
      const zip = await makeZip(records);
      downloadBlob(zip, "Auto-Collage-History.zip");
      setNotice("ZIP siap diunduh: " + records.length + " JPG.");
    } catch (err) { setNotice("Gagal membuat ZIP: " + (err.message || err), true); }
  }
  async function clearHistory() {
    if (!historyCache.length) return;
    if (!confirm("Hapus semua hasil History dari penyimpanan browser? File asli dan antrean tidak dihapus.")) return;
    await clearStore(STORES.history);
    await refresh();
    setNotice("History berhasil dihapus dari penyimpanan browser.");
  }
  if (folderInput) folderInput.addEventListener("change", async e => {
    try { await importFolder(e.target.files); }
    catch (err) { setNotice("Gagal memasukkan folder: " + (err.message || err), true); }
  });
  if (startBtn) startBtn.addEventListener("click", () => runBatch(false));
  if (retryBtn) retryBtn.addEventListener("click", () => runBatch(true));
  if (el("batchDownloadZipBtn")) el("batchDownloadZipBtn").addEventListener("click", downloadAllZip);
  if (el("batchClearHistoryBtn")) el("batchClearHistoryBtn").addEventListener("click", clearHistory);
  document.addEventListener("click", e => {
    const dl = e.target.closest("[data-batch-download]");
    if (dl) { downloadOne(dl.getAttribute("data-batch-download")); return; }
    const retry = e.target.closest("[data-batch-retry]");
    if (retry) {
      const key = retry.getAttribute("data-batch-retry");
      const failure = failureCache.find(f => f.key === key);
      if (!failure) return;
      if (failure.groupId) {
        deleteRecord(STORES.failures, key).then(() => runBatch(false));
      } else {
        setNotice("File ini memerlukan perbaikan nama/format. Setelah diperbaiki, unggah kembali foldernya.", true);
      }
    }
  });
  refresh().then(() => setNotice("History dan antrean batch siap. Pilih folder foto untuk menambahkan file."));
})();