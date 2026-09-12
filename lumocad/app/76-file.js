// ============================================================
//  LumoCAD — the drawing file: .lcad save/open, autosave, session settings
// ============================================================
// A .lcad file is the document as JSON: the same shape snapshotState() hands the undo
// stack, plus the things a drawing should reopen with (view, UCS, drafting aids).
// Chrome and Edge give us the File System Access API, so SAVE overwrites the file the
// user picked without a dialog. Anywhere else it falls back to a download.

const LCAD_FORMAT=1;
const LS_DRAWING='lumocad.autosave.v1';    // the work in progress, recovered on the next boot
const LS_SETTINGS='lumocad.settings.v1';   // drafting aids, which should outlive a reload

let fileName='Drawing1.lcad';
let fileHandle=null;    // a File System Access handle once the user has picked a file
let dirty=false;
const HAS_FS=(typeof window.showSaveFilePicker==='function');

// ---- serialise ----
// Keys starting with "_" are render caches and edit-session flags (_bb, _bbV, _refedit).
// They are rebuilt on demand and must never reach the file.
function transientKey(k){return typeof k==='string'&&k.charAt(0)==='_';}
function serializeDrawing(){
  ensureIds();
  return {
    format:LCAD_FORMAT, app:'LumoCAD', name:fileName, saved:new Date().toISOString(),
    objects:doc.objects, layers:doc.layers, activeLayer:doc.activeLayer, blocks:doc.blocks,
    textStyles:doc.textStyles, dimStyles:doc.dimStyles,
    textStyle:doc.textStyle, dimStyle:doc.dimStyle,
    annoScale, gridSize, nextObjId,
    view:{ox:view.ox, oy:view.oy, scale:view.scale},
    ucs:{ox:ucs.ox, oy:ucs.oy, ang:ucs.ang},
    settings:Object.assign({},settings), osnap:Object.assign({},osnap)
  };
}
function drawingJSON(){return JSON.stringify(serializeDrawing(),(k,v)=>transientKey(k)?undefined:v);}

// ---- validate ----
// One entity with a NaN coordinate is enough to poison zoomExtents and blank the canvas, and
// a damaged DXF or a hand-edited file will produce them. Anything unusable is dropped here,
// loudly, rather than loaded and left to break the view later.
// JSON has no NaN: JSON.stringify writes it as null, and null is just as unusable as NaN
// while sailing through isFinite(). So every coordinate is checked for being a real number,
// and each type is checked for the coordinates it actually needs.
function num(v){return typeof v==='number'&&isFinite(v);}
function nums(o,keys){return keys.every(k=>num(o[k]));}
function finitePoint(p){return Array.isArray(p)&&p.length>=2&&num(p[0])&&num(p[1]);}
function finitePts(o,min){return Array.isArray(o.pts)&&o.pts.length>=min&&o.pts.every(finitePoint);}
function objectIsSane(o){
  if(!o||typeof o!=='object'||typeof o.type!=='string')return false;
  // any coordinate-ish field that is present at all must be a real number
  for(const k of ['x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','rot','a1','a2','h','off','ltscale','lineweight','patScale','width'])
    if(k in o&&o[k]!=null&&!num(o[k]))return false;
  // an unknown type from a future format is kept rather than dropped
  return entityCall(o,'sane',true);
}
function dropInsaneObjects(){
  const before=doc.objects.length;
  doc.objects=doc.objects.filter(objectIsSane);
  _idMap=null;
  // A HOSTED hatch whose host did not survive is an invisible orphan, so it goes too. A hatch
  // that carries its own traced rings has no host by design, and this filter used to drop
  // every one of them on load — `live.has(undefined)` is false — which silently lost every
  // pick-a-point hatch the moment a drawing was saved and reopened.
  const live=new Set(doc.objects.map(o=>o.id));
  doc.objects=doc.objects.filter(o=>o.type!=='hatch'||Array.isArray(o.poly)||live.has(o.boundary));
  const dropped=before-doc.objects.length;
  if(dropped){_idMap=null;echo(`Dropped ${dropped} damaged object(s) while loading`);}
  return dropped;
}

// ---- load ----
function applyDrawing(d,srcName){
  if(!d||typeof d!=='object'||!Array.isArray(d.objects))throw new Error('not a LumoCAD drawing');
  if(d.format>LCAD_FORMAT)throw new Error(`saved by a newer LumoCAD (file format ${d.format}, this build reads ${LCAD_FORMAT})`);
  pushUndo();                                  // opening is undoable like any other edit
  doc.objects=d.objects;
  doc.layers=(Array.isArray(d.layers)&&d.layers.length)?d.layers
    :[{name:'Layer 1',color:'#3b82f6',on:true,frozen:false,locked:false,plot:true,linetype:'Continuous',lineweight:0.35}];
  doc.activeLayer=Math.max(0,Math.min(d.activeLayer|0,doc.layers.length-1));
  doc.blocks=d.blocks||{};
  doc.textStyles=d.textStyles||{Standard:{font:'monospace',h:0,bold:false,italic:false,widthFactor:1,oblique:0}};
  doc.dimStyles=d.dimStyles||{Standard:{txtH:0,arrow:'closed',arrowSize:9,extOffset:1.0,extExt:1.25,dimLineExt:0,precision:1,prefix:'',suffix:'',textPos:'above'}};
  doc.textStyle=(d.textStyle&&doc.textStyles[d.textStyle])?d.textStyle:'Standard';
  doc.dimStyle=(d.dimStyle&&doc.dimStyles[d.dimStyle])?d.dimStyle:'Standard';
  if(isFinite(d.annoScale)&&d.annoScale>0)annoScale=d.annoScale;
  gridSize=isFinite(d.gridSize)?d.gridSize:0;
  if(d.ucs){ucs.ox=+d.ucs.ox||0;ucs.oy=+d.ucs.oy||0;ucs.ang=+d.ucs.ang||0;}
  if(d.settings)Object.assign(settings,d.settings);
  if(d.osnap)Object.assign(osnap,d.osnap);
  nextObjId=Math.max(1,d.nextObjId|0);
  _layerMap=null;_idMap=null;
  dropInsaneObjects();
  ensureIds();                                 // and raise nextObjId past anything in the file
  selection.clear();editingBlock=null;hideRefeditBanner&&hideRefeditBanner();
  bumpGeom();
  if(d.view&&isFinite(d.view.scale)&&d.view.scale>0&&isFinite(d.view.ox)&&isFinite(d.view.oy)){
    view.ox=d.view.ox;view.oy=d.view.oy;view.scale=d.view.scale;
  } else zoomExtents();
  fileName=srcName||d.name||'Drawing1.lcad';
  refreshAfterLoad();
}
function refreshAfterLoad(){
  refreshToggleChips();updateScaleChip();updateLayerChip();renderLayers();
  renderProps();render();updateInfo();updateFileChip();
}
// the status-bar toggles are painted once at boot; a loaded drawing can change all of them
function refreshToggleChips(){
  const map={snap:'tSnap',ortho:'tOrtho',grid:'tGrid',polar:'tPolar',pickfirst:'tPick',dynInput:'tDyn'};
  for(const k in map){const el=document.getElementById(map[k]);if(el)el.classList.toggle('on',!!settings[k]);}
}

// ---- dirty state ----
function updateFileChip(){
  const chip=document.querySelector('.file-tab');
  if(chip){chip.textContent=fileName+(dirty?' *':'');chip.title=dirty?'Unsaved changes — Ctrl+S to save':'Saved';}
}
function markDirty(){if(!dirty){dirty=true;updateFileChip();}scheduleAutosave();}
function markClean(){dirty=false;updateFileChip();}
// pushUndo() is the one call every mutating command makes before it changes anything, so it
// is also the honest definition of "the document is about to change".
function onDocumentChanged(){markDirty();}

window.addEventListener('beforeunload',e=>{
  if(!dirty)return;
  e.preventDefault();e.returnValue='';   // the browser shows its own wording
});

// ---- autosave ----
let autosaveTimer=null,autosaveWarned=false;
function scheduleAutosave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(runAutosave,4000);}
function runAutosave(){
  if(editingBlock)return;               // mid block-edit the document holds loose _refedit parts
  saveSettings();   // the aids change from more places than the four dialogs; ride along here
  try{
    localStorage.setItem(LS_DRAWING,drawingJSON());
    autosaveWarned=false;
  }catch(err){
    // Almost always the ~5 MB localStorage quota on a large drawing. Say so once, and drop the
    // stale slot so a recovery prompt can never offer an out-of-date drawing.
    try{localStorage.removeItem(LS_DRAWING);}catch(e){}
    if(!autosaveWarned){autosaveWarned=true;echo('Autosave off — this drawing is too large for browser storage. Save to a file (Ctrl+S).');}
  }
}
function clearAutosave(){try{localStorage.removeItem(LS_DRAWING);}catch(e){}}

// ---- settings that outlive a reload ----
function saveSettings(){
  try{localStorage.setItem(LS_SETTINGS,JSON.stringify({settings,osnap,annoScale,gridSize}));}catch(e){}
}
function loadSettings(){
  let raw=null;try{raw=localStorage.getItem(LS_SETTINGS);}catch(e){return;}
  if(!raw)return;
  try{
    const s=JSON.parse(raw);
    if(s.settings)Object.assign(settings,s.settings);
    if(s.osnap)Object.assign(osnap,s.osnap);
    if(isFinite(s.annoScale)&&s.annoScale>0)annoScale=s.annoScale;
    if(isFinite(s.gridSize))gridSize=s.gridSize;
  }catch(e){}
}

// ---- a themed yes/no, so the file commands don't fall back to a native confirm() ----
function confirmDialog(opts){
  const old=document.getElementById('inputDlgOverlay');if(old)old.remove();
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:380px;max-width:90vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:12px">${opts.title||'Confirm'}</div>
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">${opts.message||''}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button id="cfmCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">${opts.cancelText||'Cancel'}</button>
        <button id="cfmOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">${opts.okText||'OK'}</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const done=v=>{ov.remove();opts.onDone&&opts.onDone(v);};
  // If the buttons cannot be found the dialog cannot ask, and a question that cannot be asked
  // has to answer "no" rather than throw — never "yes" on something the user did not confirm.
  const okBtn=ov.querySelector('#cfmOk'), cancelBtn=ov.querySelector('#cfmCancel');
  if(!okBtn||!cancelBtn){done(false);return;}
  okBtn.onclick=()=>done(true);
  cancelBtn.onclick=()=>done(false);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)done(false);});
  okBtn.focus();
}
// resolves true when it is safe to throw the current drawing away
function confirmDiscard(what){
  return new Promise(res=>{
    if(!dirty)return res(true);
    confirmDialog({
      title:'Unsaved changes',
      message:`"${fileName}" has changes that are not saved to a file. ${what||'Continue'} and lose them?`,
      okText:'Discard', cancelText:'Keep editing',
      onDone:res
    });
  });
}

// ---- commands ----
function newDrawing(){
  confirmDiscard('Start a new drawing').then(go=>{
    if(!go){echo('NEW: cancelled');return;}
    pushUndo();
    doc.objects=[];doc.blocks={};
    doc.layers=[{name:'Layer 1',color:'#3b82f6',on:true,frozen:false,locked:false,plot:true,linetype:'Continuous',lineweight:0.35}];
    doc.activeLayer=0;
    ucs.ox=0;ucs.oy=0;ucs.ang=0;
    selection.clear();editingBlock=null;
    _layerMap=null;_idMap=null;nextObjId=1;
    fileName='Drawing1.lcad';fileHandle=null;
    view.ox=W*0.5;view.oy=H*0.5;view.scale=1;
    bumpGeom();clearAutosave();markClean();
    refreshAfterLoad();
    echo('New drawing');
  });
}

async function saveDrawing(saveAs){
  if(editingBlock){echo('Finish the block edit first (REFCLOSE), then save.');return false;}
  const json=drawingJSON();
  if(HAS_FS){
    try{
      if(saveAs||!fileHandle){
        fileHandle=await window.showSaveFilePicker({
          suggestedName:fileName,
          types:[{description:'LumoCAD drawing',accept:{'application/json':['.lcad']}}]
        });
        fileName=fileHandle.name||fileName;
      }
      const w=await fileHandle.createWritable();
      await w.write(json);await w.close();
      markClean();updateFileChip();echo(`Saved ${fileName}`);
      return true;
    }catch(err){
      if(err&&err.name==='AbortError'){echo('Save cancelled');return false;}
      // No permission, or a browser that advertises the API but refuses here — fall back.
      fileHandle=null;
      echo('Could not write the file directly — saving to your downloads folder instead');
    }
  }
  downloadText(fileName,json);
  markClean();echo(`Saved ${fileName} to your downloads folder`);
  return true;
}

function loadDrawingText(text,name){
  let d;
  try{d=JSON.parse(text);}catch(e){echo('OPEN: that file is not a LumoCAD drawing (bad JSON)');return false;}
  try{applyDrawing(d,name);}
  catch(err){echo('OPEN: '+err.message);return false;}
  markClean();clearAutosave();
  echo(`Opened ${fileName} — ${doc.objects.length} object(s)`);
  return true;
}

async function openDrawing(){
  if(!(await confirmDiscard('Open another drawing'))){echo('OPEN: cancelled');return;}
  if(HAS_FS){
    try{
      const [h]=await window.showOpenFilePicker({
        types:[{description:'LumoCAD drawing',accept:{'application/json':['.lcad','.json']}}]
      });
      const f=await h.getFile();
      if(loadDrawingText(await f.text(),f.name))fileHandle=h;
      return;
    }catch(err){
      if(err&&err.name==='AbortError'){echo('OPEN: cancelled');return;}
      echo('Could not use the file picker — choose the file from the browser dialog instead');
    }
  }
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.lcad,.json';inp.style.display='none';
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];inp.remove();
    if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{fileHandle=null;loadDrawingText(String(rd.result),f.name);};
    rd.readAsText(f);
  };
  document.body.appendChild(inp);inp.click();
}

// ---- crash recovery ----
// Offered once, at boot, and only when there is something worth offering.
function offerRecovery(){
  let raw=null;try{raw=localStorage.getItem(LS_DRAWING);}catch(e){return;}
  if(!raw)return;
  let d;
  try{d=JSON.parse(raw);}catch(e){clearAutosave();return;}
  if(!d||!Array.isArray(d.objects)||!d.objects.length){clearAutosave();return;}
  const when=d.saved?new Date(d.saved):null;
  const ago=when?`${when.toLocaleDateString()} ${when.toLocaleTimeString()}`:'an earlier session';
  confirmDialog({
    title:'Recover unsaved drawing',
    message:`LumoCAD was closed with <b>${d.objects.length}</b> object(s) in "<b>${d.name||'Drawing1.lcad'}</b>" that were never saved to a file.<br><br>Autosaved ${ago}.`,
    okText:'Restore', cancelText:'Discard',
    onDone:go=>{
      if(!go){clearAutosave();echo('Autosaved drawing discarded');return;}
      try{
        applyDrawing(d,d.name);
        dirty=true;updateFileChip();       // recovered, but still not in a file anywhere
        echo(`Recovered ${doc.objects.length} object(s) — save to a file with Ctrl+S`);
      }catch(err){echo('Could not recover the autosaved drawing: '+err.message);clearAutosave();}
    }
  });
}

// ---- register the commands ----
COMMANDS.NEW={aliases:['NEW','QNEW'],name:'New',grp:'file'};
COMMANDS.OPEN={aliases:['OPEN','LOAD'],name:'Open',grp:'file'};
COMMANDS.SAVE={aliases:['SAVE','QSAVE'],name:'Save',grp:'file'};
COMMANDS.SAVEAS={aliases:['SAVEAS','SA'],name:'Save As',grp:'file'};
