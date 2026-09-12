// ============================================================
//  LumoCAD — hatch boundary from a picked point
// ============================================================
// The way anyone actually hatches: click an empty spot and let the program work out what
// encloses it, from whatever separate lines, arcs and polylines happen to bound the area.
//
// The method is the classical one. Take every visible edge near the pick, cut them all at
// their mutual intersections so the result is a planar arrangement, then walk the face that
// contains the point: fire a ray from the pick, take the first edge it meets, and follow
// half-edges round, at each node turning to the next edge clockwise from the way you came in.
// That traverses exactly the face lying to the left of each half-edge. Loops that come out
// anticlockwise (positive area) are real enclosed faces; the outer face comes out the other
// way and is rejected.
//
// Islands are found afterwards by re-tracing from inside the loop's own holes; they become
// `holes` on the hatch, and the even-odd scanline in clipLineToRings() leaves them unpainted.

const BOUNDARY_MAX_SEGMENTS=4000;   // above this the O(n^2) split gets slow; say so instead
const BOUNDARY_ARC_STEPS=48;        // how finely circles and arcs are polygonised

// ---- 1. every edge that could bound something ----
function traceSegments(){
  const segs=[];
  const push=(x1,y1,x2,y2)=>{
    if(!isFinite(x1)||!isFinite(y1)||!isFinite(x2)||!isFinite(y2))return;
    if(Math.abs(x2-x1)<1e-12&&Math.abs(y2-y1)<1e-12)return;
    segs.push([x1,y1,x2,y2]);
  };
  const arcPts=(cx,cy,r,a1,a2)=>{
    let span=a2-a1;while(span<=0)span+=2*Math.PI;
    const n=Math.max(4,Math.ceil(BOUNDARY_ARC_STEPS*span/(2*Math.PI)));
    let px=cx+r*Math.cos(a1),py=cy+r*Math.sin(a1);
    for(let k=1;k<=n;k++){const a=a1+span*k/n,x=cx+r*Math.cos(a),y=cy+r*Math.sin(a);push(px,py,x,y);px=x;py=y;}
  };
  for(const o of doc.objects){
    if(segs.length>BOUNDARY_MAX_SEGMENTS)break;
    if(!layerOn(o.layer))continue;                    // hidden and frozen layers do not bound
    switch(o.type){
      case 'line': push(o.x1,o.y1,o.x2,o.y2); break;
      case 'rect': push(o.x1,o.y1,o.x2,o.y1);push(o.x2,o.y1,o.x2,o.y2);push(o.x2,o.y2,o.x1,o.y2);push(o.x1,o.y2,o.x1,o.y1); break;
      case 'circle': arcPts(o.cx,o.cy,o.r,0,2*Math.PI); break;
      case 'arc': arcPts(o.cx,o.cy,o.r,o.a1,o.a2); break;
      case 'ellipse': {
        const c=Math.cos(o.rot||0),s=Math.sin(o.rot||0);
        let px=null,py=null;
        for(let k=0;k<=BOUNDARY_ARC_STEPS;k++){
          const a=k/BOUNDARY_ARC_STEPS*2*Math.PI, ex=o.rx*Math.cos(a), ey=o.ry*Math.sin(a);
          const x=o.cx+ex*c-ey*s, y=o.cy+ex*s+ey*c;
          if(px!==null)push(px,py,x,y);
          px=x;py=y;
        }
        break;
      }
      case 'spline': case 'pline': {
        const pts=(o.type==='spline')?sampleSpline(o.pts,8):o.pts;
        const n=pts.length, last=o.closed?n:n-1;
        for(let i=0;i<last;i++){
          const a=pts[i], b=pts[(i+1)%n];
          const seg=o.segs&&o.segs[i];
          if(seg&&seg.arc){
            const a1=Math.atan2(a[1]-seg.cy,a[0]-seg.cx), a2=Math.atan2(b[1]-seg.cy,b[0]-seg.cx);
            const ccw=(seg.sweep!=null?seg.sweep>0:(seg.bulge||0)>0);
            ccw?arcPts(seg.cx,seg.cy,seg.r,a1,a2):arcPts(seg.cx,seg.cy,seg.r,a2,a1);
          } else push(a[0],a[1],b[0],b[1]);
        }
        break;
      }
      case 'block': {
        for(const part of blockInstanceObjects(o)){
          for(const s of (part.type==='pline'||part.type==='rect'||part.type==='line')?objAsSegments(part):[])push(s[0],s[1],s[2],s[3]);
          if(part.type==='circle')arcPts(part.cx,part.cy,part.r,0,2*Math.PI);
          if(part.type==='arc')arcPts(part.cx,part.cy,part.r,part.a1,part.a2);
        }
        break;
      }
      default: break;   // text, dimensions, points, leaders and hatches do not bound an area
    }
  }
  return segs;
}

// ---- 2. cut every segment where another crosses it ----
function splitSegments(segs){
  const params=segs.map(()=>[0,1]);
  for(let i=0;i<segs.length;i++){
    const [x1,y1,x2,y2]=segs[i];
    const dx=x2-x1, dy=y2-y1;
    for(let j=i+1;j<segs.length;j++){
      const [x3,y3,x4,y4]=segs[j];
      const den=dx*(y4-y3)-dy*(x4-x3);
      if(Math.abs(den)<1e-12)continue;                  // parallel
      const t=((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3))/den;
      const u=((x3-x1)*dy-(y3-y1)*dx)/den;
      // Split each segment wherever the crossing falls strictly inside IT, whatever the
      // other one is doing. A T-junction — one segment ending on another's middle — only
      // splits the segment being crossed, and that is exactly the case that matters.
      const onI=(t>1e-9&&t<1-1e-9), onJ=(u>1e-9&&u<1-1e-9);
      if(!onI&&!onJ)continue;
      if(onI&&u>=-1e-9&&u<=1+1e-9)params[i].push(t);
      if(onJ&&t>=-1e-9&&t<=1+1e-9)params[j].push(u);
    }
  }
  const out=[];
  for(let i=0;i<segs.length;i++){
    const [x1,y1,x2,y2]=segs[i];
    const ts=[...new Set(params[i])].sort((a,b)=>a-b);
    for(let k=0;k+1<ts.length;k++){
      const ta=ts[k], tb=ts[k+1];
      if(tb-ta<1e-9)continue;
      out.push([x1+(x2-x1)*ta,y1+(y2-y1)*ta,x1+(x2-x1)*tb,y1+(y2-y1)*tb]);
    }
  }
  return out;
}

// ---- 3. the planar graph ----
function buildArrangement(edges,tol){
  const nodes=[],index=new Map();
  const key=(x,y)=>Math.round(x/tol)+':'+Math.round(y/tol);
  const nodeAt=(x,y)=>{
    const k=key(x,y);
    let id=index.get(k);
    if(id===undefined){id=nodes.length;nodes.push({x,y,out:[]});index.set(k,id);}
    return id;
  };
  const half=[];   // {from,to,ang,twin,used}
  for(const [x1,y1,x2,y2] of edges){
    const a=nodeAt(x1,y1), b=nodeAt(x2,y2);
    if(a===b)continue;                                  // collapsed by the tolerance
    const ia=half.length, ib=ia+1;
    half.push({from:a,to:b,ang:Math.atan2(nodes[b].y-nodes[a].y,nodes[b].x-nodes[a].x),twin:ib,used:false});
    half.push({from:b,to:a,ang:Math.atan2(nodes[a].y-nodes[b].y,nodes[a].x-nodes[b].x),twin:ia,used:false});
    nodes[a].out.push(ia);
    nodes[b].out.push(ib);
  }
  for(const n of nodes)n.out.sort((p,q)=>half[p].ang-half[q].ang);
  return {nodes,half};
}

// ---- 4. walk the face to the left of a half-edge ----
function walkFace(arr,startHalf,maxSteps){
  const {nodes,half}=arr;
  const loop=[];
  let h=startHalf;
  for(let step=0;step<maxSteps;step++){
    loop.push(half[h].from);
    const v=half[h].to;
    const back=half[h].twin;                            // the way we came, seen from v
    const out=nodes[v].out;
    const i=out.indexOf(back);
    if(i<0)return null;
    // the next edge clockwise from the one we arrived on keeps the same face on our left
    const next=out[(i-1+out.length)%out.length];
    if(next===startHalf)return loop;
    h=next;
  }
  return null;                                          // ran away: not a closed face
}
function ringArea(pts){
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1];
  return a/2;
}

// ---- 5. the face containing a point ----
// Fires a ray and takes the first edge it meets. A ray that grazes a node gives an ambiguous
// answer, so several directions are tried and the first clean one wins.
function faceAt(arr,px,py,maxSteps){
  const {nodes,half}=arr;
  const DIRS=[0,0.2137,1.1071,2.3562,3.5619,4.7124,5.6397,0.7854];
  for(const dir of DIRS){
    const dx=Math.cos(dir), dy=Math.sin(dir);
    let bestT=Infinity,bestHalf=-1,grazed=false;
    for(let e=0;e<half.length;e+=2){
      const A=nodes[half[e].from], B=nodes[half[e].to];
      const ex=B.x-A.x, ey=B.y-A.y;
      const den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-12)continue;
      const t=((A.x-px)*ey-(A.y-py)*ex)/den;            // along the ray
      const u=((A.x-px)*dy-(A.y-py)*dx)/den;            // along the edge
      if(t<=1e-9)continue;
      if(u<-1e-9||u>1+1e-9)continue;
      if(u<1e-6||u>1-1e-6){grazed=true;break;}          // through a node: try another direction
      if(t<bestT){bestT=t;bestHalf=e;}
    }
    if(grazed||bestHalf<0)continue;
    // of the two directions along that edge, take the one whose left side faces the pick
    const A=nodes[half[bestHalf].from], B=nodes[half[bestHalf].to];
    const ex=B.x-A.x, ey=B.y-A.y;
    // left normal of A->B is (-ey, ex); we want it pointing back towards the pick
    const towards=(-ey)*(px-A.x)+(ex)*(py-A.y);
    const h=(towards>0)?bestHalf:half[bestHalf].twin;
    const loop=walkFace(arr,h,maxSteps);
    if(!loop)continue;
    const pts=loop.map(i=>[nodes[i].x,nodes[i].y]);
    if(pts.length<3)continue;
    if(ringArea(pts)<=0)continue;                       // the outer face, not an enclosure
    if(!pointInPoly(px,py,pts))continue;                // sanity: the walk must contain the pick
    return pts;
  }
  return null;
}

// ---- 6. the whole job ----
// Returns {outer:[[x,y]...], holes:[[[x,y]...]]} or null with a reason in `boundaryError`.
let boundaryError='';
function traceBoundaryAt(px,py){
  boundaryError='';
  const raw=traceSegments();
  if(!raw.length){boundaryError='there is no geometry here to enclose an area';return null;}
  if(raw.length>BOUNDARY_MAX_SEGMENTS){
    boundaryError=`too much geometry to trace (${raw.length} edges) — freeze some layers, or select a closed shape instead`;
    return null;
  }
  // a tolerance that means the same thing whatever units the drawing is in
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const s of raw){
    minx=Math.min(minx,s[0],s[2]);maxx=Math.max(maxx,s[0],s[2]);
    miny=Math.min(miny,s[1],s[3]);maxy=Math.max(maxy,s[1],s[3]);
  }
  const tol=Math.max(1e-9,Math.hypot(maxx-minx,maxy-miny)*1e-7);
  const arr=buildArrangement(splitSegments(raw),tol);
  if(!arr.half.length){boundaryError='there is no geometry here to enclose an area';return null;}
  const maxSteps=arr.half.length+8;
  const outer=faceAt(arr,px,py,maxSteps);
  if(!outer){boundaryError='that point is not inside a closed area';return null;}
  return {outer,holes:findHoles(arr,outer,maxSteps)};
}
// Anything enclosed *inside* the traced face is an island. They are found by tracing again
// from a point just inside each candidate loop that sits within the outer one.
function findHoles(arr,outer,maxSteps){
  const {nodes,half}=arr;
  const holes=[],seen=new Set();
  for(let e=0;e<half.length;e++){
    if(seen.has(e))continue;
    const loop=walkFace(arr,e,maxSteps);
    if(!loop){seen.add(e);continue;}
    // mark the whole loop so each face is only considered once
    let h=e;
    for(let k=0;k<loop.length;k++){
      seen.add(h);
      const v=half[h].to, out=nodes[v].out, i=out.indexOf(half[h].twin);
      if(i<0)break;
      h=out[(i-1+out.length)%out.length];
    }
    const pts=loop.map(i=>[nodes[i].x,nodes[i].y]);
    if(pts.length<3||ringArea(pts)<=0)continue;
    if(ringsEqual(pts,outer))continue;
    // inside the outer ring, and not the outer ring itself
    const c=ringCentroid(pts);
    if(!pointInPoly(c[0],c[1],outer))continue;
    if(Math.abs(ringArea(pts))>=Math.abs(ringArea(outer))-1e-9)continue;
    holes.push(pts);
  }
  // drop any island that sits inside another island — only the first level is a hole
  return holes.filter(h=>{
    const c=ringCentroid(h);
    return !holes.some(g=>g!==h&&Math.abs(ringArea(g))>Math.abs(ringArea(h))&&pointInPoly(c[0],c[1],g));
  });
}
function ringCentroid(pts){
  let a=0,cx=0,cy=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const cross=pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1];
    a+=cross;cx+=(pts[j][0]+pts[i][0])*cross;cy+=(pts[j][1]+pts[i][1])*cross;
  }
  a/=2;
  if(Math.abs(a)<1e-12){return [pts[0][0],pts[0][1]];}
  return [cx/(6*a),cy/(6*a)];
}
function ringsEqual(a,b){
  if(a.length!==b.length)return false;
  const key=r=>r.map(p=>p[0].toFixed(6)+','+p[1].toFixed(6)).sort().join(';');
  return key(a)===key(b);
}
