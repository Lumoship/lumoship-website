// ============================================================
//  LumoCAD — selection, hit testing, grips, mouse, context menu
// ============================================================
const selection=new Set();let selRect=null;
let lastSelWindow=null;  // {x1,y1,x2,y2} of the most recent plain selection box (used by STRETCH: window-then-command)
let lastFilletR=0;       // remember the last fillet radius so it isn't re-asked every time
let lastChamferD=0;      // remember the last chamfer distance
// opts.ignoreLocks lets the layer tools (LAYULK, LAYFRZ) click an object whose layer is
// locked. Everything else picks only what it is allowed to edit.
function pickObject(wx,wy,opts){const tol=8/view.scale;for(let i=doc.objects.length-1;i>=0;i--){const o=doc.objects[i];
  if(editingBlock&&!o._refedit)continue;
  if(!layerOn(o.layer))continue;                                  // hidden or frozen
  if(!(opts&&opts.ignoreLocks)&&layerLocked(o.layer))continue;    // locked
  if(hitTest(o,wx,wy,tol))return i;}
  return -1;}
// hit test for dimensions — click on the dimension line, extension area, or text
// world-space corners of a text object's bounding box (accounts for height, lines, align, rotation)
function textBounds(o){
  const h=o.h||12;const lines=String(o.str||'').split('\n');
  const lh=h*1.35;
  // estimate width using a per-char factor (monospace-ish); good enough for picking
  const charW=h*0.6;
  let maxLen=0;for(const ln of lines)maxLen=Math.max(maxLen,ln.length);
  const w=Math.max(charW,maxLen*charW);
  const totalH=lines.length*lh;
  // local box: text drawn with baseline at o.y, growing downward in screen but upward in world
  // anchor by alignment
  let x0=o.x;
  if(o.align==='center')x0=o.x-w/2;else if(o.align==='right')x0=o.x-w;
  // world box (y grows up): top near o.y + small ascent, bottom below by totalH
  const asc=h*0.8;
  const corners=[[x0,o.y+asc],[x0+w,o.y+asc],[x0+w,o.y+asc-totalH],[x0,o.y+asc-totalH]];
  const rot=(o.rot||0)*Math.PI/180;
  if(rot){
    const c=Math.cos(rot),s=Math.sin(rot);
    return corners.map(([px,py])=>{const dx=px-o.x,dy=py-o.y;return [o.x+dx*c-dy*s, o.y+dx*s+dy*c];});
  }
  return corners;
}
function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function textHit(o,x,y,tol){
  const poly=textBounds(o);
  if(pointInPoly(x,y,poly))return true;
  // also allow clicking slightly outside (tolerance) and near the insertion point
  if(Math.hypot(x-o.x,y-o.y)<tol*1.5)return true;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){if(distToSeg(x,y,poly[j][0],poly[j][1],poly[i][0],poly[i][1])<tol)return true;}
  return false;
}
function dimHit(o,x,y,tol){
  const kind=o.dim||'linear';
  if(kind==='radius'||kind==='diameter'){
    const ang=o.ang||0;const ex=o.cx+o.r*Math.cos(ang),ey=o.cy+o.r*Math.sin(ang);
    if(kind==='diameter'){const sx=o.cx-o.r*Math.cos(ang),sy=o.cy-o.r*Math.sin(ang);return distToSeg(x,y,sx,sy,ex,ey)<tol;}
    return distToSeg(x,y,o.cx,o.cy,ex,ey)<tol;
  }
  if(kind==='angular'){
    const d=Math.hypot(x-o.cx,y-o.cy);const r=40/view.scale;
    return Math.abs(d-r)<tol*1.5;
  }
  // linear / aligned: the dimension line sits at the offset
  let wdx=o.x2-o.x1, wdy=o.y2-o.y1;
  if(kind==='linear'){ if(Math.abs(wdx)>=Math.abs(wdy))wdy=0; else wdx=0; }
  const wlen=Math.hypot(wdx,wdy)||1;const nx=-wdy/wlen, ny=wdx/wlen;
  const ax=o.x1+nx*o.off, ay=o.y1+ny*o.off, bx=o.x2+nx*o.off, by=o.y2+ny*o.off;
  if(distToSeg(x,y,ax,ay,bx,by)<tol)return true;          // dimension line
  if(distToSeg(x,y,o.x1,o.y1,ax,ay)<tol)return true;       // extension line 1
  if(distToSeg(x,y,o.x2,o.y2,bx,by)<tol)return true;       // extension line 2
  // text near the middle of the dimension line
  if(Math.hypot(x-(ax+bx)/2,y-(ay+by)/2)<(o.txtH||annoText()))return true;
  return false;
}
function hitTest(o,x,y,tol){return entityCall(o,'hit',false,x,y,tol);}
function objInWindow(o,r,crossing){
  const xmin=Math.min(r.x1,r.x2),xmax=Math.max(r.x1,r.x2),ymin=Math.min(r.y1,r.y2),ymax=Math.max(r.y1,r.y2);
  const inside=p=>p[0]>=xmin&&p[0]<=xmax&&p[1]>=ymin&&p[1]<=ymax;
  const spec=entitySpec(o);
  if(spec&&typeof spec.inWindow==='function')return spec.inWindow(o,r,crossing,{xmin,xmax,ymin,ymax,inside});
  // the general answer: a window takes what it fully contains, a crossing window anything it
  // touches — which is every point inside, or any segment cutting a box edge
  const pts=objPoints(o);
  if(crossing)return pts.some(inside)||objAsSegments(o).some(s=>
    segInt(s[0],s[1],s[2],s[3],xmin,ymin,xmax,ymin)||
    segInt(s[0],s[1],s[2],s[3],xmax,ymin,xmax,ymax)||
    segInt(s[0],s[1],s[2],s[3],xmax,ymax,xmin,ymax)||
    segInt(s[0],s[1],s[2],s[3],xmin,ymax,xmin,ymin));
  return pts.every(inside);
}

// ============================================================
//  MOUSE
// ============================================================
let cursor=null,panning=false,panStart=null,downPt=null,downScreen=null;
let trueCursor=null;  // real cursor position (crosshair); cursor may snap to a candidate for previews
let overCanvas=false; // true while the pointer is over the drawing area (drives the crosshair)
let gripDrag=null;   // {obj, grip, info} while dragging a grip
let gripPreview=null;
let hoverGrip=null;  // {obj, grip, info} the grip currently under the cursor
let gripMenuEl=null; // the floating multifunction grip menu (Stretch / Add Vertex / Convert to Arc)
let gripMenuFor=null;// the grip the open menu belongs to
let gripMenuHover=false; // true while the pointer is over the open grip menu
let gripMenuCloseTimer=null;
function scheduleGripMenuClose(){clearTimeout(gripMenuCloseTimer);gripMenuCloseTimer=setTimeout(()=>{if(!gripMenuHover&&!(hoverGrip&&hoverGrip.info&&hoverGrip.info.mid))closeGripMenu();},800);}
function cancelGripMenuClose(){clearTimeout(gripMenuCloseTimer);gripMenuCloseTimer=null;}
// compute the edited object when a grip is dragged to point p
function buildGripEdit(o,gd,p){
  const c=cloneObj(o);
  return entityCall(o,'gripEdit',c,c,gd.info,p);
}

// ---- multifunction grip menu (AutoCAD-style): hover a mid grip on a line/pline ----
function closeGripMenu(){clearTimeout(gripMenuCloseTimer);gripMenuCloseTimer=null;if(gripMenuEl){gripMenuEl.remove();gripMenuEl=null;gripMenuFor=null;gripMenuHover=false;}}
function showGripMenu(cx,cy,gd){
  cancelGripMenuClose();
  closeGripMenu();
  gripMenuFor=gd;
  const items=[
    {label:'Stretch',act:()=>gripStretch(gd)},
    {label:'Add Vertex',act:()=>gripAddVertex(gd)},
    {label:'Convert to Arc',act:()=>gripConvertToArc(gd)},
  ];
  const m=document.createElement('div');m.className='grip-menu';gripMenuEl=m;
  m.style.cssText='position:fixed;z-index:11000;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,0.5);padding:4px;min-width:130px;font-family:var(--font-body)';
  // keep the menu open while the pointer is over it; once the pointer actually leaves
  // the menu (moved away to somewhere else), close it quickly.
  m.addEventListener('mouseenter',()=>{gripMenuHover=true;cancelGripMenuClose();});
  m.addEventListener('mouseleave',()=>{gripMenuHover=false;clearTimeout(gripMenuCloseTimer);gripMenuCloseTimer=setTimeout(()=>{if(!gripMenuHover)closeGripMenu();},250);});
  items.forEach(it=>{
    const b=document.createElement('div');
    b.textContent=it.label;
    b.style.cssText='padding:6px 12px;font-size:13px;color:var(--orange);border-radius:5px;cursor:pointer;white-space:nowrap';
    b.onmouseenter=()=>b.style.background='rgba(245,158,11,0.15)';
    b.onmouseleave=()=>b.style.background='transparent';
    b.onmousedown=ev=>{ev.preventDefault();ev.stopPropagation();const a=it.act;closeGripMenu();a();};
    m.appendChild(b);
  });
  document.body.appendChild(m);
  // Position the menu flush against the cursor (slight overlap) so moving the pointer
  // down-right travels straight onto it without ever leaving a hover gap.
  const mw=m.offsetWidth,mh=m.offsetHeight;
  let x=cx-4,y=cy-4;                       // top-left sits under the cursor → no dead gap
  if(x+mw>window.innerWidth-8)x=cx-mw+4;   // flip left if it would overflow the right edge
  if(y+mh>window.innerHeight-8)y=cy-mh+4;  // flip up if it would overflow the bottom edge
  m.style.left=x+'px';m.style.top=y+'px';
}
// Stretch: begin dragging this grip (moves the vertex / midpoint live)
function gripStretch(gd){
  const o=doc.objects[gd.obj];if(!o)return;
  hoverGrip=null;
  // line mid -> seed a real vertex so "stretch" reshapes instead of bending to an arc
  if(o.type==='line'&&gd.info.mid){
    pushUndo();
    const np={type:'pline',pts:[[o.x1,o.y1],[(o.x1+o.x2)/2,(o.y1+o.y2)/2],[o.x2,o.y2]],layer:o.layer,linetype:o.linetype,lineweight:o.lineweight,closed:false};
    doc.objects[gd.obj]=np;
    const grips=gripPoints(np);
    // the middle vertex is index 1
    gripDrag={obj:gd.obj,grip:1,info:grips[1],armed:true};
    echo('STRETCH: drag the vertex, click to place');render();updateInfo();return;
  }
  const grips=gripPoints(o);
  gripDrag={obj:gd.obj,grip:gd.grip,info:grips[gd.grip],armed:true};
  echo('STRETCH: drag the grip, click to place');render();
}
// Add Vertex: insert a new vertex at this segment midpoint (line becomes a pline)
function gripAddVertex(gd){
  const o=doc.objects[gd.obj];if(!o)return;
  pushUndo();
  if(o.type==='line'){
    const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
    doc.objects[gd.obj]={type:'pline',pts:[[o.x1,o.y1],[mx,my],[o.x2,o.y2]],layer:o.layer,linetype:o.linetype,lineweight:o.lineweight,closed:false};
    echo('Vertex added — line converted to polyline');
  } else if(o.type==='pline'){
    // find which segment this mid grip sits on, then insert a vertex there
    const i=plineSegmentAt(o,gd.info);
    if(i>=0){const mx=(o.pts[i][0]+o.pts[i+1][0])/2,my=(o.pts[i][1]+o.pts[i+1][1])/2;
      const c=cloneObj(o);c.pts=o.pts.slice(0,i+1).concat([[mx,my]]).concat(o.pts.slice(i+1));
      doc.objects[gd.obj]=c;echo('Vertex added');}
  }
  hoverGrip=null;renderProps();render();updateInfo();
}
// Convert to Arc: bulge this segment — drag the midpoint to set the arc, click to commit
function gripConvertToArc(gd){
  const o=doc.objects[gd.obj];if(!o)return;
  hoverGrip=null;
  if(o.type==='line'){
    // reuse the existing line-mid drag, which builds an arc through both ends + cursor
    const grips=gripPoints(o);const mi=grips.findIndex(g=>g.mid);
    if(mi>=0){gripDrag={obj:gd.obj,grip:mi,info:grips[mi],armed:true};echo('CONVERT TO ARC: drag to bulge, click to set');render();}
    return;
  }
  if(o.type==='pline'){
    // turn the segment under this mid grip into an arc-3pt: split into prev-line + arc by
    // dragging the inserted midpoint. Simplest robust behaviour: insert a vertex then drag it.
    const i=plineSegmentAt(o,gd.info);
    if(i>=0){const mx=(o.pts[i][0]+o.pts[i+1][0])/2,my=(o.pts[i][1]+o.pts[i+1][1])/2;
      pushUndo();
      const c=cloneObj(o);c.pts=o.pts.slice(0,i+1).concat([[mx,my]]).concat(o.pts.slice(i+1));doc.objects[gd.obj]=c;
      const grips=gripPoints(c);
      // the new vertex sits at index i+1
      gripDrag={obj:gd.obj,grip:i+1,info:grips[i+1],armed:true};
      echo('CONVERT TO ARC: drag the vertex to curve the segment, click to set');render();updateInfo();
    }
  }
}
// close the grip menu when the cursor leaves canvas or interaction starts elsewhere
wrap.addEventListener('mouseenter',()=>{overCanvas=true;render();});
wrap.addEventListener('mouseleave',()=>{overCanvas=false;cursor=null;closeGripMenu();if(hoverGrip)hoverGrip=null;render();});

wrap.addEventListener('mousemove',e=>{
  const r=cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;
  if(panning){view.ox+=px-panStart.px;view.oy+=py-panStart.py;panStart={px,py};_scheduleFrame();return;}
  let wpt=s2w(px,py);const sn=findSnap(wpt.x,wpt.y);
  // Snap is now a *candidate*, not a magnet: the crosshair stays at the true cursor
  // position and we only highlight the snap point. Clicking will use it (see mousedown).
  // This keeps snapping optional instead of forcibly teleporting the cursor.
  snapMark=sn||null;
  // dragging a grip -> live preview of the edited object
  if(gripDrag){
    cursor=wpt;
    gripPreview=buildGripEdit(doc.objects[gripDrag.obj],gripDrag,wpt);
    render();return;
  }
  // idle hover: highlight a grip under the cursor (and arm the multi-function grip menu on mid grips)
  if(!cmd.active&&!gripDrag&&selection.size===1){
    const oi=idIndex([...selection][0]);const o=doc.objects[oi];
    if(o&&entityHas(o,'gripEdit')&&o.type!=='circle'){   // circle grips have no hover menu
      const grips=gripPoints(o);const tol=8/view.scale;
      let gi=-1,gd=tol;
      for(let k=0;k<grips.length;k++){const d=Math.hypot(grips[k].x-wpt.x,grips[k].y-wpt.y);if(d<gd){gd=d;gi=k;}}
      const newHover=(gi>=0)?{obj:oi,grip:gi,info:grips[gi]}:null;
      const changed=(!!newHover!==!!hoverGrip)||(newHover&&hoverGrip&&(newHover.grip!==hoverGrip.grip||newHover.obj!==hoverGrip.obj));
      hoverGrip=newHover;
      if(changed){
        if(hoverGrip&&hoverGrip.info.mid&&o.type==='pline'){
          // hovering a multifunction mid grip on a polyline -> show the menu
          showGripMenu(e.clientX,e.clientY,hoverGrip);
        } else {
          // moved off the grip (or onto a different/non-mid grip) -> schedule hide,
          // giving the cursor a moment to travel onto the menu
          scheduleGripMenuClose();
        }
        cursor=wpt;render();
      }
    } else if(hoverGrip){hoverGrip=null;scheduleGripMenuClose();render();}
  } else if(hoverGrip&&(cmd.active||gripDrag)){hoverGrip=null;closeGripMenu();}
  // ortho/polar during any direction-based command (LINE, PLINE, MOVE, COPY, STRETCH...)
  {const cref=lastPoint();if(cref)wpt=applyConstraint(cref,wpt);}
  trueCursor=wpt;
  cursor=wpt;   // crosshair + preview follow the true cursor; snapping is applied only when you click
  {const u=ucsActive()?world2ucs(wpt.x,wpt.y):wpt;document.querySelector('#coords').innerHTML=`X <b>${u.x.toFixed(2)}</b>&nbsp;&nbsp;Y <b>${u.y.toFixed(2)}</b>${ucsActive()?' <span style="color:var(--orange)">UCS</span>':''}`;}
  if(selRect){selRect.x2=wpt.x;selRect.y2=wpt.y;}
  updateDynInput(e.clientX,e.clientY);
  updatePreview();render();
});
function applyConstraint(from,to){
  // ROTATE: ORTHO locks the rotation angle to 90° steps; POLAR to 15° steps
  if(cmd.active==='ROTATE'){
    const dx=to.x-from.x,dy=to.y-from.y;const len=Math.hypot(dx,dy);if(len<1e-6)return to;
    let ang=Math.atan2(dy,dx);
    if(settings.ortho){const inc=Math.PI/2;ang=Math.round(ang/inc)*inc;return{x:from.x+len*Math.cos(ang),y:from.y+len*Math.sin(ang)};}
    if(settings.polar){const inc=Math.PI/12;const sn=Math.round(ang/inc)*inc;if(Math.abs(sn-ang)<(Math.PI/180)*4)return{x:from.x+len*Math.cos(sn),y:from.y+len*Math.sin(sn)};}
    return to;
  }
  if(cmd.active==='SCALE')return to; // scaling shouldn't be axis-constrained
  if(settings.ortho){const dx=Math.abs(to.x-from.x),dy=Math.abs(to.y-from.y);return dx>dy?{x:to.x,y:from.y}:{x:from.x,y:to.y};}
  if(settings.polar){
    const dx=to.x-from.x,dy=to.y-from.y;const len=Math.hypot(dx,dy);if(len<1e-6)return to;
    let ang=Math.atan2(dy,dx);const inc=Math.PI/12;
    const snapped=Math.round(ang/inc)*inc;
    if(Math.abs(snapped-ang)<(Math.PI/180)*4){
      return {x:from.x+len*Math.cos(snapped),y:from.y+len*Math.sin(snapped)};
    }
  }
  return to;
}
wrap.addEventListener('mousedown',e=>{
  const r=cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;
  if(e.button===1||(e.button===0&&e.altKey)||(e.button===0&&panModeActive())){panning=true;panStart={px,py};wrap.classList.add('panning');closeGripMenu();e.preventDefault();render();return;}
  if(e.button!==0)return;
  let wpt=s2w(px,py);const sn=findSnap(wpt.x,wpt.y);
  // carry what the snap was attached to, so an annotation made on it can follow that geometry
  if(sn)wpt={x:sn.x,y:sn.y,ref:sn.ref,feat:sn.feat};
  downPt=wpt;downScreen={px,py};
  if(cmd.active){
    if(cmd.step===-1){ // selecting objects for a modify command
      if(cmd.active==='STRETCH'){ // always a window for stretch
        selRect={x1:wpt.x,y1:wpt.y,x2:wpt.x,y2:wpt.y,forSelect:true};return;
      }
      const i=pickObject(wpt.x,wpt.y);if(i>=0){selection.add(idAt(i));renderProps();render();}else{selRect={x1:wpt.x,y1:wpt.y,x2:wpt.x,y2:wpt.y,forSelect:true};}
      return;
    }
    // box-select support for click-based commands (TRIM, EXTEND, ERASE)
    if(boxableCmd(cmd.active)){
      const i=pickObject(wpt.x,wpt.y);
      if(i<0){selRect={x1:wpt.x,y1:wpt.y,x2:wpt.x,y2:wpt.y,forCmd:cmd.active};return;}
      // clicked directly on an object -> act on it immediately (single pick)
    }
    let p=wpt;
    {const cref=lastPoint();if(cref&&!sn)p=applyConstraint(cref,wpt);}
    // Mid Between 2 Points: capture two clicks, feed their midpoint
    if(midBetween){
      if(!midBetween.a){midBetween.a={x:p.x,y:p.y};echo('Mid Between: pick second point',true);render();return;}
      const mp={x:(midBetween.a.x+p.x)/2,y:(midBetween.a.y+p.y)/2};midBetween=null;feedPoint(mp);return;
    }
    feedPoint(p);
  } else {
    // a grip drag armed from the grip menu (Stretch / Convert to Arc) commits on the next click
    if(gripDrag){
      if(gripPreview){pushUndo();doc.objects[gripDrag.obj]=gripPreview;echo('Edited via grip');}
      gripDrag=null;gripPreview=null;hoverGrip=null;renderProps();render();updateInfo();return;
    }
    // idle: first, if exactly one object is selected, check whether a grip was grabbed
    if(selection.size===1){
      const oi=idIndex([...selection][0]);const o=doc.objects[oi];
      if(o){
      const grips=gripPoints(o);const tol=8/view.scale;
      let gi=-1,gd=tol;
      for(let k=0;k<grips.length;k++){const d=Math.hypot(grips[k].x-wpt.x,grips[k].y-wpt.y);if(d<gd){gd=d;gi=k;}}
      if(gi>=0){gripDrag={obj:oi,grip:gi,info:grips[gi]};render();return;}
      }
    }
    // idle: start selection
    hoverGrip=null;closeGripMenu();
    const i=pickObject(wpt.x,wpt.y);
    if(i>=0){const id=idAt(i);if(!e.shiftKey)selection.clear();selection.has(id)?selection.delete(id):selection.add(id);renderProps();render();}
    else{if(!e.shiftKey)selection.clear();selRect={x1:wpt.x,y1:wpt.y,x2:wpt.x,y2:wpt.y};renderProps();render();}
  }
});
window.addEventListener('mouseup',e=>{
  if(panning){panning=false;wrap.classList.remove('panning');render();}
  else panning=false;
  // finish a grip drag
  if(gripDrag){
    // a drag armed from the grip menu uses click-to-place, not button-release; ignore this release
    if(gripDrag.armed){gripDrag.armed=false;return;}
    if(gripPreview){pushUndo();doc.objects[gripDrag.obj]=gripPreview;echo('Edited via grip');}
    gripDrag=null;gripPreview=null;renderProps();render();updateInfo();return;
  }
  if(selRect){
    const moved=downScreen&&Math.hypot((e.clientX)-(cv.getBoundingClientRect().left+downScreen.px),(e.clientY)-(cv.getBoundingClientRect().top+downScreen.py))>4;
    // box used to drive a click-command (TRIM/EXTEND/ERASE) on everything it covers
    if(selRect.forCmd){
      if(moved){
        // for click-commands the box always acts as a CROSSING window (anything it touches),
        // regardless of drag direction — this is what feels natural for trim/erase/extend
        const hit=[];for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(layerEditable(o.layer)&&objInWindow(o,selRect,true))hit.push(i);}
        applyCmdToBox(selRect.forCmd,hit,selRect);
      }
      selRect=null;render();return;
    }
    if(moved){
      const crossing=(cmd.active==='STRETCH')?true:(selRect.x2<selRect.x1);
      for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(layerEditable(o.layer)&&objInWindow(o,selRect,crossing))selection.add(idAt(i));}
      // Remember this box. If it was a plain (no command active) selection, STRETCH can use it
      // later as the vertex filter — this is the "draw a window, then STRETCH, then move" flow.
      const winRect={x1:selRect.x1,y1:selRect.y1,x2:selRect.x2,y2:selRect.y2};
      if(!cmd.active)lastSelWindow=winRect;
      // STRETCH started before the window (command-first flow) also records it directly.
      if(cmd.active==='STRETCH'){cmd.data=cmd.data||{};cmd.data.win=winRect;}
    } else {
      // a click (not a drag) that selected by picking clears any stale stretch window
      if(!cmd.active)lastSelWindow=null;
    }
    const forSel=selRect.forSelect;selRect=null;
    if(forSel&&cmd.step===-1){
      if(cmd.active==='STRETCH'){
        if(selection.size===0){echo('STRETCH: nothing selected — drag a crossing window over the part to stretch',true);}
        else{
          // rectangles only store 2 corners, so a corner-stretch can't be expressed.
          // Convert any selected rect into a 4-vertex closed polyline so every corner moves independently.
          for(const id of [...selection]){
            const i=idIndex(id);if(i<0)continue;
            const o=doc.objects[i];
            if(o.type==='rect'){
              doc.objects[i]={id:o.id,type:'pline',layer:o.layer,closed:true,
                pts:[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]]};
            }
          }
          cmd.step=0;echo(`STRETCH: ${selection.size} object(s) — specify base point`,true);
        }
      } else if(cmd.active==='BLOCK'){
        if(selection.size===0){echo('BLOCK: nothing selected — drag a window or click objects, then run BLOCK',true);endCmd();}
        else{startBlockDefinition();}
      } else {
        echo(`${selection.size} selected — click base point`,true);
      }
    }
    renderProps();render();
  }
});
// which click-commands accept a box selection
function boxableCmd(k){return ['TRIM','EXTEND','ERASE'].includes(k);}
// apply a click-command to all objects a box covers
function applyCmdToBox(k,idxList,rect){
  if(!idxList.length){echo(`${k}: nothing in selection`);return;}
  if(k==='ERASE'){
    pushUndo();idxList.sort((a,b)=>b-a).forEach(i=>doc.objects.splice(i,1));
    echo(`${idxList.length} object(s) erased`);updateInfo();renderProps();return;
  }
  // TRIM / EXTEND: act at the box center on each covered object (treats box like a fence)
  const cx=(rect.x1+rect.x2)/2, cy=(rect.y1+rect.y2)/2;
  let n=0;
  // process from highest index to keep indices valid as objects are replaced
  idxList.sort((a,b)=>b-a).forEach(i=>{
    const o=doc.objects[i];if(!o)return;
    if(k==='TRIM'){
      // pick a point on the object closest to box center, then trim there
      const hp=nearestPointOnObject(o,cx,cy);if(hp){doTrimIndex(i,hp);n++;}
    } else if(k==='EXTEND'){
      const hp=nearestPointOnObject(o,cx,cy);if(hp){doExtendIndex(i,hp);n++;}
    }
  });
  echo(`${k} applied to ${n} object(s)`);updateInfo();
}
// nearest point on an object to a given coordinate (for box-driven trim/extend)
function nearestPointOnObject(o,x,y){return entityCall(o,'nearest',null,x,y);}
wrap.addEventListener('dblclick',e=>{
  if(editingBlock)return;          // already inside an edit
  const r=cv.getBoundingClientRect();const w=s2w(e.clientX-r.left,e.clientY-r.top);
  const i=pickObject(w.x,w.y);
  if(i<0)return;
  const o=doc.objects[i];
  if(o.type==='block'){e.preventDefault();cancelCommand(true);selection.clear();enterBlockEdit(i);return;}
  if(o.type==='text'){
    // double-click a text/mtext to edit its content and formatting in place
    e.preventDefault();cancelCommand(true);
    textDialog({multiline:!!o.mtext,
      init:{str:o.str,font:o.font,h:o.h,bold:o.bold,italic:o.italic,align:o.align,rot:o.rot},
      onOk:(props)=>{if(props.str!=null){pushUndo();o.str=props.str;o.h=props.h;o.font=props.font;o.bold=props.bold;o.italic=props.italic;o.align=props.align;o.rot=props.rot;render();updateInfo();}},
      onCancel:()=>{}});
    return;
  }
  if(o.type==='dim'&&o.dim&&(o.dim==='linear'||o.dim==='aligned')){
    // double-click a linear/aligned dimension to override its text
    e.preventDefault();cancelCommand(true);
    textDialog({multiline:false,init:{str:o.textOverride||'',h:o.txtH||annoText()},
      onOk:(props)=>{pushUndo();o.textOverride=props.str||'';render();updateInfo();},
      onCancel:()=>{}});
    return;
  }
});
let _frameRAF=null;
function _scheduleFrame(){
  if(_frameRAF)return;
  _frameRAF=requestAnimationFrame(()=>{_frameRAF=null;updateInfo();render();});
}
let _zoomRAF=null;
function _scheduleZoomRender(){_scheduleFrame();}
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;
  const before=s2w(px,py);
  // Scale the zoom step to how hard the user scrolled. deltaMode 1 = lines (mouse wheel),
  // 0 = pixels (trackpad / smooth wheels). Normalise to a "notches" amount, then map to a
  // smooth exponential factor so fast flicks zoom far and gentle scrolls zoom finely.
  let d=e.deltaY;
  if(e.deltaMode===1)d*=16;        // lines -> approx pixels
  else if(e.deltaMode===2)d*=100;  // pages -> approx pixels
  const notches=Math.max(-4,Math.min(4,d/100));  // clamp so a hard flick can't jump absurdly
  const factor=Math.exp(-notches*0.22);          // exp keeps zoom perceptually uniform & smooth
  view.scale=clampZoom(view.scale*factor);
  const after=s2w(px,py);view.ox+=(after.x-before.x)*view.scale;view.oy-=(after.y-before.y)*view.scale;
  _scheduleZoomRender();
},{passive:false});

// ============================================================
//  RIGHT-CLICK CONTEXT MENU
// ============================================================
wrap.addEventListener('contextmenu',e=>{
  e.preventDefault();
  // if a command is mid-run, right-click acts like Enter/confirm (AutoCAD behaviour)
  if(cmd.active&&cmd.active!=='__none'){
    // confirm: repeat-last for chain commands, otherwise just end
    if(cmd.active==='PLINE'&&cmd.pts.length>=2){finishPlineCmd();return;}
    if((cmd.active==='LEADER'||cmd.active==='MLEADER')&&cmd.pts.length>=2){finishLeader();return;}
    if(cmd.active==='SPLINE'&&cmd.pts.length>=2){finishSpline();return;}
    if(cmd.active==='DIMCONTINUE'||cmd.active==='DIMBASELINE'){endCmd();render();return;}
    if(cmd.active==='LINE'){cancelCommand(true);showContextMenu(e.clientX,e.clientY);return;}
  }
  showContextMenu(e.clientX,e.clientY);
});
let ctxMenuEl=null;
function closeContextMenu(){if(ctxMenuEl){ctxMenuEl.remove();ctxMenuEl=null;}}
function showContextMenu(cx,cy){
  closeContextMenu();
  const hasSel=selection.size>0;
  const r=cv.getBoundingClientRect();const wpt=s2w(cx-r.left,cy-r.top);
  // build the item list contextually
  const items=[];
  if(lastCmd)items.push({label:`Repeat ${COMMANDS[lastCmd]?COMMANDS[lastCmd].name:lastCmd}`,act:()=>startCommand(lastCmd)});
  items.push({sep:true});
  if(hasSel){
    items.push({label:'Move',act:()=>startCommand('MOVE')});
    items.push({label:'Copy',act:()=>startCommand('COPY')});
    items.push({label:'Rotate',act:()=>startCommand('ROTATE')});
    items.push({label:'Erase',act:()=>startCommand('ERASE')});
    items.push({sep:true});
  }
  items.push({label:'Select All',act:()=>startCommand('SELECTALL')});
  if(hasSel)items.push({label:'Deselect',act:()=>{selection.clear();renderProps();render();}});
  items.push({sep:true});
  // AutoCAD's handy "Mid Between 2 Points" — sets the next point to the midpoint of two clicks
  items.push({label:'Mid Between 2 Points',act:()=>startMidBetween()});
  items.push({sep:true});
  items.push({label:'Undo',act:()=>undo()});
  items.push({label:'Redo',act:()=>redo()});
  items.push({sep:true});
  items.push({label:'Zoom Extents',act:()=>zoomExtents()});
  items.push({label:'Pan / Zoom here',act:()=>{view.scale*=1.4;const after=s2w(cx-r.left,cy-r.top);view.ox+=(after.x-wpt.x)*view.scale;view.oy-=(after.y-wpt.y)*view.scale;render();updateInfo();}});

  const m=document.createElement('div');m.className='ctx-menu';ctxMenuEl=m;
  m.style.cssText='position:fixed;z-index:11000;background:var(--bg-secondary);border:1px solid var(--border);border-radius:9px;box-shadow:0 16px 44px rgba(0,0,0,0.55);padding:5px;min-width:190px;font-family:var(--font-body)';
  items.forEach(it=>{
    if(it.sep){const s=document.createElement('div');s.style.cssText='height:1px;background:var(--border);margin:5px 6px';m.appendChild(s);return;}
    const b=document.createElement('div');
    b.textContent=it.label;
    b.style.cssText='padding:7px 12px;font-size:13px;color:var(--text-primary);border-radius:6px;cursor:pointer;white-space:nowrap';
    b.onmouseenter=()=>b.style.background='rgba(59,130,246,0.15)';
    b.onmouseleave=()=>b.style.background='transparent';
    b.onclick=()=>{closeContextMenu();it.act();};
    m.appendChild(b);
  });
  document.body.appendChild(m);
  // keep on screen
  const mw=m.offsetWidth,mh=m.offsetHeight;
  let x=cx,y=cy;if(x+mw>window.innerWidth-8)x=window.innerWidth-mw-8;if(y+mh>window.innerHeight-8)y=window.innerHeight-mh-8;
  m.style.left=x+'px';m.style.top=y+'px';
}
document.addEventListener('mousedown',e=>{if(ctxMenuEl&&!ctxMenuEl.contains(e.target))closeContextMenu();if(gripMenuEl&&!gripMenuEl.contains(e.target))closeGripMenu();});
// "Mid Between 2 Points": user picks two points, the active command receives their midpoint
function startMidBetween(){
  if(!cmd.active){echo('Mid Between 2 Points: start a drawing command first, then use this');return;}
  midBetween={a:null};echo('Mid Between: pick first point',true);
}
let midBetween=null;

function updatePreview(){
  cmd.preview=null;if(!cmd.active||!cursor)return;const k=cmd.active,p=cursor;
  if(k==='LINE'&&cmd.pts.length===1)cmd.preview={type:'line',layer:layerName(),x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y};
  else if(k==='PLINE'&&cmd.pts.length>=1){const pts=cmd.pts.map(q=>[q.x,q.y]);pts.push([p.x,p.y]);cmd.preview={type:'pline',layer:layerName(),pts};}
  else if((k==='LEADER'||k==='MLEADER')&&cmd.pts.length>=1){const pts=cmd.pts.map(q=>[q.x,q.y]);pts.push([p.x,p.y]);cmd.preview={type:'leader',layer:layerName(),pts,txtH:annoText(),mleader:k==='MLEADER'};}
  else if(k==='SPLINE'&&cmd.pts.length>=1){const pts=cmd.pts.map(q=>[q.x,q.y]);pts.push([p.x,p.y]);cmd.preview={type:'spline',layer:layerName(),pts};}
  else if(k==='MTEXT'&&cmd.pts.length===1){cmd.preview={type:'rect',layer:'Construction',x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y};}
  else if(k==='REVCLOUD'&&cmd.pts.length===1){cmd.preview={type:'rect',layer:'Construction',x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y};}
  else if(k==='ARC'){
    if(cmd.pts.length===1){cmd.preview={type:'line',layer:'Construction',x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y};}
    else if(cmd.pts.length===2){const a=arc3(cmd.pts[0],cmd.pts[1],p);if(a){a.layer=layerName();cmd.preview=a;}else cmd.preview={type:'pline',layer:'Construction',pts:[[cmd.pts[0].x,cmd.pts[0].y],[cmd.pts[1].x,cmd.pts[1].y],[p.x,p.y]]};}
  }
  else if(k==='ELLIPSE'&&cmd.pts.length>=1){
    const c=cmd.pts[0];
    if(cmd.pts.length===1){const rx=dist(c,p),rot=Math.atan2(p.y-c.y,p.x-c.x);cmd.preview={type:'ellipse',layer:layerName(),cx:c.x,cy:c.y,rx,ry:rx*0.4,rot};}
    else{const ax=cmd.pts[1];const rx=dist(c,ax),rot=Math.atan2(ax.y-c.y,ax.x-c.x);const ry=Math.abs((p.x-c.x)*-Math.sin(rot)+(p.y-c.y)*Math.cos(rot));cmd.preview={type:'ellipse',layer:layerName(),cx:c.x,cy:c.y,rx,ry,rot};}
  }
  else if((k==='DIM'||k==='DIMALIGNED')&&cmd.step===1&&cmd.pts.length>=2){
    const off=dimOffset(cmd.pts[0],cmd.pts[1],p,k==='DIM');
    cmd.preview={type:'dim',dim:k==='DIM'?'linear':'aligned',layer:dimLayer(),x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:cmd.pts[1].x,y2:cmd.pts[1].y,off,txtH:annoText()};
  }
  else if(k==='CIRCLE'&&cmd.step===1)cmd.preview={type:'circle',layer:layerName(),cx:cmd.pts[0].x,cy:cmd.pts[0].y,r:dist(cmd.pts[0],p)};
  else if(k==='RECT'&&cmd.step===1){
    const c=cmd.pts[0];
    if(cmd.data&&cmd.data.dimMode==='w'){cmd.preview=null;}        // waiting for typed width -> no mouse preview
    else if(cmd.data&&cmd.data.dimMode==='h'){                      // width locked, height follows cursor (or sign of it)
      const w=cmd.data.w; const dirY=(p.y>=c.y)?1:-1; const h=Math.abs(p.y-c.y)*dirY;
      cmd.preview={type:'rect',layer:layerName(),x1:c.x,y1:c.y,x2:c.x+w,y2:c.y+(h||0)};
    }
    else cmd.preview={type:'rect',layer:layerName(),x1:c.x,y1:c.y,x2:p.x,y2:p.y};
  }
  else if(k==='POLYGON'&&cmd.step===1)cmd.preview=makePolygon(cmd.pts[0],p,cmd.data.sides);
  else if((k==='MOVE'||k==='COPY')&&cmd.step===1&&cmd.data){const dx=p.x-cmd.data.base.x,dy=p.y-cmd.data.base.y;cmd.preview=selObjects().map(o=>{const c=cloneObj(o);translateObj(c,dx,dy);return c;});}
  else if(k==='ROTATE'&&cmd.step===1&&cmd.data&&cmd.data.base){
    const r=cmd.data.ref;
    if(r){
      if(r.stage==='cur'&&r.p1){cmd.preview={type:'line',layer:'Construction',x1:r.p1.x,y1:r.p1.y,x2:p.x,y2:p.y};}
      else if(r.stage==='new'){const ang=Math.atan2(p.y-cmd.data.base.y,p.x-cmd.data.base.x)-(r.curAng||0);cmd.preview=selObjects().map(o=>{const c=cloneObj(o);rotateObj(c,cmd.data.base.x,cmd.data.base.y,ang);return c;});}
      else cmd.preview=null;
    } else {const ang=Math.atan2(p.y-cmd.data.base.y,p.x-cmd.data.base.x);cmd.preview=selObjects().map(o=>{const c=cloneObj(o);rotateObj(c,cmd.data.base.x,cmd.data.base.y,ang);return c;});}
  }
  else if(k==='SCALE'&&cmd.step===1&&cmd.data&&cmd.data.base){
    const r=cmd.data.ref;
    if(r){
      if(r.stage==='cur'&&r.p1){cmd.preview={type:'line',layer:'Construction',x1:r.p1.x,y1:r.p1.y,x2:p.x,y2:p.y};}
      else if(r.stage==='new'&&r.curLen){const f=(dist(cmd.data.base,p)/r.curLen)||1;cmd.preview=selObjects().map(o=>{const c=cloneObj(o);scaleObj(c,cmd.data.base.x,cmd.data.base.y,f);return c;});}
      else cmd.preview=null;
    } else {const f=dist(cmd.data.base,p)/50||1;cmd.preview=selObjects().map(o=>{const c=cloneObj(o);scaleObj(c,cmd.data.base.x,cmd.data.base.y,f);return c;});}
  }
  else if(k==='STRETCH'&&cmd.step===1&&cmd.data&&cmd.data.base){const dx=p.x-cmd.data.base.x,dy=p.y-cmd.data.base.y;const win=cmd.data.win;const inWin=(x,y)=>{if(!win)return true;const xmin=Math.min(win.x1,win.x2),xmax=Math.max(win.x1,win.x2),ymin=Math.min(win.y1,win.y2),ymax=Math.max(win.y1,win.y2);return x>=xmin&&x<=xmax&&y>=ymin&&y<=ymax;};cmd.preview=selObjects().map(o=>{const c=cloneObj(o);stretchObj(c,dx,dy,inWin);return c;});}
  else if(k==='MIRROR'&&cmd.pts.length===1)cmd.preview={type:'line',layer:'Construction',x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y};
  else if(k==='ZOOM'&&cmd.pts.length===1){const a=cmd.pts[0];cmd.preview={type:'pline',layer:layerName(),closed:true,pts:[[a.x,a.y],[p.x,a.y],[p.x,p.y],[a.x,p.y]]};}
  else if(k==='PASTECLIP')cmd.preview=pastePreview(p);
}

// ============================================================
//  RIBBON UI
// ============================================================
