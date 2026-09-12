// ============================================================
//  LumoCAD — region, mass properties, modal dialogs, join, explode
// ============================================================
function doRegion(){
  const targets=selObjects();
  if(targets.length===0){echo('REGION: select closed polylines, circles or rectangles first');return;}
  let made=0;pushUndo();
  for(const o of targets){
    if(!entityCall(o,'ring',null))continue;      // it encloses nothing — not a region
    if(o.type==='pline')o.closed=true;           // a region is closed by definition
    o.region=true;made++;
  }
  if(made)echo(`${made} region(s) created`);else echo('REGION: selection has no closed shapes');
  selection.clear();render();renderProps();updateInfo();
}
// ---- MASSPROP: area, perimeter, centroid, moments of inertia of the selected region(s) ----
function doMassProp(){
  const sel=selObjects().filter(o=>!!entityCall(o,'ring',null));
  if(!sel.length){echo('MASSPROP: select a closed region (circle, rectangle, or closed polyline)');return;}
  // compute combined properties
  let A=0,Cx=0,Cy=0,perim=0,Ix=0,Iy=0;
  for(const o of sel){
    const r=shapeMass(o);
    A+=r.area;Cx+=r.cx*r.area;Cy+=r.cy*r.area;perim+=r.perim;Ix+=r.Ix;Iy+=r.Iy;
  }
  if(Math.abs(A)<1e-9){echo('MASSPROP: zero area');return;}
  Cx/=A;Cy/=A;
  // moments about centroid (parallel axis already in component Ix/Iy about origin -> shift)
  const IxC=Ix-A*Cy*Cy, IyC=Iy-A*Cx*Cx;
  // extreme fibre distances from centroid (for section modulus S = I / c)
  let yTop=0,yBot=0,xRight=0,xLeft=0;
  for(const o of sel){
    // a curved shape reaches past every vertex it has, so it answers for itself; the rest
    // reach exactly as far as their outline goes
    const e=entityCall(o,'extreme',null,Cx,Cy);
    if(e){
      yTop=Math.max(yTop,e.top);yBot=Math.max(yBot,e.bot);
      xRight=Math.max(xRight,e.right);xLeft=Math.max(xLeft,e.left);
      continue;
    }
    for(const [px,py] of (entityCall(o,'ring',null)||[])){
      yTop=Math.max(yTop,py-Cy);yBot=Math.max(yBot,Cy-py);
      xRight=Math.max(xRight,px-Cx);xLeft=Math.max(xLeft,Cx-px);
    }
  }
  const cY=Math.max(yTop,yBot)||1, cX=Math.max(xRight,xLeft)||1;  // worst (largest) fibre distance
  const Sx=IxC/cY, Sy=IyC/cX;                 // section modulus in mm^3 (drawing units mm)
  const MM3_PER_CM3=1000;                      // 1 cm^3 = 10mm × 10mm × 10mm = 1000 mm^3
  const cu=ucsActive()?world2ucs(Cx,Cy):{x:Cx,y:Cy};
  showMassReport({area:Math.abs(A),perim,cx:cu.x,cy:cu.y,Ix:IxC,Iy:IyC,J:IxC+IyC,
    Sx_cm3:Sx/MM3_PER_CM3, Sy_cm3:Sy/MM3_PER_CM3, cY, cX});
}
// per-shape mass properties about the world origin
function shapeMass(o){return entityCall(o,'mass',null);}
function showMassReport(m){
  echo(`AREA ${m.area.toFixed(2)} · PERIMETER ${m.perim.toFixed(2)} · CENTROID (${m.cx.toFixed(2)}, ${m.cy.toFixed(2)})`);
  let dlg=document.getElementById('massDlg');if(dlg)dlg.remove();
  dlg=document.createElement('div');dlg.id='massDlg';
  dlg.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:18px 22px;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,0.6);min-width:300px;font-family:var(--font-mono)';
  const row=(k,v)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04)"><span style="color:var(--text-muted)">${k}</span><span style="color:var(--text-primary)">${v}</span></div>`;
  dlg.innerHTML=`<div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:12px;font-weight:600;display:flex;align-items:center;gap:10px">Mass Properties<span style="margin-left:auto;cursor:pointer;color:var(--text-muted)" id="mpClose">✕</span></div>
    ${row('Area',m.area.toFixed(3))}
    ${row('Perimeter',m.perim.toFixed(3))}
    ${row('Centroid X',m.cx.toFixed(3))}
    ${row('Centroid Y',m.cy.toFixed(3))}
    ${row('Moment of inertia Ix',m.Ix.toFixed(2))}
    ${row('Moment of inertia Iy',m.Iy.toFixed(2))}
    ${row('Polar moment J',m.J.toFixed(2))}
    <div style="font-family:var(--font-display);font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin:12px 0 4px">Section Modulus</div>
    ${row('Sx (about X)',m.Sx_cm3.toFixed(3)+' cm³')}
    ${row('Sy (about Y)',m.Sy_cm3.toFixed(3)+' cm³')}
    <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">Moments about the centroid. Section modulus S = I / c (worst fibre), shown in cm³.${ucsActive()?' Centroid shown in current UCS.':''}</div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#mpClose').onclick=()=>dlg.remove();
}

// ---- in-app themed text/name input dialog (replaces browser prompt) ----
// ---- rich text dialog: font, size, bold/italic, alignment, rotation, with live preview ----
const TEXT_FONTS=['monospace','Arial, sans-serif','Georgia, serif','Times New Roman, serif','Courier New, monospace','Verdana, sans-serif','Trebuchet MS, sans-serif','Impact, sans-serif'];
function textDialog(opts){
  const old=document.getElementById('inputDlgOverlay');if(old)old.remove();
  const init=opts.init||{};
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const fontOpts=TEXT_FONTS.map(f=>`<option value="${f}" ${(init.font||'monospace')===f?'selected':''}>${f.split(',')[0]}</option>`).join('');
  const field=opts.multiline
    ? `<textarea id="txtField" rows="3" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:10px;resize:vertical;outline:none"></textarea>`
    : `<input id="txtField" type="text" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:10px 12px;outline:none"/>`;
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:420px;max-width:94vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:14px">${opts.multiline?'Multi-line Text':'Text'}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Content${opts.multiline?' (Enter for new line, Ctrl+Enter to confirm)':''}</div>
      ${field}
      <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-top:12px">
        <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Font</div>
          <select id="txtFont" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:12px;padding:6px;outline:none">${fontOpts}</select></div>
        <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Height</div>
          <input id="txtSize" type="number" value="${init.h||12}" min="1" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-family:var(--font-mono);font-size:12px;padding:6px;outline:none"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
        <button id="txtBold" class="txt-tg" style="font-weight:bold;width:34px;height:30px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);cursor:pointer">B</button>
        <button id="txtItalic" class="txt-tg" style="font-style:italic;width:34px;height:30px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);cursor:pointer">I</button>
        <div style="width:1px;height:24px;background:var(--border);margin:0 4px"></div>
        <select id="txtAlign" style="flex:1;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:12px;padding:6px;outline:none">
          <option value="left">Align Left</option><option value="center">Align Center</option><option value="right">Align Right</option></select>
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--text-muted)">Rot°</span>
          <input id="txtRot" type="number" value="${init.rot||0}" style="width:52px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-family:var(--font-mono);font-size:12px;padding:6px;outline:none"></div>
      </div>
      <div style="margin-top:14px;padding:14px;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;min-height:40px;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <span id="txtPreview" style="color:var(--accent)">Preview</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button id="txtCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="txtOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">OK</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const fld=ov.querySelector('#txtField');fld.value=init.str||'';fld.focus();
  let bold=!!init.bold, italic=!!init.italic;
  const bBtn=ov.querySelector('#txtBold'),iBtn=ov.querySelector('#txtItalic');
  const fontSel=ov.querySelector('#txtFont'),sizeInp=ov.querySelector('#txtSize'),alignSel=ov.querySelector('#txtAlign'),rotInp=ov.querySelector('#txtRot');
  if(init.align)alignSel.value=init.align;
  const syncTg=()=>{bBtn.style.background=bold?'var(--accent)':'var(--bg-primary)';bBtn.style.color=bold?'#fff':'var(--text-primary)';iBtn.style.background=italic?'var(--accent)':'var(--bg-primary)';iBtn.style.color=italic?'#fff':'var(--text-primary)';};
  syncTg();
  const prev=ov.querySelector('#txtPreview');
  const upd=()=>{prev.textContent=(fld.value||'Preview').split('\n')[0];prev.style.fontFamily=fontSel.value;prev.style.fontWeight=bold?'bold':'normal';prev.style.fontStyle=italic?'italic':'normal';prev.style.fontSize=Math.min(28,Math.max(10,(+sizeInp.value||12)*1.5))+'px';};
  upd();
  [fld,fontSel,sizeInp].forEach(el=>el.addEventListener('input',upd));
  bBtn.onclick=()=>{bold=!bold;syncTg();upd();};
  iBtn.onclick=()=>{italic=!italic;syncTg();upd();};
  const close=()=>ov.remove();
  const ok=()=>{const props={str:fld.value,h:+sizeInp.value||12,font:fontSel.value,bold,italic,align:alignSel.value,rot:+rotInp.value||0};close();opts.onOk&&opts.onOk(props);};
  const cancel=()=>{close();opts.onCancel&&opts.onCancel();};
  ov.querySelector('#txtOk').onclick=ok;ov.querySelector('#txtCancel').onclick=cancel;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)cancel();});
  fld.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!opts.multiline){e.preventDefault();ok();}
    else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ok();}
    else if(e.key==='Escape'){e.preventDefault();cancel();}
    e.stopPropagation();
  });
}
function inputDialog(opts){
  // opts: {title, label, value, multiline, onOk(value), onCancel()}
  const old=document.getElementById('inputDlgOverlay');if(old)old.remove();
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const field=opts.multiline
    ? `<textarea id="inputDlgField" rows="4" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:10px;resize:vertical;outline:none"></textarea>`
    : `<input id="inputDlgField" type="text" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:10px 12px;outline:none"/>`;
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:340px;max-width:90vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:14px">${opts.title||'Input'}</div>
      ${opts.label?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px">${opts.label}</div>`:''}
      ${field}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button id="inputDlgCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="inputDlgOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">OK</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const fld=ov.querySelector('#inputDlgField');fld.value=opts.value||'';
  fld.focus();fld.select&&fld.select();
  const close=()=>ov.remove();
  const ok=()=>{const v=fld.value;close();opts.onOk&&opts.onOk(v);};
  const cancel=()=>{close();opts.onCancel&&opts.onCancel();};
  ov.querySelector('#inputDlgOk').onclick=ok;
  ov.querySelector('#inputDlgCancel').onclick=cancel;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)cancel();});
  fld.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!opts.multiline){e.preventDefault();ok();}
    else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ok();}
    else if(e.key==='Escape'){e.preventDefault();cancel();}
    e.stopPropagation();   // don't let the canvas keyboard handler grab it
  });
}
// ---- themed single-choice dialog (replaces prompt for picking from a list) ----
function choiceDialog(opts){
  // opts: {title, label, choices:[...], onPick(choice), onCancel()}
  const old=document.getElementById('inputDlgOverlay');if(old)old.remove();
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const btns=opts.choices.map(c=>`<button class="chDlgItem" data-v="${c}" style="display:block;width:100%;text-align:left;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:9px 12px;border-radius:7px;margin-bottom:6px;cursor:pointer">${c}</button>`).join('');
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:320px;max-width:90vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:14px">${opts.title||'Choose'}</div>
      ${opts.label?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${opts.label}</div>`:''}
      <div style="max-height:260px;overflow:auto">${btns}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="chDlgCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button></div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('.chDlgItem').forEach(btn=>{
    btn.onmouseenter=()=>btn.style.borderColor='var(--accent)';
    btn.onmouseleave=()=>btn.style.borderColor='var(--border)';
    btn.onclick=()=>{const v=btn.dataset.v;ov.remove();opts.onPick&&opts.onPick(v);};
  });
  ov.querySelector('#chDlgCancel').onclick=()=>{ov.remove();opts.onCancel&&opts.onCancel();};
  ov.addEventListener('mousedown',e=>{if(e.target===ov){ov.remove();opts.onCancel&&opts.onCancel();}});
}

function doJoin(){
  if(selection.size<2){echo('JOIN: select 2+ lines or plines first');return;}
  const parts=selObjects().filter(o=>!!entityCall(o,'chain',null));
  if(parts.length<2){echo('JOIN: need at least 2 lines/plines');return;}
  pushUndo();
  // collect ordered points by chaining endpoints
  let segs=parts.map(o=>entityCall(o,'chain',null));
  let chain=segs.shift();
  let changed=true;const tol=1e-3;
  while(segs.length&&changed){changed=false;
    for(let s=0;s<segs.length;s++){const seg=segs[s];const head=chain[0],tail=chain[chain.length-1];
      const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<tol;
      if(near(tail,seg[0])){chain=chain.concat(seg.slice(1));segs.splice(s,1);changed=true;break;}
      if(near(tail,seg[seg.length-1])){chain=chain.concat(seg.slice().reverse().slice(1));segs.splice(s,1);changed=true;break;}
      if(near(head,seg[seg.length-1])){chain=seg.slice(0,-1).concat(chain);segs.splice(s,1);changed=true;break;}
      if(near(head,seg[0])){chain=seg.slice().reverse().slice(0,-1).concat(chain);segs.splice(s,1);changed=true;break;}
    }
  }
  const layer=parts[0].layer;
  idsToIndices(parts.map(o=>o.id)).forEach(i=>doc.objects.splice(i,1));
  pushObj({type:'pline',layer,pts:chain});
  selection.clear();echo(`Joined into polyline (${chain.length} vertices)`);renderProps();render();updateInfo();
}

// ---- explode: break plines/rects into individual lines, and block instances into their parts ----
function doExplode(){
  if(selection.size===0){echo('EXPLODE: select a polyline, rectangle or block first');return;}
  pushUndo();const toAdd=[];const toDel=[];
  for(const o of selObjects()){
    const parts=entityCall(o,'explode',null);
    if(!parts||!parts.length)continue;
    parts.forEach(c=>toAdd.push(c));toDel.push(o.id);
  }
  if(!toDel.length){echo('EXPLODE: nothing explodable selected');return;}
  idsToIndices(toDel).forEach(i=>doc.objects.splice(i,1));
  toAdd.forEach(o=>pushObj(o));
  selection.clear();echo(`Exploded into ${toAdd.length} object(s)`);renderProps();render();updateInfo();
}

// ============================================================
//  BLOCKS
// ============================================================
// Step 1 of BLOCK: ask for a name, then wait for the base point.
