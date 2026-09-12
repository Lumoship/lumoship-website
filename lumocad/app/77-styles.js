// ============================================================
//  LumoCAD — named text and dimension styles
// ============================================================
// An annotation stores only what it overrides. Everything else comes from its named style, so
// changing the text height on a drawing is one edit instead of one per label — which is the
// whole point of a style, and the reason a drawing can be restyled after it is finished.
//
// Resolution order, for both kinds: the object's own value, then its style's, then the
// built-in fallback. The one exception follows AutoCAD: a text style with a FIXED height
// (h greater than zero) overrides the object, because that is what fixing a height means.

const TEXT_STYLE_FIELDS=['font','h','bold','italic','widthFactor','oblique'];
const DIM_STYLE_FIELDS=['txtH','arrow','arrowSize','extOffset','extExt','dimLineExt','precision','prefix','suffix','textPos'];

function textStyleOf(o){
  const n=(o&&o.style)||doc.textStyle||'Standard';
  return doc.textStyles[n]||doc.textStyles.Standard||{};
}
function dimStyleOf(o){
  const n=(o&&o.dimStyle)||doc.dimStyle||'Standard';
  return doc.dimStyles[n]||doc.dimStyles.Standard||{};
}
// an object's effective text property
function txtProp(o,key,fallback){
  const st=textStyleOf(o);
  // a fixed height in the style wins, the way AutoCAD's fixed-height styles do
  if(key==='h'&&st.h>0)return st.h;
  if(o&&o[key]!=null&&o[key]!=='')return o[key];
  if(st[key]!=null&&st[key]!=='')return st[key];
  return fallback;
}
// an object's effective dimension property
function dimProp(o,key,fallback){
  if(o&&o[key]!=null&&o[key]!=='')return o[key];
  const st=dimStyleOf(o);
  if(st[key]!=null&&st[key]!=='')return st[key];
  return fallback;
}
// the model-space text height for an annotation: 0 anywhere means "follow the drawing scale"
function styleTextHeight(o,isDim){
  const h=isDim?dimProp(o,'txtH',0):txtProp(o,'h',0);
  return (h>0)?h:annoText();
}
// make sure a name exists before anything points at it
function ensureStyle(kind,name){
  const table=kind==='dim'?doc.dimStyles:doc.textStyles;
  if(!table[name])table[name]=cloneObj(kind==='dim'?doc.dimStyles.Standard:doc.textStyles.Standard);
  return table[name];
}

// ============================================================
//  Managers
// ============================================================
function styleDialogShell(id,title,bodyHTML,onClose){
  const old=document.getElementById(id+'Overlay');if(old)old.remove();
  const ov=document.createElement('div');ov.id=id+'Overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding-top:9vh';
  ov.innerHTML=`<div id="${id}" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:640px;max-width:94vw;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:650">${title}</span>
        <button id="${id}New" style="margin-left:auto;background:var(--accent);border:1px solid var(--accent);color:#fff;font-size:11px;padding:6px 13px;border-radius:7px;cursor:pointer;font-weight:600">+ New Style</button>
        <span id="${id}Close" style="cursor:pointer;color:var(--text-muted);font-size:14px;padding-left:6px">&#10005;</span>
      </div>
      <div id="${id}Body" style="padding:14px 20px 20px;max-height:62vh;overflow:auto">${bodyHTML}</div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>{ov.remove();onClose&&onClose();};
  ov.querySelector('#'+id+'Close').onclick=close;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  return ov;
}
const STYLE_INPUT='background:var(--bg-input);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-family:var(--font-mono);font-size:11px;padding:4px 7px;outline:none;width:100%';

// ---- text styles ----
function openTextStyleManager(){
  const render=()=>{
    const body=document.getElementById('styleDlgBody');if(!body)return;
    const GRID='grid-template-columns:22px 1fr 150px 74px 60px 60px 44px;gap:8px';
    let h=`<div style="display:grid;${GRID};padding:4px 2px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">
        <span></span><span>Name</span><span>Font</span><span>Height</span><span>Bold</span><span>Italic</span><span></span></div>`;
    for(const name of Object.keys(doc.textStyles)){
      const st=doc.textStyles[name];
      const cur=doc.textStyle===name;
      const fonts=TEXT_FONTS.map(f=>`<option value="${f}" ${st.font===f?'selected':''}>${f.split(',')[0]}</option>`).join('');
      h+=`<div style="display:grid;${GRID};align-items:center;padding:6px 2px;border-radius:7px;margin-bottom:2px;background:${cur?'var(--accent-subtle)':'transparent'}">
        <button class="ts-cur" data-n="${name}" title="Make current" style="width:16px;height:16px;border-radius:50%;border:2px solid ${cur?'var(--accent)':'var(--border)'};background:${cur?'var(--accent)':'transparent'};cursor:pointer"></button>
        <input class="ts-name" data-n="${name}" value="${name}" ${name==='Standard'?'readonly':''} style="${STYLE_INPUT}${name==='Standard'?';color:var(--text-muted)':''}">
        <select class="ts-font" data-n="${name}" style="${STYLE_INPUT}">${fonts}</select>
        <input class="ts-h" data-n="${name}" type="number" min="0" step="0.5" value="${st.h||0}" title="0 = follow the drawing scale" style="${STYLE_INPUT};text-align:right">
        <input class="ts-bold" data-n="${name}" type="checkbox" ${st.bold?'checked':''} style="width:15px;height:15px;accent-color:var(--accent)">
        <input class="ts-italic" data-n="${name}" type="checkbox" ${st.italic?'checked':''} style="width:15px;height:15px;accent-color:var(--accent)">
        <button class="ts-del" data-n="${name}" ${name==='Standard'?'disabled':''} style="background:transparent;border:1px solid var(--border);color:${name==='Standard'?'var(--text-muted)':'var(--error)'};font-size:10px;padding:4px 6px;border-radius:5px;cursor:${name==='Standard'?'not-allowed':'pointer'}">Del</button>
      </div>`;
    }
    h+=`<div style="margin-top:12px;font-size:11px;color:var(--text-muted);line-height:1.6">A height of 0 follows the drawing scale (currently ${annoText().toFixed(0)} mm at 1:${annoScale}). Text that sets its own font or height overrides the style, except a fixed height, which always wins.</div>`;
    body.innerHTML=h;
    const touched=()=>{renderProps();renderCanvas();};
    body.querySelectorAll('.ts-cur').forEach(b=>b.onclick=()=>{pushUndo();doc.textStyle=b.dataset.n;render();});
    body.querySelectorAll('.ts-font').forEach(el=>el.onchange=()=>{pushUndo();doc.textStyles[el.dataset.n].font=el.value;render();touched();});
    body.querySelectorAll('.ts-h').forEach(el=>el.onchange=()=>{pushUndo();doc.textStyles[el.dataset.n].h=Math.max(0,parseFloat(el.value)||0);render();touched();});
    body.querySelectorAll('.ts-bold').forEach(el=>el.onchange=()=>{pushUndo();doc.textStyles[el.dataset.n].bold=el.checked;touched();});
    body.querySelectorAll('.ts-italic').forEach(el=>el.onchange=()=>{pushUndo();doc.textStyles[el.dataset.n].italic=el.checked;touched();});
    body.querySelectorAll('.ts-name').forEach(el=>el.onchange=()=>renameStyle('text',el.dataset.n,el.value.trim(),render));
    body.querySelectorAll('.ts-del').forEach(b=>b.onclick=()=>deleteStyle('text',b.dataset.n,render));
  };
  styleDialogShell('styleDlg','Text Styles','<div id="styleDlgBody"></div>');
  document.getElementById('styleDlgNew').onclick=()=>{
    inputDialog({title:'New Text Style',label:'Name',value:'Style '+(Object.keys(doc.textStyles).length+1),
      onOk:v=>{const n=(v||'').trim();if(!n)return;if(doc.textStyles[n]){echo('A text style called "'+n+'" already exists');return;}
        pushUndo();ensureStyle('text',n);doc.textStyle=n;render();}});
  };
  render();
}

// ---- dimension styles ----
function openDimStyleManager(){
  const render=()=>{
    const body=document.getElementById('dimStyleDlgBody');if(!body)return;
    const GRID='grid-template-columns:22px 1fr 76px 96px 76px 72px 66px 44px;gap:8px';
    let h=`<div style="display:grid;${GRID};padding:4px 2px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">
        <span></span><span>Name</span><span>Text h</span><span>Arrowhead</span><span>Arrow size</span><span>Ext gap</span><span>Decimals</span><span></span></div>`;
    for(const name of Object.keys(doc.dimStyles)){
      const st=doc.dimStyles[name];
      const cur=doc.dimStyle===name;
      const arrows=DIM_ARROWS.map(([v,lab])=>`<option value="${v}" ${st.arrow===v?'selected':''}>${lab}</option>`).join('');
      h+=`<div style="display:grid;${GRID};align-items:center;padding:6px 2px;border-radius:7px;margin-bottom:2px;background:${cur?'var(--accent-subtle)':'transparent'}">
        <button class="ds-cur" data-n="${name}" title="Make current" style="width:16px;height:16px;border-radius:50%;border:2px solid ${cur?'var(--accent)':'var(--border)'};background:${cur?'var(--accent)':'transparent'};cursor:pointer"></button>
        <input class="ds-name" data-n="${name}" value="${name}" ${name==='Standard'?'readonly':''} style="${STYLE_INPUT}${name==='Standard'?';color:var(--text-muted)':''}">
        <input class="ds-txtH" data-n="${name}" type="number" min="0" step="1" value="${st.txtH||0}" title="0 = follow the drawing scale" style="${STYLE_INPUT};text-align:right">
        <select class="ds-arrow" data-n="${name}" style="${STYLE_INPUT}">${arrows}</select>
        <input class="ds-arrowSize" data-n="${name}" type="number" min="1" step="1" value="${st.arrowSize||9}" style="${STYLE_INPUT};text-align:right">
        <input class="ds-extOffset" data-n="${name}" type="number" min="0" step="0.25" value="${st.extOffset||0}" style="${STYLE_INPUT};text-align:right">
        <input class="ds-precision" data-n="${name}" type="number" min="0" max="6" step="1" value="${st.precision==null?1:st.precision}" style="${STYLE_INPUT};text-align:right">
        <button class="ds-del" data-n="${name}" ${name==='Standard'?'disabled':''} style="background:transparent;border:1px solid var(--border);color:${name==='Standard'?'var(--text-muted)':'var(--error)'};font-size:10px;padding:4px 6px;border-radius:5px;cursor:${name==='Standard'?'not-allowed':'pointer'}">Del</button>
      </div>`;
    }
    h+=`<div style="margin-top:12px;font-size:11px;color:var(--text-muted);line-height:1.6">Text height 0 follows the drawing scale (currently ${annoText().toFixed(0)} mm at 1:${annoScale}). Arrow size and the extension gap are in paper millimetres. A dimension that sets one of these itself overrides its style.</div>`;
    body.innerHTML=h;
    const num=(cls,key,min)=>body.querySelectorAll('.'+cls).forEach(el=>el.onchange=()=>{
      pushUndo();const v=parseFloat(el.value);
      doc.dimStyles[el.dataset.n][key]=isFinite(v)?Math.max(min,v):min;
      render();renderProps();renderCanvas();
    });
    body.querySelectorAll('.ds-cur').forEach(b=>b.onclick=()=>{pushUndo();doc.dimStyle=b.dataset.n;render();});
    body.querySelectorAll('.ds-arrow').forEach(el=>el.onchange=()=>{pushUndo();doc.dimStyles[el.dataset.n].arrow=el.value;renderCanvas();});
    num('ds-txtH','txtH',0);num('ds-arrowSize','arrowSize',1);num('ds-extOffset','extOffset',0);num('ds-precision','precision',0);
    body.querySelectorAll('.ds-name').forEach(el=>el.onchange=()=>renameStyle('dim',el.dataset.n,el.value.trim(),render));
    body.querySelectorAll('.ds-del').forEach(b=>b.onclick=()=>deleteStyle('dim',b.dataset.n,render));
  };
  styleDialogShell('dimStyleDlg','Dimension Styles','<div id="dimStyleDlgBody"></div>');
  document.getElementById('dimStyleDlgNew').onclick=()=>{
    inputDialog({title:'New Dimension Style',label:'Name',value:'Style '+(Object.keys(doc.dimStyles).length+1),
      onOk:v=>{const n=(v||'').trim();if(!n)return;if(doc.dimStyles[n]){echo('A dimension style called "'+n+'" already exists');return;}
        pushUndo();ensureStyle('dim',n);doc.dimStyle=n;render();}});
  };
  render();
}

// ---- shared rename / delete, keeping every reference pointing somewhere real ----
function renameStyle(kind,from,to,redraw){
  const table=kind==='dim'?doc.dimStyles:doc.textStyles;
  const key=kind==='dim'?'dimStyle':'style';
  if(!to||to===from){redraw&&redraw();return;}
  if(from==='Standard'){echo('Standard cannot be renamed');redraw&&redraw();return;}
  if(table[to]){echo('A style called "'+to+'" already exists');redraw&&redraw();return;}
  pushUndo();
  table[to]=table[from];delete table[from];
  for(const o of doc.objects)if(o[key]===from)o[key]=to;
  if((kind==='dim'?doc.dimStyle:doc.textStyle)===from){if(kind==='dim')doc.dimStyle=to;else doc.textStyle=to;}
  redraw&&redraw();renderCanvas();
}
function deleteStyle(kind,name,redraw){
  const table=kind==='dim'?doc.dimStyles:doc.textStyles;
  const key=kind==='dim'?'dimStyle':'style';
  if(name==='Standard'){echo('Standard cannot be deleted');return;}
  const used=doc.objects.filter(o=>o[key]===name).length;
  const go=()=>{
    pushUndo();
    delete table[name];
    for(const o of doc.objects)if(o[key]===name)delete o[key];   // fall back to the current style
    if((kind==='dim'?doc.dimStyle:doc.textStyle)===name){if(kind==='dim')doc.dimStyle='Standard';else doc.textStyle='Standard';}
    echo(`Style "${name}" deleted`);redraw&&redraw();renderCanvas();
  };
  if(used)confirmDialog({title:'Delete style',message:`"${name}" is used by ${used} object(s). They will fall back to Standard.`,okText:'Delete',onDone:ok=>{if(ok)go();}});
  else go();
}
// the canvas redraw, named so the managers do not shadow their own local `render`
function renderCanvas(){render();updateInfo();}

// ---- commands ----
COMMANDS.STYLE={aliases:['ST','STYLE','DDSTYLE'],name:'Text Style',grp:'annotate'};
COMMANDS.DIMSTYLE={aliases:['D','DIMSTYLE','DST','DDIM'],name:'Dim Style',grp:'annotate'};
