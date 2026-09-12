// ============================================================
//  LumoCAD — annotation scale, sheets/title blocks, PDF plot
// ============================================================
// ============================================================
//  PDF EXPORT (vector, via jsPDF) — all standard page sizes + orientation
// ============================================================
const PAGE_SIZES={ // [width,height] in mm, portrait
  'A0':[841,1189],'A1':[594,841],'A2':[420,594],'A3':[297,420],'A4':[210,297],'A5':[148,210],
  'Letter':[216,279],'Legal':[216,356],'Tabloid':[279,432],'ANSI C':[432,559],'ANSI D':[559,864],'ANSI E':[864,1118],
};
// ---- drawing (annotation) scale picker ----
function openScaleDialog(){
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const opts=SCALE_LIST.map(s=>`<option value="${s}" ${s===annoScale?'selected':''}>1:${s}</option>`).join('');
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:360px;max-width:92vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:6px">Drawing Scale</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">Geometry is always drawn 1:1 (mm). The scale only sets how big text, dimensions, arrows and leaders are, so they print at standard size (text ≈ ${ANNO_PAPER.text} mm on paper).</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Scale</div>
      <select id="scSel" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:14px;padding:9px;outline:none;margin-bottom:14px">${opts}</select>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);cursor:pointer;margin-bottom:6px"><input type="checkbox" id="scUpdate" checked> Resize existing text & dimensions to the new scale</label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button id="scCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="scOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  ov.querySelector('#scCancel').onclick=close;
  ov.querySelector('#scOk').onclick=()=>{
    const newScale=+ov.querySelector('#scSel').value;
    const doUpdate=ov.querySelector('#scUpdate').checked;
    const oldScale=annoScale;
    if(newScale!==oldScale)pushUndo();   // annoScale is part of the undo snapshot
    if(doUpdate&&newScale!==oldScale){
      const factor=newScale/oldScale;
      for(const o of doc.objects){
        if(o.type==='text'){o.h=(o.h||annoText())*factor;}
        else if(o.type==='dim'){o.txtH=(o.txtH||ANNO_PAPER.text*oldScale)*factor;}
      }
    }
    annoScale=newScale;updateScaleChip();saveSettings();close();render();renderProps();
    echo(`Drawing scale set to 1:${newScale}`);
  };
}
function updateScaleChip(){const el=document.getElementById('scaleChip');if(el)el.textContent='1:'+annoScale;}

// ---- SHEET / title-block: ready-made paper frames (A0..A4) at a chosen scale ----
// Paper sizes in mm, landscape (long edge first). Portrait swaps the two.
const PAPER_SIZES={A0:[1189,841],A1:[841,594],A2:[594,420],A3:[420,297],A4:[297,210]};
function openSheetDialog(){
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const sizeOpts=Object.keys(PAPER_SIZES).map(k=>`<option value="${k}" ${k==='A3'?'selected':''}>${k} (${PAPER_SIZES[k][0]}×${PAPER_SIZES[k][1]} mm)</option>`).join('');
  const scaleOpts=SCALE_LIST.map(s=>`<option value="${s}" ${s===annoScale?'selected':''}>1:${s}</option>`).join('');
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:380px;max-width:92vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:6px">Insert Sheet / Title Block</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">Draws a paper border + title block sized for your scale. The frame is paper size × scale in model units, so real‑size geometry fits the page when printed.</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Paper size</div>
      <select id="shSize" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:14px;padding:9px;outline:none;margin-bottom:12px">${sizeOpts}</select>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Orientation</div>
      <select id="shOrient" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:14px;padding:9px;outline:none;margin-bottom:12px"><option value="landscape" selected>Landscape</option><option value="portrait">Portrait</option></select>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Scale</div>
      <select id="shScale" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:14px;padding:9px;outline:none;margin-bottom:6px">${scaleOpts}</select>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);cursor:pointer;margin-top:10px"><input type="checkbox" id="shSetScale" checked> Also set drawing scale to match</label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button id="shCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="shOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">Insert</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  ov.querySelector('#shCancel').onclick=close;
  ov.querySelector('#shOk').onclick=()=>{
    const size=ov.querySelector('#shSize').value;
    const orient=ov.querySelector('#shOrient').value;
    const scale=+ov.querySelector('#shScale').value;
    if(ov.querySelector('#shSetScale').checked){annoScale=scale;updateScaleChip();}
    close();
    placeSheet(size,orient,scale);
  };
}

function placeSheet(size,orient,scale){
  const dims=PAPER_SIZES[size]||PAPER_SIZES.A3;
  // paper dimensions in mm (swap for portrait)
  let pw=dims[0],ph=dims[1];
  if(orient==='portrait'){const t=pw;pw=ph;ph=t;}
  // model size = paper × scale (so 1:scale geometry fits the printed page)
  const W=pw*scale, H=ph*scale;
  // place the sheet so its drawable area is centred on the current view centre
  const c=screenCenterWorld();
  const x0=c.x-W/2, y0=c.y-H/2;
  // margins: mm-on-paper → model units (wider left edge for binding, ISO style)
  const mO=5*scale;                                          // paper edge → outer border
  const mL=20*scale, mR=7*scale, mT=7*scale, mB=7*scale;     // outer border → drawable frame
  const tbW=180*scale, tbH=40*scale;                         // title block size

  const layer=layerName();
  const objs=[];
  const rect=(a,b,cc,d)=>({type:'rect',layer,x1:a,y1:b,x2:cc,y2:d});
  const line=(a,b,cc,d)=>({type:'line',layer,x1:a,y1:b,x2:cc,y2:d});
  // outer paper edge — tagged with sheet metadata so PDF export can auto-detect this page
  const paper=rect(x0,y0,x0+W,y0+H);
  paper.sheet={size,orient,scale,x0,y0,W,H};
  objs.push(paper);
  const fx1=x0+mO+mL, fy1=y0+mO+mB, fx2=x0+W-mO-mR, fy2=y0+H-mO-mT;
  objs.push(rect(fx1,fy1,fx2,fy2));
  // title block: bottom-right, inside the frame
  const tx2=fx2, ty1=fy1, tx1=tx2-tbW, ty2=ty1+tbH;
  objs.push(rect(tx1,ty1,tx2,ty2));
  objs.push(line(tx1,ty1+tbH/2,tx2,ty1+tbH/2));
  const colA=tx1+tbW*0.55, colB=tx1+tbW*0.78;
  objs.push(line(colA,ty1,colA,ty2));
  objs.push(line(colB,ty1,colB,ty2));
  // labels (scaled to paper); origin of text is baseline-left
  const th=2.5*scale, thBig=4*scale, pad=2.5*scale;
  const today=new Date().toISOString().slice(0,10);
  const txt=(x,y,h,str)=>({type:'text',layer,x,y,h,str,rot:0,font:'Inter',align:'left'});
  objs.push(txt(tx1+pad, ty1+tbH/2+pad, thBig, 'TITLE'));
  objs.push(txt(tx1+pad, ty1+pad, th, 'Drawing name'));
  objs.push(txt(colA+pad, ty1+tbH/2+pad, th, 'Scale'));
  objs.push(txt(colA+pad, ty1+pad, th, '1:'+scale));
  objs.push(txt(colB+pad, ty1+tbH/2+pad, th, 'Sheet'));
  objs.push(txt(colB+pad, ty1+pad, th, size+' '+(orient==='portrait'?'P':'L')));

  pushUndo();
  for(const o of objs)add(o);
  zoomExtents();render();updateInfo();
  echo(`Inserted ${size} ${orient} sheet at 1:${scale}  (${Math.round(pw)}×${Math.round(ph)} mm on paper)`);
}
function screenCenterWorld(){
  const r=cv.getBoundingClientRect();
  return s2w(r.width/2, r.height/2);
}

// ---- grid spacing dialog ----
function openCursorSizeDialog(){
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const cur=settings.cursorSize||8;
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:340px;max-width:92vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:14px">Crosshair Size</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Percentage of screen (1–100). 100 = full-screen crosshair.</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
        <input id="csRange" type="range" min="1" max="100" value="${cur}" style="flex:1">
        <input id="csNum" type="number" min="1" max="100" value="${cur}" style="width:64px;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:7px;outline:none">
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">%</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button id="csCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="csOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const range=ov.querySelector('#csRange'),num=ov.querySelector('#csNum');
  const prev=cur; // restore on cancel
  const clamp=v=>Math.max(1,Math.min(100,parseInt(v,10)||1));
  const live=v=>{settings.cursorSize=clamp(v);if(overCanvas&&cursor)render();};
  range.oninput=()=>{num.value=range.value;live(range.value);};
  num.oninput=()=>{range.value=clamp(num.value);live(num.value);};
  const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov){settings.cursorSize=prev;render();close();}});
  ov.querySelector('#csCancel').onclick=()=>{settings.cursorSize=prev;render();close();};
  ov.querySelector('#csOk').onclick=()=>{settings.cursorSize=clamp(num.value);saveSettings();close();render();echo(`Crosshair size set to ${settings.cursorSize}%`);};
}

function openGridDialog(){
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  const presets=[0,5,10,25,50,100,250,500,1000];
  const opts=presets.map(v=>`<option value="${v}" ${v===gridSize?'selected':''}>${v===0?'Automatic (zoom-based)':v+' mm'}</option>`).join('');
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:340px;max-width:92vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:14px">Grid Spacing</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Preset</div>
      <select id="gridSel" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:9px;outline:none;margin-bottom:14px">${opts}</select>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Or custom (mm, 0 = automatic)</div>
      <input id="gridCustom" type="number" min="0" value="${gridSize}" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:9px;outline:none">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button id="gridCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="gridOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const sel=ov.querySelector('#gridSel'),cust=ov.querySelector('#gridCustom');
  sel.onchange=()=>{cust.value=sel.value;};
  const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  ov.querySelector('#gridCancel').onclick=close;
  ov.querySelector('#gridOk').onclick=()=>{
    gridSize=Math.max(0,parseFloat(cust.value)||0);
    if(!settings.grid){settings.grid=true;const g=document.getElementById('tGrid');if(g)g.classList.add('on');}
    close();saveSettings();render();if(selection.size===0)renderProps();echo(gridSize>0?`Grid spacing set to ${gridSize} mm`:'Grid set to automatic');
  };
}

// find all sheet frames in the drawing (tagged by placeSheet)
function findSheets(){
  const list=[];
  doc.objects.forEach((o,i)=>{if(o.sheet)list.push({idx:i,...o.sheet});});
  return list;
}
function openPdfDialog(){
  if(!doc.objects.length){echo('PDF: nothing to export — draw something first');return;}
  const sheets=findSheets();
  // build the source <select>: each detected sheet first, then "Custom page"
  const srcOpts=[
    ...sheets.map((s,k)=>`<option value="sheet:${s.idx}" ${k===0?'selected':''}>From sheet — ${s.size} ${s.orient==='portrait'?'Portrait':'Landscape'} 1:${s.scale}</option>`),
    `<option value="custom" ${sheets.length?'':'selected'}>Custom page…</option>`
  ].join('');
  const sizeOpts=Object.keys(PAGE_SIZES).map(k=>`<option value="${k}" ${k==='A4'?'selected':''}>${k}</option>`).join('');
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:360px;max-width:90vw;padding:20px 22px">
      <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:16px">Export PDF</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Source</div>
      <select id="pdfSrc" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:8px;outline:none;margin-bottom:14px">${srcOpts}</select>
      <div id="pdfCustom" style="display:none">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Page size</div>
        <select id="pdfSize" style="width:100%;box-sizing:border-box;background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;padding:8px;outline:none;margin-bottom:14px">${sizeOpts}</select>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Orientation</div>
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <label style="flex:1;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;padding:8px;cursor:pointer"><input type="radio" name="pdfOri" value="landscape" checked> Landscape</label>
          <label style="flex:1;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border);border-radius:7px;padding:8px;cursor:pointer"><input type="radio" name="pdfOri" value="portrait"> Portrait</label>
        </div>
      </div>
      <div id="pdfSheetNote" style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:4px">Prints exactly the sheet frame, 1:1 with its title block — no extra margin.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button id="pdfCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:8px 16px;border-radius:7px;cursor:pointer">Cancel</button>
        <button id="pdfOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:8px 18px;border-radius:7px;cursor:pointer;font-weight:600">Export</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  const srcSel=ov.querySelector('#pdfSrc');
  const custom=ov.querySelector('#pdfCustom');
  const note=ov.querySelector('#pdfSheetNote');
  const sync=()=>{const isCustom=srcSel.value==='custom';custom.style.display=isCustom?'block':'none';note.style.display=isCustom?'none':'block';};
  srcSel.onchange=sync;sync();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  ov.querySelector('#pdfCancel').onclick=close;
  ov.querySelector('#pdfOk').onclick=()=>{
    const src=srcSel.value;
    if(src.startsWith('sheet:')){
      const idx=+src.slice(6);close();exportPDFFromSheet(idx);
    } else {
      const size=ov.querySelector('#pdfSize').value;
      const ori=ov.querySelector('input[name="pdfOri"]:checked').value;
      close();exportPDF(size,ori);
    }
  };
}
// export a PDF that matches a placed sheet exactly: page = paper size, content = sheet area 1:1
function exportPDFFromSheet(idx){
  const JsPDF=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  if(!JsPDF){echo('PDF library not loaded — check your connection');return;}
  const sh=doc.objects[idx]&&doc.objects[idx].sheet;
  if(!sh){echo('PDF: sheet not found');return;}
  const dims=PAPER_SIZES[sh.size]||PAPER_SIZES.A3;
  let pw=dims[0],ph=dims[1];
  if(sh.orient==='portrait'){const t=pw;pw=ph;ph=t;}
  const pdf=new JsPDF({orientation:sh.orient,unit:'mm',format:[pw,ph]});
  // map the sheet's world rectangle (x0,y0)..(x0+W,y0+H) onto the full page (no margin)
  // world W,H = paper(mm) × scale, so dividing by scale gives mm — exact 1:1 with the title block
  const s=1/sh.scale;
  const X=x=>(x-sh.x0)*s;
  const Y=y=>ph-((y-sh.y0)*s);
  for(const o of doc.objects){if(!layerOn(o.layer)||!layerPlots(o.layer))continue;pdfDrawObject(pdf,o,X,Y,s);}
  pdf.save('Drawing1.pdf');
  echo(`Exported ${sh.size} ${sh.orient} PDF from sheet (1:${sh.scale})`);
}
function exportPDF(sizeKey,orientation){
  const JsPDF=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  if(!JsPDF){echo('PDF library not loaded — check your connection');return;}
  let [pw,ph]=PAGE_SIZES[sizeKey]||PAGE_SIZES['A4'];
  if(orientation==='landscape'){const t=pw;pw=ph;ph=t;}
  const pdf=new JsPDF({orientation,unit:'mm',format:[pw,ph]});
  // compute drawing bounds
  const bb=drawingBounds();
  if(!bb){echo('PDF: nothing to export');return;}
  const margin=12; // mm
  const availW=pw-2*margin, availH=ph-2*margin;
  const dw=Math.max(bb.maxx-bb.minx,1e-6), dh=Math.max(bb.maxy-bb.miny,1e-6);
  const scale=Math.min(availW/dw,availH/dh);
  // center the drawing on the page
  const offX=margin+(availW-dw*scale)/2, offY=margin+(availH-dh*scale)/2;
  // world -> page mm (flip Y: world up = page up)
  const X=x=>offX+(x-bb.minx)*scale;
  const Y=y=>ph-(offY+(y-bb.miny)*scale);
  // draw each object as vector
  for(const o of doc.objects){if(!layerOn(o.layer)||!layerPlots(o.layer))continue;pdfDrawObject(pdf,o,X,Y,scale);}
  pdf.save('Drawing1.pdf');
  echo(`Exported ${sizeKey} ${orientation} PDF`);
}
function pdfSetStyle(pdf,o){
  const hex=layerColor(o.layer)||'#000000';const c=hexToRgb(hex)||{r:0,g:0,b:0};
  pdf.setDrawColor(c.r,c.g,c.b);pdf.setTextColor(c.r,c.g,c.b);
  pdf.setLineWidth(Math.max(0.1,effLineweight(o)*0.5));
  const pat=LINETYPES[effLinetype(o)]||[];
  if(pat.length&&pdf.setLineDashPattern){try{pdf.setLineDashPattern(pat.map(v=>v*0.5),0);}catch(e){}}
  else if(pdf.setLineDashPattern){try{pdf.setLineDashPattern([],0);}catch(e){}}
}
function pdfDrawObject(pdf,o,X,Y,scale){
  if(o.construction)return;   // xline/ray are construction aids, not printed
  pdfSetStyle(pdf,o);
  // safe line wrapper: skip any segment with non-finite coordinates instead of throwing
  const L=(x1,y1,x2,y2)=>{if(isFinite(x1)&&isFinite(y1)&&isFinite(x2)&&isFinite(y2))pdf.line(x1,y1,x2,y2);};
  if(o.type==='line'){pdf.line(X(o.x1),Y(o.y1),X(o.x2),Y(o.y2));}
  else if(o.type==='circle'){pdf.circle(X(o.cx),Y(o.cy),o.r*scale);}
  else if(o.type==='arc'){pdfArc(pdf,X(o.cx),Y(o.cy),o.r*scale,o.a1,o.a2);}
  else if(o.type==='rect'){const x=X(Math.min(o.x1,o.x2)),y=Y(Math.max(o.y1,o.y2));pdf.rect(x,y,Math.abs(o.x2-o.x1)*scale,Math.abs(o.y2-o.y1)*scale);}
  else if(o.type==='pline'){
    const p=o.pts;const segs=o.segs;
    const drawSeg=(i,a,b)=>{
      const s=segs&&segs[i];
      if(s&&s.arc){pdfArc(pdf,X(s.cx),Y(s.cy),s.r*scale,s.a1,s.a2);}
      else pdf.line(X(a[0]),Y(a[1]),X(b[0]),Y(b[1]));
    };
    for(let i=0;i<p.length-1;i++)drawSeg(i,p[i],p[i+1]);
    if(o.closed&&p.length>2)drawSeg(p.length-1,p[p.length-1],p[0]);
  }
  else if(o.type==='text'){
    const fs=Math.max(4,o.h*scale*2.6);
    pdf.setFontSize(fs);
    const ang=o.rot?(-o.rot*180/Math.PI):0;   // world rot is radians CCW; jsPDF wants degrees, page Y flipped
    const opt=ang?{angle:ang}:undefined;
    if(o.mtext&&o.width){
      // wrap to the width box (model units → page mm)
      let lines=[];
      try{lines=pdf.splitTextToSize(String(o.str),o.width*scale);}catch(e){lines=String(o.str).split('\n');}
      pdf.text(lines,X(o.x),Y(o.y),opt);
    } else {
      pdf.text(String(o.str).split('\n'),X(o.x),Y(o.y),opt);
    }
  }
  else if(o.type==='point'){pdf.circle(X(o.x),Y(o.y),0.4,'F');}
  else if(o.type==='ellipse'){
    // sample the ellipse outline and draw as connected segments
    const c=Math.cos(o.rot||0),sn=Math.sin(o.rot||0);let px,py;
    for(let k=0;k<=64;k++){const a=k/64*2*Math.PI;const ex=o.rx*Math.cos(a),ey=o.ry*Math.sin(a);const wx=o.cx+ex*c-ey*sn,wy=o.cy+ex*sn+ey*c;const sx=X(wx),sy=Y(wy);if(k>0)pdf.line(px,py,sx,sy);px=sx;py=sy;}
  }
  else if(o.type==='spline'){
    const pts=sampleSpline(o.pts,12);for(let i=0;i<pts.length-1;i++)pdf.line(X(pts[i][0]),Y(pts[i][1]),X(pts[i+1][0]),Y(pts[i+1][1]));
  }
  else if(o.type==='hatch'){
    for(const seg of hatchSegments(o))L(X(seg[0].x),Y(seg[0].y),X(seg[1].x),Y(seg[1].y));
  }
  else if(o.type==='leader'){
    if(o.pts&&o.pts.length>=2)for(let i=0;i<o.pts.length-1;i++)L(X(o.pts[i][0]),Y(o.pts[i][1]),X(o.pts[i+1][0]),Y(o.pts[i+1][1]));
    if(o.str){const last=o.pts[o.pts.length-1];pdf.setFontSize(Math.max(4,(o.txtH||annoText())*scale*2.6));pdf.text(String(o.str).split('\n'),X(last[0]+(o.txtH||2.5)),Y(last[1]));}
  }
  else if(o.type==='dim'){
    for(const seg of dimSegments(o))L(X(seg[0].x),Y(seg[0].y),X(seg[1].x),Y(seg[1].y));
    const dt=dimTextInfo(o);if(dt){pdf.setFontSize(Math.max(4,dt.h*scale*2.6));pdf.text(dt.str,X(dt.x),Y(dt.y));}
  }
  else if(o.type==='block'){for(const part of blockInstanceObjects(o))pdfDrawObject(pdf,part,X,Y,scale);}
}
// approximate an arc with short line segments (jsPDF has no native arc)
function pdfArc(pdf,cx,cy,r,a1,a2){
  let s=a1,e=a2;if(e<s)e+=Math.PI*2;const steps=Math.max(8,Math.ceil((e-s)/(Math.PI/36)));
  let px=cx+r*Math.cos(s),py=cy-r*Math.sin(s);
  for(let i=1;i<=steps;i++){const a=s+(e-s)*i/steps;const nx=cx+r*Math.cos(a),ny=cy-r*Math.sin(a);pdf.line(px,py,nx,ny);px=nx;py=ny;}
}
function drawingBounds(){
  let minx=1e18,miny=1e18,maxx=-1e18,maxy=-1e18,any=false;
  const acc=(x,y)=>{any=true;if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;};
  for(const o of doc.objects){if(!layerOn(o.layer)||!layerPlots(o.layer))continue;
    if(o.construction)continue;   // xline/ray are infinite — never part of the printable extent
    if(o.type==='circle'||o.type==='arc'){acc(o.cx-o.r,o.cy-o.r);acc(o.cx+o.r,o.cy+o.r);}
    else if(o.type==='block'){blockInstanceObjects(o).forEach(c=>objPoints(c).forEach(p=>acc(p[0],p[1])));}
    else objPoints(o).forEach(p=>acc(p[0],p[1]));
  }
  return any?{minx,miny,maxx,maxy}:null;
}

