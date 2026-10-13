(() => {
"use strict";
const profiles={
 usvisa:{w:51,h:51,dpi:300,pxW:600,pxH:600,label:"Amerika Serikat — Visa",note:"Katalog referensi mencantumkan foto visa AS 2 × 2 inci. Portal pengajuan dapat menetapkan dimensi dan batas file digital tersendiri."},
 schengen:{w:35,h:45,dpi:300,pxW:413,pxH:531,label:"Schengen — Visa",note:"Ukuran umum pada katalog referensi: 35 × 45 mm. Periksa petunjuk konsulat atau pusat aplikasi negara tujuan."},
 ukvisa:{w:35,h:45,dpi:300,pxW:413,pxH:531,label:"Britania Raya — Visa",note:"Ukuran 35 × 45 mm ditampilkan sebagai profil referensi. Persyaratan unggahan online dapat berbeda."},
 china:{w:33,h:48,dpi:300,pxW:390,pxH:567,label:"Tiongkok — Visa",note:"Profil 33 × 48 mm / 390 × 567 px muncul pada katalog referensi. Cocokkan dengan portal visa yang Anda gunakan."},
 indiavisa:{w:51,h:51,dpi:300,pxW:600,pxH:600,label:"India — Visa",note:"Katalog referensi menampilkan ukuran visa India 2 × 2 inci; beberapa pusat aplikasi menggunakan format digital berbeda."},
 indonesia:{w:30,h:40,dpi:300,pxW:354,pxH:472,label:"Indonesia — Visa",note:"Katalog referensi mencantumkan profil 30 × 40 mm berlatar merah. Latar foto tidak diganti otomatis oleh aplikasi ini."},
 australia:{w:35,h:45,dpi:300,pxW:413,pxH:531,label:"Australia — Visa",note:"35 × 45 mm adalah profil referensi. Permohonan online dapat meminta file digital dan panduan yang berbeda."},
 canada:{w:35,h:45,dpi:300,pxW:413,pxH:531,label:"Kanada — Visa",note:"Katalog referensi mencantumkan 35 × 45 mm. Pastikan jenis permohonan dan instruksi resmi yang berlaku."},
 custom:{w:35,h:45,dpi:300,pxW:413,pxH:531,label:"Ukuran khusus",note:"Masukkan ukuran sesuai instruksi resmi dokumen Anda."}
};
const $=id=>document.getElementById(id);
const profile=$("profile"),input=$("photoInput"),canvas=$("preview"),ctx=canvas.getContext("2d",{willReadFrequently:false});
let img=null,zoom=1,offsetX=0,offsetY=0,drag=null,profileData=profiles.usvisa;
function updateProfile(){
 profileData={...profiles[profile.value]};
 const custom=profile.value==="custom";
 $("customFields").hidden=!custom;
 if(custom){profileData.w=Number($("customWidth").value)||35;profileData.h=Number($("customHeight").value)||45;profileData.dpi=Number($("dpi").value)||300;profileData.pxW=Math.round(profileData.w/25.4*profileData.dpi);profileData.pxH=Math.round(profileData.h/25.4*profileData.dpi)}
 $("sizeLabel").textContent=profileData.w+" × "+profileData.h+" mm";
 $("pixelLabel").textContent=profileData.pxW+" × "+profileData.pxH+" px";
 $("profileHint").textContent=profileData.note;
 draw();
}
function bounds(){
 const ratio=profileData.w/profileData.h;
 const cw=canvas.width,ch=canvas.height;
 let w=cw,h=w/ratio;if(h>ch){h=ch;w=h*ratio}
 return {x:(cw-w)/2,y:(ch-h)/2,w,h};
}
function draw(){
 if(!img)return;
 const maxDim=900,ratio=profileData.w/profileData.h;
 canvas.width=ratio>=1?maxDim:Math.round(maxDim*ratio);
 canvas.height=ratio>=1?Math.round(maxDim/ratio):maxDim;
 const b=bounds();
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
 const scale=Math.max(b.w/img.naturalWidth,b.h/img.naturalHeight)*zoom;
 const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
 const x=(canvas.width-iw)/2+offsetX,y=(canvas.height-ih)/2+offsetY;
 ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.drawImage(img,x,y,iw,ih);ctx.restore();
}
input.addEventListener("change",()=>{
 const file=input.files&&input.files[0];if(!file)return;
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)){alert("Pilih file JPG, PNG, atau WEBP.");input.value="";return}
 const url=URL.createObjectURL(file),image=new Image();
 image.onload=()=>{if(img&&img.src.startsWith("blob:"))URL.revokeObjectURL(img.src);img=image;zoom=1;offsetX=0;offsetY=0;$("emptyState").hidden=true;canvas.hidden=false;$("exportBtn").disabled=false;$("imageInfo").textContent=file.name+" · "+image.naturalWidth+" × "+image.naturalHeight+" px";$("zoom").value="1";$("zoomValue").textContent="1.0×";draw()};
 image.onerror=()=>{URL.revokeObjectURL(url);alert("Foto tidak dapat dibuka. Coba file gambar lain.")};image.src=url;
});
$("zoom").addEventListener("input",e=>{zoom=Number(e.target.value);$("zoomValue").textContent=zoom.toFixed(1)+"×";draw()});
profile.addEventListener("change",updateProfile);
["customWidth","customHeight","dpi"].forEach(id=>$(id).addEventListener("input",()=>{if(profile.value==="custom")updateProfile()}));
canvas.addEventListener("pointerdown",e=>{if(!img)return;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,ox:offsetX,oy:offsetY,scaleX:canvas.width/canvas.getBoundingClientRect().width,scaleY:canvas.height/canvas.getBoundingClientRect().height}});
canvas.addEventListener("pointermove",e=>{if(!drag)return;offsetX=drag.ox+(e.clientX-drag.x)*drag.scaleX;offsetY=drag.oy+(e.clientY-drag.y)*drag.scaleY;draw()});
["pointerup","pointercancel","lostpointercapture"].forEach(type=>canvas.addEventListener(type,()=>drag=null));
$("exportBtn").addEventListener("click",()=>{
 if(!img)return;
 const out=document.createElement("canvas");out.width=profileData.pxW;out.height=profileData.pxH;
 if(out.width>10000||out.height>10000||out.width*out.height>40000000){alert("Resolusi terlalu besar. Kurangi DPI atau dimensi khusus.");return}
 const o=out.getContext("2d");o.fillStyle="#fff";o.fillRect(0,0,out.width,out.height);
 const ratio=profileData.w/profileData.h,cw=canvas.width,ch=canvas.height;
 let cropW=cw,cropH=ch;if(cw/ch>ratio)cropW=ch*ratio;else cropH=cw/ratio;
 const sx=(cw-cropW)/2,sy=(ch-cropH)/2;
 o.drawImage(canvas,sx,sy,cropW,cropH,0,0,out.width,out.height);
 out.toBlob(blob=>{if(!blob){alert("Gagal membuat JPG.");return}const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="visa-photo-"+profile.value+"-"+out.width+"x"+out.height+".jpg";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}, "image/jpeg",.94);
});
$("resetBtn").addEventListener("click",()=>{img=null;input.value="";canvas.hidden=true;$("emptyState").hidden=false;$("exportBtn").disabled=true;$("imageInfo").textContent="Belum ada foto";zoom=1;offsetX=0;offsetY=0;$("zoom").value="1";$("zoomValue").textContent="1.0×";ctx.clearRect(0,0,canvas.width,canvas.height)});
if("serviceWorker" in navigator && location.protocol==="https:"){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
updateProfile();
})();