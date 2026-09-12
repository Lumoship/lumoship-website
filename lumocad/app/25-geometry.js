// ============================================================
//  LumoCAD — geometry helpers, transforms, object snap
// ============================================================
//  Geometry helpers
// ============================================================
// The characteristic points of an object — used for bounds, zoom extents and snapping.
// The per-type answers live in the entity registry (app/15-entities.js).
function objPoints(o){return entityCall(o,'points',[]);}
function objCenter(o){const p=objPoints(o);let sx=0,sy=0;for(const q of p){sx+=q[0];sy+=q[1];}return{x:sx/p.length,y:sy/p.length};}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function distToSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(l2===0)return Math.hypot(px-x1,py-y1);let t=((px-x1)*dx+(py-y1)*dy)/l2;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
function translateObj(o,dx,dy){entityCall(o,'translate',undefined,dx,dy);}
function rotateObj(o,cx,cy,ang){
  const rot=(x,y)=>{const c=Math.cos(ang),s=Math.sin(ang),dx=x-cx,dy=y-cy;return[cx+dx*c-dy*s,cy+dx*s+dy*c];};
  entityCall(o,'rotate',undefined,rot,ang);
}
function scaleObj(o,cx,cy,f){
  const sc=(x,y)=>[cx+(x-cx)*f,cy+(y-cy)*f];
  entityCall(o,'scale',undefined,sc,f);
}
// Scale with a separate X and Y factor, which is what a DXF INSERT can ask for. Point-based
// geometry takes it exactly; a circle or an arc has one radius and cannot, so those take the
// average — the same compromise AutoCAD makes when it explodes a non-uniformly scaled block.
// Scale with a separate X and Y factor, which is what a DXF INSERT can ask for. Point-based
// geometry takes it exactly; a circle or an arc has one radius and cannot, so those take the
// average — the same compromise AutoCAD makes when it explodes a non-uniformly scaled block.
function scaleObjXY(o,cx,cy,fx,fy){
  if(fx===fy){scaleObj(o,cx,cy,fx);return;}
  const sc=(x,y)=>[cx+(x-cx)*fx,cy+(y-cy)*fy];
  entityCall(o,'scaleXY',undefined,sc,fx,fy,(Math.abs(fx)+Math.abs(fy))/2);
}
function mirrorObj(o,x1,y1,x2,y2){
  const mir=(x,y)=>{const dx=x2-x1,dy=y2-y1,d=dx*dx+dy*dy||1;const t=((x-x1)*dx+(y-y1)*dy)/d;const px=x1+t*dx,py=y1+t*dy;return[2*px-x,2*py-y];};
  entityCall(o,'mirror',undefined,mir,Math.atan2(y2-y1,x2-x1));
}
function cloneObj(o){return JSON.parse(JSON.stringify(o));}
// A clone destined to become a SEPARATE object: same geometry, no identity. COPY, MIRROR,
// ARRAY and block expansion all go through this so the copy cannot inherit the original's id.
function copyObj(o){const c=cloneObj(o);delete c.id;return c;}

// ============================================================
//  SNAP
// ============================================================
let snapMark=null;
function snapActive(){
  // OSNAP only matters while a command is actively waiting for a POINT to be picked.
  if(!cmd.active)return false;
  if(cmd.step===-1)return false;                       // selecting objects (window pick)
  // these commands pick existing objects, not free points -> no point snapping needed
  if(['TRIM','EXTEND','ERASE','OFFSET','FILLET','REGION','DIMRADIUS','DIMDIAMETER','DIMANGULAR'].includes(cmd.active))return false;
  return true;
}
// ============================================================
//  Associativity
// ============================================================
// A snap knows which object it came from and which feature of it — an endpoint, a midpoint, a
// centre. An annotation created on such a snap stores that reference instead of a frozen
// coordinate, and then it FOLLOWS the geometry it measures. Intersections, perpendicular and
// nearest snaps are deliberately not associative: there is no stable feature to point at.
//
// The stored x/y stay as a cache, so everything that reads a dimension's coordinates keeps
// working unchanged; syncAssociations() brings the cache up to date when geometry moves.
function featurePoint(o,feat){
  if(!o||!feat)return null;
  return entityCall(o,'feature',null,feat);
}
// the reference a picked point carries, if it came from a feature snap
function refOf(p){return (p&&p.ref!=null&&p.feat)?{id:p.ref,feat:p.feat}:undefined;}
// resolve one stored reference, or null if the object or the feature is gone
function resolveRef(r){
  if(!r||r.id==null)return null;
  return featurePoint(byId(r.id),r.feat);
}
// Pull an associative dimension's cached endpoints back onto the geometry they reference.
// Returns true if anything moved.
function syncDimRefs(o){
  let moved=false;
  if(o.refObj!=null){
    // a radius or diameter dimension tracks the circle itself, centre and radius together
    const c=byId(o.refObj);
    if(c&&(c.type==='circle'||c.type==='arc')){
      if(c.cx!==o.cx||c.cy!==o.cy||c.r!==o.r){o.cx=c.cx;o.cy=c.cy;o.r=c.r;moved=true;}
    }
    return moved;
  }
  const a=resolveRef(o.ref1);
  if(a&&(a.x!==o.x1||a.y!==o.y1)){o.x1=a.x;o.y1=a.y;moved=true;}
  const b=resolveRef(o.ref2);
  if(b&&(b.x!==o.x2||b.y!==o.y2)){o.x2=b.x;o.y2=b.y;moved=true;}
  return moved;
}
// Run once per geometry version: cheap on a frame where nothing changed, which is every pan
// and zoom frame. Deliberately does NOT bump the version — a dimension following its geometry
// is not itself a geometry change, and bumping here would never settle.
let _assocVersion=-1;
function syncAssociations(){
  if(_assocVersion===_geomVersion)return;
  _assocVersion=_geomVersion;
  for(const o of doc.objects)if(o.type==='dim'&&isAssociative(o))syncDimRefs(o);
}
// does this dimension follow anything?
function isAssociative(o){return !!(o&&(o.ref1||o.ref2||o.refObj!=null));}

function findSnap(wx,wy){
  if(!settings.snap)return null;
  if(!snapActive())return null;   // no snapping when idle / not picking a point
  const tol=12/view.scale;
  // priority buckets: vertex snaps (highest) > perpendicular > nearest (lowest)
  let best=null,bestD=tol;
  let edgeCenter=null,bestEdgeCenterD=1e18;
  const cand=[];
  for(const o of doc.objects){
    if(!layerOn(o.layer))continue;
    if(o.type==='line'){
      if(o.construction){
        // xline/ray: snap to the user's anchor + through points, not the ±1e6 ends
        if(osnap.end||osnap.node){if(o.anchor)cand.push({x:o.anchor.x,y:o.anchor.y,kind:'node'});if(o.thru)cand.push({x:o.thru.x,y:o.thru.y,kind:'node'});}
      } else {
        if(osnap.end)cand.push({x:o.x1,y:o.y1,kind:'end',ref:o.id,feat:{t:'end',i:0}},{x:o.x2,y:o.y2,kind:'end',ref:o.id,feat:{t:'end',i:1}});
        if(osnap.mid)cand.push({x:(o.x1+o.x2)/2,y:(o.y1+o.y2)/2,kind:'mid',ref:o.id,feat:{t:'mid'}});
      }
    }
    else if(o.type==='rect'){
      if(osnap.end)cand.push({x:o.x1,y:o.y1,kind:'end',ref:o.id,feat:{t:'corner',i:0}},{x:o.x2,y:o.y2,kind:'end',ref:o.id,feat:{t:'corner',i:1}},{x:o.x1,y:o.y2,kind:'end',ref:o.id,feat:{t:'corner',i:2}},{x:o.x2,y:o.y1,kind:'end',ref:o.id,feat:{t:'corner',i:3}});
      if(osnap.mid)cand.push({x:(o.x1+o.x2)/2,y:o.y1,kind:'mid',ref:o.id,feat:{t:'edgemid',i:0}},{x:(o.x1+o.x2)/2,y:o.y2,kind:'mid',ref:o.id,feat:{t:'edgemid',i:1}},{x:o.x1,y:(o.y1+o.y2)/2,kind:'mid',ref:o.id,feat:{t:'edgemid',i:2}},{x:o.x2,y:(o.y1+o.y2)/2,kind:'mid',ref:o.id,feat:{t:'edgemid',i:3}});
    }
    else if(o.type==='circle'){
      if(osnap.center)cand.push({x:o.cx,y:o.cy,kind:'center',ref:o.id,feat:{t:'center'}});
      if(osnap.quad)cand.push({x:o.cx+o.r,y:o.cy,kind:'quad',ref:o.id,feat:{t:'quad',i:0}},{x:o.cx-o.r,y:o.cy,kind:'quad',ref:o.id,feat:{t:'quad',i:1}},{x:o.cx,y:o.cy+o.r,kind:'quad',ref:o.id,feat:{t:'quad',i:2}},{x:o.cx,y:o.cy-o.r,kind:'quad',ref:o.id,feat:{t:'quad',i:3}});
    }
    else if(o.type==='arc'){if(osnap.center)cand.push({x:o.cx,y:o.cy,kind:'center',ref:o.id,feat:{t:'center'}});}
    else if(o.type==='pline'){o.pts.forEach((p,i)=>{
      if(osnap.end)cand.push({x:p[0],y:p[1],kind:'end',ref:o.id,feat:{t:'vertex',i}});
      if(osnap.mid&&i<o.pts.length-1)cand.push({x:(p[0]+o.pts[i+1][0])/2,y:(p[1]+o.pts[i+1][1])/2,kind:'mid',ref:o.id,feat:{t:'segmid',i}});
    });}
    else if(o.type==='point'&&osnap.node)cand.push({x:o.x,y:o.y,kind:'node',ref:o.id,feat:{t:'origin'}});
  }
  // INTERSECTION: where any two objects cross
  if(osnap.intersection){
    for(let i=0;i<doc.objects.length;i++){for(let j=i+1;j<doc.objects.length;j++){
      const oa=doc.objects[i],ob=doc.objects[j];if(!layerOn(oa.layer)||!layerOn(ob.layer))continue;
      for(const ip of pairIntersections(oa,ob))cand.push({x:ip.x,y:ip.y,kind:'int'});
    }}
  }
  // CENTER when hovering near the EDGE of a circle/arc (AutoCAD behaviour):
  // if the cursor is close to the circumference, offer the center as a snap.
  if(osnap.center){
    for(const o of doc.objects){
      if(!layerOn(o.layer))continue;
      if(o.type==='circle'||o.type==='arc'){
        const dEdge=Math.abs(Math.hypot(wx-o.cx,wy-o.cy)-o.r);
        if(dEdge<tol){const dC=Math.hypot(o.cx-wx,o.cy-wy);if(dC<bestEdgeCenterD){bestEdgeCenterD=dC;edgeCenter={x:o.cx,y:o.cy,kind:'center',ref:o.id,feat:{t:'center'}};}}
      }
    }
  }
  // pick best vertex/intersection snap
  for(const c of cand){const d=Math.hypot(c.x-wx,c.y-wy);if(d<bestD){bestD=d;best=c;}}
  if(best)return best;   // vertex/intersection wins outright
  if(edgeCenter)return edgeCenter;  // then center-from-edge

  // PERPENDICULAR: foot of perpendicular from the current reference point onto a line
  const ref=constraintRef();
  if(osnap.perp&&ref){
    let pBest=null,pd=tol;
    for(const o of doc.objects){if(!layerOn(o.layer))continue;
      for(const s of objAsSegments(o)){
        const dx=s[2]-s[0],dy=s[3]-s[1],l2=dx*dx+dy*dy||1;let t=((ref.x-s[0])*dx+(ref.y-s[1])*dy)/l2;t=Math.max(0,Math.min(1,t));
        const fx=s[0]+t*dx,fy=s[1]+t*dy;const d=Math.hypot(fx-wx,fy-wy);
        if(d<pd){pd=d;pBest={x:fx,y:fy,kind:'perp'};}
      }
    }
    if(pBest)return pBest;
  }

  // NEAREST: closest point lying on any object (lowest priority)
  if(osnap.nearest){
    let nBest=null,nd=tol;
    for(const o of doc.objects){if(!layerOn(o.layer))continue;
      const np=nearestPointOnObject(o,wx,wy);
      if(np){const d=Math.hypot(np.x-wx,np.y-wy);if(d<nd){nd=d;nBest={x:np.x,y:np.y,kind:'nearest'};}}
    }
    if(nBest)return nBest;
  }
  return null;
}
// intersection points between two objects (segments + circles)
function pairIntersections(a,b){
  const res=[];
  const aCirc=a.type==='circle', bCirc=b.type==='circle';
  if(aCirc&&bCirc){return intersectCircleCircle(a,b);}
  if(aCirc||bCirc){const circle=aCirc?a:b, other=aCirc?b:a;
    for(const s of objAsSegments(other))intersectLineCircle({x1:s[0],y1:s[1],x2:s[2],y2:s[3]},circle).forEach(ip=>res.push(ip));
    return res;
  }
  for(const sa of objAsSegments(a))for(const sb of objAsSegments(b)){const ip=segInt(sa[0],sa[1],sa[2],sa[3],sb[0],sb[1],sb[2],sb[3]);if(ip)res.push(ip);}
  return res;
}
// reference point that perpendicular/distance should measure from, for the active command
function constraintRef(){
  if((cmd.active==='LINE'||cmd.active==='PLINE')&&cmd.pts.length)return cmd.pts[cmd.pts.length-1];
  if(cmd.data&&cmd.data.base)return cmd.data.base;
  return null;
}

