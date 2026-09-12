// ============================================================
//  LumoCAD — move/copy/rotate/scale/mirror/array/stretch commit, hatch, dim chains
// ============================================================
function restart(k){endCmd();startCommand(k);}

function commitMoveCopy(k,dest){
  const dx=dest.x-cmd.data.base.x,dy=dest.y-cmd.data.base.y;pushUndo();
  if(k==='MOVE'){for(const o of selObjects())translateObj(o,dx,dy);echo('Moved');selection.clear();endCmd();}
  else{for(const o of selObjects()){const c=copyObj(o);translateObj(c,dx,dy);pushObj(c);}echo('Copied (click for another, Esc to stop)');/*keep copying from same base*/}
  renderProps();render();
}
function commitRotate(ang){pushUndo();const c=cmd.data.base;for(const o of selObjects())rotateObj(o,c.x,c.y,ang);echo(`Rotated ${(ang*180/Math.PI).toFixed(1)}°`);selection.clear();endCmd();renderProps();render();}
function commitScale(f){pushUndo();const c=cmd.data.base;for(const o of selObjects())scaleObj(o,c.x,c.y,f);echo(`Scaled ×${f.toFixed(2)}`);selection.clear();endCmd();renderProps();render();}
function commitMirror(a,b){pushUndo();for(const o of selObjects()){const c=copyObj(o);mirrorObj(c,a.x,a.y,b.x,b.y);pushObj(c);}echo('Mirrored');selection.clear();endCmd();renderProps();render();}
// ALIGN: move+rotate the selection so source point 1 lands on dest 1 and the src1->src2
// direction aligns to dest1->dest2. (Two-point classic ALIGN; no scaling.)
function commitAlign(selIds,pts){
  const [s1,d1,s2,d2]=pts;
  pushUndo();
  const ang=Math.atan2(d2.y-d1.y,d2.x-d1.x)-Math.atan2(s2.y-s1.y,s2.x-s1.x);
  for(const id of selIds){
    const o=byId(id);if(!o)continue;
    rotateObj(o,s1.x,s1.y,ang);          // rotate about the first source point
    translateObj(o,d1.x-s1.x,d1.y-s1.y); // then shift first source point onto first dest
  }
  echo('Aligned');selection.clear();
}
function commitArray(){
  const cols=cmd.data.cols||1, rows=cmd.data.rows||1, dx=(cmd.data.dx==null?50:cmd.data.dx), dy=(cmd.data.dy==null?50:cmd.data.dy);
  if(selection.size===0){echo('ARRAY: nothing selected');endCmd();return;}
  pushUndo();const base=selObjects();
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(r===0&&c===0)continue;for(const src of base){const o=copyObj(src);translateObj(o,c*dx,r*dy);pushObj(o);}}
  echo(`Array ${cols}×${rows} created`);selection.clear();endCmd();renderProps();render();updateInfo();
}

// ---- stretch: move only the vertices that fell inside the crossing window ----
function commitStretch(dest){
  const dx=dest.x-cmd.data.base.x,dy=dest.y-cmd.data.base.y;pushUndo();
  const win=cmd.data.win;
  const inWin=(x,y)=>{if(!win)return true;const xmin=Math.min(win.x1,win.x2),xmax=Math.max(win.x1,win.x2),ymin=Math.min(win.y1,win.y2),ymax=Math.max(win.y1,win.y2);return x>=xmin&&x<=xmax&&y>=ymin&&y<=ymax;};
  for(const o of selObjects())stretchObj(o,dx,dy,inWin);
  echo('Stretched');selection.clear();endCmd();renderProps();render();updateInfo();
}

// ---- join: merge selected collinear lines / chained segments into a polyline ----
// ---- REGION: mark a closed shape as a region (enables mass properties & fill) ----
// ---- HATCH: fill a closed shape with a line pattern ----
const HATCH_PATTERNS={'ANSI31 (diagonal)':{ang:45,gap:4},'Lines (horizontal)':{ang:0,gap:4},'Cross':{ang:45,gap:4,cross:true},'Steel':{ang:45,gap:3},'Concrete':{ang:0,gap:6,dots:true}};
function doHatch(){
  const targets=selObjects().filter(o=>!!entityCall(o,'ring',null));
  choiceDialog({title:'Hatch Pattern',label:'Choose a pattern',choices:Object.keys(HATCH_PATTERNS),
    onPick:(name)=>{
      if(targets.length){
        // something closed was selected: hatch it and stay associated with it
        pushUndo();
        for(const o of targets)add({type:'hatch',layer:o.layer,boundary:o.id,pattern:name,patScale:1});
        echo(`Hatched ${targets.length} region(s) with ${name}`);
        selection.clear();render();renderProps();updateInfo();
        return;
      }
      // nothing selected: pick internal points, the way AutoCAD does it
      cmd.active='HATCH';cmd.step=0;cmd.data={pattern:name,count:0};setActiveTool('HATCH');
      echo('HATCH: click a point inside the area to fill — Esc or Enter when done',true);
      render();
    },onCancel:()=>{endCmd();render();}});
}
// one click inside an area: trace what encloses it and drop a hatch on that
function hatchAtPoint(p){
  const found=traceBoundaryAt(p.x,p.y);
  if(!found){echo('HATCH: '+(boundaryError||'that point is not inside a closed area'),true);return;}
  pushUndo();
  add({type:'hatch',layer:layerName(),poly:found.outer,holes:found.holes,pattern:cmd.data.pattern,patScale:1});
  cmd.data.count++;
  const isl=found.holes.length;
  echo(`HATCH: area ${cmd.data.count} filled${isl?` (${isl} island${isl===1?'':'s'} left clear)`:''} — click another, or Esc when done`,true);
  render();renderProps();updateInfo();
}
// The rings a hatch paints between: the outer boundary first, then any islands. A hatch
// either hosts on a closed object (HATCH with something selected) or carries its own traced
// rings (HATCH by picking an internal point).
function hatchRings(o){
  if(Array.isArray(o.poly)&&o.poly.length>=3)return [o.poly].concat(Array.isArray(o.holes)?o.holes:[]);
  const host=byId(o.boundary);
  const poly=host?hatchBoundary(host):null;
  return poly?[poly]:null;
}
// boundary polygon (world points) of a hatchable object — the same closed outline REGION and
// MASSPROP work from, so what can be hatched and what can be measured never disagree
function hatchBoundary(o){return entityCall(o,'ring',null);}
// The rule that places a hatch's pattern lines. The renderer draws from it and picking tests
// against it, so what you can see is exactly what you can click — the two cannot drift apart.
function hatchPattern(o){
  const pat=HATCH_PATTERNS[o.pattern]||HATCH_PATTERNS['ANSI31 (diagonal)'];
  return {angs:pat.cross?[pat.ang,pat.ang+90]:[pat.ang],
          gap:(pat.gap||4)*(o.patScale||1)*annoScale*0.25};   // world spacing, scale-aware
}
// Where the pattern is anchored: the centre of the outer ring, and the half-length that
// covers it from any angle. Lines sit at offset -diag, -diag+gap, … along the normal.
function hatchFrame(rings){
  const poly=rings[0];
  let minx=1e18,miny=1e18,maxx=-1e18,maxy=-1e18;
  for(const[px,py]of poly){minx=Math.min(minx,px);miny=Math.min(miny,py);maxx=Math.max(maxx,px);maxy=Math.max(maxy,py);}
  return {cx:(minx+maxx)/2,cy:(miny+maxy)/2,diag:Math.hypot(maxx-minx,maxy-miny)};
}
function drawHatch(o,hl,col){
  const rings=hatchRings(o);if(!rings)return;
  const {angs,gap}=hatchPattern(o);if(!(gap>0))return;
  const {cx,cy,diag}=hatchFrame(rings);
  ctx.save();ctx.strokeStyle=hl?'#3b82f6':(o.color||col);ctx.lineWidth=0.8;ctx.setLineDash([]);
  ctx.beginPath();
  for(const angDeg of angs){
    const ang=angDeg*Math.PI/180, dx=Math.cos(ang), dy=Math.sin(ang), nx=-dy, ny=dx;
    for(let d=-diag;d<=diag;d+=gap){
      // line through center offset by d along normal, clipped to polygon
      const lx=cx+nx*d, ly=cy+ny*d;
      const p1={x:lx-dx*diag,y:ly-dy*diag}, p2={x:lx+dx*diag,y:ly+dy*diag};
      const seg=clipLineToRings(p1,p2,rings);
      for(const s of seg){const a=w2s(s[0].x,s[0].y),b=w2s(s[1].x,s[1].y);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
    }
  }
  ctx.stroke();ctx.restore();
}
// Is (x,y) within tol of one of the pattern lines this hatch paints? Answered from the rule
// rather than from generated geometry: the offset of the point along the pattern normal,
// rounded to the nearest line. O(1), and exact against what drawHatch() emits.
function hatchOnPattern(o,rings,x,y,tol){
  const {angs,gap}=hatchPattern(o);if(!(gap>0))return false;
  const f=hatchFrame(rings);
  for(const angDeg of angs){
    const a=angDeg*Math.PI/180, nx=-Math.sin(a), ny=Math.cos(a);
    const d=(x-f.cx)*nx+(y-f.cy)*ny+f.diag;     // distance from the first line of the family
    const k=Math.round(d/gap);
    if(k<0||k*gap>f.diag*2)continue;            // beyond the family — no line drawn there
    if(Math.abs(d-k*gap)<tol)return true;
  }
  return false;
}
// clip a line to a polygon, returning inside spans as [{x,y},{x,y}] pairs
function clipLineToPoly(p1,p2,poly){return clipLineToRings(p1,p2,[poly]);}
// Clip against a set of rings — outer boundary first, then islands. Every crossing of every
// ring goes into one sorted list and the spans pair off even-odd, which is exactly what
// leaves an island unpainted: a scanline crosses outer, hole, hole, outer.
function clipLineToRings(p1,p2,rings){
  const hits=[];const dx=p2.x-p1.x,dy=p2.y-p1.y;
  for(const poly of rings){
    if(!poly||poly.length<3)continue;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const x3=poly[j][0],y3=poly[j][1],x4=poly[i][0],y4=poly[i][1];
      const den=(dx)*(y4-y3)-(dy)*(x4-x3);if(Math.abs(den)<1e-9)continue;
      const t=((x3-p1.x)*(y4-y3)-(y3-p1.y)*(x4-x3))/den;
      const u=((x3-p1.x)*(dy)-(y3-p1.y)*(dx))/den;
      // Half-open along the ring edge: a vertex shared by two edges must contribute ONE
      // crossing, not two, or the even-odd pairing inverts and the fill breaks. A 48-gon
      // cutout has vertices exactly on the horizontal through its centre, so this is not a
      // corner case — it is the middle of the commonest case there is.
      if(u>=0&&u<1&&t>=0&&t<=1)hits.push(t);
    }
  }
  hits.sort((a,b)=>a-b);const spans=[];
  for(let i=0;i+1<hits.length;i+=2){
    spans.push([{x:p1.x+dx*hits[i],y:p1.y+dy*hits[i]},{x:p1.x+dx*hits[i+1],y:p1.y+dy*hits[i+1]}]);
  }
  return spans;
}

// ---- DIMCONTINUE / DIMBASELINE: chain or baseline dimensions from the last linear dim ----
function startDimContinue(mode){
  // find the most recent linear/aligned dim to continue from
  let base=null;for(let i=doc.objects.length-1;i>=0;i--){const o=doc.objects[i];if(o.type==='dim'&&(o.dim==='linear'||o.dim==='aligned')){base=o;break;}}
  if(!base){echo(`${mode==='baseline'?'DIMBASELINE':'DIMCONTINUE'}: create a linear dimension first`);endCmd();return;}
  cmd.active=mode==='baseline'?'DIMBASELINE':'DIMCONTINUE';cmd.data={base};cmd.pts=[];
  echo(`${cmd.active}: specify next point (continues from the last dimension) — Esc to finish`,true);
}
function feedDimChain(p){
  const base=cmd.data.base;
  // previous "to" point: for continue it's the last dim's p2; for baseline it's always base p1
  const prev=cmd.data.last|| {x:base.x2,y:base.y2};
  const origin=(cmd.active==='DIMBASELINE')?{x:base.x1,y:base.y1}:prev;
  pushUndo();
  let off=base.off;
  if(cmd.active==='DIMBASELINE'){off=base.off+(cmd.data.step||1)*(base.txtH||annoText())*1.5*Math.sign(base.off||1);cmd.data.step=(cmd.data.step||1)+1;}
  add({type:'dim',dimStyle:base.dimStyle||doc.dimStyle,dim:base.dim,layer:base.layer,x1:origin.x,y1:origin.y,x2:p.x,y2:p.y,off,txtH:base.txtH,arrow1:base.arrow1,arrow2:base.arrow2,arrowSize:base.arrowSize,color:base.color});
  cmd.data.last={x:p.x,y:p.y};
  echo(`${cmd.active}: next point — Esc to finish`,true);render();updateInfo();
}
