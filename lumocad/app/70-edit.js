// ============================================================
//  LumoCAD — offset, trim, extend, fillet, chamfer, break, lengthen, divide
// ============================================================
// Which side of the directed segment a->b the point p falls on: +1 left, -1 right.
// doOffset builds its normal as the LEFT normal (-dy, dx)/len, so +1 means "toward p".
// (This was called from two places and defined in none of them, which made OFFSET throw a
// ReferenceError on every line and polyline.)
function offsetSign(a,b,p){
  const cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  return cross>=0?1:-1;
}
function doOffset(p){
  // Step 1: pick the object to offset. Step 2: click the side.
  if(cmd.data.obj==null){
    const i=pickObject(p.x,p.y);if(i<0){echo('OFFSET: click an object to offset');return;}
    cmd.data.obj=i;
    selection.clear();selection.add(idAt(i));   // highlight the picked object so the user sees what's selected
    echo(`OFFSET: click the side to offset (distance ${cmd.data.dist})`,true);
    renderProps();render();return;
  }
  const i=cmd.data.obj;const o=doc.objects[i];const d=cmd.data.dist;pushUndo();
  if(o.type==='line'){let dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.hypot(dx,dy)||1;let nx=-dy/len,ny=dx/len;const side=offsetSign({x:o.x1,y:o.y1},{x:o.x2,y:o.y2},p);add({type:'line',layer:o.layer,x1:o.x1+nx*d*side,y1:o.y1+ny*d*side,x2:o.x2+nx*d*side,y2:o.y2+ny*d*side});}
  else if(o.type==='circle'){const dir=dist({x:o.cx,y:o.cy},p)>o.r?1:-1;add({type:'circle',layer:o.layer,cx:o.cx,cy:o.cy,r:Math.max(0.1,o.r+d*dir)});}
  else if(o.type==='rect'){const cx=(o.x1+o.x2)/2,cy=(o.y1+o.y2)/2;const out=(p.x<o.x1||p.x>o.x2||p.y<o.y1||p.y>o.y2)?1:-1;add({type:'rect',layer:o.layer,x1:o.x1-d*out,y1:o.y1-d*out,x2:o.x2+d*out,y2:o.y2+d*out});}
  else if(o.type==='pline'){const off=offsetPline(o,d,p);if(off)add(off);}
  else{echo('OFFSET: this object type not supported yet');return;}
  echo(`Offset by ${d} — pick another object or Esc`,true);
  cmd.data.obj=null;  // allow offsetting another object (AutoCAD keeps OFFSET running)
  selection.clear();renderProps();   // clear highlight, ready for next pick
  render();updateInfo();
}
// offset a polyline by moving each vertex along the average normal toward the click side
function offsetPline(o,d,p){
  const pts=o.pts;if(pts.length<2)return null;
  // determine side via signed area / click relative to first segment
  const side=offsetSign({x:pts[0][0],y:pts[0][1]},{x:pts[1][0],y:pts[1][1]},p);
  const np=pts.map((pt,idx)=>{
    const prev=pts[idx-1]||pt, next=pts[idx+1]||pt;
    let dx=next[0]-prev[0], dy=next[1]-prev[1];const len=Math.hypot(dx,dy)||1;
    const nx=-dy/len, ny=dx/len;
    return [pt[0]+nx*d*side, pt[1]+ny*d*side];
  });
  return {type:'pline',layer:o.layer,pts:np,closed:o.closed};
}

// ---- trim (line at nearest intersection with another object) ----
function paramOnLine(o,p){const dx=o.x2-o.x1,dy=o.y2-o.y1,l2=dx*dx+dy*dy||1;return((p.x-o.x1)*dx+(p.y-o.y1)*dy)/l2;}
function doTrim(p){
  const i=pickObject(p.x,p.y);if(i<0){echo('TRIM: click the part of an object to remove (or drag a box)');return;}
  doTrimIndex(i,p);
}
function doTrimIndex(i,p){
  const o=doc.objects[i];if(!o)return;
  if(o.type==='line'){return trimLine(i,o,p);}
  if(o.type==='circle'){return trimCircle(i,o,p);}
  if(o.type==='rect'){
    // convert the rectangle to a 4-segment closed polyline, then trim that
    const pl={type:'pline',layer:o.layer,closed:true,pts:[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]]};
    doc.objects[i]=pl;
    return trimPline(i,pl,p);
  }
  if(o.type==='pline'){return trimPline(i,o,p);}
  echo('TRIM: that object type isn\u2019t trimmable yet');
}
// --- trim a LINE: remove the clicked span between nearest intersections ---
function trimLine(i,o,p){
  const ints=allIntersectionsWith(o,i);
  if(!ints.length){echo('TRIM: no intersection on this line');return;}
  const tClick=paramOnLine(o,p);
  let lo=0,hi=1;
  for(const ip of ints){const t=paramOnLine(o,ip);if(t<tClick&&t>lo)lo=t;if(t>tClick&&t<hi)hi=t;}
  pushUndo();
  const ax=o.x1+(o.x2-o.x1)*lo,ay=o.y1+(o.y2-o.y1)*lo,bx=o.x1+(o.x2-o.x1)*hi,by=o.y1+(o.y2-o.y1)*hi;
  doc.objects.splice(i,1);
  if(lo>0.001)pushObj({type:'line',layer:o.layer,x1:o.x1,y1:o.y1,x2:ax,y2:ay});
  if(hi<0.999)pushObj({type:'line',layer:o.layer,x1:bx,y1:by,x2:o.x2,y2:o.y2});
  echo('Trimmed');render();updateInfo();
}
// --- trim a CIRCLE: cut the clicked arc span, leaving an arc of the remainder ---
function trimCircle(i,o,p){
  const ints=[];
  for(let j=0;j<doc.objects.length;j++){if(j===i)continue;const pts=intersectCircle(o,doc.objects[j]);for(const ip of pts)ints.push(ip);}
  if(ints.length<2){echo('TRIM: need at least 2 intersections to trim a circle');return;}
  // angles of intersections, sorted
  let angs=ints.map(ip=>Math.atan2(ip.y-o.cy,ip.x-o.cx));
  angs=angs.map(a=>(a+2*Math.PI)%(2*Math.PI)).sort((a,b)=>a-b);
  const click=((Math.atan2(p.y-o.cy,p.x-o.cx))+2*Math.PI)%(2*Math.PI);
  // find the arc segment (between consecutive intersection angles) containing the click
  let a1=angs[angs.length-1],a2=angs[0]; // wrap segment by default
  for(let s=0;s<angs.length;s++){
    const lo=angs[s],hi=angs[(s+1)%angs.length];
    if(inArc(click,lo,hi)){a1=lo;a2=hi;break;}
  }
  pushUndo();
  doc.objects.splice(i,1);
  // keep the complement: an arc from a2 around to a1
  pushObj({type:'arc',layer:o.layer,cx:o.cx,cy:o.cy,r:o.r,a1:a2,a2:a1});
  echo('Trimmed (circle \u2192 arc)');render();updateInfo();
}
function inArc(a,lo,hi){a=(a+2*Math.PI)%(2*Math.PI);lo=(lo+2*Math.PI)%(2*Math.PI);hi=(hi+2*Math.PI)%(2*Math.PI);if(lo<=hi)return a>=lo&&a<=hi;return a>=lo||a<=hi;}
// --- trim a POLYLINE: drop the clicked segment, splitting the pline ---
function trimPline(i,o,p){
  // find which segment was clicked
  const segCount = o.closed ? o.pts.length : o.pts.length-1;
  let seg=-1,bestD=1e9;
  for(let s=0;s<segCount;s++){
    const a=o.pts[s], b=o.pts[(s+1)%o.pts.length];
    const d=distToSeg(p.x,p.y,a[0],a[1],b[0],b[1]);if(d<bestD){bestD=d;seg=s;}
  }
  if(seg<0){echo('TRIM: no segment found');return;}
  const a=o.pts[seg], b=o.pts[(seg+1)%o.pts.length];
  // treat the clicked segment as a line, find intersections with all OTHER objects along it
  const segLine={x1:a[0],y1:a[1],x2:b[0],y2:b[1]};
  const ints=[];
  for(let j=0;j<doc.objects.length;j++){
    if(j===i)continue;const oj=doc.objects[j];
    if(oj.type==='circle'){intersectLineCircle(segLine,oj).forEach(ip=>ints.push(ip));}
    else{for(const s of objAsSegments(oj)){const ip=segInt(segLine.x1,segLine.y1,segLine.x2,segLine.y2,s[0],s[1],s[2],s[3]);if(ip)ints.push(ip);}}
  }
  const tParam=(pt)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1;return ((pt.x-a[0])*dx+(pt.y-a[1])*dy)/l2;};
  const tClick=tParam(p);
  // nearest intersection below and above the click, bounded to the segment
  let lo=0,hi=1;
  for(const ip of ints){const t=tParam(ip);if(t<tClick&&t>lo)lo=t;if(t>tClick&&t<hi)hi=t;}
  pushUndo();
  if(ints.length===0){
    // no crossing on this edge -> remove the whole segment (old behaviour), splitting the pline
    doc.objects.splice(i,1);
    if(!o.closed){
      const left=o.pts.slice(0,seg+1),right=o.pts.slice(seg+1);
      if(left.length>=2)pushObj({type:'pline',layer:o.layer,pts:left});
      if(right.length>=2)pushObj({type:'pline',layer:o.layer,pts:right});
    } else {
      // open the closed pline by dropping this edge -> a single open pline
      const rot=o.pts.slice((seg+1)%o.pts.length).concat(o.pts.slice(0,(seg+1)%o.pts.length));
      pushObj({type:'pline',layer:o.layer,pts:rot});
    }
    echo('Trimmed (segment removed)');render();updateInfo();return;
  }
  // cut only the clicked span [lo,hi] out of this edge; rebuild as line pieces + the other edges
  const ax=a[0]+(b[0]-a[0])*lo, ay=a[1]+(b[1]-a[1])*lo;
  const bx=a[0]+(b[0]-a[0])*hi, by=a[1]+(b[1]-a[1])*hi;
  // collect all the OTHER edges of the pline as standalone lines (so the shape stays drawn)
  doc.objects.splice(i,1);
  for(let s=0;s<segCount;s++){
    if(s===seg)continue;
    const u=o.pts[s], v=o.pts[(s+1)%o.pts.length];
    pushObj({type:'line',layer:o.layer,x1:u[0],y1:u[1],x2:v[0],y2:v[1]});
  }
  // the two remaining stubs of the clicked edge
  if(lo>0.001)pushObj({type:'line',layer:o.layer,x1:a[0],y1:a[1],x2:ax,y2:ay});
  if(hi<0.999)pushObj({type:'line',layer:o.layer,x1:bx,y1:by,x2:b[0],y2:b[1]});
  echo('Trimmed');render();updateInfo();
}
// all intersection points of object `o` (index i) with every other object
function allIntersectionsWith(o,i){
  const res=[];
  for(let j=0;j<doc.objects.length;j++){
    if(j===i)continue;const oj=doc.objects[j];
    if(oj.type==='circle'){intersectLineCircle(o,oj).forEach(ip=>res.push(ip));}
    else{const segs=objAsSegments(oj);for(const s of segs){const ip=segInt(o.x1,o.y1,o.x2,o.y2,s[0],s[1],s[2],s[3]);if(ip)res.push(ip);}}
  }
  return res;
}
// intersections of a line segment with a circle
function intersectLineCircle(line,c){
  const x1=line.x1,y1=line.y1,x2=line.x2,y2=line.y2;
  const dx=x2-x1,dy=y2-y1;const fx=x1-c.cx,fy=y1-c.cy;
  const a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-c.r*c.r;
  let disc=b*b-4*a*cc;if(disc<0||a<1e-12)return[];disc=Math.sqrt(disc);
  const res=[];for(const t of [(-b-disc)/(2*a),(-b+disc)/(2*a)]){if(t>=-0.001&&t<=1.001)res.push({x:x1+t*dx,y:y1+t*dy});}
  return res;
}
// intersections of a circle with any object
function intersectCircle(c,other){
  if(other.type==='line')return intersectLineCircle(other,c);
  if(other.type==='rect'||other.type==='pline'){const segs=objAsSegments(other);const r=[];for(const s of segs)intersectLineCircle({x1:s[0],y1:s[1],x2:s[2],y2:s[3]},c).forEach(ip=>r.push(ip));return r;}
  if(other.type==='circle')return intersectCircleCircle(c,other);
  return[];
}
function intersectCircleCircle(c1,c2){
  const dx=c2.cx-c1.cx,dy=c2.cy-c1.cy;const d=Math.hypot(dx,dy);
  if(d<1e-9||d>c1.r+c2.r||d<Math.abs(c1.r-c2.r))return[];
  const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d);const h2=c1.r*c1.r-a*a;if(h2<0)return[];const h=Math.sqrt(h2);
  const xm=c1.cx+a*dx/d,ym=c1.cy+a*dy/d;
  return[{x:xm+h*dy/d,y:ym-h*dx/d},{x:xm-h*dy/d,y:ym+h*dx/d}];
}
// An object reduced to straight pieces, for trim, extend and boundary work.
function objAsSegments(o){return entityCall(o,'segments',[]);}
function segInt(x1,y1,x2,y2,x3,y3,x4,y4){
  const d=(x2-x1)*(y4-y3)-(y2-y1)*(x4-x3);if(Math.abs(d)<1e-9)return null;
  const t=((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3))/d;const u=((x3-x1)*(y2-y1)-(y3-y1)*(x2-x1))/d;
  if(t<-0.001||t>1.001||u<-0.001||u>1.001)return null;return{x:x1+t*(x2-x1),y:y1+t*(y2-y1)};
}
function doExtend(p){
  const i=pickObject(p.x,p.y);if(i<0){echo('EXTEND: click a line, polyline or arc to extend (or drag a box)');return;}
  doExtendIndex(i,p);
}
function doExtendIndex(i,p){
  const o=doc.objects[i];if(!o)return;
  if(o.type==='line')   return extendLine(o,p);
  if(o.type==='pline')  return extendPline(o,p);
  if(o.type==='arc')    return extendArc(o,p);
  echo('EXTEND: can extend lines, polylines and arcs');return;
}
// extend a straight line to the nearest boundary along its own infinite line
function extendLine(o,p){
  const tClick=paramOnLine(o,p);const extendEnd=tClick>0.5?2:1;
  let bestT=null;
  const consider=(t)=>{
    if(extendEnd===2&&t>1.0001&&(bestT===null||t<bestT))bestT=t;
    if(extendEnd===1&&t<-0.0001&&(bestT===null||t>bestT))bestT=t;
  };
  for(let j=0;j<doc.objects.length;j++){const oj=doc.objects[j];if(oj===o)continue;
    for(const s of boundarySegments(oj)){const ip=lineSegIntInfinite(o,s);if(ip)consider(paramOnLine(o,ip));}
    // circle / arc boundaries: intersect the infinite line with their circle
    if(oj.type==='circle'||oj.type==='arc'){for(const ip of infiniteLineCircleInts(o,oj))consider(paramOnLine(o,ip));}
  }
  if(bestT===null){echo('EXTEND: no boundary found');return;}
  pushUndo();const nx=o.x1+(o.x2-o.x1)*bestT,ny=o.y1+(o.y2-o.y1)*bestT;
  if(extendEnd===2){o.x2=nx;o.y2=ny;}else{o.x1=nx;o.y1=ny;}
  echo('Extended');render();updateInfo();
}
// intersections of an INFINITE line (through o.x1,y1 - o.x2,y2) with a circle/arc's circle
function infiniteLineCircleInts(o,circ){
  const x1=o.x1,y1=o.y1,dx=o.x2-o.x1,dy=o.y2-o.y1;
  const fx=x1-circ.cx,fy=y1-circ.cy;
  const a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-circ.r*circ.r;
  let disc=b*b-4*a*cc;if(disc<0||a<1e-12)return[];disc=Math.sqrt(disc);
  return [(-b-disc)/(2*a),(-b+disc)/(2*a)].map(t=>({x:x1+t*dx,y:y1+t*dy}));
}
// extend the END segment of a polyline (whichever endpoint the click is nearest)
function extendPline(o,p){
  if(o.pts.length<2){echo('EXTEND: polyline too short');return;}
  const first={x:o.pts[0][0],y:o.pts[0][1]}, last={x:o.pts[o.pts.length-1][0],y:o.pts[o.pts.length-1][1]};
  const atStart=Math.hypot(p.x-first.x,p.y-first.y)<Math.hypot(p.x-last.x,p.y-last.y);
  // the end segment as a directed line whose param t>1 (or <0) points outward past the endpoint
  const seg = atStart
    ? {x1:o.pts[1][0],y1:o.pts[1][1],x2:o.pts[0][0],y2:o.pts[0][1]}       // points outward past start
    : {x1:o.pts[o.pts.length-2][0],y1:o.pts[o.pts.length-2][1],x2:last.x,y2:last.y}; // outward past last
  let bestT=null;
  const consider=(t)=>{ if(t>1.0001&&(bestT===null||t<bestT))bestT=t; };
  for(let j=0;j<doc.objects.length;j++){const oj=doc.objects[j];if(oj===o)continue;
    for(const s of boundarySegments(oj)){const ip=lineSegIntInfinite(seg,s);if(ip)consider(paramOnLine(seg,ip));}
    if(oj.type==='circle'||oj.type==='arc'){for(const ip of infiniteLineCircleInts(seg,oj))consider(paramOnLine(seg,ip));}
  }
  if(bestT===null){echo('EXTEND: no boundary found');return;}
  pushUndo();const nx=seg.x1+(seg.x2-seg.x1)*bestT,ny=seg.y1+(seg.y2-seg.y1)*bestT;
  if(atStart){o.pts[0]=[nx,ny];}else{o.pts[o.pts.length-1]=[nx,ny];}
  echo('Extended');render();updateInfo();
}
// extend an arc by growing the angle at the end nearest the click until it meets a boundary
function extendArc(o,p){
  const clickAng=Math.atan2(p.y-o.cy,p.x-o.cx);
  const norm=a=>{while(a<0)a+=2*Math.PI;while(a>=2*Math.PI)a-=2*Math.PI;return a;};
  // which end (a1 or a2) is nearer the click
  const d1=Math.abs(angDiff(clickAng,o.a1)), d2=Math.abs(angDiff(clickAng,o.a2));
  const growStart=d1<d2;
  // candidate boundary intersection angles on the arc's full circle
  const circle={cx:o.cx,cy:o.cy,r:o.r};
  let best=null;
  for(let j=0;j<doc.objects.length;j++){const oj=doc.objects[j];if(oj===o)continue;
    const ints=intersectCircle(circle,oj);
    for(const ip of ints){const a=norm(Math.atan2(ip.y-o.cy,ip.x-o.cx));
      // measure how far we'd have to grow from the chosen end, in the outward direction
      const grow = growStart ? norm(o.a1-a) : norm(a-o.a2);   // positive = outward
      if(grow>0.0001&&grow<2*Math.PI-0.0001&&(best===null||grow<best))best=grow;}
  }
  if(best===null){echo('EXTEND: no boundary found');return;}
  pushUndo();
  if(growStart)o.a1=norm(o.a1-best); else o.a2=norm(o.a2+best);
  echo('Extended');render();updateInfo();
}
// smallest signed angular difference a-b in (-PI,PI]
function angDiff(a,b){let d=a-b;while(d<=-Math.PI)d+=2*Math.PI;while(d>Math.PI)d-=2*Math.PI;return d;}
// segments that can act as cutting/boundary edges for trim/extend (lines, rects, plines, arcs-as-chords are skipped; circles handled separately)
function boundarySegments(o){
  if(o.type==='circle'||o.type==='arc')return[]; // handled via circle intersection where needed
  return objAsSegments(o);
}
function lineSegIntInfinite(line,seg){
  const x1=line.x1,y1=line.y1,x2=line.x2,y2=line.y2,x3=seg[0],y3=seg[1],x4=seg[2],y4=seg[3];
  const d=(x2-x1)*(y4-y3)-(y2-y1)*(x4-x3);if(Math.abs(d)<1e-9)return null;
  const u=((x3-x1)*(y2-y1)-(y3-y1)*(x2-x1))/d;if(u<-0.001||u>1.001)return null;
  const t=((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3))/d;return{x:x1+t*(x2-x1),y:y1+t*(y2-y1)};
}
// ============================================================
//  FILLET / CHAMFER  (unified)
//  Default: pick the FIRST edge, then the SECOND edge — the shared corner is rounded/beveled.
//  Type "P" first to switch to Polyline mode: then a single click on a rectangle/polyline
//  rounds/bevels ALL of its corners at once.
//  Result is one joined polyline; the command finishes (Space to repeat).
// ============================================================
function doFillet(p){ applyCornerOp(p,'fillet'); }
function doChamfer(p){ applyCornerOp(p,'chamfer'); }

function applyCornerOp(p,mode){
  const size = mode==='fillet' ? (cmd.data.r||0) : (cmd.data.d||0);
  const label = mode==='fillet' ? `R${size}` : `${size}`;

  // ---- Polyline mode (user typed P): one click = all corners ----
  if(cmd.data.polyMode){
    const i=pickObject(p.x,p.y);if(i<0){echo(`${mode.toUpperCase()} (Polyline): click a rectangle or polyline`,true);return;}
    const o=doc.objects[i];
    if(o.type!=='rect'&&o.type!=='pline'){echo(`${mode.toUpperCase()} (Polyline): click a rectangle or polyline`,true);return;}
    if(size<=0){echo(`${mode.toUpperCase()}: set a ${mode==='fillet'?'radius':'distance'} > 0 first`,true);return;}
    pushUndo();
    const made=cornerOpPolyAll(i,size,mode);
    echo(made?`${mode==='fillet'?'Filleted':'Chamfered'} all corners (${label})`:`${mode.toUpperCase()}: nothing to do`);
    endCmd();render();updateInfo();return;
  }

  // ---- Default: pick two edges (works for lines, rect edges, polyline segments alike) ----
  const e=pickEdge(p.x,p.y);
  if(!e){echo(`${mode.toUpperCase()}: pick first edge — or type P for a whole polyline`);return;}
  if(!cmd.data.e1){
    cmd.data.e1=e;echo(`${mode.toUpperCase()}: first edge selected — pick second edge`,true);render();return;
  }
  // second edge: must be a different edge
  if(sameEdge(cmd.data.e1,e)){echo(`${mode.toUpperCase()}: pick a different second edge`,true);return;}
  if(size<=0){echo(`${mode.toUpperCase()}: set a ${mode==='fillet'?'radius':'distance'} > 0 first`,true);return;}
  cmd.data.e2=e;render();
  // compute the corner where the two edges meet, build the joined result
  pushUndo();
  const ok=cornerOpEdges(cmd.data.e1,cmd.data.e2,size,mode);
  if(!ok){popUndoQuiet();echo(`${mode.toUpperCase()}: edges don't meet — pick two that share a corner`);cmd.data.e2=null;return;}
  echo(`${mode==='fillet'?'Filleted':'Chamfered'} (${label})`);
  endCmd();render();updateInfo();
}

// Pick the EDGE (segment) under the cursor: for a line it's the whole line; for a rect/polyline
// it's the nearest segment. Returns {idx,type,seg:[ax,ay,bx,by],a,b} with world coords.
function pickEdge(wx,wy){
  const tol=8/view.scale;
  let best=null,bd=tol;
  for(let i=doc.objects.length-1;i>=0;i--){
    const o=doc.objects[i];
    let segs=null;
    if(o.type==='line')segs=[[o.x1,o.y1,o.x2,o.y2,-1]];
    else if(o.type==='rect')segs=[[o.x1,o.y1,o.x2,o.y1,0],[o.x2,o.y1,o.x2,o.y2,1],[o.x2,o.y2,o.x1,o.y2,2],[o.x1,o.y2,o.x1,o.y1,3]];
    else if(o.type==='pline'){segs=[];const n=o.pts.length;const m=o.closed?n:n-1;for(let k=0;k<m;k++){const a=o.pts[k],b=o.pts[(k+1)%n];segs.push([a[0],a[1],b[0],b[1],k]);}}
    else continue;
    for(const s of segs){const d=distToSeg(wx,wy,s[0],s[1],s[2],s[3]);if(d<bd){bd=d;best={idx:i,type:o.type,seg:[s[0],s[1],s[2],s[3]],segIdx:s[4],a:{x:s[0],y:s[1]},b:{x:s[2],y:s[3]}};}}
  }
  return best;
}
function sameEdge(e1,e2){return e1.idx===e2.idx && e1.segIdx===e2.segIdx;}

// Round/bevel the corner where two picked edges meet, replacing the involved objects with ONE
// joined polyline. Handles: two separate lines, two edges of the same rect/polyline, or one line
// + one polyline edge that share an endpoint.
function cornerOpEdges(e1,e2,size,mode){
  // infinite-line intersection of the two edges = the corner point
  const L1={x1:e1.seg[0],y1:e1.seg[1],x2:e1.seg[2],y2:e1.seg[3]};
  const L2={x1:e2.seg[0],y1:e2.seg[1],x2:e2.seg[2],y2:e2.seg[3]};
  const ip=segIntInfinite(L1,L2);
  if(!ip)return false;

  // Same rect/polyline, adjacent segments -> edit that polyline's shared vertex in place.
  if(e1.idx===e2.idx && (e1.type==='rect'||e1.type==='pline')){
    return cornerOpPolyVertex(e1.idx,ip,size,mode);
  }
  // Otherwise treat each edge as a line from the corner to its far end, and join into one pline.
  const farA=farOfSeg(e1.seg,ip), farB=farOfSeg(e2.seg,ip);
  const dirA=unitTo(ip,farA), dirB=unitTo(ip,farB);
  const cdata=cornerGeom(ip,dirA,dirB,size);
  let pts,segs=[];
  if(!cdata){pts=[[farA.x,farA.y],[ip.x,ip.y],[farB.x,farB.y]];}
  else{pts=[[farA.x,farA.y],[cdata.tA.x,cdata.tA.y],[cdata.tB.x,cdata.tB.y],[farB.x,farB.y]];if(mode==='fillet')segs[1]=cdata.arcSeg;}
  const layer=doc.objects[e1.idx].layer;
  const hi=Math.max(e1.idx,e2.idx), lo=Math.min(e1.idx,e2.idx);
  doc.objects.splice(hi,1);doc.objects.splice(lo,1);
  pushObj({type:'pline',layer,closed:false,pts,segs});
  return true;
}
function farOfSeg(seg,ip){const a={x:seg[0],y:seg[1]},b={x:seg[2],y:seg[3]};return (Math.hypot(a.x-ip.x,a.y-ip.y)>=Math.hypot(b.x-ip.x,b.y-ip.y))?a:b;}
function unitTo(from,to){let dx=to.x-from.x,dy=to.y-from.y;const l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};}

// Round/bevel a specific vertex of a rect/polyline (the corner the two adjacent edges share).
function cornerOpPolyVertex(idx,ip,size,mode){
  const o=doc.objects[idx];
  let pts,closed,layer=o.layer;
  if(o.type==='rect'){pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];closed=true;}
  else {pts=o.pts.map(q=>[q[0],q[1]]);closed=!!o.closed;}
  const n=pts.length;
  // find the vertex matching the corner point
  let best=-1,bd=1e-3*Math.max(1,Math.abs(ip.x)+Math.abs(ip.y))+1e-6;
  for(let k=0;k<n;k++){const d=Math.hypot(pts[k][0]-ip.x,pts[k][1]-ip.y);if(d<bd){bd=d;best=k;}}
  if(best<0){ // fall back: nearest vertex
    bd=1e18;for(let k=0;k<n;k++){const d=Math.hypot(pts[k][0]-ip.x,pts[k][1]-ip.y);if(d<bd){bd=d;best=k;}}
  }
  if(best<0)return false;
  if(!closed&&(best===0||best===n-1))return false;  // open ends aren't corners
  const cur=pts[best],prev=pts[(best-1+n)%n],next=pts[(best+1)%n];
  const dirA=unitTo({x:cur[0],y:cur[1]},{x:prev[0],y:prev[1]});
  const dirB=unitTo({x:cur[0],y:cur[1]},{x:next[0],y:next[1]});
  const cdata=cornerGeom({x:cur[0],y:cur[1]},dirA,dirB,size);
  if(!cdata)return false;
  const oldSegs=o.segs||[];const newPts=[],newSegs=[];
  for(let k=0;k<n;k++){
    if(k===best){const ai=newPts.length;newPts.push([cdata.tA.x,cdata.tA.y]);if(mode==='fillet')newSegs[ai]=cdata.arcSeg;newPts.push([cdata.tB.x,cdata.tB.y]);}
    else{const ni=newPts.length;newPts.push([pts[k][0],pts[k][1]]);if(oldSegs[k])newSegs[ni]=oldSegs[k];}
  }
  doc.objects.splice(idx,1,{id:idAt(idx),type:'pline',layer,closed,pts:newPts,segs:newSegs});
  return true;
}

// Round/bevel just the ONE corner of a rect/pline nearest the click; keeps it a single polyline.
function cornerOpPolyNearest(idx,p,size,mode){
  const o=doc.objects[idx];
  let pts,closed,layer=o.layer;
  if(o.type==='rect'){pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];closed=true;}
  else {pts=o.pts.map(q=>[q[0],q[1]]);closed=!!o.closed;}
  const n=pts.length;if(n<3)return false;
  // nearest eligible corner (open plines exclude their two free ends)
  let best=-1,bd=1e18;
  for(let k=0;k<n;k++){if(!closed&&(k===0||k===n-1))continue;
    const d=Math.hypot(pts[k][0]-p.x,pts[k][1]-p.y);if(d<bd){bd=d;best=k;}}
  if(best<0)return false;
  const cur=pts[best], prev=pts[(best-1+n)%n], next=pts[(best+1)%n];
  const ip={x:cur[0],y:cur[1]};
  const dirA=unit({x:prev[0]-cur[0],y:prev[1]-cur[1]});
  const dirB=unit({x:next[0]-cur[0],y:next[1]-cur[1]});
  const cdata=cornerGeom(ip,dirA,dirB,size);
  if(!cdata)return false;
  // preserve any existing arc-segments, shifting indices as we replace one vertex with two points
  const oldSegs=o.segs||[];
  const newPts=[]; const newSegs=[];
  for(let k=0;k<n;k++){
    if(k===best){
      const ai=newPts.length;
      newPts.push([cdata.tA.x,cdata.tA.y]);
      if(mode==='fillet')newSegs[ai]=cdata.arcSeg;       // arc on tA->tB
      newPts.push([cdata.tB.x,cdata.tB.y]);
    } else {
      const ni=newPts.length;
      newPts.push([pts[k][0],pts[k][1]]);
      if(oldSegs[k])newSegs[ni]=oldSegs[k];              // carry over previous fillets
    }
  }
  doc.objects.splice(idx,1,{id:idAt(idx),type:'pline',layer,closed,pts:newPts,segs:newSegs});
  return true;
}

// Round/bevel EVERY corner of a rect/pline, returning a single joined polyline.
function cornerOpPolyAll(idx,size,mode){
  const o=doc.objects[idx];
  let pts,closed,layer=o.layer;
  if(o.type==='rect'){pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];closed=true;}
  else {pts=o.pts.map(q=>[q[0],q[1]]);closed=!!o.closed;}
  const n=pts.length;if(n<3)return false;
  // For each corner (interior corners only on an open pline) compute the two tangent points.
  // Build a new point list; remember which new segment is an arc (fillet) for the round.
  const newPts=[]; const segArc=[];   // segArc[k] = arc descriptor for segment starting at newPts[k]
  const cornerStart = closed?0:1;     // open pline keeps its very first point
  const cornerEnd   = closed?n:n-1;   // and its very last point
  if(!closed)newPts.push([pts[0][0],pts[0][1]]);
  for(let k=cornerStart;k<cornerEnd;k++){
    const cur=pts[k], prev=pts[(k-1+n)%n], next=pts[(k+1)%n];
    const ip={x:cur[0],y:cur[1]};
    const dirA=unit({x:prev[0]-cur[0],y:prev[1]-cur[1]});
    const dirB=unit({x:next[0]-cur[0],y:next[1]-cur[1]});
    const cdata=cornerGeom(ip,dirA,dirB,size);
    if(!cdata){newPts.push([cur[0],cur[1]]);continue;}   // can't round (straight) -> keep vertex
    // push tangent A then tangent B; the segment between them is the round (arc) or bevel (line)
    newPts.push([cdata.tA.x,cdata.tA.y]);
    if(mode==='fillet')segArc[newPts.length-1]=cdata.arcSeg;   // arc on the segment tA->tB
    newPts.push([cdata.tB.x,cdata.tB.y]);
  }
  if(!closed)newPts.push([pts[n-1][0],pts[n-1][1]]);
  // assemble segs array aligned to newPts segment indices
  const segs=[];for(const k in segArc)segs[k]=segArc[k];
  doc.objects.splice(idx,1,{id:idAt(idx),type:'pline',layer,closed,pts:newPts,segs});
  return true;
}

// Round/bevel the corner shared by two lines; replace BOTH lines with one joined polyline.
function cornerOpTwoLines(ia,ib,ip,size,mode){
  const a=doc.objects[ia], b=doc.objects[ib], layer=a.layer;
  const dirA=farDir(a,ip), dirB=farDir(b,ip);
  const farA=farPoint(a,ip), farB=farPoint(b,ip);
  const cdata=cornerGeom(ip,dirA,dirB,size);
  // build a polyline farA -> tA -(round/bevel)- tB -> farB
  let pts,segs=[];
  if(!cdata){pts=[[farA.x,farA.y],[ip.x,ip.y],[farB.x,farB.y]];}
  else{
    pts=[[farA.x,farA.y],[cdata.tA.x,cdata.tA.y],[cdata.tB.x,cdata.tB.y],[farB.x,farB.y]];
    if(mode==='fillet')segs[1]=cdata.arcSeg;   // segment index 1 = tA->tB is the arc
  }
  // remove both source lines (higher index first) and add the joined polyline
  const hi=Math.max(ia,ib), lo=Math.min(ia,ib);
  doc.objects.splice(hi,1);doc.objects.splice(lo,1);
  pushObj({type:'pline',layer,closed:false,pts,segs});
}

// single-click on one line near a corner: find the neighbouring line and apply
function cornerOpTwoLinesAuto(i,p,size,mode){
  const o=doc.objects[i];
  const e1={x:o.x1,y:o.y1}, e2={x:o.x2,y:o.y2};
  const near=(Math.hypot(p.x-e1.x,p.y-e1.y)<=Math.hypot(p.x-e2.x,p.y-e2.y))?e1:e2;
  const tol=Math.max(1e-6, 8/view.scale);
  let j=-1;
  for(let k=0;k<doc.objects.length;k++){if(k===i)continue;const ok=doc.objects[k];if(ok.type!=='line')continue;
    if(Math.hypot(ok.x1-near.x,ok.y1-near.y)<tol||Math.hypot(ok.x2-near.x,ok.y2-near.y)<tol){j=k;break;}}
  if(j<0)return false;
  pushUndo();
  cornerOpTwoLines(i,j,{x:near.x,y:near.y},size,mode);
  echo(`${mode==='fillet'?'Filleted':'Chamfered'}`,true);
  return true;
}

// Geometry of a rounded corner: tangent points + an arc-segment descriptor for a polyline.
// Returns null when the legs are collinear (nothing to round).
function cornerGeom(ip,dirA,dirB,r){
  let dot=dirA.x*dirB.x+dirA.y*dirB.y; dot=Math.max(-1,Math.min(1,dot));
  const theta=Math.acos(dot);
  if(theta<1e-3||Math.abs(theta-Math.PI)<1e-3)return null;
  const tdist=r/Math.tan(theta/2);
  const tA={x:ip.x+dirA.x*tdist,y:ip.y+dirA.y*tdist};
  const tB={x:ip.x+dirB.x*tdist,y:ip.y+dirB.y*tdist};
  let bx=dirA.x+dirB.x, by=dirA.y+dirB.y; const bl=Math.hypot(bx,by)||1; bx/=bl; by/=bl;
  const cdist=r/Math.sin(theta/2);
  const center={x:ip.x+bx*cdist,y:ip.y+by*cdist};
  let a1=Math.atan2(tA.y-center.y,tA.x-center.x), a2=Math.atan2(tB.y-center.y,tB.x-center.x);
  const ccw=(from,to)=>{let d=to-from;while(d<0)d+=2*Math.PI;while(d>=2*Math.PI)d-=2*Math.PI;return d;};
  // Empirically, the renderer ctx.arc(cx,cy,r,-a2,-a1,true) draws the span where CCW(a1->a2)
  // is LARGE. So to render the SHORT inner fillet (sweep = PI - theta < PI), choose the ordering
  // whose CCW(a1->a2) is the larger of the two (> PI). This holds for any corner angle.
  if(ccw(a1,a2)<Math.PI){const t=a1;a1=a2;a2=t;}
  return {tA,tB, arcSeg:{arc:true,cx:center.x,cy:center.y,r,a1,a2}};
}
function unit(v){const l=Math.hypot(v.x,v.y)||1;return{x:v.x/l,y:v.y/l};}
// unit vector from corner point toward the far end of a line
function farDir(o,corner){
  const d1=Math.hypot(o.x1-corner.x,o.y1-corner.y),d2=Math.hypot(o.x2-corner.x,o.y2-corner.y);
  const far=d1>d2?{x:o.x1,y:o.y1}:{x:o.x2,y:o.y2};
  let dx=far.x-corner.x,dy=far.y-corner.y;const l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};
}
function farPoint(o,corner){
  const d1=Math.hypot(o.x1-corner.x,o.y1-corner.y),d2=Math.hypot(o.x2-corner.x,o.y2-corner.y);
  return d1>d2?{x:o.x1,y:o.y1}:{x:o.x2,y:o.y2};
}
function segIntInfinite(a,b){const d=(a.x2-a.x1)*(b.y2-b.y1)-(a.y2-a.y1)*(b.x2-b.x1);if(Math.abs(d)<1e-9)return null;const t=((b.x1-a.x1)*(b.y2-b.y1)-(b.y1-a.y1)*(b.x2-b.x1))/d;return{x:a.x1+t*(a.x2-a.x1),y:a.y1+t*(a.y2-a.y1)};}
function trimToPoint(o,ip){const d1=Math.hypot(o.x1-ip.x,o.y1-ip.y),d2=Math.hypot(o.x2-ip.x,o.y2-ip.y);if(d1<d2){o.x1=ip.x;o.y1=ip.y;}else{o.x2=ip.x;o.y2=ip.y;}}

// ---- (old CHAMFER implementation replaced by the unified mechanism above) ----

// ---- BREAK: split a line/pline by two clicked points (removes the span between) ----
function doBreak(p){
  if(cmd.data.idx==null){
    const i=pickObject(p.x,p.y);if(i<0){echo('BREAK: click an object to break');return;}
    const o=doc.objects[i];
    if(!['line','pline','rect','arc','circle'].includes(o.type)){echo('BREAK: pick a line, polyline, rectangle, arc or circle');return;}
    cmd.data.idx=i;cmd.data.first={x:p.x,y:p.y};echo('BREAK: click second break point',true);return;
  }
  const o=doc.objects[cmd.data.idx];const p1=cmd.data.first,p2=p;
  pushUndo();
  const lay=o.layer;

  if(o.type==='line'){
    const t=pt=>{const dx=o.x2-o.x1,dy=o.y2-o.y1,l2=dx*dx+dy*dy||1;return Math.max(0,Math.min(1,((pt.x-o.x1)*dx+(pt.y-o.y1)*dy)/l2));};
    let t1=t(p1),t2=t(p2);if(t1>t2){const s=t1;t1=t2;t2=s;}
    const ax=o.x1+(o.x2-o.x1)*t1, ay=o.y1+(o.y2-o.y1)*t1;
    const bx=o.x1+(o.x2-o.x1)*t2, by=o.y1+(o.y2-o.y1)*t2;
    const x1=o.x1,y1=o.y1,x2=o.x2,y2=o.y2;
    doc.objects.splice(cmd.data.idx,1);
    if(t1>0.001)add({type:'line',layer:lay,x1,y1,x2:ax,y2:ay});
    if(t2<0.999)add({type:'line',layer:lay,x1:bx,y1:by,x2,y2});
    echo('Broken');
  }
  else if(o.type==='circle'){
    // remove the arc going (CCW) from angle(p1) to angle(p2); keep the rest as an arc
    const a1=Math.atan2(p1.y-o.cy,p1.x-o.cx), a2=Math.atan2(p2.y-o.cy,p2.x-o.cx);
    // keep arc from p2 -> p1 (the complementary span)
    doc.objects.splice(cmd.data.idx,1,{id:idAt(cmd.data.idx),type:'arc',layer:lay,cx:o.cx,cy:o.cy,r:o.r,a1:a2,a2:a1});
    echo('Broken (circle → arc)');
  }
  else if(o.type==='arc'){
    // angles of the two break points, clamped into the arc's own span
    const norm=a=>{while(a<0)a+=2*Math.PI;while(a>=2*Math.PI)a-=2*Math.PI;return a;};
    let s=norm(o.a1), e=norm(o.a2); let span=e-s; if(span<0)span+=2*Math.PI;
    const frac=pt=>{let a=norm(Math.atan2(pt.y-o.cy,pt.x-o.cx))-s; if(a<0)a+=2*Math.PI; return a/ (span||1);};
    let f1=frac(p1),f2=frac(p2); if(f1>f2){const t=f1;f1=f2;f2=t;}
    const ang=f=>o.a1+(o.a2-o.a1)*f;
    doc.objects.splice(cmd.data.idx,1);
    if(f1>0.001)add({type:'arc',layer:lay,cx:o.cx,cy:o.cy,r:o.r,a1:o.a1,a2:ang(f1)});
    if(f2<0.999)add({type:'arc',layer:lay,cx:o.cx,cy:o.cy,r:o.r,a1:ang(f2),a2:o.a2});
    echo('Broken');
  }
  else if(o.type==='pline'||o.type==='rect'){
    // work on a point list; rect becomes a closed 4-point loop
    let pts,closed;
    if(o.type==='rect'){pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];closed=true;}
    else{pts=o.pts.map(q=>[q[0],q[1]]);closed=!!o.closed;}
    const br=breakOnPolyline(pts,closed,p1,p2,lay);
    doc.objects.splice(cmd.data.idx,1);
    br.forEach(pl=>add(pl));
    echo('Broken');
  }
  endCmd();render();updateInfo();
}

// Split a polyline point-list at two points; returns the remaining polyline pieces.
function breakOnPolyline(pts,closed,p1,p2,layer){
  const n=pts.length;
  const segN=closed?n:n-1;
  // for a point, find the segment index it lies on + parametric position -> a single scalar "s = seg + t"
  function locate(pt){
    let bestS=0,bd=1e18;
    for(let i=0;i<segN;i++){
      const a=pts[i],b=pts[(i+1)%n];
      const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1;
      let t=((pt.x-a[0])*dx+(pt.y-a[1])*dy)/l2;t=Math.max(0,Math.min(1,t));
      const fx=a[0]+t*dx,fy=a[1]+t*dy;const d=Math.hypot(pt.x-fx,pt.y-fy);
      if(d<bd){bd=d;bestS=i+t;}
    }
    return bestS;
  }
  const pointAt=s=>{let i=Math.floor(s);if(i>=segN)i=segN-1;const t=s-i;const a=pts[i],b=pts[(i+1)%n];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
  let s1=locate(p1),s2=locate(p2);
  if(s1>s2){const t=s1;s1=s2;s2=t;}
  const cut1=pointAt(s1), cut2=pointAt(s2);
  // collect vertices strictly between two scalar positions (lo, hi)
  const between=(lo,hi)=>{const r=[];for(let i=0;i<n;i++){if(i>lo+1e-9&&i<hi-1e-9)r.push([pts[i][0],pts[i][1]]);}return r;};

  if(!closed){
    // open polyline -> two pieces: [start..cut1] and [cut2..end]
    const pieces=[];
    const left=[ ...pts.slice(0,Math.floor(s1)+1).map(q=>[q[0],q[1]]), cut1 ];
    const right=[ cut2, ...pts.slice(Math.ceil(s2)).map(q=>[q[0],q[1]]) ];
    if(left.length>=2)pieces.push({type:'pline',layer,closed:false,pts:dedupe(left)});
    if(right.length>=2)pieces.push({type:'pline',layer,closed:false,pts:dedupe(right)});
    return pieces;
  }
  // closed polyline -> one open polyline: go from cut2 forward (wrapping) to cut1,
  // i.e. remove the short arc between cut1 and cut2.
  const out=[cut1];
  // vertices from after s1 up to s2 are the REMOVED span; keep the complement (from s2 -> wrap -> s1)
  // build complement: start at cut2, walk forward through vertices until we reach cut1
  let i=Math.ceil(s2-1e-9)%n;
  const startVtx=Math.ceil(s2-1e-9);
  const endVtx=Math.floor(s1+1e-9);
  out.length=0;
  out.push(cut2);
  for(let k=startVtx;k<=endVtx+n;k++){const vi=k%n;out.push([pts[vi][0],pts[vi][1]]);if(((k)%n)===((endVtx)%n))break;}
  out.push(cut1);
  return [{type:'pline',layer,closed:false,pts:dedupe(out)}];
}
function dedupe(pts){const r=[];for(const p of pts){const last=r[r.length-1];if(!last||Math.hypot(last[0]-p[0],last[1]-p[1])>1e-6)r.push(p);}return r;}

// ---- LENGTHEN: set a line's total length (keeps the nearer end fixed) ----
function doLengthen(p){
  if(cmd.data.len==null){echo('LENGTHEN: type the new length first',true);return;}
  const i=pickObject(p.x,p.y);if(i<0){echo('LENGTHEN: click a line');return;}
  const o=doc.objects[i];if(o.type!=='line'){echo('LENGTHEN: only lines');return;}
  pushUndo();
  // keep the end FARTHER from the click; move the nearer end to set the length
  const d1=Math.hypot(o.x1-p.x,o.y1-p.y), d2=Math.hypot(o.x2-p.x,o.y2-p.y);
  const fixed=d1>d2?{x:o.x1,y:o.y1}:{x:o.x2,y:o.y2};
  const moving=d1>d2?2:1;
  let dx=(moving===2?o.x2:o.x1)-fixed.x, dy=(moving===2?o.y2:o.y1)-fixed.y;
  const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
  const nx=fixed.x+dx*cmd.data.len, ny=fixed.y+dy*cmd.data.len;
  if(moving===2){o.x2=nx;o.y2=ny;}else{o.x1=nx;o.y1=ny;}
  echo(`Lengthened to ${cmd.data.len}`);endCmd();render();updateInfo();
}

// ---- DIVIDE: place point markers dividing an object into N equal segments ----
function doDivide(p){
  if(cmd.data.n==null){echo('DIVIDE: type the number of segments first',true);return;}
  const i=pickObject(p.x,p.y);if(i<0){echo('DIVIDE: click a line, polyline, circle or arc');return;}
  const o=doc.objects[i];const n=cmd.data.n;pushUndo();let placed=0;
  if(o.type==='line'){
    for(let k=1;k<n;k++){const t=k/n;add({type:'point',layer:o.layer,x:o.x1+(o.x2-o.x1)*t,y:o.y1+(o.y2-o.y1)*t});placed++;}
  }else if(o.type==='circle'){
    for(let k=0;k<n;k++){const a=k/n*2*Math.PI;add({type:'point',layer:o.layer,x:o.cx+o.r*Math.cos(a),y:o.cy+o.r*Math.sin(a)});placed++;}
  }else if(o.type==='arc'){
    let span=o.a2-o.a1;while(span<0)span+=2*Math.PI;
    for(let k=1;k<n;k++){const a=o.a1+span*k/n;add({type:'point',layer:o.layer,x:o.cx+o.r*Math.cos(a),y:o.cy+o.r*Math.sin(a)});placed++;}
  }else if(o.type==='pline'){
    // total length, then walk along
    const pts=o.pts;let total=0;const segs=[];
    for(let k=0;k<pts.length-1;k++){const L=Math.hypot(pts[k+1][0]-pts[k][0],pts[k+1][1]-pts[k][1]);segs.push(L);total+=L;}
    for(let k=1;k<n;k++){
      let target=total*k/n, acc=0;
      for(let s=0;s<segs.length;s++){
        if(acc+segs[s]>=target){const t=(target-acc)/segs[s];add({type:'point',layer:o.layer,x:pts[s][0]+(pts[s+1][0]-pts[s][0])*t,y:pts[s][1]+(pts[s+1][1]-pts[s][1])*t});placed++;break;}
        acc+=segs[s];
      }
    }
  }else{echo('DIVIDE: that object type isn\u2019t supported');endCmd();return;}
  echo(`Divided into ${n} — ${placed} points placed`);endCmd();render();updateInfo();
}

function makePolygon(center,vertex,n){const r=dist(center,vertex);const a0=Math.atan2(vertex.y-center.y,vertex.x-center.x);const pts=[];for(let i=0;i<n;i++){const a=a0+i*2*Math.PI/n;pts.push([center.x+r*Math.cos(a),center.y+r*Math.sin(a)]);}return{type:'pline',pts,closed:true};}
function arc3(p1,p2,p3){
  const ax=p1.x,ay=p1.y,bx=p2.x,by=p2.y,cx=p3.x,cy=p3.y;
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));if(Math.abs(d)<1e-9)return null;
  const ux=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/d;
  const uy=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/d;
  const r=Math.hypot(ax-ux,ay-uy);
  let a1=Math.atan2(ay-uy,ax-ux),a3=Math.atan2(cy-uy,cx-ux);
  return{type:'arc',cx:ux,cy:uy,r,a1,a2:a3};
}

// ---- typed command-line value (for radius, distance, angle, coords) ----
function feedValue(v){
  const k=cmd.active;
  v=v.trim();
  if(ACAD_VALUE[k]&&ACAD_VALUE[k](v))return;

  // --- ROTATE / SCALE Reference option (AutoCAD-style) ---
  // "R" enters reference mode; then the user gives a current reference value
  // and a new target value, and the program computes the angle/factor.
  if((k==='ROTATE'||k==='SCALE')&&cmd.step===1&&cmd.data){
    const r=cmd.data.ref;
    if(!r && /^r$/i.test(v)){
      cmd.data.ref={stage:'cur'};
      if(k==='ROTATE')echo('ROTATE Reference: specify the reference angle — click 2 points, or type the current angle°',true);
      else echo('SCALE Reference: specify the reference length — click 2 points, or type the current length',true);
      return;
    }
    if(r){
      const num=parseFloat(v);
      if(k==='ROTATE'){
        if(r.stage==='cur'&&!isNaN(num)){r.curAng=num*Math.PI/180;r.stage='new';echo('ROTATE Reference: specify the new angle — click a point, or type the new angle°',true);return;}
        if(r.stage==='new'&&!isNaN(num)){commitRotate(num*Math.PI/180-(r.curAng||0));render();updateInfo();return;}
      } else { // SCALE
        if(r.stage==='cur'&&!isNaN(num)&&num>0){r.curLen=num;r.stage='new';echo('SCALE Reference: specify the new length — click a point, or type the new length',true);return;}
        if(r.stage==='new'&&!isNaN(num)&&num>0&&r.curLen){commitScale(num/r.curLen);render();updateInfo();return;}
      }
      return; // swallow other input while in reference mode
    }
  }

  // --- FILLET / CHAMFER: "P" switches to Polyline mode (one click = all corners) ---
  if((k==='FILLET'||k==='CHAMFER')&&/^p$/i.test(v)){
    cmd.data=cmd.data||{};cmd.data.polyMode=true;cmd.data.first=null;
    echo(`${k} (Polyline mode): click a rectangle or polyline to ${k==='FILLET'?'round':'bevel'} all corners`,true);
    return;
  }

  // --- ARRAY: type columns,rows then xspacing,yspacing ---
  if(k==='ARRAY'&&cmd.data){
    if(cmd.data.phase==='grid'){
      let m=v.match(/^(\d+)\s*,\s*(\d+)$/);
      if(m){cmd.data.cols=parseInt(m[1]);cmd.data.rows=parseInt(m[2]);cmd.data.phase='spacing';echo('ARRAY: type column,row spacing (e.g. 50,50)',true);return;}
      echo('ARRAY: type columns,rows (e.g. 3,2)',true);return;
    }
    if(cmd.data.phase==='spacing'){
      let m=v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if(m){cmd.data.dx=parseFloat(m[1]);cmd.data.dy=parseFloat(m[2]);commitArray();return;}
      echo('ARRAY: type column,row spacing (e.g. 50,50)',true);return;
    }
  }

  // --- RECTANGLE: when waiting for the opposite corner, accept width,height or "D" ---
  if(k==='RECT'&&cmd.step===1){
    const c=cmd.pts[0];
    // "D" enters dimension sub-mode: ask width, then height
    if(/^d$/i.test(v)){cmd.data={dimMode:'w'};echo('RECTANGLE: enter width',true);updatePreview();render();return;}
    if(cmd.data&&cmd.data.dimMode==='w'){const w=parseFloat(v);if(!isNaN(w)){cmd.data.w=w;cmd.data.dimMode='h';echo(`RECTANGLE: width ${w} locked — type height or click to set it`,true);updatePreview();render();return;}}
    if(cmd.data&&cmd.data.dimMode==='h'){const h=parseFloat(v);if(!isNaN(h)){pushUndo();add({type:'rect',x1:c.x,y1:c.y,x2:c.x+cmd.data.w,y2:c.y+h});endCmd();render();updateInfo();return;}}
    // direct "width,height"
    let mWH=v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if(mWH){const w=parseFloat(mWH[1]),h=parseFloat(mWH[2]);pushUndo();add({type:'rect',x1:c.x,y1:c.y,x2:c.x+w,y2:c.y+h});endCmd();render();updateInfo();return;}
  }

  // --- 1) Relative polar: @dist<angle  (e.g. @1000<45) ---
  let mPolar=v.match(/^@?\s*(-?\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)$/);
  if(mPolar){
    const ref=lastPoint();
    if(ref){const d=parseFloat(mPolar[1]),ang=parseFloat(mPolar[2])*Math.PI/180;
      feedPoint({x:ref.x+d*Math.cos(ang),y:ref.y+d*Math.sin(ang)});return;}
  }
  // --- 2) Relative cartesian: @dx,dy  (e.g. @100,50) ---
  let mRel=v.match(/^@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(mRel){
    const ref=lastPoint();
    if(ref){feedPoint({x:ref.x+parseFloat(mRel[1]),y:ref.y+parseFloat(mRel[2])});return;}
  }
  // --- 3) Absolute coordinate: x,y ---
  if(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)){const[x,y]=v.split(',').map(Number);const w=ucs2world(x,y);feedPoint({x:w.x,y:w.y});return;}

  const num=parseFloat(v);

  // step-specific numeric values (radius, sides, distance, angle, factor)
  if(k==='POLYGON'&&cmd.step===0&&Number.isInteger(num)&&num>=3){cmd.data.sides=num;echo(`POLYGON: ${num} sides — specify center`,true);return;}
  if(k==='OFFSET'&&cmd.data.dist==null&&!isNaN(num)){cmd.data.dist=num;echo(`OFFSET: distance ${num} — click object, then side`,true);return;}
  if(k==='FILLET'&&cmd.data.first===null&&!isNaN(num)){cmd.data.r=num;lastFilletR=num;echo(`FILLET: radius ${num} — click a polyline corner, two line edges, or P for all`,true);return;}
  if(k==='CHAMFER'&&cmd.data.first===null&&!isNaN(num)){cmd.data.d=num;lastChamferD=num;echo(`CHAMFER: distance ${num} — click a polyline corner, two line edges, or P for all`,true);return;}
  if(k==='LENGTHEN'&&cmd.data.len==null&&!isNaN(num)){cmd.data.len=num;echo(`LENGTHEN: new length ${num} — click a line`,true);return;}
  if(k==='DIVIDE'&&cmd.data.n==null&&Number.isInteger(num)&&num>=2){cmd.data.n=num;echo(`DIVIDE: ${num} segments — click an object`,true);return;}
  if(k==='CIRCLE'&&cmd.step===1&&!isNaN(num)){pushUndo();add({type:'circle',cx:cmd.pts[0].x,cy:cmd.pts[0].y,r:num});endCmd();render();updateInfo();return;}
  // ELLIPSE: type the first half-axis (along current cursor direction) or the minor half-axis
  if(k==='ELLIPSE'&&!isNaN(num)&&num>0){
    if(cmd.pts.length===1){const c=cmd.pts[0];let dx=cursor.x-c.x,dy=cursor.y-c.y;let l=Math.hypot(dx,dy)||1;const ax={x:c.x+dx/l*num,y:c.y+dy/l*num};feedPoint(ax);return;}
    if(cmd.pts.length===2){const c=cmd.pts[0],ax=cmd.pts[1];const rot=Math.atan2(ax.y-c.y,ax.x-c.x);pushUndo();add({type:'ellipse',cx:c.x,cy:c.y,rx:dist(c,ax),ry:num,rot});endCmd();render();updateInfo();return;}
  }
  // POLYGON: type the circumradius (distance center->vertex)
  if(k==='POLYGON'&&cmd.step===1&&!isNaN(num)&&num>0){const c=cmd.pts[0];const v={x:c.x+num,y:c.y};pushUndo();add(makePolygon(c,v,cmd.data.sides));endCmd();render();updateInfo();return;}
  if(k==='ROTATE'&&cmd.step===1&&!isNaN(num)){commitRotate(num*Math.PI/180);render();updateInfo();return;}
  if(k==='SCALE'&&cmd.step===1&&!isNaN(num)){commitScale(num);render();updateInfo();return;}

  // --- 4) Distance-only entry: type a length, go that far in the current cursor direction ---
  //     Works for LINE, PLINE, and the destination step of MOVE/COPY.
  if(!isNaN(num)&&num!==0){
    const ref=lastPoint();
    if(ref&&cursor){
      let dx=cursor.x-ref.x, dy=cursor.y-ref.y;
      let len=Math.hypot(dx,dy);
      if(len<1e-9){dx=1;dy=0;len=1;}            // no direction yet -> default +X
      // honour ORTHO / POLAR: constrain the direction first, then apply the typed length
      let dir=applyConstraint(ref,{x:cursor.x,y:cursor.y});
      let ddx=dir.x-ref.x, ddy=dir.y-ref.y, dlen=Math.hypot(ddx,ddy);
      if(dlen<1e-9){ddx=dx;ddy=dy;dlen=len;}
      const ux=ddx/dlen, uy=ddy/dlen;
      feedPoint({x:ref.x+ux*num, y:ref.y+uy*num});
      return;
    }
  }
  echo(`(value "${v}" ignored in current step)`);
}
// returns the reference point a distance/relative entry should measure from
function lastPoint(){
  if((cmd.active==='LINE'||cmd.active==='PLINE')&&cmd.pts.length)return cmd.pts[cmd.pts.length-1];
  if((cmd.active==='MOVE'||cmd.active==='COPY'||cmd.active==='STRETCH'||cmd.active==='ROTATE'||cmd.active==='SCALE')&&cmd.step===1&&cmd.data&&cmd.data.base)return cmd.data.base;
  return null;
}

// ============================================================
//  SELECTION
// ============================================================
