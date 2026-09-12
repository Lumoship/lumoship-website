// ============================================================
//  LumoCAD — AutoCAD working habits
// ============================================================
// The point of this module is muscle memory: the aliases people already have in their
// fingers, the command line behaving the way acad.pgp trained it, ZOOM and PAN as real
// commands you can run in the middle of another one, a clipboard on Ctrl+C/X/V, and a
// scrollback you reach with the up arrow and F2.

// ============================================================
//  1. ALIASES — aligned with acad.pgp
// ============================================================
// Where our alias table disagreed with AutoCAD it was our table that was wrong, and the
// disagreements were the expensive kind: DI ran a linear dimension instead of DIST, and RE
// redid instead of regenerating. Both are now what a draughtsman expects.
const ACAD_ALIASES={
  // draw
  LINE:['L'], PLINE:['PL'], CIRCLE:['C'], ARC:['A'], ELLIPSE:['EL'], SPLINE:['SPL'],
  RECT:['REC','RECTANG','RECTANGLE'], POLYGON:['POL'], POINT:['PO'], XLINE:['XL'], RAY:[],
  REVCLOUD:['RC','CLOUD'],
  // annotate
  TEXT:['DT','DTEXT'], MTEXT:['T','MT'], HATCH:['H','BH','BHATCH'],
  LEADER:['LE','QLEADER'], MLEADER:['MLD','ML'],
  DIM:['DLI','DIMLIN','DIMLINEAR'], DIMALIGNED:['DAL','DIMALI'], DIMANGULAR:['DAN','DIMANG'],
  DIMRADIUS:['DRA','DIMRAD'], DIMDIAMETER:['DDI','DIMDIA'],
  DIMCONTINUE:['DCO','DIMCONT'], DIMBASELINE:['DBA','DIMBASE'],
  SHEET:['PAPER','TITLEBLOCK'],
  // modify
  MOVE:['M'], COPY:['CO','CP'], ROTATE:['RO'], SCALE:['SC'], MIRROR:['MI'], OFFSET:['O'],
  TRIM:['TR'], EXTEND:['EX'], FILLET:['F'], CHAMFER:['CHA'], BREAK:['BR'], LENGTHEN:['LEN'],
  STRETCH:['S'], JOIN:['J'], EXPLODE:['X'], MATCHPROP:['MA','PAINTER'], ALIGN:['AL'],
  ERASE:['E','DEL'], ARRAY:['AR'], DIVIDE:['DIV'], MEASURE:['ME'],
  BLOCK:['B','BMAKE'], INSERT:['I','DDINSERT'], REFEDIT:['BEDIT','BE'], REFCLOSE:[],
  // view / inquiry
  ZOOM:['Z'], PAN:['P'], ZOOMEXT:['ZE'], REGEN:['RE'], REDRAW:['R'],
  DIST:['DI'], ID:[], AREA:['AA'], LIST:['LI','LS'], MASSPROP:['MP'], REGION:['REG'],
  SELECTALL:['SELALL'], UNDO:['U'], REDO:[], LAYER:['LA','DDLMODES'],
  UCS:[], UCSWORLD:['UCSW','WORLD'], PURGE:['PU'],
  // clipboard
  COPYCLIP:['CC'], CUTCLIP:['CUT'], PASTECLIP:['PA','PASTE'],
  // file
  NEW:['QNEW'], OPEN:['LOAD'], SAVE:['QSAVE'], SAVEAS:['SA'],
  DXFOUT:['SAVEDXF','EXPORT'], DXFIN:['OPENDXF','IMPORT'], PDFOUT:['PLOT','PRINT','PDF'],
  // settings
  OSNAP:['OS','DS','SE','DSETTINGS','DDOSNAP'], PICKFIRST:['PICK'],
  ANNOSCALE:['DRAWSCALE','DSCALE','SCALELISTEDIT'], GRIDSET:['GRIDSIZE','GS'],
  CURSORSIZE:['CURSOR','CROSSHAIR','CHSIZE'],
};

// ============================================================
//  2. NEW COMMANDS
// ============================================================
// DIST is what the old MEASURE command always was — two points and a readout. The name is
// now AutoCAD's, which frees MEASURE to mean what AutoCAD means by it: markers every N mm.
COMMANDS.DIST={aliases:['DI','DIST'],name:'Distance',grp:'view'};
COMMANDS.MEASURE={aliases:['ME','MEASURE'],name:'Measure',grp:'modify'};
COMMANDS.ZOOM={aliases:['Z','ZOOM'],name:'Zoom',grp:'view'};
COMMANDS.PAN={aliases:['P','PAN'],name:'Pan',grp:'view'};
COMMANDS.REGEN={aliases:['RE','REGEN'],name:'Regen',grp:'view'};
COMMANDS.REDRAW={aliases:['R','REDRAW'],name:'Redraw',grp:'view'};
COMMANDS.ID={aliases:['ID'],name:'ID Point',grp:'view'};
COMMANDS.PURGE={aliases:['PU','PURGE'],name:'Purge',grp:'view'};
COMMANDS.COPYCLIP={aliases:['CC','COPYCLIP'],name:'Copy Clip',grp:'modify'};
COMMANDS.CUTCLIP={aliases:['CUT','CUTCLIP'],name:'Cut Clip',grp:'modify'};
COMMANDS.PASTECLIP={aliases:['PA','PASTE','PASTECLIP'],name:'Paste',grp:'modify'};

// apply the alias table over whatever each command was declared with
(function applyAliases(){
  for(const key in ACAD_ALIASES){
    if(!COMMANDS[key])continue;
    const set=new Set([key,...ACAD_ALIASES[key]]);
    COMMANDS[key].aliases=[...set];
  }
})();
// An alias that resolves to two commands silently picks whichever the key order reaches
// first, which is exactly the kind of thing that only shows up as "why did that run?".
// Called at the very end of this file, once every command has been registered.
function checkAliasClashes(){
  const seen=new Map(),clashes=[];
  for(const key in COMMANDS)for(const a of COMMANDS[key].aliases){
    if(seen.has(a)&&seen.get(a)!==key)clashes.push(`${a}: ${seen.get(a)} / ${key}`);
    else seen.set(a,key);
  }
  if(clashes.length)console.warn('LumoCAD: duplicate command aliases —',clashes.join(', '));
  return clashes;
}

// ============================================================
//  3. VIEW STACK — what ZOOM Previous walks back through
// ============================================================
const viewStack=[];
function pushView(){
  const last=viewStack[viewStack.length-1];
  if(last&&last.ox===view.ox&&last.oy===view.oy&&last.scale===view.scale)return;
  viewStack.push({ox:view.ox,oy:view.oy,scale:view.scale});
  if(viewStack.length>32)viewStack.shift();
}
function popView(){
  const v=viewStack.pop();
  if(!v){echo('ZOOM: no previous view');return false;}
  view.ox=v.ox;view.oy=v.oy;view.scale=v.scale;render();updateInfo();return true;
}
// A single clamp, so the wheel, ZOOM Scale and the nav buttons all agree. The old floor of
// 0.02 capped the widest view at about 67 m, which is not enough to see a hull.
const ZOOM_MIN=1e-5, ZOOM_MAX=5000;
function clampZoom(s){return Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,s));}
// zoom about a fixed screen point, so the geometry under the cursor stays put
function zoomAbout(px,py,factor){
  const before=s2w(px,py);
  view.scale=clampZoom(view.scale*factor);
  const after=s2w(px,py);
  view.ox+=(after.x-before.x)*view.scale;
  view.oy-=(after.y-before.y)*view.scale;
}
function zoomToRect(a,b){
  const w=Math.abs(b.x-a.x), h=Math.abs(b.y-a.y);
  if(w<1e-9||h<1e-9){echo('ZOOM: that window has no area');return;}
  pushView();
  view.scale=clampZoom(Math.min(W/w,H/h));
  view.ox=W/2-(a.x+b.x)/2*view.scale;
  view.oy=H/2+(a.y+b.y)/2*view.scale;
  render();updateInfo();
}
function zoomToObjects(objs){
  if(!objs.length){echo('ZOOM Object: nothing selected');return;}
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  const fin=v=>typeof v==='number'&&isFinite(v);
  for(const o of objs){
    for(const p of objPoints(o)){if(!fin(p[0])||!fin(p[1]))continue;a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1]);}
    if((o.type==='circle'||o.type==='arc')&&fin(o.cx)&&fin(o.r)){a=Math.min(a,o.cx-o.r);c=Math.max(c,o.cx+o.r);b=Math.min(b,o.cy-o.r);d=Math.max(d,o.cy+o.r);}
  }
  if(!isFinite(a)){echo('ZOOM Object: nothing measurable');return;}
  const mx=(c-a)*0.06||10, my=(d-b)*0.06||10;
  zoomToRect({x:a-mx,y:b-my},{x:c+mx,y:d+my});
}

// ---- ZOOM, with the options AutoCAD offers ----
const ZOOM_PROMPT='ZOOM: drag a window, or type A(ll) E(xtents) P(revious) O(bject) or a scale like 2X';
function startZoom(){
  cmd.active='ZOOM';cmd.step=0;cmd.pts=[];cmd.data={};
  echo(ZOOM_PROMPT,true);render();
}
// Returns true when the token was a recognised ZOOM option. Used both by the ZOOM command
// itself and by the transparent form, where there is no command state to drive.
function zoomOption(tok){
  const t=String(tok||'').trim().toUpperCase();
  if(t==='A'||t==='ALL'||t==='E'||t==='EXTENTS'){pushView();zoomExtents();echo('Zoomed to extents');return true;}
  if(t==='P'||t==='PREVIOUS'){popView();echo('Previous view');return true;}
  if(t==='O'||t==='OBJECT'){pushView();zoomToObjects(selObjects());return true;}
  if(t==='W'||t==='WINDOW'){cmd.active='ZOOM';cmd.step=0;cmd.pts=[];echo('ZOOM: pick the first corner of the window',true);return 'window';}
  // a scale: "2X" / "0.5x" relative to the current view, or a bare number as an absolute zoom
  const m=/^([0-9]*\.?[0-9]+)\s*(X?)$/.exec(t);
  if(m){
    const v=parseFloat(m[1]);
    if(!(v>0)){echo('ZOOM: the scale has to be greater than zero');return true;}
    pushView();
    view.scale=clampZoom(m[2]==='X'?view.scale*v:v);
    render();updateInfo();echo(`Zoom scale ${m[2]==='X'?v+'x':v}`);
    return true;
  }
  return false;
}

// ---- PAN as a command: left-drag moves the view until Esc or Enter ----
let panMode=false;
function startPan(){
  panMode=true;wrap.classList.add('panning');
  echo('PAN: drag to move the view — Esc or Enter to stop',true);
}
function stopPan(){
  if(!panMode)return false;
  panMode=false;wrap.classList.remove('panning');
  echo('PAN: done');render();
  return true;
}
function panModeActive(){return panMode;}

// ---- the small ones ----
function doRegen(){
  _layerMap=null;_idMap=null;
  for(const o of doc.objects){delete o._bb;delete o._bbV;}
  bumpGeom();render();updateInfo();echo('Regenerating model.');
}
function doRedraw(){render();echo('Redrawn');}
function startId(){cmd.active='ID';cmd.step=0;cmd.pts=[];echo('ID: pick a point',true);render();}
function reportId(p){
  const u=ucsActive()?world2ucs(p.x,p.y):p;
  echo(`X = ${u.x.toFixed(3)}   Y = ${u.y.toFixed(3)}${ucsActive()?'   (UCS)':''}`);
  endCmd();render();
}
// PURGE: drop block definitions nothing references, and empty layers nobody is standing on.
function doPurge(){
  const usedBlocks=new Set(doc.objects.filter(o=>o.type==='block').map(o=>o.name));
  const deadBlocks=Object.keys(doc.blocks).filter(n=>!usedBlocks.has(n));
  const usedLayers=new Set(doc.objects.map(o=>o.layer));
  const deadLayers=doc.layers.filter((l,i)=>!usedLayers.has(l.name)&&i!==doc.activeLayer);
  if(!deadBlocks.length&&!deadLayers.length){echo('PURGE: nothing unused to remove');return;}
  confirmDialog({
    title:'Purge',
    message:`Remove ${deadBlocks.length} unused block definition(s) and ${deadLayers.length} empty layer(s)?`,
    okText:'Purge',
    onDone:go=>{
      if(!go){echo('PURGE: cancelled');return;}
      pushUndo();
      deadBlocks.forEach(n=>{delete doc.blocks[n];});
      if(doc.layers.length-deadLayers.length>=1){
        const kill=new Set(deadLayers.map(l=>l.name));
        const active=doc.layers[doc.activeLayer].name;
        doc.layers=doc.layers.filter(l=>!kill.has(l.name));
        doc.activeLayer=Math.max(0,doc.layers.findIndex(l=>l.name===active));
        _layerMap=null;
      }
      echo(`Purged ${deadBlocks.length} block(s) and ${deadLayers.length} layer(s)`);
      renderLayers();updateLayerChip();render();updateInfo();
    }
  });
}

// ---- MEASURE: markers every N units along an object (AutoCAD's MEASURE, not DIST) ----
function walkObject(o,step,cb){
  if(o.type==='line'){
    const L=Math.hypot(o.x2-o.x1,o.y2-o.y1);
    for(let d=step;d<L-1e-9;d+=step){const t=d/L;cb(o.x1+(o.x2-o.x1)*t,o.y1+(o.y2-o.y1)*t);}
  } else if(o.type==='circle'){
    const C=2*Math.PI*o.r;
    for(let d=0;d<C-1e-9;d+=step){const a=d/o.r;cb(o.cx+o.r*Math.cos(a),o.cy+o.r*Math.sin(a));}
  } else if(o.type==='arc'){
    let span=o.a2-o.a1;while(span<0)span+=2*Math.PI;
    const L=span*o.r;
    for(let d=step;d<L-1e-9;d+=step){const a=o.a1+d/o.r;cb(o.cx+o.r*Math.cos(a),o.cy+o.r*Math.sin(a));}
  } else if(o.type==='pline'||o.type==='rect'){
    const segs=objAsSegments(o);
    let carry=step;
    for(const s of segs){
      const L=Math.hypot(s[2]-s[0],s[3]-s[1]);
      let d=carry;
      while(d<L-1e-9){const t=d/L;cb(s[0]+(s[2]-s[0])*t,s[1]+(s[3]-s[1])*t);d+=step;}
      carry=d-L;
    }
  } else return false;
  return true;
}
function doMeasure(p){
  if(cmd.data.len==null){echo('MEASURE: type the segment length first',true);return;}
  const i=pickObject(p.x,p.y);
  if(i<0){echo('MEASURE: click a line, polyline, rectangle, circle or arc');return;}
  const o=doc.objects[i];const step=cmd.data.len;
  if(!(step>0)){echo('MEASURE: the length has to be greater than zero');endCmd();return;}
  pushUndo();let placed=0;
  const okType=walkObject(o,step,(x,y)=>{add({type:'point',layer:o.layer,x,y});placed++;});
  if(!okType){popUndoQuiet();echo('MEASURE: that object type isn’t supported');endCmd();return;}
  echo(`Measured every ${step} — ${placed} point(s) placed`);
  endCmd();render();updateInfo();
}

// ============================================================
//  4. CLIPBOARD — Ctrl+C / Ctrl+X / Ctrl+V
// ============================================================
// Internal to the app: the OS clipboard cannot carry geometry, and pasting between two
// LumoCAD windows would need a shared origin anyway.
let clipboard=null;   // {objects:[...], base:{x,y}}
function clipBounds(objs){
  let a=Infinity,b=Infinity;
  for(const o of objs)for(const p of objPoints(o)){
    if(typeof p[0]!=='number'||!isFinite(p[0]))continue;
    a=Math.min(a,p[0]);b=Math.min(b,p[1]);
  }
  return isFinite(a)?{x:a,y:b}:{x:0,y:0};
}
function doCopyClip(cut){
  const objs=selObjects();
  if(!objs.length){echo(`${cut?'CUTCLIP':'COPYCLIP'}: select objects first`);return;}
  clipboard={objects:objs.map(copyObj),base:clipBounds(objs)};
  if(cut){
    pushUndo();
    idsToIndices(selection).forEach(i=>doc.objects.splice(i,1));
    selection.clear();renderProps();render();updateInfo();
  }
  echo(`${objs.length} object(s) ${cut?'cut to':'copied to'} the clipboard`);
}
function startPaste(){
  if(!clipboard||!clipboard.objects.length){echo('PASTECLIP: the clipboard is empty');endCmd();return;}
  cmd.active='PASTECLIP';cmd.step=0;cmd.pts=[];cmd.data={};
  echo(`PASTECLIP: specify the insertion point for ${clipboard.objects.length} object(s)`,true);
  render();
}
function pasteObjectsAt(p){
  const dx=p.x-clipboard.base.x, dy=p.y-clipboard.base.y;
  pushUndo();
  const placed=[];
  for(const src of clipboard.objects){const c=copyObj(src);translateObj(c,dx,dy);placed.push(pushObj(c));}
  selection.clear();placed.forEach(o=>selection.add(o.id));
  echo(`Pasted ${placed.length} object(s)`);
  endCmd();renderProps();render();updateInfo();
}
function pastePreview(p){
  if(!clipboard)return null;
  const dx=p.x-clipboard.base.x, dy=p.y-clipboard.base.y;
  return clipboard.objects.map(src=>{const c=copyObj(src);translateObj(c,dx,dy);return c;});
}

// ============================================================
//  5. COMMAND HISTORY — up arrow, and F2 for the text window
// ============================================================
const cmdHistory=[];        // what was typed, newest last
let histCursor=-1;          // -1 = not recalling
const textLog=[];           // everything echo() has said, for the F2 window
function logLine(s){textLog.push(s);if(textLog.length>500)textLog.shift();}
function rememberCommand(text){
  const t=String(text||'').trim();
  if(!t)return;
  if(cmdHistory[cmdHistory.length-1]!==t)cmdHistory.push(t);
  if(cmdHistory.length>200)cmdHistory.shift();
  histCursor=-1;
}
function recallCommand(dir){          // dir -1 = older, +1 = newer
  if(!cmdHistory.length)return false;
  if(histCursor===-1)histCursor=cmdHistory.length;
  histCursor=Math.max(0,Math.min(cmdHistory.length,histCursor+dir));
  cmdInput.value=(histCursor>=cmdHistory.length)?'':cmdHistory[histCursor];
  cmdInput.setSelectionRange(cmdInput.value.length,cmdInput.value.length);
  return true;
}
function toggleTextWindow(){
  const open=document.getElementById('textWindow');
  if(open){open.remove();return;}
  const ov=document.createElement('div');ov.id='textWindow';
  ov.style.cssText='position:fixed;left:0;right:0;bottom:0;height:46vh;z-index:9000;background:var(--bg-secondary);border-top:1px solid var(--border);box-shadow:0 -16px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column';
  ov.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);font-family:var(--font-display);font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-secondary)">
      <span style="width:7px;height:7px;border-radius:50%;background:var(--accent)"></span>LumoCAD Text Window
      <span style="margin-left:auto;color:var(--text-muted);text-transform:none;letter-spacing:0;font-family:var(--font-body)">F2 to close</span>
    </div>
    <div id="twBody" style="flex:1;overflow:auto;padding:10px 14px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap"></div>`;
  document.body.appendChild(ov);
  const body=ov.querySelector('#twBody');
  body.textContent=textLog.join('\n');
  body.scrollTop=body.scrollHeight;
}

// ============================================================
//  6. WIRING — the hooks the rest of the app calls into
// ============================================================
// Commands that finish on the spot, with no points to pick. startCommand() checks this table
// before it does anything else, so adding one here is all it takes.
const ACAD_INSTANT={
  REGEN:doRegen, REDRAW:doRedraw, PURGE:doPurge,
  COPYCLIP:()=>doCopyClip(false), CUTCLIP:()=>doCopyClip(true),
};
// Commands that take over startCommand and then wait for input of their own.
const ACAD_START={
  ZOOM:startZoom, PAN:startPan, ID:startId, PASTECLIP:startPaste,
  MEASURE:()=>{cmd.active='MEASURE';cmd.step=0;cmd.data={len:null};echo('MEASURE: type the segment length, then click a line/polyline/circle/arc',true);render();},
  DIST:()=>{cmd.active='DIST';cmd.step=0;cmd.pts=[];echo('DIST: specify the first point',true);render();},
};
// Point handlers for the commands above, checked at the top of feedPoint().
const ACAD_FEED={
  ID:reportId,
  MEASURE:doMeasure,
  PASTECLIP:pasteObjectsAt,
  ZOOM:p=>{
    cmd.pts.push(p);
    if(cmd.pts.length===1){echo('ZOOM: pick the opposite corner',true);render();return;}
    zoomToRect(cmd.pts[0],cmd.pts[1]);endCmd();render();
  },
  DIST:p=>{
    cmd.pts.push(p);
    if(cmd.pts.length===1){echo('DIST: specify the second point',true);render();return;}
    const a=cmd.pts[0],b=cmd.pts[1];
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
    const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
    echo(`Distance = ${d.toFixed(3)}   Angle = ${ang.toFixed(2)}°   ΔX = ${dx.toFixed(3)}   ΔY = ${dy.toFixed(3)}`);
    endCmd();render();
  },
};
// Typed values (the command line) for the commands above, checked at the top of feedValue().
const ACAD_VALUE={
  ZOOM:v=>{const r=zoomOption(v);if(r===true&&cmd.active==='ZOOM')endCmd();return !!r;},
  MEASURE:v=>{const n=parseFloat(v);if(!(n>0)){echo('MEASURE: type a length greater than zero',true);return true;}cmd.data.len=n;echo(`MEASURE: every ${n} — now click the object`,true);return true;},
};
// Commands that may be run in the middle of another one, AutoCAD's transparent commands.
// These are the ones that touch only the view or the settings, never the command state, so
// they need no suspend-and-resume machinery — they simply do not clear cmd.
const TRANSPARENT={ZOOM:1,PAN:1,REGEN:1,REDRAW:1,OSNAP:1,ID:1,LAYER:1};
// Run one transparently. Returns true when it handled the input.
function runTransparent(key,rest){
  if(key==='ZOOM'){
    if(/^W(INDOW)?$/i.test(rest||'')&&cmd.active){echo("ZOOM Window can't run inside another command — use A, E, P, O or a scale");return true;}
    if(rest&&zoomOption(rest))return true;
    if(!rest){pushView();zoomExtents();echo('Zoomed to extents');return true;}
    echo(`ZOOM: '${rest}' is not a zoom option (A E P O, or a scale like 2X)`);return true;
  }
  if(key==='PAN'){startPan();return true;}
  if(key==='REGEN'){doRegen();return true;}
  if(key==='REDRAW'){doRedraw();return true;}
  if(key==='OSNAP'){openOsnapDialog();return true;}
  if(key==='LAYER'){openLayerManager();return true;}
  return false;
}
// Split "'Z E" or "Z E" into the command and the rest of the line.
function splitCommandLine(v){
  const t=String(v).trim().replace(/^'/,'');
  const sp=t.search(/\s/);
  return sp<0?{head:t,rest:''}:{head:t.slice(0,sp),rest:t.slice(sp+1).trim()};
}

// ============================================================
//  7. LAYER TOOLS — the express-tools commands, by muscle memory
// ============================================================
// Freeze, lock and plot are layer properties (10-core.js seeds them, 20-render.js reads
// them). These are the click-an-object shortcuts that make them usable without opening the
// layer manager every time.

// Anything on a hidden, frozen or locked layer must not stay selected.
function dropUneditableFromSelection(){
  let dropped=0;
  for(const id of [...selection]){
    const o=byId(id);
    if(!o||!layerEditable(o.layer)){selection.delete(id);dropped++;}
  }
  if(dropped){renderProps();render();}
  return dropped;
}

let isolatedLayers=null;   // the on/off state LAYISO replaced, so LAYUNISO can put it back

function layerOfPick(p,label){
  const i=pickObject(p.x,p.y,{ignoreLocks:true});
  if(i<0){echo(`${label}: click an object on the layer you mean`);return null;}
  const l=layerByName(doc.objects[i].layer);
  if(!l){echo(`${label}: that object has no layer`);return null;}
  return l;
}
// Build a command that picks one object and does something to its layer.
function layerPickCommand(key,label,apply){
  ACAD_START[key]=()=>{cmd.active=key;cmd.step=0;echo(`${label}: click an object on the layer you want`,true);render();};
  ACAD_FEED[key]=p=>{
    const l=layerOfPick(p,label);
    if(l){pushUndo();apply(l);renderLayers();updateLayerChip();renderProps();render();updateInfo();}
    endCmd();render();
  };
}

COMMANDS.LAYFRZ={aliases:['LAYFRZ','FREEZE'],name:'Freeze Layer',grp:'view'};
COMMANDS.LAYTHW={aliases:['LAYTHW','THAW'],name:'Thaw All',grp:'view'};
COMMANDS.LAYLCK={aliases:['LAYLCK','LOCK'],name:'Lock Layer',grp:'view'};
COMMANDS.LAYULK={aliases:['LAYULK','UNLOCK'],name:'Unlock Layer',grp:'view'};
COMMANDS.LAYOFF={aliases:['LAYOFF'],name:'Layer Off',grp:'view'};
COMMANDS.LAYON={aliases:['LAYON'],name:'All Layers On',grp:'view'};
COMMANDS.LAYISO={aliases:['LAYISO'],name:'Isolate Layer',grp:'view'};
COMMANDS.LAYUNISO={aliases:['LAYUNISO'],name:'Un-isolate',grp:'view'};
COMMANDS.LAYMCUR={aliases:['LAYMCUR','SETLAYER'],name:'Make Current',grp:'view'};

layerPickCommand('LAYFRZ','LAYFRZ',l=>{
  if(doc.layers.indexOf(l)===doc.activeLayer){popUndoQuiet();echo('LAYFRZ: cannot freeze the current layer');return;}
  l.frozen=true;dropUneditableFromSelection();echo(`Layer "${l.name}" frozen`);
});
layerPickCommand('LAYLCK','LAYLCK',l=>{l.locked=true;dropUneditableFromSelection();echo(`Layer "${l.name}" locked`);});
layerPickCommand('LAYULK','LAYULK',l=>{l.locked=false;echo(`Layer "${l.name}" unlocked`);});
layerPickCommand('LAYOFF','LAYOFF',l=>{
  if(doc.layers.indexOf(l)===doc.activeLayer){popUndoQuiet();echo('LAYOFF: cannot turn off the current layer');return;}
  l.on=false;dropUneditableFromSelection();echo(`Layer "${l.name}" turned off`);
});
layerPickCommand('LAYMCUR','LAYMCUR',l=>{doc.activeLayer=doc.layers.indexOf(l);echo(`Current layer is now "${l.name}"`);});
layerPickCommand('LAYISO','LAYISO',l=>{
  isolatedLayers=doc.layers.map(x=>({name:x.name,on:x.on!==false,frozen:!!x.frozen}));
  for(const x of doc.layers)if(x!==l)x.on=false;
  l.on=true;l.frozen=false;
  doc.activeLayer=doc.layers.indexOf(l);
  dropUneditableFromSelection();
  echo(`Isolated layer "${l.name}" — LAYUNISO to bring the others back`);
});

ACAD_INSTANT.LAYTHW=()=>{
  const n=doc.layers.filter(l=>l.frozen).length;
  if(!n){echo('LAYTHW: nothing is frozen');return;}
  pushUndo();doc.layers.forEach(l=>{l.frozen=false;});
  echo(`Thawed ${n} layer(s)`);renderLayers();render();updateInfo();
};
ACAD_INSTANT.LAYON=()=>{
  const n=doc.layers.filter(l=>l.on===false).length;
  if(!n){echo('LAYON: every layer is already on');return;}
  pushUndo();doc.layers.forEach(l=>{l.on=true;});
  echo(`Turned on ${n} layer(s)`);renderLayers();render();updateInfo();
};
ACAD_INSTANT.LAYUNISO=()=>{
  if(!isolatedLayers){echo('LAYUNISO: no layer was isolated');return;}
  pushUndo();
  for(const saved of isolatedLayers){
    const l=layerByName(saved.name);
    if(l){l.on=saved.on;l.frozen=saved.frozen;}
  }
  isolatedLayers=null;
  echo('Layers restored');renderLayers();render();updateInfo();
};

checkAliasClashes();
