// ============================================================
//  LumoCAD — spatial index, linetypes, entity + dimension drawing, grid
// ============================================================
// ============================================================
//  RENDER
// ============================================================
// ============================================================
//  SPATIAL INDEX + CACHED BOUNDS  (fast rendering of huge drawings)
// ============================================================
// Compute an object's world-space AABB. Cached on the object (o._bb) and invalidated by
// bumping a global version stamp whenever geometry changes.
let _geomVersion=0;
function bumpGeom(){_geomVersion++;_spatialDirty=true;}
function objBounds(o){
  if(o._bbV===_geomVersion&&o._bb)return o._bb;
  const b=entityCall(o,'bounds',null);
  if(!b){
    // dimensions, block references and hatches draw outside any box their own fields
    // describe, so they are treated as everywhere and never culled
    const bb={x1:-Infinity,y1:-Infinity,x2:Infinity,y2:Infinity,big:true};
    o._bb=bb;o._bbV=_geomVersion;return bb;
  }
  const bb={x1:b[0],y1:b[1],x2:b[2],y2:b[3],w:b[2]-b[0],h:b[3]-b[1]};
  o._bb=bb;o._bbV=_geomVersion;return bb;
}
// Uniform-grid spatial index. Rebuilt lazily when geometry changes AND the drawing is large
// enough to benefit (small drawings just use a linear scan — cheaper than maintaining a grid).
let _spatial=null,_spatialDirty=true,_spatialVersion=-1,_spatialBuiltCount=-1;
const SPATIAL_MIN_OBJECTS=2000;
function buildSpatial(){
  const n=doc.objects.length;
  _spatialBuiltCount=n;
  if(n<SPATIAL_MIN_OBJECTS){_spatial=null;_spatialDirty=false;_spatialVersion=_geomVersion;return;}
  // overall extent
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity,finite=0;
  for(const o of doc.objects){if(o.construction)continue;const b=objBounds(o);if(b.big||!isFinite(b.x1))continue;
    if(b.x1<minx)minx=b.x1;if(b.y1<miny)miny=b.y1;if(b.x2>maxx)maxx=b.x2;if(b.y2>maxy)maxy=b.y2;finite++;}
  if(!finite){_spatial=null;_spatialDirty=false;_spatialVersion=_geomVersion;return;}
  // aim for ~ a few objects per cell: cols ≈ sqrt(n)
  const cols=Math.max(1,Math.min(512,Math.round(Math.sqrt(n))));
  const rows=cols;
  const cw=(maxx-minx)/cols||1, ch=(maxy-miny)/rows||1;
  const cells=new Array(cols*rows);
  const big=[];          // objects spanning huge/infinite area -> always checked
  for(let i=0;i<n;i++){const o=doc.objects[i];if(o.construction){big.push(i);continue;}
    const b=objBounds(o);if(b.big||!isFinite(b.x1)){big.push(i);continue;}
    let c0=Math.floor((b.x1-minx)/cw),c1=Math.floor((b.x2-minx)/cw);
    let r0=Math.floor((b.y1-miny)/ch),r1=Math.floor((b.y2-miny)/ch);
    c0=Math.max(0,Math.min(cols-1,c0));c1=Math.max(0,Math.min(cols-1,c1));
    r0=Math.max(0,Math.min(rows-1,r0));r1=Math.max(0,Math.min(rows-1,r1));
    // if an object covers a large fraction of the grid, treat as "big" to avoid bloating cells
    if((c1-c0+1)*(r1-r0+1)>cols*rows*0.25){big.push(i);continue;}
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const k=r*cols+c;(cells[k]||(cells[k]=[])).push(i);}
  }
  _spatial={minx,miny,cw,ch,cols,rows,cells,big};
  _spatialDirty=false;_spatialVersion=_geomVersion;
}
// Return the set of object indices potentially visible in world box vb (or null = "scan all").
function visibleIndices(vb){
  if(_spatialDirty||_spatialVersion!==_geomVersion||_spatialBuiltCount!==doc.objects.length)buildSpatial();
  if(!_spatial)return null;            // small drawing: caller scans linearly
  const s=_spatial;
  let c0=Math.floor((vb.minx-s.minx)/s.cw),c1=Math.floor((vb.maxx-s.minx)/s.cw);
  let r0=Math.floor((vb.miny-s.miny)/s.ch),r1=Math.floor((vb.maxy-s.miny)/s.ch);
  c0=Math.max(0,Math.min(s.cols-1,c0));c1=Math.max(0,Math.min(s.cols-1,c1));
  r0=Math.max(0,Math.min(s.rows-1,r0));r1=Math.max(0,Math.min(s.rows-1,r1));
  const seen=new Set();
  for(const i of s.big)seen.add(i);
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const cell=s.cells[r*s.cols+c];if(cell)for(const i of cell)seen.add(i);}
  return seen;
}
// World-space bounds of the current viewport (with a small margin so thick lines near the edge
// aren't clipped). Used to skip drawing objects that are entirely off-screen.
function viewportWorldBounds(){
  const a=s2w(0,0),b=s2w(W,H);
  const minx=Math.min(a.x,b.x),maxx=Math.max(a.x,b.x);
  const miny=Math.min(a.y,b.y),maxy=Math.max(a.y,b.y);
  const mx=(maxx-minx)*0.05||1, my=(maxy-miny)*0.05||1;
  return {minx:minx-mx,miny:miny-my,maxx:maxx+mx,maxy:maxy+my};
}
// Quick reject: is object o entirely outside view box vb, OR too tiny to see at this zoom?
function offscreen(o,vb){
  if(o.construction)return false;          // infinite lines: always consider on-screen
  const b=objBounds(o);
  if(b.big||!isFinite(b.x1))return false;  // unknown/complex: don't risk culling
  if(b.x2<vb.minx||b.x1>vb.maxx||b.y2<vb.miny||b.y1>vb.maxy)return true;     // fully off-screen
  // sub-pixel: when zoomed way out, an object smaller than ~0.6px on screen can't be seen
  if(o.type!=='text'&&Math.max(b.x2-b.x1,b.y2-b.y1)*view.scale<0.6)return true;
  return false;
}
function render(){
  syncAssociations();   // annotations follow the geometry they measure
  ctx.clearRect(0,0,W,H);
  if(settings.grid)drawGrid();
  const _vb=viewportWorldBounds();   // viewport bounds for culling off-screen objects
  // ---- In-place block edit (REFEDIT): edited contents are vivid, everything else is ghosted ----
  if(editingBlock){
    for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(!o._refedit)drawObject(o,{ghost:true});}
    for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(o._refedit)drawObject(o,selection.has(o.id)?{highlight:true}:{});}
    if(cmd.preview)for(const pv of [].concat(cmd.preview))drawObject(pv,{preview:true});
    if(gripPreview)drawObject(gripPreview,{preview:true});
    if(selRect)drawSelRect();
    if(cursor&&overCanvas&&!panning)drawCrosshair();
    if(snapMark)drawSnapMark(snapMark);
    drawUcsIcon();
    return;
  }
  // (no full-screen axis lines — the short UCS icon at the origin marks 0,0 instead)
  // is a preview-driven transform command active? (move/copy/rotate/scale/stretch with a preview)
  // MOVE/ROTATE/SCALE/STRETCH relocate the original, so fade it; COPY keeps the original in place, so don't.
  const transforming=cmd.preview && ['MOVE','ROTATE','SCALE','STRETCH'].includes(cmd.active);
  // Once a command that consumes the current selection is running, AutoCAD "accepts" the
  // selection and stops showing grips. We keep a coloured highlight (so you can see what's
  // affected) but suppress grips until the original gets ghosted by the live preview.
  const cmdConsumesSelection=cmd.active && ['MOVE','COPY','ROTATE','SCALE','STRETCH','MIRROR','ARRAY','ERASE'].includes(cmd.active);
  const _vis=visibleIndices(_vb);   // Set of candidate indices, or null = scan all
  resetStrokeStyle();
  if(_vis){
    for(const i of _vis){const o=doc.objects[i];if(o&&!selection.has(o.id))drawSceneObject(o,_vb);}
  } else {
    for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(!selection.has(o.id))drawSceneObject(o,_vb);}
  }
  ctx.setLineDash([]);resetStrokeStyle();   // hand the selection pass a clean context
  for(const so of selObjects())drawObject(so,transforming?{ghost:true}:{highlight:true,noGrips:cmdConsumesSelection});
  if(cmd.preview)for(const pv of [].concat(cmd.preview))drawObject(pv,{preview:true});
  // FILLET/CHAMFER: highlight the edge(s) the user has picked so far
  if((cmd.active==='FILLET'||cmd.active==='CHAMFER')&&cmd.data){
    for(const e of [cmd.data.e1,cmd.data.e2]){
      if(!e)continue;const a=w2s(e.seg[0],e.seg[1]),b=w2s(e.seg[2],e.seg[3]);
      ctx.save();ctx.strokeStyle='#22d3ee';ctx.lineWidth=3;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
    }
  }
  if(gripPreview)drawObject(gripPreview,{preview:true});
  if(selRect)drawSelRect();
  if(cursor&&overCanvas&&!panning)drawCrosshair();
  if(snapMark)drawSnapMark(snapMark);
  drawUcsIcon();
}
function drawUcsIcon(){
  // draws the UCS origin marker with X (red) and Y (green) axes
  const o=w2s(ucs.ox,ucs.oy);
  const L=46; const c=Math.cos(ucs.ang),s=Math.sin(ucs.ang);
  // X axis tip (world): origin + L*(c,s); but screen Y is flipped
  const xt={x:o.x+L*c, y:o.y-L*s};
  const yt={x:o.x-L*s, y:o.y-L*c}; // Y axis = X rotated +90°
  ctx.lineWidth=2;ctx.setLineDash([]);
  ctx.strokeStyle=ucsActive()?'#ef4444':'rgba(239,68,68,0.6)';
  ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(xt.x,xt.y);ctx.stroke();
  ctx.strokeStyle=ucsActive()?'#22c55e':'rgba(34,197,94,0.6)';
  ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(yt.x,yt.y);ctx.stroke();
  ctx.fillStyle='#94a3b8';ctx.font='10px monospace';
  ctx.fillText('X',xt.x+3,xt.y+3);ctx.fillText('Y',yt.x+3,yt.y+3);
  // small square at origin
  ctx.strokeStyle='#94a3b8';ctx.lineWidth=1;ctx.strokeRect(o.x-3,o.y-3,6,6);
}
function drawGrid(){
  let step = (gridSize>0) ? gridSize : niceStep(60/view.scale);
  // if a fixed grid is too dense on screen, skip drawing minor lines to avoid a solid block
  const px=step*view.scale;
  const tl=s2w(0,0),br=s2w(W,H);ctx.lineWidth=1;
  if(px>=4){ctx.strokeStyle='rgba(59,130,246,0.05)';gl(step,tl,br);}
  ctx.strokeStyle='rgba(59,130,246,0.1)';gl(step*5,tl,br);
}
function gl(step,tl,br){ctx.beginPath();const x0=Math.floor(tl.x/step)*step;for(let x=x0;x<br.x;x+=step){const s=w2s(x,0);ctx.moveTo(s.x,0);ctx.lineTo(s.x,H);}const y0=Math.floor(br.y/step)*step;for(let y=y0;y<tl.y;y+=step){const s=w2s(0,y);ctx.moveTo(0,s.y);ctx.lineTo(W,s.y);}ctx.stroke();}
function niceStep(raw){const p=Math.pow(10,Math.floor(Math.log10(raw)));const n=raw/p;let m=1;if(n>=5)m=5;else if(n>=2)m=2;return m*p;}
function drawAxes(){const o=w2s(0,0);ctx.lineWidth=1.2;ctx.strokeStyle='rgba(239,68,68,0.3)';ctx.beginPath();ctx.moveTo(0,o.y);ctx.lineTo(W,o.y);ctx.stroke();ctx.strokeStyle='rgba(34,197,94,0.3)';ctx.beginPath();ctx.moveTo(o.x,0);ctx.lineTo(o.x,H);ctx.stroke();}
let _layerMap=null;
function _rebuildLayerMap(){_layerMap=new Map();for(const l of doc.layers)_layerMap.set(l.name,l);}
function layerByName(n){if(!_layerMap||_layerMap.size!==doc.layers.length)_rebuildLayerMap();let l=_layerMap.get(n);if(!l&&doc.layers.find(x=>x.name===n)){_rebuildLayerMap();l=_layerMap.get(n);}return l;}
function layerColor(n){const l=layerByName(n);return l?l.color:'#f1f5f9';}
// A layer draws when it is on and not frozen. Off and Frozen both hide; Frozen also drops
// the layer out of ZOOM Extents, which is the reason AutoCAD has both.
function layerOn(n){const l=layerByName(n);return l?(l.on!==false&&!l.frozen):true;}
function layerFrozen(n){const l=layerByName(n);return l?!!l.frozen:false;}
// A locked layer is visible but cannot be picked, selected or edited.
function layerLocked(n){const l=layerByName(n);return l?!!l.locked:false;}
// Plot=off keeps a layer on screen and out of the plot: setting-out lines, notes to self.
function layerPlots(n){const l=layerByName(n);return l?l.plot!==false:true;}
// what a command may touch: visible and unlocked
function layerEditable(n){return layerOn(n)&&!layerLocked(n);}
// AutoCAD-style linetypes: name -> dash pattern in *world units* (scaled by view at draw time)
const LINETYPES={
  'Continuous':[],
  'Dashed':[12,7],
  'Hidden':[6,4],
  'Dotted':[1,5],
  'Dash-Dot':[12,5,1,5],
  'Center':[20,5,4,5],
  'Phantom':[20,5,4,5,4,5],
};
const LINETYPE_NAMES=Object.keys(LINETYPES);
const LINEWEIGHTS=[0.25,0.35,0.5,0.7,1.0,1.4,2.0];   // mm-style, mapped to px on screen
function layerOf(n){return layerByName(n);}   // cached; this was a linear scan per object per frame
// resolve an object's effective linetype/lineweight (object override else ByLayer)
function effLinetype(o){if(o.linetype&&o.linetype!=='ByLayer')return o.linetype;const l=layerOf(o.layer);return l&&l.linetype?l.linetype:'Continuous';}
function effLineweight(o){if(o.lineweight!=null)return o.lineweight;const l=layerOf(o.layer);return l&&l.lineweight!=null?l.lineweight:0.35;}
// build the canvas dash array (in screen px) for a linetype at current zoom
function dashFor(o){const pat=LINETYPES[effLinetype(o)]||[];const s=(o.ltscale!=null&&o.ltscale>0)?o.ltscale:1;return pat.map(v=>Math.max(1,v*view.scale*0.25*s));}
function lwPx(o){return Math.max(1,effLineweight(o)*1.4);}

// ---- geometry only ----
// Appends this object's outline to the CURRENT path; strokes nothing, begins nothing.
// drawObject() and the fast stroked path in render() both go through here, so the two can
// never drift apart about what a polyline or a bulged arc segment looks like.
// Returns false for the types that paint themselves — text, dimensions, hatch, leaders and
// block instances still need drawObject.
function pathObject(o){
  if(o.type==='line'){const a=w2s(o.x1,o.y1),b=w2s(o.x2,o.y2);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
  else if(o.type==='circle'){const c=w2s(o.cx,o.cy);ctx.arc(c.x,c.y,o.r*view.scale,0,Math.PI*2);}
  else if(o.type==='arc'){const c=w2s(o.cx,o.cy);ctx.arc(c.x,c.y,o.r*view.scale,-o.a2,-o.a1,true);}
  else if(o.type==='ellipse'){const c=w2s(o.cx,o.cy);ctx.ellipse(c.x,c.y,o.rx*view.scale,o.ry*view.scale,-(o.rot||0),0,Math.PI*2);}
  else if(o.type==='spline'){
    const pts=o.pts.map(q=>w2s(q[0],q[1]));
    if(pts.length<3){for(let i=0;i<pts.length;i++)i===0?ctx.moveTo(pts[i].x,pts[i].y):ctx.lineTo(pts[i].x,pts[i].y);}
    else{ // Catmull-Rom through the control points -> smooth curve
      ctx.moveTo(pts[0].x,pts[0].y);
      for(let i=0;i<pts.length-1;i++){
        const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
        const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6;
        const c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
        ctx.bezierCurveTo(c1x,c1y,c2x,c2y,p2.x,p2.y);
      }
    }
  }
  else if(o.type==='rect'){const a=w2s(o.x1,o.y1),b=w2s(o.x2,o.y2);ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y);}
  else if(o.type==='pline'){
    const n=o.pts.length;
    const segCount=o.closed?n:n-1;
    let started=false;
    for(let i=0;i<segCount;i++){
      const a=o.pts[i], b=o.pts[(i+1)%n];
      const sa=w2s(a[0],a[1]);
      if(!started){ctx.moveTo(sa.x,sa.y);started=true;}
      const seg=o.segs&&o.segs[i];
      if(seg&&seg.arc){
        // Draw the arc a -> b around its stored center. The sweep DIRECTION comes from the DXF
        // bulge sign (bulge>0 = CCW in world). Screen space is y-down, so a world-CCW sweep is
        // drawn clockwise on screen -> ctx.arc anticlockwise flag is the inverse of the world sign.
        const c=w2s(seg.cx,seg.cy);
        const sb=w2s(b[0],b[1]);
        const a1=Math.atan2(sa.y-c.y,sa.x-c.x);   // start (current path point = a)
        const a2=Math.atan2(sb.y-c.y,sb.x-c.x);   // end (b)
        const worldCCW=(seg.sweep!=null? seg.sweep>0 : (seg.bulge||0)>0);
        ctx.arc(c.x,c.y,seg.r*view.scale,a1,a2,worldCCW);  // y-down flips the world direction
      } else {
        const sb=w2s(b[0],b[1]);ctx.lineTo(sb.x,sb.y);
      }
    }
    if(o.closed)ctx.closePath();
  }
  else if(o.type==='point'){const p=w2s(o.x,o.y);ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x+4,p.y);ctx.moveTo(p.x,p.y-4);ctx.lineTo(p.x,p.y+4);}
  else return false;
  return true;
}
// the types pathObject() can draw, and so the ones eligible for the fast path
const FAST_TYPES=new Set(['line','circle','arc','ellipse','spline','rect','pline','point']);
const NO_DASH=[];

// ---- the fast stroked path ----
// Measured at 20 000 visible entities: a frame cost about 224 ms, and almost none of that was
// the drawing. ctx.save()/restore() per object was ~274 ms of work on its own, and re-writing
// strokeStyle / lineWidth / setLineDash for every entity most of the rest; the actual stroke
// calls were ~12 ms. So the plain stroked types skip save/restore entirely — they only ever
// touch those three properties — and write each one only when it CHANGES from the previous
// object. 224 ms -> 51 ms, a 4.4x frame, with document order preserved exactly.
//
// Grouping by style instead would reach 34 ms, but it reorders the drawing, and which stroke
// sits on top of which is not ours to rearrange behind the user's back.
let _sCol=null,_sLw=null,_sDash=null;
function resetStrokeStyle(){_sCol=null;_sLw=null;_sDash=null;}
function fastDrawable(o){
  return FAST_TYPES.has(o.type)&&!o.region&&!o.transparency&&layerOn(o.layer);
}
function strokeFast(o){
  const col=o.color||layerColor(o.layer);
  if(col!==_sCol){ctx.strokeStyle=col;_sCol=col;}
  const lw=lwPx(o);
  if(lw!==_sLw){ctx.lineWidth=lw;_sLw=lw;}
  const lt=effLinetype(o);
  // the dash pattern depends on the linetype, its scale and the zoom; the zoom is fixed for
  // the frame, so the key only has to carry the first two
  const key=(lt==='Continuous')?'':lt+'|'+(o.ltscale!=null?o.ltscale:1);
  if(key!==_sDash){ctx.setLineDash(key?dashFor(o):NO_DASH);_sDash=key;}
  ctx.beginPath();
  pathObject(o);
  ctx.stroke();
}
// one entity, drawn whichever way suits it
function drawSceneObject(o,vb){
  if(!o||offscreen(o,vb))return;
  if(fastDrawable(o))strokeFast(o);
  else{drawObject(o,{});resetStrokeStyle();}   // drawObject saves and restores its own state
}

function drawObject(o,opt){
  const preview=opt.preview,highlight=opt.highlight,ghost=opt.ghost,noGrips=opt.noGrips;
  if(!preview&&!layerOn(o.layer))return;
  let col=preview?'#60a5fa':(o.color||layerColor(o.layer));
  ctx.save();
  if(ghost)ctx.globalAlpha=0.25;   // faded original while a transform preview is showing
  else if(!preview&&o.transparency)ctx.globalAlpha=Math.max(0.1,1-(o.transparency/100));  // object transparency (0–90%)
  if(preview){ctx.strokeStyle='#60a5fa';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);}
  else if(highlight){ctx.strokeStyle='#3b82f6';ctx.lineWidth=2.4;ctx.setLineDash([]);}
  else{ctx.strokeStyle=col;ctx.lineWidth=lwPx(o);ctx.setLineDash(dashFor(o));}
  ctx.fillStyle=col;
  ctx.beginPath();
  // light fill for regions
  if(o.region&&!preview){
    ctx.save();ctx.globalAlpha=0.12;ctx.fillStyle=col;ctx.beginPath();
    if(o.type==='circle'){const c=w2s(o.cx,o.cy);ctx.arc(c.x,c.y,o.r*view.scale,0,Math.PI*2);}
    else if(o.type==='rect'){const a=w2s(o.x1,o.y1),b=w2s(o.x2,o.y2);ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y);}
    else if(o.type==='pline'){for(let i=0;i<o.pts.length;i++){const p=w2s(o.pts[i][0],o.pts[i][1]);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);}ctx.closePath();}
    ctx.fill();ctx.restore();ctx.beginPath();
  }
  if(pathObject(o))ctx.stroke();
  else if(o.type==='text'){
    const p=w2s(o.x,o.y);ctx.setLineDash([]);ctx.fillStyle=highlight?'#3b82f6':(o.color||col);
    const fam=txtProp(o,'font','monospace');
    const style=(txtProp(o,'italic',false)?'italic ':'')+(txtProp(o,'bold',false)?'bold ':'');
    const th=styleTextHeight(o,false);
    ctx.font=`${style}${(th*view.scale)}px ${fam}`;
    ctx.textBaseline='alphabetic';ctx.textAlign=o.align||'left';
    const lh=styleTextHeight(o,false)*1.35*view.scale;
    // MTEXT: word-wrap each paragraph to the box width (in screen px); TEXT: literal lines
    let lines;
    if(o.mtext&&o.width){
      const wpx=o.width*view.scale;lines=[];
      for(const para of String(o.str).split('\n')){
        const words=para.split(/\s+/);let cur='';
        for(const w of words){
          const test=cur?cur+' '+w:w;
          if(ctx.measureText(test).width>wpx&&cur){lines.push(cur);cur=w;}
          else cur=test;
        }
        lines.push(cur);
      }
    } else {
      lines=String(o.str).split('\n');
    }
    const ang=(o.rot||0);
    if(ang){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-ang*Math.PI/180);lines.forEach((ln,i)=>ctx.fillText(ln,0,i*lh));ctx.restore();}
    else lines.forEach((ln,i)=>ctx.fillText(ln,p.x,p.y+i*lh));
    ctx.textAlign='left';
    // faint box outline for mtext when selected, so the wrap width is visible
    if(o.mtext&&o.width&&highlight){
      const wpx=o.width*view.scale;ctx.save();ctx.strokeStyle='#3b82f6';ctx.globalAlpha=0.4;ctx.setLineDash([4,3]);
      ctx.strokeRect(p.x,p.y-styleTextHeight(o,false)*view.scale,wpx,lines.length*lh);ctx.restore();
    }
  }
  else if(o.type==='dim'){drawDim(o,highlight,col);}
  else if(o.type==='hatch'){drawHatch(o,highlight,col);}
  else if(o.type==='leader'){drawLeader(o,highlight,col);}
  else if(o.type==='block'){
    const def=doc.blocks[o.name];
    if(def){for(const part of def.objects){const c=cloneObj(part);translateObj(c,o.x,o.y);if(!c.layer)c.layer=o.layer;drawObject(c,{preview,highlight,ghost});}}
    // draw the insertion handle marker
    const ip=w2s(o.x,o.y);ctx.save();ctx.strokeStyle=highlight?'#3b82f6':'rgba(148,163,184,0.5)';ctx.lineWidth=highlight?2:1;ctx.strokeRect(ip.x-3,ip.y-3,6,6);ctx.restore();
  }
  ctx.setLineDash([]);
  if(highlight&&!noGrips&&o.type!=='dim'){
    const grips=gripPoints(o);
    ctx.lineWidth=1.5;
    const hov=(hoverGrip&&doc.objects[hoverGrip.obj]===o)?hoverGrip.grip:-1;
    for(let gi=0;gi<grips.length;gi++){const g=grips[gi];const s=w2s(g.x,g.y);
      const isHot=(gi===hov);
      if(isHot){
        // hovered grip: brighter, slightly larger filled marker (AutoCAD "hot grip" look)
        ctx.fillStyle='#60a5fa';ctx.strokeStyle='#bfdbfe';
        ctx.fillRect(s.x-5,s.y-5,10,10);ctx.strokeRect(s.x-5,s.y-5,10,10);
      } else {
        ctx.fillStyle=g.mid?'rgba(59,130,246,0.35)':'#3b82f6';
        ctx.strokeStyle='#3b82f6';
        ctx.fillRect(s.x-4,s.y-4,8,8);ctx.strokeRect(s.x-4,s.y-4,8,8);
      }
    }
  }
  ctx.restore();
}
// grips for a selected object: endpoints/vertices (solid) + edge-midpoints (hollow-ish)
// grips for a selected object: endpoints/vertices (solid) + edge-midpoints (hollow-ish)
function gripPoints(o){
  const g=entityCall(o,'grips',null);
  if(g)return g;
  return objPoints(o).map(p=>({x:p[0],y:p[1]}));
}
function drawLeader(o,hl,col){
  const pts=o.pts;if(!pts||pts.length<2)return;
  ctx.strokeStyle=hl?'#3b82f6':col;ctx.fillStyle=hl?'#3b82f6':col;ctx.lineWidth=1.2;ctx.setLineDash([]);
  // poly line through all points (screen)
  ctx.beginPath();const s0=w2s(pts[0][0],pts[0][1]);ctx.moveTo(s0.x,s0.y);
  for(let i=1;i<pts.length;i++){const s=w2s(pts[i][0],pts[i][1]);ctx.lineTo(s.x,s.y);}
  // MLEADER: add a short horizontal landing (tail) at the end, on the side the text sits
  let landEnd=w2s(pts[pts.length-1][0],pts[pts.length-1][1]);
  const goingRight=pts.length<2?true:(pts[pts.length-1][0]>=pts[pts.length-2][0]);
  if(o.mleader){
    const landPx=(o.landing!=null?o.landing:8)*view.scale||24;
    const lx=landEnd.x+(goingRight?1:-1)*Math.max(18,landPx);
    ctx.lineTo(lx,landEnd.y);
    landEnd={x:lx,y:landEnd.y};
  }
  ctx.stroke();
  // arrowhead at the FIRST point, pointing from pts[1] -> pts[0]
  const tip=w2s(pts[0][0],pts[0][1]), nxt=w2s(pts[1][0],pts[1][1]);
  const ang=Math.atan2(tip.y-nxt.y,tip.x-nxt.x);
  const aLen=12;   // arrowhead length in screen px (kept readable at any zoom)
  const aw=aLen*0.4;
  ctx.beginPath();ctx.moveTo(tip.x,tip.y);
  ctx.lineTo(tip.x-aLen*Math.cos(ang-Math.atan2(aw,aLen)),tip.y-aLen*Math.sin(ang-Math.atan2(aw,aLen)));
  ctx.lineTo(tip.x-aLen*Math.cos(ang+Math.atan2(aw,aLen)),tip.y-aLen*Math.sin(ang+Math.atan2(aw,aLen)));
  ctx.closePath();ctx.fill();
  // text at the landing end, offset slightly
  if(o.str){
    const fontPx=Math.max(8,styleTextHeight(o,true)*view.scale);
    ctx.font=`${txtProp(o,'italic',false)?'italic ':''}${txtProp(o,'bold',false)?'bold ':''}${fontPx}px ${txtProp(o,'font','monospace')}`;
    ctx.textBaseline='middle';
    ctx.textAlign=goingRight?'left':'right';
    const pad=4*(goingRight?1:-1);
    String(o.str).split('\n').forEach((ln,i)=>ctx.fillText(ln,landEnd.x+pad,landEnd.y+i*fontPx*1.2));
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
}
// pick the dimension layer: a 'Dimensions' layer if present, else the active layer
function dimLayer(){const d=doc.layers.find(l=>l.name==='Dimensions');return d?d.name:layerName();}
// signed offset (world units) from the measured segment to the clicked point
function dimOffset(p1,p2,pick,linear){
  let dx=p2.x-p1.x, dy=p2.y-p1.y;
  if(linear){ if(Math.abs(dx)>=Math.abs(dy))dy=0; else dx=0; }
  const len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len;
  return (pick.x-p1.x)*nx + (pick.y-p1.y)*ny;
}
function drawDim(o,hl,col){
  const dcol=hl?'#3b82f6':(o.color||col);
  ctx.strokeStyle=dcol;ctx.fillStyle=dcol;ctx.lineWidth=o.lineWidth||1.2;ctx.setLineDash([]);
  // dim text height follows annotation scale (model mm) -> screen px
  const txtH=styleTextHeight(o,true);const fontPx=Math.max(8,txtH*view.scale);
  ctx.font=`${fontPx}px monospace`;
  const dimKind=o.dim||'linear';
  if(dimKind==='radius'||dimKind==='diameter'){
    const c=w2s(o.cx,o.cy);const ang=o.ang||0;const rEnd=w2s(o.cx+o.r*Math.cos(ang),o.cy+o.r*Math.sin(ang));
    ctx.beginPath();
    if(dimKind==='diameter'){const rStart=w2s(o.cx-o.r*Math.cos(ang),o.cy-o.r*Math.sin(ang));ctx.moveTo(rStart.x,rStart.y);ctx.lineTo(rEnd.x,rEnd.y);}
    else{ctx.moveTo(c.x,c.y);ctx.lineTo(rEnd.x,rEnd.y);}
    ctx.stroke();
    const label=(dimKind==='diameter'?'Ø':'R')+(dimKind==='diameter'?(o.r*2):o.r).toFixed(1);
    ctx.textAlign='left';ctx.fillText(label,rEnd.x+4,rEnd.y-2);
    return;
  }
  if(dimKind==='angular'){
    const c=w2s(o.cx,o.cy);const r=40;
    ctx.beginPath();ctx.arc(c.x,c.y,r,-o.a2,-o.a1,true);ctx.stroke();
    let deg=((o.a2-o.a1)*180/Math.PI);deg=((deg%360)+360)%360;
    ctx.textAlign='center';ctx.fillText(deg.toFixed(1)+'°',c.x+ (r+12)*Math.cos(-(o.a1+o.a2)/2), c.y + (r+12)*Math.sin(-(o.a1+o.a2)/2));ctx.textAlign='left';
    return;
  }
  // linear & aligned — full dimension geometry in WORLD space, then project to screen
  let wdx=o.x2-o.x1, wdy=o.y2-o.y1;
  if(dimKind==='linear'){ if(Math.abs(wdx)>=Math.abs(wdy))wdy=0; else wdx=0; }
  const wlen=Math.hypot(wdx,wdy)||1;
  const wnx=-wdy/wlen, wny=wdx/wlen;       // world normal (toward the dim line)
  const sgn=o.off>=0?1:-1;
  // scale-aware extension settings (mm on paper × annoScale), with sensible defaults
  const sc=annoScale;
  const extOffset=dimProp(o,'extOffset',ANNO_PAPER.gap)*sc;   // gap from measured point to start of ext line
  const extExt=dimProp(o,'extExt',ANNO_PAPER.ext)*sc;            // how far ext line passes the dim line
  const dimExt=(o.dimLineExt!=null?o.dimLineExt:0)*sc;                 // dim line past the ext lines
  // points on the dimension line (offset from the measured points)
  const ox=wnx*o.off, oy=wny*o.off;
  const a2={x:o.x1+ox,y:o.y1+oy}, b2={x:o.x2+ox,y:o.y2+oy};
  // extension lines: start a small gap away from the measured point, end a bit past the dim line
  const e1s={x:o.x1+wnx*sgn*extOffset, y:o.y1+wny*sgn*extOffset};
  const e1e={x:a2.x+wnx*sgn*extExt, y:a2.y+wny*sgn*extExt};
  const e2s={x:o.x2+wnx*sgn*extOffset, y:o.y2+wny*sgn*extOffset};
  const e2e={x:b2.x+wnx*sgn*extExt, y:b2.y+wny*sgn*extExt};
  // dim line, optionally extended past the ext lines
  const dirx=(b2.x-a2.x)/wlen, diry=(b2.y-a2.y)/wlen;
  const dla={x:a2.x-dirx*dimExt, y:a2.y-diry*dimExt}, dlb={x:b2.x+dirx*dimExt, y:b2.y+diry*dimExt};
  const A2=w2s(a2.x,a2.y), B2=w2s(b2.x,b2.y);
  // draw extension lines (each can be toggled off)
  ctx.beginPath();
  if(o.extLine1!==false){const s=w2s(e1s.x,e1s.y),e=w2s(e1e.x,e1e.y);ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);}
  if(o.extLine2!==false){const s=w2s(e2s.x,e2s.y),e=w2s(e2e.x,e2e.y);ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);}
  // dim line
  {const s=w2s(dla.x,dla.y),e=w2s(dlb.x,dlb.y);ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);}
  ctx.stroke();
  // arrowheads (independent ends)
  drawDimArrow(A2,B2,o,1);drawDimArrow(B2,A2,o,2);
  // measurement text
  let measure;
  if(dimKind==='linear'){measure=(Math.abs(o.x2-o.x1)>=Math.abs(o.y2-o.y1)?Math.abs(o.x2-o.x1):Math.abs(o.y2-o.y1));}
  else{measure=Math.hypot(o.x2-o.x1,o.y2-o.y1);}
  let label=(o.textOverride&&o.textOverride.length)?o.textOverride:measure.toFixed(o.precision!=null?o.precision:1);
  label=(o.prefix||'')+label+(o.suffix||'');
  // text position: centered along the dim line; 'above' nudges it off the line
  const midx=(A2.x+B2.x)/2, midy=(A2.y+B2.y)/2;
  const fontPxNow=Math.max(8,styleTextHeight(o,true)*view.scale);
  // unit normal of the dim line on screen, pointing to the side away from the measured object
  let snx=A2.x-w2s(o.x1,o.y1).x, sny=A2.y-w2s(o.x1,o.y1).y;const snl=Math.hypot(snx,sny)||1;snx/=snl;sny/=snl;
  const vert=o.textPos||'above';
  let tx=midx, ty=midy+fontPxNow*0.35;   // centered baseline default
  if(vert==='above'){const nudge=fontPxNow*0.7+2;tx+=snx*nudge;ty+=sny*nudge+fontPxNow*0.35;}
  // fill behind text (optional)
  if(o.fillColor&&o.fillColor!=='none'){
    ctx.save();ctx.font=`${fontPxNow}px monospace`;const tw=ctx.measureText(label).width;
    ctx.fillStyle=o.fillColor;ctx.fillRect(tx-tw/2-3,ty-fontPxNow*0.8,tw+6,fontPxNow*1.1);ctx.restore();
  }
  if(o.textColor&&!hl)ctx.fillStyle=o.textColor;else ctx.fillStyle=hl?'#3b82f6':dcol;
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(label,tx,ty);ctx.textAlign='left';
  ctx.fillStyle=dcol;
}
// arrowhead at screen point `tip`, pointing away from `from`, honoring the dim's arrow style/size
function drawDimArrow(tip,from,o,which){
  // arrow type resolved per-end: arrow1/arrow2 if set, else legacy o.arrow, else 'closed'
  let type='closed';
  if(o){
    if(which===1)type=o.arrow1||dimProp(o,'arrow','closed');
    else if(which===2)type=o.arrow2||dimProp(o,'arrow','closed');
    else type=o.arrow||'closed';
  }
  const sz=(o?dimProp(o,'arrowSize',9):9);             // screen px
  const ang=Math.atan2(tip.y-from.y,tip.x-from.x);
  if(type==='none')return;
  if(type==='dot'){ctx.beginPath();ctx.arc(tip.x,tip.y,sz*0.32,0,Math.PI*2);ctx.fill();return;}
  if(type==='oblique'){ // architectural tick: short 45° slash through the point
    const a=ang+Math.PI/4;const l=sz*0.7;
    ctx.beginPath();ctx.moveTo(tip.x-l*Math.cos(a),tip.y-l*Math.sin(a));ctx.lineTo(tip.x+l*Math.cos(a),tip.y+l*Math.sin(a));
    const lw=ctx.lineWidth;ctx.lineWidth=Math.max(1.5,lw);ctx.stroke();ctx.lineWidth=lw;return;
  }
  const w=sz*0.36;
  const x1=tip.x-sz*Math.cos(ang-Math.atan2(w,sz)), y1=tip.y-sz*Math.sin(ang-Math.atan2(w,sz));
  const x2=tip.x-sz*Math.cos(ang+Math.atan2(w,sz)), y2=tip.y-sz*Math.sin(ang+Math.atan2(w,sz));
  ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.closePath();
  if(type==='open'){ctx.stroke();}      // open (just outline)
  else{ctx.fill();}                       // closed filled (default)
}
function drawSnapMark(m){const s=w2s(m.x,m.y);ctx.strokeStyle='#22c55e';ctx.lineWidth=1.5;ctx.setLineDash([]);
  if(m.kind==='end'){ctx.strokeRect(s.x-5,s.y-5,10,10);}
  else if(m.kind==='mid'){ctx.beginPath();ctx.moveTo(s.x,s.y-6);ctx.lineTo(s.x+6,s.y+5);ctx.lineTo(s.x-6,s.y+5);ctx.closePath();ctx.stroke();}
  else if(m.kind==='center'){ctx.beginPath();ctx.arc(s.x,s.y,6,0,Math.PI*2);ctx.stroke();}
  else if(m.kind==='quad'){ctx.beginPath();ctx.moveTo(s.x,s.y-6);ctx.lineTo(s.x+6,s.y);ctx.lineTo(s.x,s.y+6);ctx.lineTo(s.x-6,s.y);ctx.closePath();ctx.stroke();}
  else if(m.kind==='int'){ctx.beginPath();ctx.moveTo(s.x-5,s.y-5);ctx.lineTo(s.x+5,s.y+5);ctx.moveTo(s.x+5,s.y-5);ctx.lineTo(s.x-5,s.y+5);ctx.stroke();}
  else if(m.kind==='perp'){ctx.beginPath();ctx.moveTo(s.x-6,s.y-6);ctx.lineTo(s.x-6,s.y+6);ctx.lineTo(s.x+6,s.y+6);ctx.moveTo(s.x-6,s.y+2);ctx.lineTo(s.x+2,s.y+2);ctx.lineTo(s.x+2,s.y+6);ctx.stroke();}
  else if(m.kind==='node'){ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.moveTo(s.x-6,s.y);ctx.lineTo(s.x+6,s.y);ctx.moveTo(s.x,s.y-6);ctx.lineTo(s.x,s.y+6);ctx.stroke();}
  else if(m.kind==='nearest'){ctx.beginPath();ctx.moveTo(s.x-6,s.y-6);ctx.lineTo(s.x+6,s.y+6);ctx.moveTo(s.x-6,s.y+6);ctx.lineTo(s.x+6,s.y-6);ctx.moveTo(s.x-6,s.y-6);ctx.lineTo(s.x+6,s.y-6);ctx.moveTo(s.x-6,s.y+6);ctx.lineTo(s.x+6,s.y+6);ctx.stroke();}
}
function drawCrosshair(){
  const cp=trueCursor||cursor;
  const s=w2s(cp.x,cp.y);
  ctx.setLineDash([]);
  const pb=4;     // half-size of the central pick-box
  // CURSORSIZE: percent of the viewport height. 100% -> arms reach the screen edges (full crosshair).
  const pct=Math.max(1,Math.min(100,settings.cursorSize||8));
  const arm=(pct>=100)?Math.max(W,H):(H*pct/100)/2;
  ctx.strokeStyle='rgba(241,245,249,0.7)';ctx.lineWidth=1;
  ctx.beginPath();
  // horizontal arms (gap left for the pick-box)
  ctx.moveTo(s.x-pb-arm,s.y);ctx.lineTo(s.x-pb,s.y);
  ctx.moveTo(s.x+pb,s.y);ctx.lineTo(s.x+pb+arm,s.y);
  // vertical arms
  ctx.moveTo(s.x,s.y-pb-arm);ctx.lineTo(s.x,s.y-pb);
  ctx.moveTo(s.x,s.y+pb);ctx.lineTo(s.x,s.y+pb+arm);
  ctx.stroke();
  // central pick-box — but hide it while a snap marker is shown, so the two don't overlap.
  // (The snap marker itself indicates where a click will land, taking the pick-box's role.)
  if(!snapMark)ctx.strokeRect(s.x-pb,s.y-pb,pb*2,pb*2);
}
function drawSelRect(){const a=w2s(selRect.x1,selRect.y1),b=w2s(selRect.x2,selRect.y2);const cross=selRect.x2<selRect.x1;ctx.setLineDash(cross?[5,3]:[]);ctx.strokeStyle=cross?'#22c55e':'#3b82f6';ctx.fillStyle=cross?'rgba(34,197,94,0.08)':'rgba(59,130,246,0.08)';ctx.lineWidth=1;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}

// ============================================================
