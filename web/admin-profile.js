/* Private administrator photo. The venue's public photos have their own editor. */
(() => {
 let account=null;
 const identity=()=>state.token&&state.user?.id?`${state.user.id}:${state.token}`:null;
 const current=entry=>account===entry&&entry.key===identity();
 window.tocaAdminAvatarMarkup=()=>`<section class="admin-avatar-editor" aria-label="Foto de perfil"><span class="admin-profile-photo" data-admin-photo aria-hidden="true">${esc((state.user?.name||'A')[0].toUpperCase())}</span><div><strong>Foto de perfil</strong><p>Se muestra en tu cuenta de administrador.</p><div class="admin-avatar-actions"><label class="btn small admin-avatar-upload" for="admin-avatar-file"><span data-admin-photo-label>Agregar foto</span><input type="file" id="admin-avatar-file" accept="image/jpeg,image/png,image/webp" /></label><button type="button" class="btn ghost small" data-admin-photo-remove hidden>Quitar foto</button></div><small>JPG, PNG o WebP · hasta 6 MB</small></div><p class="admin-avatar-status" role="status" hidden></p></section>`;
 function status(message,error=false){const node=document.querySelector('.admin-avatar-status');if(node){node.hidden=!message;node.textContent=message;node.classList.toggle('is-error',error);}}
 function paint(entry){
  if(!current(entry))return;
  const avatar=entry.avatar?.startsWith('data:image/jpeg;base64,')?entry.avatar:null;
  document.querySelectorAll('.toca-admin-avatar,[data-admin-photo]').forEach(node=>{
   if(avatar){const image=document.createElement('img');image.src=avatar;image.alt='';node.replaceChildren(image);}
   else node.textContent=(state.user?.name||'A')[0].toUpperCase();
  });
  const label=document.querySelector('[data-admin-photo-label]');if(label)label.textContent=entry.saving?'Guardando…':avatar?'Cambiar foto':'Agregar foto';
  const input=document.getElementById('admin-avatar-file');if(input)input.disabled=!!entry.saving;
  const remove=document.querySelector('[data-admin-photo-remove]');if(remove){remove.hidden=!avatar;remove.disabled=!!entry.saving;}
 }
 function hydrate(){
  const key=identity();if(!key){account=null;return;}
  if(!document.querySelector('.toca-admin-frame'))return;
  if(account?.key!==key)account={key,token:state.token,avatar:null,loaded:false,revision:0};
  const entry=account;paint(entry);
  if(entry.loaded||entry.loading)return;
  const revision=entry.revision;
  entry.loading=api('/api/auth/me/avatar',{headers:{Authorization:`Bearer ${entry.token}`},signal:new AbortController().signal})
   .then(data=>{if(current(entry)&&entry.revision===revision){entry.avatar=data.avatar||null;entry.loaded=true;paint(entry);}})
   .catch(()=>{if(current(entry)&&entry.revision===revision)status('No pudimos cargar tu foto. Podés volver a subirla.',true);})
   .finally(()=>{entry.loading=null;});
 }
 const previousMount=mount;
 mount=function(...args){previousMount(...args);hydrate();};
 async function imageData(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí una foto JPG, PNG o WebP.');
  if(file.size>6*1024*1024)throw Error('La foto no puede superar los 6 MB.');
  const url=URL.createObjectURL(file);
  try{
   const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo abrir la imagen. Probá con otra foto.'));img.src=url;});
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>60_000_000)throw Error('Dimensiones de imagen no permitidas.');
   const canvas=document.createElement('canvas');canvas.width=canvas.height=360;
   const context=canvas.getContext('2d');if(!context)throw Error('No se pudo preparar la foto.');
   const edge=Math.min(image.naturalWidth,image.naturalHeight);
   context.fillStyle='#fff';context.fillRect(0,0,360,360);
   context.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,360,360);
   for(const quality of [.82,.70,.56]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<210_000)return data;}
   throw Error('La foto es demasiado grande. Probá con otra imagen.');
  }finally{URL.revokeObjectURL(url);}
 }
 async function save(file,remove=false){
  const entry=account;if(!entry||!current(entry)||entry.saving)return;
  entry.saving=true;entry.revision++;paint(entry);status(remove?'Quitando foto…':'Guardando foto…');
  try{
   const image=remove?null:await imageData(file);if(!current(entry))return;
   const data=await api('/api/auth/me/avatar',{method:remove?'DELETE':'PUT',headers:{Authorization:`Bearer ${entry.token}`},...(remove?{}:{body:{image}})});
   if(!current(entry))return;
   entry.avatar=remove?null:data.avatar;entry.loaded=true;status('');paint(entry);
   toast(remove?'Foto de perfil eliminada.':'Foto de perfil actualizada.');
  }catch(error){if(current(entry))status(error.message,true);}
  finally{entry.saving=false;if(current(entry)){paint(entry);const input=document.getElementById('admin-avatar-file');if(input)input.value='';}}
 }
 document.addEventListener('change',event=>{if(event.target.id==='admin-avatar-file'&&event.target.files?.[0])void save(event.target.files[0]);});
 document.addEventListener('click',event=>{if(event.target.closest('[data-admin-photo-remove]'))void save(null,true);});
})();
