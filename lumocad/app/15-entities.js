// ============================================================
//  LumoCAD — the entity registry
// ============================================================
// One descriptor per entity type, holding what that type does. Before this, 306 `o.type===`
// checks were spread over 13 files and adding a type meant finding all of them; measured, that
// was 12 to 45 edit sites depending on the type. A behaviour moved in here becomes a lookup at
// its old call site, and a new type becomes one `defineEntity` block.
//
// The move is being done a behaviour at a time, each step checked against build/entity-matrix.js
// — a golden master of every (type x behaviour) pair recorded before any of it started. A
// behaviour that has not been moved yet still lives in its original function; nothing is half
// migrated at any point.
//
// Descriptor keys, as they are adopted:
//   points(o)       -> [[x,y], ...]   the characteristic points, for bounds and zoom extents
//   segments(o)     -> [[x1,y1,x2,y2], ...]  straight pieces, for trim/extend/boundary work
//   degenerate(o)   -> true if the object has no size and should not be created
//   feature(o,feat) -> {x,y} for an associative reference, or null

const ENTITY={};
function defineEntity(type,spec){ENTITY[type]=Object.assign(ENTITY[type]||{},spec);}
function entitySpec(o){return (o&&ENTITY[o.type])||null;}
// ask a descriptor for one behaviour, falling back to a default when the type does not define it
function entityCall(o,key,fallback,...args){
  const e=entitySpec(o);
  return (e&&typeof e[key]==='function')?e[key](o,...args):fallback;
}

const DEGENERATE_EPS=1e-6;

// ------------------------------------------------------------
//  line
// ------------------------------------------------------------
defineEntity('line',{
  points:o=>[[o.x1,o.y1],[o.x2,o.y2]],
  segments:o=>[[o.x1,o.y1,o.x2,o.y2]],
  degenerate:o=>Math.hypot(o.x2-o.x1,o.y2-o.y1)<DEGENERATE_EPS&&!o.construction,
  feature:(o,f)=>{
    if(f.t==='end')return (f.i|0)===0?{x:o.x1,y:o.y1}:{x:o.x2,y:o.y2};
    if(f.t==='mid')return {x:(o.x1+o.x2)/2,y:(o.y1+o.y2)/2};
    return null;
  },
});

// ------------------------------------------------------------
//  rect
// ------------------------------------------------------------
defineEntity('rect',{
  points:o=>[[o.x1,o.y1],[o.x2,o.y2],[o.x1,o.y2],[o.x2,o.y1]],
  segments:o=>[[o.x1,o.y1,o.x2,o.y1],[o.x2,o.y1,o.x2,o.y2],[o.x2,o.y2,o.x1,o.y2],[o.x1,o.y2,o.x1,o.y1]],
  degenerate:o=>Math.abs(o.x2-o.x1)<DEGENERATE_EPS||Math.abs(o.y2-o.y1)<DEGENERATE_EPS,
  feature:(o,f)=>{
    const i=f.i|0;
    if(f.t==='corner')return [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2},{x:o.x1,y:o.y2},{x:o.x2,y:o.y1}][i]||null;
    if(f.t==='edgemid')return [{x:(o.x1+o.x2)/2,y:o.y1},{x:(o.x1+o.x2)/2,y:o.y2},{x:o.x1,y:(o.y1+o.y2)/2},{x:o.x2,y:(o.y1+o.y2)/2}][i]||null;
    return null;
  },
});

// ------------------------------------------------------------
//  circle / arc
// ------------------------------------------------------------
const circleFeature=(o,f)=>{
  if(f.t==='center')return {x:o.cx,y:o.cy};
  if(f.t==='quad')return [{x:o.cx+o.r,y:o.cy},{x:o.cx-o.r,y:o.cy},{x:o.cx,y:o.cy+o.r},{x:o.cx,y:o.cy-o.r}][f.i|0]||null;
  return null;
};
defineEntity('circle',{
  points:o=>[[o.cx,o.cy]],
  degenerate:o=>!(o.r>DEGENERATE_EPS),
  feature:circleFeature,
});
defineEntity('arc',{
  points:o=>[[o.cx,o.cy]],
  degenerate:o=>!(o.r>DEGENERATE_EPS)||Math.abs(o.a2-o.a1)<DEGENERATE_EPS,
  feature:circleFeature,
});

// ------------------------------------------------------------
//  ellipse
// ------------------------------------------------------------
defineEntity('ellipse',{
  points:o=>[[o.cx,o.cy],
             [o.cx+o.rx*Math.cos(o.rot||0),o.cy+o.rx*Math.sin(o.rot||0)],
             [o.cx-o.rx*Math.cos(o.rot||0),o.cy-o.rx*Math.sin(o.rot||0)]],
  degenerate:o=>!(o.rx>DEGENERATE_EPS)||!(o.ry>DEGENERATE_EPS),
});

// ------------------------------------------------------------
//  polyline / spline / leader — all point lists
// ------------------------------------------------------------
defineEntity('pline',{
  points:o=>o.pts.slice(),
  segments:o=>{const s=[];for(let i=0;i<o.pts.length-1;i++)s.push([o.pts[i][0],o.pts[i][1],o.pts[i+1][0],o.pts[i+1][1]]);return s;},
  degenerate:o=>!o.pts||o.pts.length<2,
  feature:(o,f)=>{
    const i=f.i|0;
    if(f.t==='vertex'){const p=o.pts[i];return p?{x:p[0],y:p[1]}:null;}
    if(f.t==='segmid'){const a=o.pts[i],b=o.pts[i+1];return (a&&b)?{x:(a[0]+b[0])/2,y:(a[1]+b[1])/2}:null;}
    return null;
  },
});
defineEntity('spline',{points:o=>o.pts.slice()});
defineEntity('leader',{points:o=>o.pts.slice()});

// ------------------------------------------------------------
//  point / block
// ------------------------------------------------------------
defineEntity('point',{
  points:o=>[[o.x,o.y]],
  feature:(o,f)=>f.t==='origin'?{x:o.x,y:o.y}:null,
});
defineEntity('block',{points:o=>[[o.x,o.y]]});

// ------------------------------------------------------------
//  text
// ------------------------------------------------------------
defineEntity('text',{points:o=>textBounds(o)});

// ------------------------------------------------------------
//  hatch — follows whatever it is filling
// ------------------------------------------------------------
defineEntity('hatch',{
  points:o=>{
    if(Array.isArray(o.poly))return o.poly.slice();
    const host=byId(o.boundary);
    return host?objPoints(host):[];
  },
});

// ------------------------------------------------------------
//  dimension — the points that define it, which differ per kind
// ------------------------------------------------------------
defineEntity('dim',{
  points:o=>{
    const kind=o.dim||'linear';
    if(kind==='radius'||kind==='diameter'){
      const pts=[[o.cx,o.cy]];const ang=o.ang||0;
      pts.push([o.cx+o.r*Math.cos(ang),o.cy+o.r*Math.sin(ang)]);
      if(kind==='diameter')pts.push([o.cx-o.r*Math.cos(ang),o.cy-o.r*Math.sin(ang)]);
      return pts;
    }
    if(kind==='angular'){
      const pts=[[o.cx,o.cy]];const r=o.r||30;
      pts.push([o.cx+r*Math.cos(o.a1||0),o.cy+r*Math.sin(o.a1||0)]);
      pts.push([o.cx+r*Math.cos(o.a2||0),o.cy+r*Math.sin(o.a2||0)]);
      return pts;
    }
    const pts=[[o.x1,o.y1],[o.x2,o.y2]];
    let wdx=o.x2-o.x1,wdy=o.y2-o.y1;
    if(kind==='linear'){if(Math.abs(wdx)>=Math.abs(wdy))wdy=0;else wdx=0;}
    const wlen=Math.hypot(wdx,wdy)||1,nx=-wdy/wlen,ny=wdx/wlen;
    pts.push([o.x1+nx*(o.off||0),o.y1+ny*(o.off||0)],[o.x2+nx*(o.off||0),o.y2+ny*(o.off||0)]);
    return pts;
  },
  segments:o=>{
    const kind=o.dim||'linear';
    if(kind!=='linear'&&kind!=='aligned')return [];
    let wdx=o.x2-o.x1,wdy=o.y2-o.y1;
    if(kind==='linear'){if(Math.abs(wdx)>=Math.abs(wdy))wdy=0;else wdx=0;}
    const wlen=Math.hypot(wdx,wdy)||1,nx=-wdy/wlen,ny=wdx/wlen;
    const ax=o.x1+nx*o.off,ay=o.y1+ny*o.off,bx=o.x2+nx*o.off,by=o.y2+ny*o.off;
    return [[ax,ay,bx,by],[o.x1,o.y1,ax,ay],[o.x2,o.y2,bx,by]];   // dim line + 2 extension lines
  },
});

// ============================================================
//  Transforms
// ============================================================
// Each dispatcher builds the mapping once and hands it to the descriptor, so a type only has
// to say which of its fields are points and which are angles. Types that define nothing here
// do not transform — leaders and hatches never did, and that is preserved deliberately rather
// than changed in passing.

defineEntity('line',{
  translate:(o,dx,dy)=>{o.x1+=dx;o.y1+=dy;o.x2+=dx;o.y2+=dy;},
  rotate:(o,rot)=>{[o.x1,o.y1]=rot(o.x1,o.y1);[o.x2,o.y2]=rot(o.x2,o.y2);},
  scale:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
  scaleXY:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
  mirror:(o,mir)=>{[o.x1,o.y1]=mir(o.x1,o.y1);[o.x2,o.y2]=mir(o.x2,o.y2);},
});

defineEntity('rect',{
  translate:(o,dx,dy)=>{o.x1+=dx;o.y1+=dy;o.x2+=dx;o.y2+=dy;},
  // a rect is axis-aligned by definition, so rotating or reflecting it makes it a polyline
  rotate:(o,rot)=>{
    const pts=[rot(o.x1,o.y1),rot(o.x2,o.y1),rot(o.x2,o.y2),rot(o.x1,o.y2)];
    o.type='pline';o.pts=pts;o.closed=true;
  },
  scale:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
  scaleXY:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
  mirror:(o,mir)=>{o.type='pline';o.pts=[mir(o.x1,o.y1),mir(o.x2,o.y1),mir(o.x2,o.y2),mir(o.x1,o.y2)];o.closed=true;},
});

defineEntity('circle',{
  translate:(o,dx,dy)=>{o.cx+=dx;o.cy+=dy;},
  rotate:(o,rot)=>{[o.cx,o.cy]=rot(o.cx,o.cy);},
  scale:(o,sc,f)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.r*=f;},
  scaleXY:(o,sc,fx,fy,avg)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.r*=avg;},
  mirror:(o,mir)=>{[o.cx,o.cy]=mir(o.cx,o.cy);},
});

defineEntity('arc',{
  translate:(o,dx,dy)=>{o.cx+=dx;o.cy+=dy;},
  rotate:(o,rot,ang)=>{[o.cx,o.cy]=rot(o.cx,o.cy);o.a1+=ang;o.a2+=ang;},
  scale:(o,sc,f)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.r*=f;},
  scaleXY:(o,sc,fx,fy,avg)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.r*=avg;},
  mirror:(o,mir)=>{
    // mirror the centre, then recompute the angles from the mirrored endpoints: after a
    // reflection the arc runs from the mirrored END to the mirrored START
    const ex1=o.cx+o.r*Math.cos(o.a1), ey1=o.cy+o.r*Math.sin(o.a1);
    const ex2=o.cx+o.r*Math.cos(o.a2), ey2=o.cy+o.r*Math.sin(o.a2);
    const mc=mir(o.cx,o.cy), mcx=mc[0], mcy=mc[1];
    const [p1x,p1y]=mir(ex1,ey1), [p2x,p2y]=mir(ex2,ey2);
    o.cx=mcx;o.cy=mcy;
    o.a1=Math.atan2(p2y-mcy,p2x-mcx);
    o.a2=Math.atan2(p1y-mcy,p1x-mcx);
  },
});

defineEntity('ellipse',{
  translate:(o,dx,dy)=>{o.cx+=dx;o.cy+=dy;},
  rotate:(o,rot,ang)=>{[o.cx,o.cy]=rot(o.cx,o.cy);o.rot=(o.rot||0)+ang;},
  scale:(o,sc,f)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.rx*=f;o.ry*=f;},
  scaleXY:(o,sc,fx,fy)=>{[o.cx,o.cy]=sc(o.cx,o.cy);o.rx*=Math.abs(fx);o.ry*=Math.abs(fy);},
  mirror:(o,mir)=>{[o.cx,o.cy]=mir(o.cx,o.cy);o.rot=-(o.rot||0);},
});

defineEntity('pline',{
  translate:(o,dx,dy)=>{o.pts=o.pts.map(p=>[p[0]+dx,p[1]+dy]);if(o.segs)o.segs.forEach(s=>{if(s&&s.arc){s.cx+=dx;s.cy+=dy;}});},
  rotate:(o,rot,ang)=>{o.pts=o.pts.map(p=>rot(p[0],p[1]));if(o.segs)o.segs.forEach(s=>{if(s&&s.arc){[s.cx,s.cy]=rot(s.cx,s.cy);s.a1+=ang;s.a2+=ang;}});},
  scale:(o,sc,f)=>{o.pts=o.pts.map(p=>sc(p[0],p[1]));if(o.segs)o.segs.forEach(s=>{if(s&&s.arc){[s.cx,s.cy]=sc(s.cx,s.cy);s.r*=f;}});},
  scaleXY:(o,sc,fx,fy,avg)=>{o.pts=o.pts.map(p=>sc(p[0],p[1]));if(o.segs)o.segs.forEach(s=>{if(s&&s.arc){[s.cx,s.cy]=sc(s.cx,s.cy);s.r*=avg;}});},
  mirror:(o,mir)=>{
    // mirror the vertices; for each arc segment mirror its centre and recompute the angles
    // from the mirrored tangent endpoints, flipping the sweep direction
    o.pts=o.pts.map(p=>mir(p[0],p[1]));
    if(o.segs)o.segs.forEach((s,k)=>{if(s&&s.arc){
      const [mcx,mcy]=mir(s.cx,s.cy);
      const A=o.pts[k], B=o.pts[(k+1)%o.pts.length];
      let a1=Math.atan2(A[1]-mcy,A[0]-mcx), a2=Math.atan2(B[1]-mcy,B[0]-mcx);
      const cw=(f,t)=>{let d=f-t;while(d<0)d+=2*Math.PI;while(d>=2*Math.PI)d-=2*Math.PI;return d;};
      if(cw(a1,a2)>Math.PI){const t=a1;a1=a2;a2=t;}
      s.cx=mcx;s.cy=mcy;s.a1=a1;s.a2=a2;
    }});
  },
});

defineEntity('spline',{
  translate:(o,dx,dy)=>{o.pts=o.pts.map(p=>[p[0]+dx,p[1]+dy]);},
  rotate:(o,rot)=>{o.pts=o.pts.map(p=>rot(p[0],p[1]));},
  scale:(o,sc)=>{o.pts=o.pts.map(p=>sc(p[0],p[1]));},
  scaleXY:(o,sc)=>{o.pts=o.pts.map(p=>sc(p[0],p[1]));},
  mirror:(o,mir)=>{o.pts=o.pts.map(p=>mir(p[0],p[1]));},
});

// a leader moves with a translate but has never rotated, scaled or reflected
defineEntity('leader',{
  translate:(o,dx,dy)=>{o.pts=o.pts.map(p=>[p[0]+dx,p[1]+dy]);},
  scaleXY:(o,sc)=>{o.pts=o.pts.map(p=>sc(p[0],p[1]));},
});

defineEntity('point',{
  translate:(o,dx,dy)=>{o.x+=dx;o.y+=dy;},
  rotate:(o,rot)=>{[o.x,o.y]=rot(o.x,o.y);},
  scale:(o,sc)=>{[o.x,o.y]=sc(o.x,o.y);},
  scaleXY:(o,sc)=>{[o.x,o.y]=sc(o.x,o.y);},
  mirror:(o,mir)=>{[o.x,o.y]=mir(o.x,o.y);},
});

defineEntity('text',{
  translate:(o,dx,dy)=>{o.x+=dx;o.y+=dy;},
  rotate:(o,rot)=>{[o.x,o.y]=rot(o.x,o.y);},
  scale:(o,sc,f)=>{[o.x,o.y]=sc(o.x,o.y);o.h*=f;},
  scaleXY:(o,sc,fx,fy,avg)=>{[o.x,o.y]=sc(o.x,o.y);o.h*=avg;},
  mirror:(o,mir)=>{[o.x,o.y]=mir(o.x,o.y);},
});

// a block reference is itself a transform, so these write to it rather than to geometry
defineEntity('block',{
  translate:(o,dx,dy)=>{o.x+=dx;o.y+=dy;},
  rotate:(o,rot,ang)=>{[o.x,o.y]=rot(o.x,o.y);o.rot=(o.rot||0)+ang;},
  scale:(o,sc,f)=>{[o.x,o.y]=sc(o.x,o.y);o.sx=(o.sx==null?1:o.sx)*f;o.sy=(o.sy==null?1:o.sy)*f;},
  scaleXY:(o,sc,fx,fy)=>{[o.x,o.y]=sc(o.x,o.y);o.sx=(o.sx==null?1:o.sx)*fx;o.sy=(o.sy==null?1:o.sy)*fy;},
  mirror:(o,mir,axisAng)=>{
    // reflecting a block is a negative scale and a rotation mirrored about the axis angle
    [o.x,o.y]=mir(o.x,o.y);
    o.rot=2*axisAng-(o.rot||0);
    o.sy=-(o.sy==null?1:o.sy);
  },
});

// a dimension's definition points move like a line's
defineEntity('dim',{
  translate:(o,dx,dy)=>{o.x1+=dx;o.y1+=dy;o.x2+=dx;o.y2+=dy;},
  scale:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
  scaleXY:(o,sc)=>{[o.x1,o.y1]=sc(o.x1,o.y1);[o.x2,o.y2]=sc(o.x2,o.y2);},
});

// ============================================================
//  Bounds and grips
// ============================================================
// bounds(o) -> [x1,y1,x2,y2], or nothing at all for a type that must never be culled.
// A dimension, a block reference and a hatch all draw outside any box their own fields
// describe, so they say nothing here and objBounds() treats them as everywhere.
const bbOfPts=pts=>{
  if(!pts||!pts.length)return null;
  let x1=pts[0][0],x2=x1,y1=pts[0][1],y2=y1;
  for(const p of pts){if(p[0]<x1)x1=p[0];if(p[0]>x2)x2=p[0];if(p[1]<y1)y1=p[1];if(p[1]>y2)y2=p[1];}
  return [x1,y1,x2,y2];
};
defineEntity('line',   {bounds:o=>[Math.min(o.x1,o.x2),Math.min(o.y1,o.y2),Math.max(o.x1,o.x2),Math.max(o.y1,o.y2)]});
defineEntity('rect',   {bounds:o=>[Math.min(o.x1,o.x2),Math.min(o.y1,o.y2),Math.max(o.x1,o.x2),Math.max(o.y1,o.y2)]});
defineEntity('circle', {bounds:o=>[o.cx-o.r,o.cy-o.r,o.cx+o.r,o.cy+o.r]});
defineEntity('arc',    {bounds:o=>[o.cx-o.r,o.cy-o.r,o.cx+o.r,o.cy+o.r]});
defineEntity('ellipse',{bounds:o=>{const r=Math.max(o.rx,o.ry);return [o.cx-r,o.cy-r,o.cx+r,o.cy+r];}});
defineEntity('text',   {bounds:o=>[o.x,o.y,o.x,o.y]});
defineEntity('point',  {bounds:o=>[o.x,o.y,o.x,o.y]});
defineEntity('pline',  {bounds:o=>bbOfPts(o.pts)});
defineEntity('spline', {bounds:o=>bbOfPts(o.pts)});
defineEntity('leader', {bounds:o=>bbOfPts(o.pts)});

// grips(o) -> [{x,y,mid?}]. A type that says nothing gets a grip on each of its points.
defineEntity('line',{
  grips:o=>{
    const g=[];
    if(o.construction){
      // xline/ray: the editable grips are the real anchor and direction points, not the +/-1e6 ends
      if(o.anchor)g.push({x:o.anchor.x,y:o.anchor.y,xkind:'anchor'});
      if(o.thru)g.push({x:o.thru.x,y:o.thru.y,xkind:'thru'});
      return g;
    }
    g.push({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
    g.push({x:(o.x1+o.x2)/2,y:(o.y1+o.y2)/2,mid:true});
    return g;
  },
});
defineEntity('rect',{
  grips:o=>{
    const g=[],pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];
    pts.forEach(p=>g.push({x:p[0],y:p[1]}));
    for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4];g.push({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,mid:true});}
    return g;
  },
});
defineEntity('pline',{
  grips:o=>{
    const g=[];
    o.pts.forEach(p=>g.push({x:p[0],y:p[1]}));
    // a revcloud has many vertices — its midpoint grips would be an unusable mess
    if(!o.revcloud)for(let i=0;i<o.pts.length-1;i++){const a=o.pts[i],b=o.pts[i+1];g.push({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,mid:true});}
    return g;
  },
});
defineEntity('circle',{
  grips:o=>[{x:o.cx,y:o.cy},
            {x:o.cx+o.r,y:o.cy,mid:true},{x:o.cx-o.r,y:o.cy,mid:true},
            {x:o.cx,y:o.cy+o.r,mid:true},{x:o.cx,y:o.cy-o.r,mid:true}],
});

// ============================================================
//  Picking
// ============================================================
// hit(o,x,y,tol) -> is the cursor on this object? A type that says nothing cannot be picked.
const polyHit=(pts,closed,x,y,tol)=>{
  for(let i=0;i<pts.length-1;i++)if(distToSeg(x,y,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1])<tol)return true;
  if(closed&&pts.length>2){const a=pts[0],b=pts[pts.length-1];if(distToSeg(x,y,b[0],b[1],a[0],a[1])<tol)return true;}
  return false;
};
defineEntity('line',   {hit:(o,x,y,tol)=>distToSeg(x,y,o.x1,o.y1,o.x2,o.y2)<tol});
defineEntity('dim',    {hit:(o,x,y,tol)=>dimHit(o,x,y,tol)});
defineEntity('circle', {hit:(o,x,y,tol)=>Math.abs(Math.hypot(x-o.cx,y-o.cy)-o.r)<tol});
defineEntity('arc',    {hit:(o,x,y,tol)=>Math.abs(Math.hypot(x-o.cx,y-o.cy)-o.r)<tol});
defineEntity('rect',   {hit:(o,x,y,tol)=>objAsSegments(o).some(s=>distToSeg(x,y,...s)<tol)});
defineEntity('pline',  {hit:(o,x,y,tol)=>polyHit(o.pts,o.closed,x,y,tol)});
defineEntity('leader', {hit:(o,x,y,tol)=>polyHit(o.pts,false,x,y,tol)});
// a spline is drawn as a curve through its points, so pick it a little more generously
defineEntity('spline', {hit:(o,x,y,tol)=>polyHit(o.pts,false,x,y,tol*1.5)});
defineEntity('point',  {hit:(o,x,y,tol)=>Math.hypot(x-o.x,y-o.y)<tol*1.5});
defineEntity('text',   {hit:(o,x,y,tol)=>textHit(o,x,y,tol)});
defineEntity('ellipse',{
  hit:(o,x,y,tol)=>{
    // approximate: distance to the outline via parametric sampling
    let best=1e18;const c=Math.cos(o.rot||0),s=Math.sin(o.rot||0);
    for(let k=0;k<48;k++){
      const a=k/48*2*Math.PI;
      const ex=o.cx+o.rx*Math.cos(a)*c-o.ry*Math.sin(a)*s;
      const ey=o.cy+o.rx*Math.cos(a)*s+o.ry*Math.sin(a)*c;
      best=Math.min(best,Math.hypot(x-ex,y-ey));
    }
    return best<tol*1.5;
  },
});
// A hatch is picked on its pattern lines, the way AutoCAD does it — not anywhere inside its
// boundary. A hatched plate covers everything drawn on it, so "inside counts" would mean the
// hatch swallowed every click meant for the lines underneath, and the fill would be the only
// thing on the drawing you could select. Clicking a gap between pattern lines misses it.
defineEntity('hatch',{
  hit:(o,x,y,tol)=>{
    const rings=hatchRings(o);
    if(!rings||!rings.length)return false;
    if(!pointInPoly(x,y,rings[0]))return false;
    for(let i=1;i<rings.length;i++)if(pointInPoly(x,y,rings[i]))return false;  // an island is clear
    return hatchOnPattern(o,rings,x,y,tol);
  },
});
defineEntity('block',{
  hit:(o,x,y,tol)=>{
    if(Math.hypot(x-o.x,y-o.y)<tol*1.5)return true;         // the insertion handle
    return blockInstanceObjects(o).some(c=>hitTest(c,x,y,tol));
  },
});

// ============================================================
//  Window selection
// ============================================================
// inWindow(o,r,crossing,helpers) -> only the types that cannot be answered from points and
// segments define this; everything else falls through to the generic test in objInWindow().
defineEntity('block',{
  inWindow:(o,r,crossing,h)=>{
    const parts=blockInstanceObjects(o);
    if(!parts.length)return h.inside([o.x,o.y]);
    return crossing ? parts.some(c=>objInWindow(c,r,true)) : parts.every(c=>objInWindow(c,r,false));
  },
});
const circleInWindow=(o,r,crossing,h)=>{
  // a circle has no straight segments, so it is answered from its centre and radius
  if(!crossing)return o.cx-o.r>=h.xmin&&o.cx+o.r<=h.xmax&&o.cy-o.r>=h.ymin&&o.cy+o.r<=h.ymax;
  if(h.inside([o.cx,o.cy]))return true;
  const boxEdges=[[h.xmin,h.ymin,h.xmax,h.ymin],[h.xmax,h.ymin,h.xmax,h.ymax],
                  [h.xmax,h.ymax,h.xmin,h.ymax],[h.xmin,h.ymax,h.xmin,h.ymin]];
  for(const e of boxEdges){
    if(intersectLineCircle({x1:e[0],y1:e[1],x2:e[2],y2:e[3]},o).length)return true;
  }
  // or the box sits entirely inside the circle
  if(Math.hypot(h.xmin-o.cx,h.ymin-o.cy)<o.r&&Math.hypot(h.xmax-o.cx,h.ymax-o.cy)<o.r)return true;
  return false;
};
defineEntity('circle',{inWindow:circleInWindow});
defineEntity('arc',{inWindow:circleInWindow});

// ============================================================
//  Area, and what the file loader will accept
// ============================================================
// area(o) -> {area, perim} for a closed shape, or nothing for one that encloses nothing
const shoelace=pts=>{
  const n=pts.length;let A=0,per=0;
  for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];A+=a[0]*b[1]-b[0]*a[1];per+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
  return {area:Math.abs(A)/2,perim:per};
};
defineEntity('circle', {area:o=>({area:Math.PI*o.r*o.r,perim:2*Math.PI*o.r})});
defineEntity('ellipse',{area:o=>({area:Math.PI*o.rx*o.ry,
  // Ramanujan's approximation for the perimeter
  perim:Math.PI*(3*(o.rx+o.ry)-Math.sqrt((3*o.rx+o.ry)*(o.rx+3*o.ry)))})});
defineEntity('rect',   {area:o=>shoelace([[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]])});
defineEntity('pline',  {area:o=>o.pts.length>=3?shoelace(o.pts):null});

// sane(o) -> is this object usable? Every coordinate a type needs must be a real number.
// JSON has no NaN — JSON.stringify writes it as null, which sails through isFinite() — so
// each field is checked for being a number, not merely for being finite.
defineEntity('line',   {sane:o=>nums(o,['x1','y1','x2','y2'])});
defineEntity('rect',   {sane:o=>nums(o,['x1','y1','x2','y2'])});
defineEntity('circle', {sane:o=>nums(o,['cx','cy','r'])&&o.r>0});
defineEntity('arc',    {sane:o=>nums(o,['cx','cy','r','a1','a2'])&&o.r>0});
defineEntity('ellipse',{sane:o=>nums(o,['cx','cy','rx','ry'])&&o.rx>0&&o.ry>0});
defineEntity('pline',  {sane:o=>finitePts(o,2)});
defineEntity('spline', {sane:o=>finitePts(o,2)});
defineEntity('leader', {sane:o=>finitePts(o,2)});
defineEntity('text',   {sane:o=>nums(o,['x','y'])&&o.str!=null});
defineEntity('point',  {sane:o=>nums(o,['x','y'])});
defineEntity('block',  {sane:o=>nums(o,['x','y'])&&typeof o.name==='string'});
defineEntity('hatch',  {sane:o=>o.boundary!=null||Array.isArray(o.poly)});
defineEntity('dim',    {sane:o=>{
  if(o.dim==='angular')return nums(o,['cx','cy','a1','a2']);
  if(o.dim==='radius'||o.dim==='diameter')return nums(o,['cx','cy','r']);
  return nums(o,['x1','y1','x2','y2']);
}});

// ============================================================
//  Closed outline, mass, and what a type breaks into
// ============================================================
// ring(o) -> the closed outline as world points, or nothing for a type that encloses no area.
// This is the single answer to "is this a region?" — REGION, MASSPROP, HATCH and BOUNDARY all
// used to carry their own list of which types count, and they drifted apart.
const CIRCLE_RING_SEGS=48;
defineEntity('circle',{ring:o=>{
  const pts=[];
  for(let k=0;k<CIRCLE_RING_SEGS;k++){const a=k/CIRCLE_RING_SEGS*2*Math.PI;pts.push([o.cx+o.r*Math.cos(a),o.cy+o.r*Math.sin(a)]);}
  return pts;
}});
defineEntity('rect',  {ring:o=>[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]]});
defineEntity('pline', {ring:o=>o.pts.length>=3?o.pts.slice():null});

// mass(o) -> area, centroid, perimeter and second moments about the world origin.
// A circle is answered exactly rather than from its ring: a 48-gon is close enough to draw
// with and not close enough to report a section modulus from.
const polyMass=pts=>{
  const n=pts.length;let A=0,cx=0,cy=0,perim=0,Ix=0,Iy=0;
  for(let i=0;i<n;i++){
    const [x0,y0]=pts[i],[x1,y1]=pts[(i+1)%n];
    const cross=x0*y1-x1*y0;
    A+=cross;cx+=(x0+x1)*cross;cy+=(y0+y1)*cross;
    perim+=Math.hypot(x1-x0,y1-y0);
    Iy+=(x0*x0+x0*x1+x1*x1)*cross;   // about origin
    Ix+=(y0*y0+y0*y1+y1*y1)*cross;
  }
  A/=2;cx/=(6*A);cy/=(6*A);Ix/=12;Iy/=12;
  return{area:A,cx,cy,perim,Ix:Math.abs(Ix),Iy:Math.abs(Iy)};
};
defineEntity('circle',{mass:o=>{
  const A=Math.PI*o.r*o.r;
  return {area:A,cx:o.cx,cy:o.cy,perim:2*Math.PI*o.r,
          Ix:A*o.cy*o.cy+Math.PI*Math.pow(o.r,4)/4,
          Iy:A*o.cx*o.cx+Math.PI*Math.pow(o.r,4)/4};
}});
defineEntity('rect', {mass:o=>polyMass([[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]])});
defineEntity('pline',{mass:o=>polyMass(o.pts.slice())});

// extreme(o,cx,cy) -> how far the shape reaches from a centroid, for the section modulus.
// A circle reaches its radius in every direction; everything else reaches its vertices.
defineEntity('circle',{extreme:(o,cx,cy)=>({top:(o.cy+o.r)-cy,bot:cy-(o.cy-o.r),right:(o.cx+o.r)-cx,left:cx-(o.cx-o.r)})});

// explode(o) -> the objects this one becomes, or nothing for a type that cannot be broken up.
// Layer, colour and linetype ride along: exploding must not move anything onto another layer.
const lineFrom=(o,x1,y1,x2,y2)=>({type:'line',layer:o.layer,color:o.color,linetype:o.linetype,lineweight:o.lineweight,x1,y1,x2,y2});
defineEntity('pline',{explode:o=>{
  const out=[];
  for(let j=0;j<o.pts.length-1;j++)out.push(lineFrom(o,o.pts[j][0],o.pts[j][1],o.pts[j+1][0],o.pts[j+1][1]));
  if(o.closed&&o.pts.length>2){const a=o.pts[0],b=o.pts[o.pts.length-1];out.push(lineFrom(o,b[0],b[1],a[0],a[1]));}
  return out;
}});
defineEntity('rect',  {explode:o=>objAsSegments(o).map(s=>lineFrom(o,s[0],s[1],s[2],s[3]))});
defineEntity('block', {explode:o=>blockInstanceObjects(o)});

// chain(o) -> the open run of points JOIN threads together, or nothing for a type that is
// not a run of points at all.
defineEntity('line', {chain:o=>[[o.x1,o.y1],[o.x2,o.y2]]});
defineEntity('pline',{chain:o=>o.pts.slice()});

// ============================================================
//  Editing: grips, nearest point, stretch
// ============================================================
// entityHas(o,key) -> does this type define this behaviour at all? Used where the question is
// "can you do this to it", not "do it".
function entityHas(o,key){const e=entitySpec(o);return !!(e&&typeof e[key]==='function');}

// gripEdit(o,c,g,p) -> the object as it looks with grip g dragged to p. `c` is a clone made
// for you; edit and return it, or return something else entirely (a line's middle grip turns
// it into an arc). A type that defines nothing here has grips that only move the whole object.
defineEntity('line',{gripEdit:(o,c,g,p)=>{
  if(o.construction){
    // move whichever anchor (base or through) this grip represents, then rebuild the long line
    const isAnchor=o.anchor&&Math.hypot(o.anchor.x-g.x,o.anchor.y-g.y)<1e-6;
    const a=isAnchor?{x:p.x,y:p.y}:(o.anchor||{x:o.x1,y:o.y1});
    const t=isAnchor?(o.thru||{x:o.x2,y:o.y2}):{x:p.x,y:p.y};
    const dx=t.x-a.x,dy=t.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,BIG=1e6;
    // ray if the existing start point coincides with the original anchor (one-sided)
    const ray=o.anchor&&Math.hypot(o.x1-o.anchor.x,o.y1-o.anchor.y)<1e-6;
    c.anchor={x:a.x,y:a.y};c.thru={x:t.x,y:t.y};
    if(ray){c.x1=a.x;c.y1=a.y;c.x2=a.x+ux*BIG;c.y2=a.y+uy*BIG;}
    else{c.x1=a.x-ux*BIG;c.y1=a.y-uy*BIG;c.x2=a.x+ux*BIG;c.y2=a.y+uy*BIG;}
    return c;
  }
  if(g.mid){
    // middle grip on a line -> bend it into an arc passing through both ends and p
    const arc=arc3({x:o.x1,y:o.y1},p,{x:o.x2,y:o.y2});
    if(arc){arc.layer=o.layer;return arc;}
    return c;                                              // collinear -> keep the line
  }
  if(Math.hypot(o.x1-g.x,o.y1-g.y)<1e-6){c.x1=p.x;c.y1=p.y;}else{c.x2=p.x;c.y2=p.y;}
  return c;
}});
defineEntity('rect',{gripEdit:(o,c,g,p)=>{
  // a corner grip moves that corner; an edge-midpoint grip leaves the rectangle alone, since
  // moving one would make it something other than a rectangle
  if(g.mid)return c;
  const corners=[['x1','y1'],['x2','y1'],['x2','y2'],['x1','y2']];
  let best=-1,bd=1e9;
  corners.forEach((cc,i)=>{const d=Math.hypot(o[cc[0]]-g.x,o[cc[1]]-g.y);if(d<bd){bd=d;best=i;}});
  if(best>=0){const cc=corners[best];c[cc[0]]=p.x;c[cc[1]]=p.y;}
  return c;
}});
defineEntity('pline',{gripEdit:(o,c,g,p)=>{
  if(g.mid){
    // a segment-midpoint grip inserts a new vertex there, which is how you reshape a polyline
    const i=plineSegmentAt(o,g);
    if(i>=0)c.pts=o.pts.slice(0,i+1).concat([[p.x,p.y]]).concat(o.pts.slice(i+1));
    return c;
  }
  for(let i=0;i<o.pts.length;i++)
    if(Math.hypot(o.pts[i][0]-g.x,o.pts[i][1]-g.y)<1e-6){c.pts=o.pts.map((pt,j)=>j===i?[p.x,p.y]:pt);return c;}
  return c;
}});
defineEntity('circle',{gripEdit:(o,c,g,p)=>{
  if(g.mid)c.r=Math.max(0.1,Math.hypot(p.x-o.cx,p.y-o.cy));   // a quadrant grip sets the radius
  else{c.cx=p.x;c.cy=p.y;}                                     // the centre grip moves it
  return c;
}});
// which polyline segment a midpoint grip belongs to, or -1
function plineSegmentAt(o,g){
  for(let i=0;i<o.pts.length-1;i++){
    const mx=(o.pts[i][0]+o.pts[i+1][0])/2,my=(o.pts[i][1]+o.pts[i+1][1])/2;
    if(Math.hypot(mx-g.x,my-g.y)<1e-6)return i;
  }
  return -1;
}

// nearest(o,x,y) -> the point on the object closest to (x,y). Box-driven trim and extend need
// it to know where along an edge you pointed.
const nearestOnSegments=(o,x,y)=>{
  let best=null,bd=1e9;
  for(const s of objAsSegments(o)){
    const seg={x1:s[0],y1:s[1],x2:s[2],y2:s[3]};
    const t=Math.max(0,Math.min(1,paramOnLine(seg,{x,y})));
    const px=seg.x1+(seg.x2-seg.x1)*t,py=seg.y1+(seg.y2-seg.y1)*t;
    const d=Math.hypot(px-x,py-y);
    if(d<bd){bd=d;best={x:px,y:py};}
  }
  return best;
};
defineEntity('line',  {nearest:(o,x,y)=>{const t=Math.max(0,Math.min(1,paramOnLine(o,{x,y})));return{x:o.x1+(o.x2-o.x1)*t,y:o.y1+(o.y2-o.y1)*t};}});
defineEntity('circle',{nearest:(o,x,y)=>{const a=Math.atan2(y-o.cy,x-o.cx);return{x:o.cx+o.r*Math.cos(a),y:o.cy+o.r*Math.sin(a)};}});
defineEntity('rect',  {nearest:nearestOnSegments});
defineEntity('pline', {nearest:nearestOnSegments});

// stretch(o,dx,dy,inWin) -> move only the points the crossing window caught. A type that does
// not define it moves whole, which is what STRETCH does to a circle or a piece of text.
defineEntity('line',{stretch:(o,dx,dy,inWin)=>{
  if(inWin(o.x1,o.y1)){o.x1+=dx;o.y1+=dy;}
  if(inWin(o.x2,o.y2)){o.x2+=dx;o.y2+=dy;}
}});
defineEntity('rect',{stretch:(o,dx,dy,inWin)=>{
  // a rectangle can only stay a rectangle, so it stretches by its two defining corners
  if(inWin(o.x1,o.y1)){o.x1+=dx;o.y1+=dy;}
  if(inWin(o.x2,o.y2)){o.x2+=dx;o.y2+=dy;}
}});
defineEntity('pline',{stretch:(o,dx,dy,inWin)=>{
  o.pts=o.pts.map(pt=>inWin(pt[0],pt[1])?[pt[0]+dx,pt[1]+dy]:pt);
}});
// the one stretch rule, applied — used by the live preview and by the commit alike
function stretchObj(o,dx,dy,inWin){
  if(entityHas(o,'stretch'))entityCall(o,'stretch',null,dx,dy,inWin);
  else translateObj(o,dx,dy);
}
