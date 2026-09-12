// ============================================================
//  LumoCAD — status bar, keyboard, dynamic input, autocomplete, boot
// ============================================================
function _navZoom(factor){
  const r=cv.getBoundingClientRect();const px=r.width/2,py=r.height/2;
  const before=s2w(px,py);
  view.scale=Math.max(0.02,Math.min(5000,view.scale*factor));
  const after=s2w(px,py);view.ox+=(after.x-before.x)*view.scale;view.oy-=(after.y-before.y)*view.scale;
  updateInfo();render();
}
document.getElementById('navZoomIn').onclick=()=>_navZoom(1.3);
document.getElementById('navZoomOut').onclick=()=>_navZoom(1/1.3);
document.getElementById('navExt').onclick=()=>zoomExtents();
// command reference panel open/close
const rightPanel=document.getElementById('right');
document.getElementById('refToggle').onclick=()=>rightPanel.classList.toggle('open');
document.getElementById('refClose').onclick=()=>rightPanel.classList.remove('open');

function zoomExtents(){
  if(!doc.objects.length){view.scale=1;view.ox=W/2;view.oy=H/2;render();updateInfo();return;}
  let a=1e9,b=1e9,c=-1e9,d=-1e9,seen=0;
  const fin=v=>typeof v==='number'&&isFinite(v);
  // One entity with a broken coordinate used to set view.ox/oy to NaN and blank the canvas.
  // Skip what we cannot measure instead, and fall back to a default view if nothing measures.
  for(const o of doc.objects){if(o.construction||layerFrozen(o.layer))continue;
    for(const p of objPoints(o)){if(!fin(p[0])||!fin(p[1]))continue;a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1]);seen++;}
    if((o.type==='circle'||o.type==='arc')&&fin(o.cx)&&fin(o.cy)&&fin(o.r)){a=Math.min(a,o.cx-o.r);c=Math.max(c,o.cx+o.r);b=Math.min(b,o.cy-o.r);d=Math.max(d,o.cy+o.r);seen++;}}
  if(!seen){view.scale=1;view.ox=W/2;view.oy=H/2;render();updateInfo();echo('Zoom extents: nothing measurable in the drawing');return;}
  const w=c-a||10,h=d-b||10;view.scale=Math.min(W/(w*1.25),H/(h*1.25));view.ox=W/2-(a+c)/2*view.scale;view.oy=H/2+(b+d)/2*view.scale;updateInfo();render();
}

// ============================================================
//  KEYBOARD
// ============================================================
const cmdInput=document.getElementById('cmdInput');

// ============================================================
//  DYNAMIC INPUT  — AutoCAD-style live dimension fields by the cursor.
//  Shows the size of what you're drawing (length+angle, width×height, radius...).
//  Press Tab to jump into a field and type an exact value; Enter applies it.
// ============================================================
const dynEl=document.createElement('div');dynEl.id='dynInput';document.body.appendChild(dynEl);
let dynActive=false;      // are we in keyboard-edit mode (user pressed Tab / typed)?
let dynFocusIdx=0;        // which field is being edited
let dynSpec=null;         // current field spec [{key,label,unit}]
let dynScreen={x:0,y:0};  // last cursor screen pos

// What fields does the active command show, and their live values from the cursor?
function dynFieldsFor(){
  if(!cmd.active||!cursor)return null;
  const k=cmd.active, ref=lastPoint();
  const fmt=v=>(Math.round(v*100)/100).toString();
  // length + angle relative to the previous point
  const lenAng=()=>{
    if(!ref)return null;
    const dx=cursor.x-ref.x,dy=cursor.y-ref.y;const len=Math.hypot(dx,dy);
    let ang=Math.atan2(dy,dx)*180/Math.PI;if(ang<0)ang+=360;
    return [{key:'len',label:'',unit:'',val:fmt(len)},{key:'ang',label:'∠',unit:'°',val:fmt(ang)}];
  };
  if(k==='LINE'&&ref)return lenAng();
  if(k==='PLINE'&&ref)return lenAng();
  if(k==='RECT'&&cmd.step===1&&cmd.pts[0]){
    const c=cmd.pts[0];return [{key:'w',label:'W',unit:'',val:fmt(Math.abs(cursor.x-c.x))},{key:'h',label:'H',unit:'',val:fmt(Math.abs(cursor.y-c.y))}];
  }
  if(k==='CIRCLE'&&cmd.step===1&&cmd.pts[0]){const c=cmd.pts[0];return [{key:'r',label:'R',unit:'',val:fmt(Math.hypot(cursor.x-c.x,cursor.y-c.y))}];}
  if(k==='POLYGON'&&cmd.step===1&&cmd.pts[0]){const c=cmd.pts[0];return [{key:'r',label:'R',unit:'',val:fmt(Math.hypot(cursor.x-c.x,cursor.y-c.y))}];}
  if(k==='ELLIPSE'&&cmd.pts.length>=1){const c=cmd.pts[0];return [{key:'len',label:'A',unit:'',val:fmt(Math.hypot(cursor.x-c.x,cursor.y-c.y))}];}
  if((k==='MOVE'||k==='COPY'||k==='STRETCH')&&cmd.step===1&&cmd.data&&cmd.data.base)
    {const b=cmd.data.base;const dx=cursor.x-b.x,dy=cursor.y-b.y;let ang=Math.atan2(dy,dx)*180/Math.PI;if(ang<0)ang+=360;return [{key:'len',label:'',unit:'',val:fmt(Math.hypot(dx,dy))},{key:'ang',label:'∠',unit:'°',val:fmt(ang)}];}
  if(k==='ROTATE'&&cmd.step===1&&cmd.data&&cmd.data.base){const b=cmd.data.base;let ang=Math.atan2(cursor.y-b.y,cursor.x-b.x)*180/Math.PI;if(ang<0)ang+=360;return [{key:'ang',label:'∠',unit:'°',val:fmt(ang)}];}
  return null;
}

function updateDynInput(clientX,clientY){
  if(typeof clientX==='number')dynScreen={x:clientX,y:clientY};
  if(!settings.dynInput){dynEl.classList.remove('on');return;}
  const spec=dynFieldsFor();
  if(!spec){dynEl.classList.remove('on');dynActive=false;dynSpec=null;return;}
  // If the user is editing, freeze values (don't let mouse motion overwrite typed numbers).
  if(!dynActive){
    dynSpec=spec;
    dynEl.innerHTML=spec.map((f,i)=>`<div class="dyn-field" data-i="${i}"><span class="lab">${f.label}</span><span class="val">${f.val}</span><span class="lab">${f.unit}</span></div>`).join('');
    dynEl.classList.add('on');
    dynEl.style.left=(dynScreen.x+18)+'px';
    dynEl.style.top=(dynScreen.y+18)+'px';
  }
  return;
}

// Enter keyboard-edit mode on the given field index, turning that field into an <input>.
function dynEnterEdit(idx){
  if(!dynSpec||!dynSpec.length)return;
  // save whatever is in the currently-edited field back into the spec before moving on
  if(dynActive){const cur=dynEl.querySelector('.dyn-field.active input');if(cur&&dynSpec[dynFocusIdx])dynSpec[dynFocusIdx].val=cur.value.trim();}
  dynActive=true;dynFocusIdx=Math.max(0,Math.min(dynSpec.length-1,idx));
  // re-render all fields from the (now-updated) spec so saved values show
  dynEl.innerHTML=dynSpec.map((f,i)=>`<div class="dyn-field${i===dynFocusIdx?' active':''}" data-i="${i}"><span class="lab">${f.label}</span>${i===dynFocusIdx?`<input type="text" value="${f.val}">`:`<span class="val">${f.val}</span>`}<span class="lab">${f.unit}</span></div>`).join('');
  const inp=dynEl.querySelector('.dyn-field.active input');if(inp){inp.focus();inp.select();}
}

// Apply the typed dynamic-input values by translating them into a feedValue() string.
function dynCommit(){
  if(!dynActive||!dynSpec)return false;
  // save the active field's current text into the spec
  const inp=dynEl.querySelector('.dyn-field.active input');
  if(inp&&dynSpec[dynFocusIdx])dynSpec[dynFocusIdx].val=inp.value.trim();
  const keys=dynSpec.map(f=>f.key);
  const valOf=k=>{const f=dynSpec.find(f=>f.key===k);return f?f.val:'';};
  if(keys.includes('len')&&keys.includes('ang')){dynReset();feedValue(`@${valOf('len')}<${valOf('ang')}`);return true;}
  if(keys.includes('w')&&keys.includes('h')){dynReset();feedValue(`${valOf('w')},${valOf('h')}`);return true;}
  dynReset();feedValue(valOf(keys[0]));return true;
}
function dynReset(){dynActive=false;dynFocusIdx=0;}

// ---- command autocomplete dropdown ----
const cmdAuto=document.getElementById('cmdAuto');
let acItems=[], acSel=-1;
function updateAutocomplete(){
  const v=cmdInput.value.trim().toUpperCase();
  if(!v||cmd.active){cmdAuto.style.display='none';acItems=[];return;}
  const matches=[];
  for(const k in COMMANDS){
    const c=COMMANDS[k];
    const allNames=[k,...c.aliases];
    const hit=allNames.find(n=>n.toUpperCase().startsWith(v));
    if(hit){
      const shortest=c.aliases.reduce((a,b)=>b.length<a.length?b:a,c.aliases[0]||k);
      matches.push({key:k,name:c.name,alias:shortest});
    }
  }
  matches.sort((a,b)=>a.alias.length-b.alias.length||a.name.localeCompare(b.name));
  acItems=matches.slice(0,8);
  if(!acItems.length){cmdAuto.style.display='none';return;}
  acSel=0;
  cmdAuto.innerHTML=acItems.map((m,i)=>`<div class="ac-item ${i===0?'sel':''}" data-i="${i}"><span>${m.name}</span><span class="ac-alias">${m.alias}</span></div>`).join('');
  cmdAuto.style.display='block';
  cmdAuto.querySelectorAll('.ac-item').forEach(el=>{
    el.onmousedown=(ev)=>{ev.preventDefault();const m=acItems[+el.dataset.i];cmdInput.value='';cmdAuto.style.display='none';lastCmd=m.key;startCommand(m.key);};
  });
}
function acHighlight(){cmdAuto.querySelectorAll('.ac-item').forEach((el,i)=>el.classList.toggle('sel',i===acSel));}
cmdInput.addEventListener('input',updateAutocomplete);
cmdInput.addEventListener('blur',()=>setTimeout(()=>{cmdAuto.style.display='none';},150));
window.addEventListener('keydown',e=>{
  // While a modal dialog is open, let the dialog handle its own keys — don't run app shortcuts.
  if(anyDialogOpen())return;

  // --- Dynamic Input keys ---
  // Tab: jump into / cycle the cursor dimension fields and edit them.
  if(e.key==='Tab'&&settings.dynInput&&cmd.active&&dynSpec&&dynSpec.length){
    e.preventDefault();
    if(!dynActive)dynEnterEdit(0);
    else dynEnterEdit((dynFocusIdx+1)%dynSpec.length);
    return;
  }
  if(dynActive){
    if(e.key==='Enter'){e.preventDefault();dynCommit();render();return;}
    if(e.key==='Escape'){e.preventDefault();dynReset();updateDynInput();render();return;}
    // digits/typing flow naturally into the focused input; let them through
    if(document.activeElement&&document.activeElement.tagName==='INPUT'&&dynEl.contains(document.activeElement))return;
  }
  // Typing a digit while a drawing command is active (and not already editing) jumps straight
  // into the dynamic field — like AutoCAD, where you just start typing the dimension.
  if(settings.dynInput&&cmd.active&&dynSpec&&dynSpec.length&&!dynActive&&document.activeElement!==cmdInput){
    if(/^[0-9.]$/.test(e.key)){dynEnterEdit(0);const inp=dynEl.querySelector('.dyn-field.active input');if(inp){inp.value='';}return;}
  }

  if(e.key==='F2'){e.preventDefault();toggleTextWindow();return;}
  if(e.key==='Escape'&&stopPan())return;
  if(e.key==='Escape'){cancelCommand(false);selection.clear();renderProps();render();cmdInput.value='';cmdInput.blur();dynReset();updateDynInput();return;}
  // AutoCAD-standard function-key toggles
  if(e.key==='F8'){e.preventDefault();toggleSetting('ortho');return;}   // Ortho mode
  if(e.key==='F9'){e.preventDefault();toggleSetting('snap');return;}    // Snap
  if(e.key==='F7'){e.preventDefault();toggleSetting('grid');return;}    // Grid
  if(e.key==='F10'){e.preventDefault();toggleSetting('polar');return;}  // Polar tracking
  if(e.key==='Delete'&&selection.size&&!cmd.active){pushUndo();idsToIndices(selection).forEach(i=>doc.objects.splice(i,1));selection.clear();renderProps();updateInfo();render();echo('Deleted');return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();startCommand('SELECTALL');return;}
  // File shortcuts. These must run before the command line sees the key, and Ctrl+S has to
  // beat the browser's own Save Page dialog.
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveDrawing(e.shiftKey);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();openDrawing();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newDrawing();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();openPdfDialog();return;}
  // Ctrl+C/X/V are the drawing clipboard, unless the user is editing the command line.
  if((e.ctrlKey||e.metaKey)&&document.activeElement!==cmdInput){
    const c=e.key.toLowerCase();
    if(c==='c'){e.preventDefault();doCopyClip(false);return;}
    if(c==='x'){e.preventDefault();doCopyClip(true);return;}
    if(c==='v'){e.preventDefault();startCommand('PASTECLIP');return;}
  }
  // In AutoCAD, Space and Enter both confirm/execute. Treat them the same.
  const isEnter=(e.key==='Enter'||e.key===' '||e.key==='Spacebar');
  if(document.activeElement===cmdInput){
    // autocomplete navigation
    if(cmdAuto.style.display==='block'&&acItems.length){
      if(e.key==='ArrowDown'){e.preventDefault();acSel=(acSel+1)%acItems.length;acHighlight();return;}
      if(e.key==='ArrowUp'){e.preventDefault();acSel=(acSel-1+acItems.length)%acItems.length;acHighlight();return;}
      if(e.key==='Tab'){e.preventDefault();const m=acItems[acSel]||acItems[0];cmdInput.value='';cmdAuto.style.display='none';lastCmd=m.key;startCommand(m.key);return;}
    }
    // AutoCAD's up-arrow recall: walk back through what was typed before.
    if(e.key==='ArrowUp'){e.preventDefault();recallCommand(-1);return;}
    if(e.key==='ArrowDown'){e.preventDefault();recallCommand(1);return;}
    if(isEnter){
      e.preventDefault();
      // if a suggestion is highlighted, run it
      if(cmdAuto.style.display==='block'&&acItems.length&&acSel>=0&&!cmd.active){
        const m=acItems[acSel];cmdInput.value='';cmdAuto.style.display='none';lastCmd=m.key;startCommand(m.key);return;
      }
      const v=cmdInput.value.trim();cmdInput.value='';cmdAuto.style.display='none';
      if(v===''){
        if(cmd.active==='UCS'&&cmd.pts.length===1){ucs.ox=cmd.pts[0].x;ucs.oy=cmd.pts[0].y;ucs.ang=0;echo(`UCS origin set (${ucs.ox.toFixed(1)}, ${ucs.oy.toFixed(1)})`);endCmd();render();return;}
        if(cmd.active==='PLINE'){finishPlineCmd();}else if(cmd.active==='LINE'){endCmd();render();echo('Line finished');}else if(cmd.active==='COPY'){endCmd();}else if(cmd.active==='HATCH'){endCmd();render();echo(`HATCH: ${cmd.data&&cmd.data.count||0} area(s) filled`);}else if(lastCmd){startCommand(lastCmd);}return;
      }
      rememberCommand(v);
      if(cmd.active&&v.toUpperCase()==='C'&&cmd.active==='PLINE'){closePline();return;}
      // Transparent commands: 'Z, 'P, or just ZOOM/PAN/REGEN typed while another command
      // is running. They only touch the view or the settings, so the running command is
      // left exactly as it was and picks up where it left off.
      const t=splitCommandLine(v);
      const tk=resolveCmd(t.head);
      if(tk&&TRANSPARENT[tk]&&(cmd.active||v.charAt(0)==="'")){
        if(runTransparent(tk,t.rest)){if(cmd.active)echo(`Resuming ${cmd.active}`,true);return;}
      }
      if(cmd.active){feedValue(v);return;}
      // "ZOOM E" / "Z 2X" on one line, the way AutoCAD scripts are written
      if(tk&&t.rest){lastCmd=tk;startCommand(tk);if(cmd.active===tk)feedValue(t.rest);return;}
      const key=resolveCmd(v);if(key){lastCmd=key;startCommand(key);}else echo(`Unknown command: ${v}`);
    }
    return;
  }
  if(isEnter&&stopPan()){e.preventDefault();return;}
  if(isEnter&&cmd.active==='HATCH'){e.preventDefault();const n=(cmd.data&&cmd.data.count)||0;endCmd();render();echo(`HATCH: ${n} area(s) filled`);return;}
  if(isEnter){e.preventDefault();if(cmd.active==='PLINE')finishPlineCmd();else if(cmd.active==='LINE'){endCmd();render();echo('Line finished');}else if(cmd.active==='LEADER'||cmd.active==='MLEADER')finishLeader();else if(cmd.active==='SPLINE')finishSpline();else if(cmd.active==='ALIGN'&&cmd.pts.length===2){for(const id of cmd.data.sel){const o=byId(id);if(o)translateObj(o,cmd.pts[1].x-cmd.pts[0].x,cmd.pts[1].y-cmd.pts[0].y);}pushUndo();echo('Aligned (moved)');selection.clear();endCmd();render();updateInfo();}else if(!cmd.active&&lastCmd)startCommand(lastCmd);else cmdInput.focus();return;}
});
window.addEventListener('keypress',e=>{
  // don't steal focus while the user is typing in any dialog/input/textarea/select
  if(anyDialogOpen())return;
  const ae=document.activeElement;
  if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT'||ae.isContentEditable))return;
  if(/[a-zA-Z0-9,.\-]/.test(e.key)&&e.key!==' ')cmdInput.focus();
});
// true when a modal dialog/overlay is on screen
function anyDialogOpen(){
  return !!(document.getElementById('inputDlgOverlay')||document.getElementById('layerDlgOverlay')||document.querySelector('.dlg-overlay'));
}

function finishLeader(){
  if((cmd.active!=='LEADER'&&cmd.active!=='MLEADER')||cmd.pts.length<2){endCmd();render();return;}
  const pts=cmd.pts.map(p=>[p.x,p.y]);
  const isM=cmd.active==='MLEADER';
  endCmd();
  textDialog({multiline:false,init:{h:Math.round(annoText())},
    onOk:(props)=>{if(props.str){pushUndo();const o={type:'leader',pts,str:props.str,txtH:props.h,font:props.font,bold:props.bold,italic:props.italic};if(isM){o.mleader=true;o.landing=8;}add(o);}render();updateInfo();},
    onCancel:()=>{render();}});
}

function finishPlineCmd(){if(cmd.active==='PLINE'&&cmd.pts.length>=2){pushUndo();add({type:'pline',pts:cmd.pts.map(p=>[p.x,p.y])});updateInfo();}endCmd();render();echo('Polyline finished');}
function finishSpline(){if(cmd.active==='SPLINE'&&cmd.pts.length>=2){pushUndo();add({type:'spline',pts:cmd.pts.map(p=>[p.x,p.y])});updateInfo();}endCmd();render();echo('Spline finished');}
function closePline(){if(cmd.active==='PLINE'&&cmd.pts.length>=3){pushUndo();add({type:'pline',pts:cmd.pts.map(p=>[p.x,p.y]),closed:true});updateInfo();}endCmd();render();echo('Polyline closed');}

// ============================================================
//  INFO / ECHO
// ============================================================
function updateInfo(){document.title=`LumoCAD — ${doc.objects.length} objects`;}
const histEl=document.getElementById('cmdHist');
function echo(msg,replace){
  logLine(msg);
  if(replace&&histEl.firstChild&&histEl.firstChild.dataset&&histEl.firstChild.dataset.live){histEl.firstChild.textContent=msg;return;}
  const d=document.createElement('div');d.textContent=msg;if(replace)d.dataset.live='1';
  histEl.insertBefore(d,histEl.firstChild);while(histEl.children.length>6)histEl.removeChild(histEl.lastChild);
}

// ============================================================
//  INIT
// ============================================================
loadSettings();          // drafting aids from the last session, before anything paints
const _alc=document.getElementById('activeLayerChip');if(_alc)_alc.onclick=()=>openLayerManager();
document.getElementById('scaleChip').onclick=()=>openScaleDialog();updateScaleChip();
renderLayers();renderCmdRef();renderProps();updateLayerChip();refreshToggleChips();updateFileChip();
window.addEventListener('resize',resize);resize();updateInfo();
echo('Welcome to LumoCAD v0.4. 35+ commands available — pick one from the ribbon or type its name.');
echo('Tips: Ctrl+S=Save · Ctrl+O=Open · F8=Ortho · F9=Snap · F7=Grid · F10=Polar · Enter/Space repeats command · Wheel=zoom · Alt+drag=pan');
offerRecovery();   // if the last session left unsaved work behind, ask before anything else
