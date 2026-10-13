(() => {
const button=document.getElementById("installBtn");if(!button)return;let promptEvent=null;
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
if(standalone()){button.textContent="✓ Terpasang";button.disabled=true;return}
addEventListener("beforeinstallprompt",e=>{e.preventDefault();promptEvent=e;button.hidden=false});
button.addEventListener("click",async()=>{
if(promptEvent){promptEvent.prompt();const choice=await promptEvent.userChoice;if(choice?.outcome==="accepted"){button.textContent="✓ Terpasang";button.disabled=true}else alert("Instalasi belum dilakukan. Anda bisa mencoba lagi dari menu browser.");promptEvent=null;return}
if(/iPhone|iPad|iPod/i.test(navigator.userAgent))alert('Di Safari, pilih Bagikan lalu “Tambahkan ke Layar Utama”.');
else alert('Buka menu browser (⋮) lalu pilih “Instal aplikasi” atau “Instal halaman sebagai aplikasi”, jika tersedia.');
});
addEventListener("appinstalled",()=>{button.textContent="✓ Terpasang";button.disabled=true});
})();