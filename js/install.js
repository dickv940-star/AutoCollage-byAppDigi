(() => {
  const button = document.getElementById("installAppBtn");
  if (!button) return;

  let installPrompt = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const showMessage = message => {
    let note = document.getElementById("installAppMessage");
    if (!note) {
      note = document.createElement("p");
      note.id = "installAppMessage";
      note.setAttribute("role", "status");
      note.style.cssText = "margin:8px 0 0;font-size:12px;line-height:1.4;color:#dbeafe;max-width:260px;";
      button.insertAdjacentElement("afterend", note);
    }
    note.textContent = message;
  };

  if (isStandalone()) {
    button.textContent = "✓ Aplikasi Terpasang";
    button.disabled = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    button.textContent = "⬇ Instal Aplikasi";
    button.hidden = false;
  });

  button.addEventListener("click", async () => {
    if (isStandalone()) {
      showMessage("Auto Collage sudah berjalan sebagai aplikasi.");
      return;
    }

    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        button.textContent = "✓ Aplikasi Dipasang";
        showMessage("Instalasi diterima. Buka Auto Collage dari menu aplikasi perangkat.");
      } else {
        showMessage("Instalasi belum dilakukan. Anda bisa menekan tombol ini lagi nanti.");
      }
      installPrompt = null;
      return;
    }

    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) {
      showMessage('Untuk memasang di iPhone/iPad: buka menu Bagikan di Safari, lalu pilih “Add to Home Screen / Tambahkan ke Layar Utama”.');
    } else {
      showMessage('Jika tombol instal belum muncul, buka menu browser (⋮) lalu pilih “Instal aplikasi” atau “Install page as app”. Pastikan situs dibuka melalui HTTPS.');
    }
  });

  window.addEventListener("appinstalled", () => {
    button.textContent = "✓ Aplikasi Terpasang";
    button.disabled = true;
    showMessage("Auto Collage berhasil dipasang.");
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js")
        .catch(error => console.warn("Service worker belum aktif:", error));
    });
  }
})();