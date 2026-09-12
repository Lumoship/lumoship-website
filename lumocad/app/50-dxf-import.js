// ============================================================
//  LumoCAD — DXF import, ACI colour table, colour picker
// ============================================================
// ---- DXF import ----
function importDXFText(text){
  const raw=text.split(/\r\n|\r|\n/);
  const toks=[];for(let i=0;i+1<raw.length;i+=2){const code=parseInt(raw[i].trim(),10);if(isNaN(code))continue;toks.push([code,raw[i+1]]);}
  const ents=[];const newLayers={};const pendingInserts=[];const dxfBlocks={};
  // pass 0: BLOCKS section — collect block definitions (entities stored relative to the base point)
  {
    let bs=-1;
    for(let k=0;k<toks.length;k++){if(toks[k][0]===2&&toks[k][1].trim()==='BLOCKS'){bs=k+1;break;}}
    if(bs>=0){
      let k=bs;
      while(k<toks.length){
        if(toks[k][0]===0&&toks[k][1].trim()==='ENDSEC')break;
        if(toks[k][0]===0&&toks[k][1].trim()==='BLOCK'){
          let name='',baseX=0,baseY=0;let j=k+1;
          for(;j<toks.length&&toks[j][0]!==0;j++){const[c,v]=toks[j];if(c===2)name=v.trim();else if(c===10)baseX=parseFloat(v);else if(c===20)baseY=parseFloat(v);}
          const start=j;
          while(j<toks.length){const t=toks[j];if(t[0]===0&&t[1].trim()==='ENDBLK')break;j++;}
          const blkEnts=parseEntitiesRange(toks,start,j);
          if(name)dxfBlocks[name]=blkEnts.map(o=>{const c=cloneObj(o);translateObj(c,-baseX,-baseY);return c;});
          k=j;continue;
        }
        k++;
      }
    }
  }
  // pass 1: layer table — everything AutoCAD stores about a layer, not just its name
  for(let k=0;k<toks.length;k++){
    if(toks[k][0]===0&&toks[k][1].trim()==='LAYER'){
      let name=null,aci=7,trueCol=null,lt='CONTINUOUS',on=true,flags=0,plot=true,lw=null;
      for(let j=k+1;j<toks.length&&toks[j][0]!==0;j++){
        const[c,v]=toks[j];
        if(c===2)name=v.trim();
        else if(c===62){aci=Math.abs(parseInt(v,10))||7;on=parseInt(v,10)>=0;}   // negative = off
        else if(c===420)trueCol=parseInt(v,10);                                  // 24-bit colour, exact
        else if(c===6)lt=v.trim();
        else if(c===70)flags=parseInt(v,10)||0;                                  // bit 1 frozen, bit 4 locked
        else if(c===290)plot=parseInt(v,10)!==0;
        else if(c===370){const n=parseInt(v,10);if(isFinite(n)&&n>=0)lw=n/100;}  // 1/100 mm
      }
      if(name)newLayers[name]={
        color:(trueCol!=null&&isFinite(trueCol))?rgbToHex(trueCol):hexFromAci(aci),
        on, frozen:(flags&1)!==0, locked:(flags&4)!==0, plot,
        linetype:ltFromDXF(lt), lineweight:(lw!=null?lw:0.35)
      };
    }
  }
  // pass 1b: the style tables. A drawing that names a style AutoCAD defined has to find it
  // here, or every label falls back to Standard and the drawing opens looking generic.
  const newTextStyles={},newDimStyles={};
  for(let k=0;k<toks.length;k++){
    if(toks[k][0]===0&&toks[k][1].trim()==='STYLE'){
      let name=null,h=0,wf=1,obl=0,font='';
      for(let j=k+1;j<toks.length&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===2)name=v.trim();
        else if(c===40)h=parseFloat(v)||0;
        else if(c===41)wf=parseFloat(v)||1;
        else if(c===50)obl=parseFloat(v)||0;
        else if(c===3)font=v.trim();}
      if(name)newTextStyles[name]={font:ltFontName(font),h:Math.max(0,h),bold:false,italic:false,widthFactor:wf,oblique:obl};
    }
    else if(toks[k][0]===0&&toks[k][1].trim()==='DIMSTYLE'){
      let name=null,asz=null,exo=null,exe=null,txt=null,dec=null,post='';
      for(let j=k+1;j<toks.length&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===2)name=v.trim();
        else if(c===3)post=v.trim();
        else if(c===41)asz=parseFloat(v);
        else if(c===42)exo=parseFloat(v);
        else if(c===44)exe=parseFloat(v);
        else if(c===140)txt=parseFloat(v);
        else if(c===271)dec=parseInt(v,10);}
      if(name)newDimStyles[name]={
        txtH:(isFinite(txt)&&txt>0)?txt:0,
        arrow:'closed',
        arrowSize:(isFinite(asz)&&asz>0)?Math.max(1,asz/(ANNO_PAPER.arrow*annoScale)*9):9,
        extOffset:(isFinite(exo)?exo/annoScale:ANNO_PAPER.gap),
        extExt:(isFinite(exe)?exe/annoScale:ANNO_PAPER.ext),
        dimLineExt:0,
        precision:(isFinite(dec)?dec:1),
        prefix:post,suffix:'',textPos:'above'};
    }
  }

  // pass 2: entities — find ENTITIES section bounds
  let s=-1;
  for(let k=0;k<toks.length;k++){if(toks[k][0]===2&&toks[k][1].trim()==='ENTITIES'){s=k+1;break;}}
  if(s<0){echo('DXF: no ENTITIES section found');return;}
  // find the matching ENDSEC for the ENTITIES section
  let eEnd=toks.length;for(let k=s;k<toks.length;k++){if(toks[k][0]===0&&toks[k][1].trim()==='ENDSEC'){eEnd=k;break;}}
  const parsed=parseEntitiesRange(toks,s,eEnd,pendingInserts);
  for(const e of parsed)ents.push(e);

  pushUndo();
  // A layer the DXF defines wins over one of the same name already in the drawing: opening a
  // file has to reproduce that file's layers, and layer 0 always exists here already, so
  // skipping matches would silently drop whatever the file said about it.
  for(const name in newTextStyles)doc.textStyles[name]=Object.assign(doc.textStyles[name]||{},newTextStyles[name]);
  for(const name in newDimStyles)doc.dimStyles[name]=Object.assign(doc.dimStyles[name]||{},newDimStyles[name]);
  for(const name in newLayers){
    const existing=doc.layers.find(l=>l.name===name);
    if(existing)Object.assign(existing,newLayers[name]);
    else doc.layers.push(Object.assign({name},newLayers[name]));
  }
  _layerMap=null;
  // register imported block definitions (skip anonymous *-blocks; those are dimension/hatch geometry)
  for(const name in dxfBlocks){if(name.charAt(0)==='*')continue;doc.blocks[name]={base:{x:0,y:0},objects:dxfBlocks[name]};}
  for(const e of ents){if(!doc.layers.some(l=>l.name===e.layer))doc.layers.push({name:e.layer,color:'#f1f5f9',on:true,frozen:false,locked:false,plot:true,linetype:'Continuous',lineweight:0.35});}
  // Push first so every entity has its id, then resolve each hatch's boundary to the id of
  // the entity it was written against, which it holds as a direct reference.
  // A LEADER and its MTEXT are two entities joined by a handle reference. Put them back
  // together, so a leader arrives as one object rather than a leader plus a loose label.
  {
    const byHandle=new Map();
    for(const e of ents)if(e._handle)byHandle.set(e._handle,e);
    const absorbed=new Set();
    for(const e of ents){
      if(e.type!=='leader'||!e._annot)continue;
      const t=byHandle.get(e._annot);
      if(t&&t.type==='text'){e.str=t.str;e.txtH=t.h;absorbed.add(t);}
    }
    for(let i=ents.length-1;i>=0;i--)if(absorbed.has(ents[i]))ents.splice(i,1);
    for(const e of ents){delete e._handle;delete e._annot;}
  }
  ents.forEach(e=>pushObj(e));
  ents.forEach(e=>{if(e.type==='hatch'&&e._boundaryObj){e.boundary=e._boundaryObj.id||null;delete e._boundaryObj;}});
  let hatchCount=ents.filter(e=>e.type==='hatch').length;
  // resolve INSERTs/DIMENSIONs: named blocks -> instance; anonymous/dim blocks -> exploded geometry
  let insCount=0,dimCount=0;
  for(const ins of pendingInserts){
    const anon=ins._dim||ins.name.charAt(0)==='*';
    if(!anon&&doc.blocks[ins.name]){
      pushObj({type:'block',name:ins.name,x:ins.x,y:ins.y,layer:ins.layer,
               sx:ins.sx==null?1:ins.sx, sy:ins.sy==null?1:ins.sy, rot:ins.rot||0});
      insCount++;
    }
    else if(dxfBlocks[ins.name]){
      // anonymous and dimension blocks come in exploded, so the transform is baked in here
      dxfBlocks[ins.name].forEach(o=>{
        const c=copyObj(o);
        const sx=ins.sx==null?1:ins.sx, sy=ins.sy==null?1:ins.sy;
        if(sx!==1||sy!==1)scaleObj(c,0,0,(Math.abs(sx)+Math.abs(sy))/2);
        if(ins.rot)rotateObj(c,0,0,ins.rot);
        translateObj(c,ins.x,ins.y);
        if(!c.layer)c.layer=ins.layer;
        pushObj(c);
      });
      if(ins._dim)dimCount++;else insCount++;
    }
  }
  bumpGeom();updateLayerChip();zoomExtents();renderProps();render();updateInfo();
  echo(`Imported ${ents.length} object(s)${insCount?`, ${insCount} block(s)`:''}${dimCount?`, ${dimCount} dimension(s)`:''}${hatchCount?`, ${hatchCount} hatch(es)`:''} from DXF`);
}

// Parse all entities between token indices [start,end). Returns an array of our objects.
// INSERT entities are pushed into `insertsOut` (resolved to block instances later).
function parseEntitiesRange(toks,start,end,insertsOut){
  const ents=[];
  let k=start;
  while(k<end){
    if(toks[k][0]!==0){k++;continue;}
    const type=toks[k][1].trim();
    if(type==='ENDSEC'||type==='EOF'||type==='ENDBLK')break;
    if(type==='LEADER'){
      // A LEADER carries its vertices as (10,20) pairs and points at its text annotation with
      // a hard reference (340). Without this the entity was skipped entirely and the leader
      // came back as a loose polyline and a loose label.
      let layer='0',aci=null,annot=null,h=null;const pts=[];let pend=null;
      let j=k+1;
      for(;j<end&&toks[j][0]!==0;j++){
        const[c,v]=toks[j];
        if(c===8)layer=v.trim();
        else if(c===5)h=v.trim().toUpperCase();
        else if(c===62)aci=v;
        else if(c===340)annot=v.trim().toUpperCase();
        else if(c===10){if(pend)pts.push(pend);pend=[parseFloat(v),0];}
        else if(c===20&&pend)pend[1]=parseFloat(v);
      }
      if(pend)pts.push(pend);
      if(pts.length>=2){
        const o={type:'leader',layer,pts,_handle:h,_annot:annot};
        applyOverrides(o,aci,null);
        ents.push(o);
      }
      k=j;continue;
    }
    if(type==='HATCH'){
      // Read pattern name (2), solid flag (70), and the boundary polyline vertices.
      // Vertices are the (10,20) pairs that follow the vertex-count code 93, so we gate on that
      // to avoid picking up the elevation/seed (10,20) points elsewhere in the entity.
      let layer='0',pat='',solid=false,aci=null,want=0,inPath=false,patScale=1;const verts=[];let pend=null;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===8)layer=v.trim();
        else if(c===2)pat=v.trim();
        else if(c===70)solid=parseInt(v,10)===1;
        else if(c===62)aci=v;
        else if(c===41)patScale=parseFloat(v)||1;
        else if(c===93){want=parseInt(v,10)||0;inPath=true;}
        else if(c===97){inPath=false;if(pend){verts.push(pend);pend=null;}}
        else if(c===10&&inPath&&verts.length<want){if(pend)verts.push(pend);pend=[parseFloat(v),0];}
        else if(c===20&&inPath&&pend)pend[1]=parseFloat(v);}
      if(pend&&verts.length<want)verts.push(pend);
      if(verts.length>=3){
        const o={type:'pline',layer,closed:true,pts:verts,_hatchHost:true};
        applyOverrides(o,aci,null);
        ents.push(o);
        const lumoPat=mapHatchPattern(pat,solid);
        // hold the host OBJECT, not its position: anything that reorders or removes an
        // entry before resolution would otherwise point the hatch at the wrong thing
        ents.push({type:'hatch',layer,_boundaryObj:ents[ents.length-1],pattern:lumoPat,patScale,solid});
      }
      k=j;continue;
    }
    if(type==='POLYLINE'){
      const pts=[];const bulges=[];
      let layer='0',closed=false,aci=null,lw=null,ez=null;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];if(c===8)layer=v.trim();else if(c===70)closed=(parseInt(v,10)&1)===1;else if(c===62)aci=v;else if(c===370)lw=v;else if(c===230)ez=v;}
      while(j<end){
        if(toks[j][0]===0&&toks[j][1].trim()==='VERTEX'){
          let vx=0,vy=0,bu=0;let m=j+1;for(;m<end&&toks[m][0]!==0;m++){const[c,v]=toks[m];if(c===10)vx=parseFloat(v);else if(c===20)vy=parseFloat(v);else if(c===42)bu=parseFloat(v);}
          pts.push([vx,vy]);bulges.push(bu);j=m;
        } else if(toks[j][0]===0&&toks[j][1].trim()==='SEQEND'){j++;break;}
        else j++;
      }
      if(pts.length>=2){const o={type:'pline',layer,closed,pts};const segs=segsFromBulges(pts,closed,bulges);if(segs)o.segs=segs;applyOverrides(o,aci,lw);applyExtrusion(o,ez);ents.push(o);}
      k=j;continue;
    }
    if(type==='LWPOLYLINE'){
      let layer='0',closed=false,aci=null,lw=null,ez=null;const pts=[];const bulges=[];let pend=null,pbu=0;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===8)layer=v.trim();else if(c===70)closed=(parseInt(v,10)&1)===1;
        else if(c===62)aci=v;else if(c===370)lw=v;else if(c===230)ez=v;
        else if(c===10){if(pend){pts.push(pend);bulges.push(pbu);pbu=0;}pend=[parseFloat(v),0];}
        else if(c===20&&pend)pend[1]=parseFloat(v);
        else if(c===42)pbu=parseFloat(v);}
      if(pend){pts.push(pend);bulges.push(pbu);}
      if(pts.length>=2){const o={type:'pline',layer,closed,pts};const segs=segsFromBulges(pts,closed,bulges);if(segs)o.segs=segs;applyOverrides(o,aci,lw);applyExtrusion(o,ez);ents.push(o);}
      k=j;continue;
    }
    if(type==='SPLINE'){
      let layer='0',aci=null,lw=null;const ctrl=[];const fit=[];let pc=null,pf=null;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===8)layer=v.trim();else if(c===62)aci=v;else if(c===370)lw=v;
        else if(c===10){if(pc)ctrl.push(pc);pc=[parseFloat(v),0];}
        else if(c===20&&pc)pc[1]=parseFloat(v);
        else if(c===11){if(pf)fit.push(pf);pf=[parseFloat(v),0];}
        else if(c===21&&pf)pf[1]=parseFloat(v);}
      if(pc)ctrl.push(pc); if(pf)fit.push(pf);
      const pts=fit.length>=2?fit:ctrl;   // fit points define a through-curve (matches our spline)
      if(pts.length>=2){const o={type:'spline',layer,pts};applyOverrides(o,aci,lw);ents.push(o);}
      k=j;continue;
    }
    if(type==='LEADER'){
      // classic LEADER: vertices as repeated 10/20; text comes from a separate MTEXT nearby,
      // so we just build the line+arrow. (code 40 = text height hint)
      let layer='0',aci=null,th=null;const pts=[];let pend=null;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===8)layer=v.trim();else if(c===62)aci=v;else if(c===40)th=parseFloat(v);
        else if(c===10){if(pend)pts.push(pend);pend=[parseFloat(v),0];}
        else if(c===20&&pend)pend[1]=parseFloat(v);}
      if(pend)pts.push(pend);
      if(pts.length>=2){const o={type:'leader',layer,pts,txtH:th||annoText()};applyOverrides(o,aci,null);ents.push(o);}
      k=j;continue;
    }
    if(type==='MULTILEADER'||type==='MLEADER'){
      // modern MLEADER: leader vertices live in context data as 10/20 pairs; text is code 304.
      // We do a best-effort scrape of all 10/20 points and the text string.
      let layer='0',aci=null,str='',th=null;const pts=[];let pend=null;
      let j=k+1;for(;j<end&&toks[j][0]!==0;j++){const[c,v]=toks[j];
        if(c===8)layer=v.trim();else if(c===62)aci=v;
        else if(c===304||c===1)str=mtextClean(v);
        else if(c===40||c===41||c===42)th=th||parseFloat(v);
        else if(c===10){if(pend)pts.push(pend);pend=[parseFloat(v),0];}
        else if(c===20&&pend)pend[1]=parseFloat(v);}
      if(pend)pts.push(pend);
      if(pts.length>=2){const o={type:'leader',layer,pts,str:str||'',txtH:th||annoText(),mleader:true,landing:8};applyOverrides(o,aci,null);ents.push(o);}
      k=j;continue;
    }
    if(type==='3DFACE'||type==='SOLID'){
      const e={};let j=k+1;for(;j<end&&toks[j][0]!==0;j++){if(e[toks[j][0]]===undefined)e[toks[j][0]]=toks[j][1];}
      const L=(e[8]||'0').trim();
      let cs=[[+e[10],+e[20]],[+e[11],+e[21]],[+e[12],+e[22]]];
      if(e[13]!==undefined)cs.push([+e[13],+e[23]]);
      if(type==='SOLID'&&cs.length===4){const t=cs[2];cs[2]=cs[3];cs[3]=t;}
      cs=cs.filter(p=>!isNaN(p[0])&&!isNaN(p[1]));
      if(cs.length>=3)ents.push(applyOverrides({type:'pline',layer:L,closed:true,pts:cs},e[62],e[370],e[6],e[420]));
      k=j;continue;
    }
    const e={};let p=k+1;for(;p<end&&toks[p][0]!==0;p++){if(e[toks[p][0]]===undefined)e[toks[p][0]]=toks[p][1];}
    const L=(e[8]||'0').trim();
    if(type==='LINE')ents.push(applyExtrusion(applyOverrides({type:'line',layer:L,x1:+e[10],y1:+e[20],x2:+e[11],y2:+e[21]},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='CIRCLE')ents.push(applyExtrusion(applyOverrides({type:'circle',layer:L,cx:+e[10],cy:+e[20],r:+e[40]},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='ARC')ents.push(applyExtrusion(applyOverrides({type:'arc',layer:L,cx:+e[10],cy:+e[20],r:+e[40],a1:(+e[50])*Math.PI/180,a2:(+e[51])*Math.PI/180},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='ELLIPSE'){
      const cx=+e[10],cy=+e[20],mx=+e[11]||0,my=+e[21]||0,ratio=+e[40]||1;
      const rx=Math.hypot(mx,my), ry=rx*ratio, rot=Math.atan2(my,mx);
      if(rx>0)ents.push(applyExtrusion(applyOverrides({type:'ellipse',layer:L,cx,cy,rx,ry,rot},e[62],e[370],e[6],e[420]),e[230]));
    }
    else if(type==='TEXT')ents.push(applyExtrusion(applyOverrides({type:'text',layer:L,x:+e[10],y:+e[20],h:+(e[40]||10),str:(e[1]||''),rot:e[50]?(+e[50]):0,style:(e[7]||'').trim()||undefined,_handle:(e[5]||'').trim().toUpperCase()},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='MTEXT')ents.push(applyExtrusion(applyOverrides({type:'text',layer:L,x:+e[10],y:+e[20],h:+(e[40]||10),str:mtextClean(e[1]||''),rot:e[50]?(+e[50]):0,mtext:true,width:e[41]?+e[41]:undefined,style:(e[7]||'').trim()||undefined,_handle:(e[5]||'').trim().toUpperCase()},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='POINT')ents.push(applyExtrusion(applyOverrides({type:'point',layer:L,x:+e[10],y:+e[20]},e[62],e[370],e[6],e[420]),e[230]));
    else if(type==='INSERT'&&insertsOut){
      // 41/42 are the X and Y scale, 50 the rotation in degrees. Dropping them put every
      // rotated or scaled block in the wrong place and the wrong size, silently.
      const sx=(e[41]!=null&&+e[41])||1, sy=(e[42]!=null&&+e[42])||1;
      insertsOut.push({name:(e[2]||'').trim(),x:+e[10]||0,y:+e[20]||0,layer:L,
                       sx,sy,rot:((+e[50]||0)*Math.PI/180)});
    }
    else if(type==='DIMENSION'){
      const dimObj=parseDimension(e,L);
      if(dimObj)ents.push(dimObj);
      else if(insertsOut){const bname=(e[2]||'').trim();if(bname)insertsOut.push({name:bname,x:+e[10]||0,y:+e[20]||0,layer:L,
        sx:(e[41]!=null&&+e[41])||1, sy:(e[42]!=null&&+e[42])||1, rot:((+e[50]||0)*Math.PI/180), _dim:true});}
    }
    k=p;
  }
  return ents;
}
// Build a LIVE dimension object from a DXF DIMENSION's definition points, so it stays
// associative-looking (value recomputed from geometry) instead of dead exploded lines.
// Returns null for kinds we can't reconstruct (caller falls back to exploding the anon block).
function parseDimension(e,L){
  const dt=(parseInt(e[70],10)||0)&7;   // low 3 bits = dimension type
  const num=v=>{const n=parseFloat(v);return isNaN(n)?0:n;};
  // Text height: prefer the DIMENSION's own override (code 140), else fall back to our annotation
  // scale. AutoCAD dim text is small (e.g. 3 mm), so forcing annoText() made imported text huge.
  const fileTxtH=parseFloat(e[140]);
  const txtH=(isFinite(fileTxtH)&&fileTxtH>0)?fileTxtH:annoText();
  if(dt===0||dt===1){ // 0 = linear (rotated), 1 = aligned
    // measured points: (13,23) and (14,24); dimension-line location: (10,20)
    const p1={x:num(e[13]),y:num(e[23])}, p2={x:num(e[14]),y:num(e[24])};
    if((!e[13]&&!e[14]))return null;
    const dl={x:num(e[10]),y:num(e[20])};
    // signed perpendicular offset of the dimension line from the measured segment
    let dx=p2.x-p1.x, dy=p2.y-p1.y; const len=Math.hypot(dx,dy)||1; const nx=-dy/len, ny=dx/len;
    const off=((dl.x-p1.x)*nx+(dl.y-p1.y)*ny);
    return {type:'dim',dim:dt===1?'aligned':'linear',layer:L,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,off,txtH};
  }
  if(dt===4||dt===3){ // 4 = radius, 3 = diameter
    // center (10,20); chord/definition point on the circle (15,25)
    const c={x:num(e[10]),y:num(e[20])}, q={x:num(e[15]),y:num(e[25])};
    const r=Math.hypot(q.x-c.x,q.y-c.y); if(r<=0)return null;
    const ang=Math.atan2(q.y-c.y,q.x-c.x);
    return {type:'dim',dim:dt===3?'diameter':'radius',layer:L,cx:c.x,cy:c.y,r,ang,txtH};
  }
  if(dt===2||dt===5){ // angular
    const vx=num(e[16]),vy=num(e[26]);
    const p1={x:num(e[13]),y:num(e[23])}, p2={x:num(e[14]),y:num(e[24])};
    if(!e[13]||!e[14])return null;
    const a1=Math.atan2(p1.y-vy,p1.x-vx), a2=Math.atan2(p2.y-vy,p2.x-vx);
    return {type:'dim',dim:'angular',layer:L,cx:vx,cy:vy,a1,a2,txtH};
  }
  return null;
}
// Strip MTEXT formatting codes to readable text (\P -> newline, drop \f..; {} groups, \A etc.)
function mtextClean(s){
  return String(s)
    .replace(/\\P/g,'\n')
    .replace(/\\[A-Za-z][^;\\]*;/g,'')   // formatting like \fArial; \A1; \H2x;
    .replace(/[{}]/g,'')
    .replace(/\\[{}\\]/g,m=>m[1]);       // escaped braces/backslash
}
// Full AutoCAD ACI (AutoCAD Color Index) -> hex. 1-9 are the fixed standard colors;
// Exact AutoCAD ACI (AutoCAD Color Index) palette. These are the official RGB values AutoCAD
// uses, so an imported DXF shows the same colors as in AutoCAD (no hue drift). 1-9 fixed,
// 10-249 chromatic (24 hues × 10 tints/shades), 250-255 grey ramp. Packed as RGB triplets.
const _ACI_RGB=[
// 0 (ByBlock placeholder) + 1-9 fixed
[0,0,0],[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255],[255,255,255],[128,128,128],[192,192,192],
// 10-19 (hue 0 / red)
[255,0,0],[255,127,127],[165,0,0],[165,82,82],[127,0,0],[127,63,63],[76,0,0],[76,38,38],[38,0,0],[38,19,19],
// 20-29 (hue 15)
[255,63,0],[255,159,127],[165,41,0],[165,103,82],[127,31,0],[127,79,63],[76,19,0],[76,47,38],[38,9,0],[38,23,19],
// 30-39 (hue 30 / orange)
[255,127,0],[255,191,127],[165,82,0],[165,124,82],[127,63,0],[127,95,63],[76,38,0],[76,57,38],[38,19,0],[38,28,19],
// 40-49 (hue 45)
[255,191,0],[255,223,127],[165,124,0],[165,145,82],[127,95,0],[127,111,63],[76,57,0],[76,66,38],[38,28,0],[38,33,19],
// 50-59 (hue 60 / yellow)
[255,255,0],[255,255,127],[165,165,0],[165,165,82],[127,127,0],[127,127,63],[76,76,0],[76,76,38],[38,38,0],[38,38,19],
// 60-69 (hue 75)
[191,255,0],[223,255,127],[124,165,0],[145,165,82],[95,127,0],[111,127,63],[57,76,0],[66,76,38],[28,38,0],[33,38,19],
// 70-79 (hue 90)
[127,255,0],[191,255,127],[82,165,0],[124,165,82],[63,127,0],[95,127,63],[38,76,0],[57,76,38],[19,38,0],[28,38,19],
// 80-89 (hue 105)
[63,255,0],[159,255,127],[41,165,0],[103,165,82],[31,127,0],[79,127,63],[19,76,0],[47,76,38],[9,38,0],[23,38,19],
// 90-99 (hue 120 / green)
[0,255,0],[127,255,127],[0,165,0],[82,165,82],[0,127,0],[63,127,63],[0,76,0],[38,76,38],[0,38,0],[19,38,19],
// 100-109 (hue 135)
[0,255,63],[127,255,159],[0,165,41],[82,165,103],[0,127,31],[63,127,79],[0,76,19],[38,76,47],[0,38,9],[19,38,23],
// 110-119 (hue 150)
[0,255,127],[127,255,191],[0,165,82],[82,165,124],[0,127,63],[63,127,95],[0,76,38],[38,76,57],[0,38,19],[19,38,28],
// 120-129 (hue 165)
[0,255,191],[127,255,223],[0,165,124],[82,165,145],[0,127,95],[63,127,111],[0,76,57],[38,76,66],[0,38,28],[19,38,33],
// 130-139 (hue 180 / cyan)
[0,255,255],[127,255,255],[0,165,165],[82,165,165],[0,127,127],[63,127,127],[0,76,76],[38,76,76],[0,38,38],[19,38,38],
// 140-149 (hue 195)
[0,191,255],[127,223,255],[0,124,165],[82,145,165],[0,95,127],[63,111,127],[0,57,76],[38,66,76],[0,28,38],[19,33,38],
// 150-159 (hue 210)
[0,127,255],[127,191,255],[0,82,165],[82,124,165],[0,63,127],[63,95,127],[0,38,76],[38,57,76],[0,19,38],[19,28,38],
// 160-169 (hue 225)
[0,63,255],[127,159,255],[0,41,165],[82,103,165],[0,31,127],[63,79,127],[0,19,76],[38,47,76],[0,9,38],[19,23,38],
// 170-179 (hue 240 / blue)
[0,0,255],[127,127,255],[0,0,165],[82,82,165],[0,0,127],[63,63,127],[0,0,76],[38,38,76],[0,0,38],[19,19,38],
// 180-189 (hue 255)
[63,0,255],[159,127,255],[41,0,165],[103,82,165],[31,0,127],[79,63,127],[19,0,76],[47,38,76],[9,0,38],[23,19,38],
// 190-199 (hue 270)
[127,0,255],[191,127,255],[82,0,165],[124,82,165],[63,0,127],[95,63,127],[38,0,76],[57,38,76],[19,0,38],[28,19,38],
// 200-209 (hue 285)
[191,0,255],[223,127,255],[124,0,165],[145,82,165],[95,0,127],[111,63,127],[57,0,76],[66,38,76],[28,0,38],[33,19,38],
// 210-219 (hue 300 / magenta)
[255,0,255],[255,127,255],[165,0,165],[165,82,165],[127,0,127],[127,63,127],[76,0,76],[76,38,76],[38,0,38],[38,19,38],
// 220-229 (hue 315)
[255,0,191],[255,127,223],[165,0,124],[165,82,145],[127,0,95],[127,63,111],[76,0,57],[76,38,66],[38,0,28],[38,19,33],
// 230-239 (hue 330)
[255,0,127],[255,127,191],[165,0,82],[165,82,124],[127,0,63],[127,63,95],[76,0,38],[76,38,57],[38,0,19],[38,19,28],
// 240-249 (hue 345)
[255,0,63],[255,127,159],[165,0,41],[165,82,103],[127,0,31],[127,63,79],[76,0,19],[76,38,47],[38,0,9],[38,19,23],
// 250-255 grey ramp
[51,51,51],[91,91,91],[132,132,132],[173,173,173],[214,214,214],[255,255,255]
];
let _ACI_CACHE=null;
function _buildAciTable(){
  const t={};const hex=([r,g,b])=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  for(let i=1;i<_ACI_RGB.length;i++)t[i]=hex(_ACI_RGB[i]);
  return t;
}
// DXF code 420 carries a 24-bit colour, which is how a colour survives a round trip exactly
// instead of being squeezed through the 255-entry ACI palette and back.
// DXF stores a font file; map the common ones back to a family the canvas can render
function ltFontName(f){
  const n=(f||'').replace(/\.(shx|ttf)$/i,'').trim();
  if(!n||/^txt$/i.test(n)||/^simplex$/i.test(n)||/^romans$/i.test(n))return 'monospace';
  const known=TEXT_FONTS.find(t=>t.split(',')[0].toLowerCase()===n.toLowerCase());
  return known||n;
}
function rgbToHex(n){const v=n&0xffffff;return '#'+v.toString(16).padStart(6,'0');}
function hexFromAci(ci){if(!_ACI_CACHE)_ACI_CACHE=_buildAciTable();return _ACI_CACHE[ci]||'#ffffff';}

// AutoCAD-style "Select Color" dialog: Index Color (ACI palette) + True Color (HSL field + RGB).
// openColorPicker(currentHex, onPick) — calls onPick(hex) when the user confirms.
function openColorPicker(current,onPick){
  if(!_ACI_CACHE)_ACI_CACHE=_buildAciTable();
  let sel=(current||'#ffffff').toLowerCase();
  const ov=document.createElement('div');ov.id='inputDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.55);backdrop-filter:blur(2px);z-index:11000;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:430px;max-width:94vw;padding:18px 20px">
    <div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600;margin-bottom:12px">Select Color</div>
    <div style="display:flex;gap:4px;margin-bottom:12px">
      <button class="cpTab" data-tab="index" style="flex:1;background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:11px;padding:7px;border-radius:6px;cursor:pointer">Index Color</button>
      <button class="cpTab" data-tab="true" style="flex:1;background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:11px;padding:7px;border-radius:6px;cursor:pointer">True Color</button>
    </div>
    <div id="cpIndex"></div>
    <div id="cpTrue" style="display:none"></div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
      <span style="font-size:12px;color:var(--text-muted)">Selected</span>
      <span id="cpSwatch" style="width:30px;height:20px;border:1px solid var(--border);border-radius:4px;display:inline-block;background:${sel}"></span>
      <span id="cpHex" style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary)">${(()=>{const c=hexToRgb(sel)||{r:0,g:0,b:0};return c.r+','+c.g+','+c.b;})()}</span>
      <span id="cpAci" style="font-family:var(--font-mono);font-size:12px;color:var(--accent);white-space:nowrap"></span>
      <span style="flex:1"></span>
      <button id="cpCancel" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);font-family:var(--font-display);font-size:12px;padding:7px 14px;border-radius:7px;cursor:pointer">Cancel</button>
      <button id="cpOk" style="background:var(--accent);border:1px solid var(--accent);color:#fff;font-family:var(--font-display);font-size:12px;padding:7px 16px;border-radius:7px;cursor:pointer;font-weight:600">OK</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const swatchEl=ov.querySelector('#cpSwatch'), hexEl=ov.querySelector('#cpHex'), aciEl=ov.querySelector('#cpAci');
  // setSel(hex, aci?) — if aci is given (clicked an index swatch) show it exactly; otherwise
  // show the nearest index for a True Color value, like AutoCAD's "Index color: N" readout.
  const setSel=(hex,aci)=>{
    sel=hex.toLowerCase();swatchEl.style.background=sel;
    const c=hexToRgb(sel)||{r:0,g:0,b:0};
    hexEl.textContent=c.r+','+c.g+','+c.b;
    const n=(aci!=null)?aci:aciFromHex(sel);
    const exact=(hexFromAci(n)===sel);
    aciEl.textContent=(exact?'· Index '+n:'· ≈ Index '+n);
  };

  // ----- Index Color tab: AutoCAD-style layout -----
  // Top strip: the 9 standard colors (1-9) + the 6 greys (250-255).
  // Main block: 240 chromatic colors arranged as 24 hue COLUMNS x 10 value ROWS, so each
  // column is one hue family shading dark->light (matching AutoCAD's orderly palette, not a jumble).
  const idxWrap=ov.querySelector('#cpIndex');
  const cell=(ci)=>`<div class="cpCell" data-aci="${ci}" title="ACI ${ci}" style="width:100%;aspect-ratio:1;background:${hexFromAci(ci)};border:1px solid rgba(0,0,0,0.35);cursor:pointer"></div>`;
  let top='';for(let ci=1;ci<=9;ci++)top+=cell(ci);for(let ci=250;ci<=255;ci++)top+=cell(ci);
  let main='';
  for(let r=0;r<10;r++){            // value row (0 = brightest)
    for(let h=0;h<24;h++){          // hue column
      main+=cell(10+h*10+r);
    }
  }
  idxWrap.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-bottom:6px">${top}</div>
    <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:4px;overflow:hidden">${main}</div>
    <div id="cpIdxHint" style="font-size:11px;color:var(--text-muted);margin-top:8px">AutoCAD Color Index — click a swatch</div>`;
  const idxHint=idxWrap.querySelector('#cpIdxHint');
  idxWrap.querySelectorAll('.cpCell').forEach(c=>{
    const ci=+c.dataset.aci;
    c.onclick=()=>{setSel(hexFromAci(ci),ci);};
    // live "Index color: N" readout on hover, like AutoCAD
    c.onmouseenter=()=>{const c2=hexToRgb(hexFromAci(ci))||{r:0,g:0,b:0};idxHint.textContent='Index color: '+ci+'   ('+c2.r+','+c2.g+','+c2.b+')';};
    c.onmouseleave=()=>{idxHint.textContent='AutoCAD Color Index — click a swatch';};
  });

  // ----- True Color tab: HSL hue/sat field + lightness slider + RGB readout -----
  const trueWrap=ov.querySelector('#cpTrue');
  trueWrap.innerHTML=`
    <div style="display:flex;gap:10px">
      <canvas id="cpField" width="240" height="180" style="position:static;border:1px solid var(--border);border-radius:4px;cursor:crosshair"></canvas>
      <canvas id="cpLum" width="22" height="180" style="position:static;border:1px solid var(--border);border-radius:4px;cursor:pointer"></canvas>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
      <label style="font-size:11px;color:var(--text-muted)">R</label><input id="cpR" type="number" min="0" max="255" style="width:54px">
      <label style="font-size:11px;color:var(--text-muted)">G</label><input id="cpG" type="number" min="0" max="255" style="width:54px">
      <label style="font-size:11px;color:var(--text-muted)">B</label><input id="cpB" type="number" min="0" max="255" style="width:54px">
      <span style="flex:1"></span>
      <input id="cpHexIn" type="text" maxlength="7" style="width:80px;font-family:var(--font-mono)">
    </div>`;
  const field=trueWrap.querySelector('#cpField'), lum=trueWrap.querySelector('#cpLum');
  const fx=field.getContext('2d'), lx=lum.getContext('2d');
  const rIn=trueWrap.querySelector('#cpR'),gIn=trueWrap.querySelector('#cpG'),bIn=trueWrap.querySelector('#cpB'),hexIn=trueWrap.querySelector('#cpHexIn');
  let hsl={h:0,s:100,l:50};
  function drawField(){
    // x = hue (0..360), y = saturation (100..0); fixed mid lightness for the field
    for(let x=0;x<240;x++){
      for(let y=0;y<180;y+=2){
        const hh=(x/240)*360, ss=100-(y/180)*100;
        fx.fillStyle=`hsl(${hh},${ss}%,50%)`;fx.fillRect(x,y,1,2);
      }
    }
    // marker
    const mx=(hsl.h/360)*240, my=(1-hsl.s/100)*180;
    fx.strokeStyle='#000';fx.lineWidth=1;fx.strokeRect(mx-3,my-3,6,6);
    fx.strokeStyle='#fff';fx.strokeRect(mx-2,my-2,4,4);
  }
  function drawLum(){
    for(let y=0;y<180;y++){const ll=100-(y/180)*100;lx.fillStyle=`hsl(${hsl.h},${hsl.s}%,${ll}%)`;lx.fillRect(0,y,22,1);}
    const my=(1-hsl.l/100)*180;lx.strokeStyle='#000';lx.strokeRect(0,my-2,22,4);lx.strokeStyle='#fff';lx.strokeRect(1,my-1,20,2);
  }
  function hslToHex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);
    const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
    const to=v=>Math.round(v*255).toString(16).padStart(2,'0');return '#'+to(f(0))+to(f(8))+to(f(4));}
  function syncFromHsl(){const hx=hslToHex(hsl.h,hsl.s,hsl.l);const c=hexToRgb(hx);
    rIn.value=c.r;gIn.value=c.g;bIn.value=c.b;hexIn.value=hx;setSel(hx);drawField();drawLum();}
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;
    if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
      switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
    return{h:h*360,s:s*100,l:l*100};}
  // init HSL from current
  {const c=hexToRgb(sel)||{r:255,g:255,b:255};hsl=rgbToHsl(c.r,c.g,c.b);}
  field.onmousedown=e=>{const move=ev=>{const r=field.getBoundingClientRect();
      const x=Math.max(0,Math.min(240,ev.clientX-r.left)),y=Math.max(0,Math.min(180,ev.clientY-r.top));
      hsl.h=(x/240)*360;hsl.s=100-(y/180)*100;syncFromHsl();};
    move(e);const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);};
  lum.onmousedown=e=>{const move=ev=>{const r=lum.getBoundingClientRect();
      const y=Math.max(0,Math.min(180,ev.clientY-r.top));hsl.l=100-(y/180)*100;syncFromHsl();};
    move(e);const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);};
  const rgbChanged=()=>{const r=+rIn.value||0,g=+gIn.value||0,bb=+bIn.value||0;
    const hx='#'+[r,g,bb].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
    hsl=rgbToHsl(r,g,bb);hexIn.value=hx;setSel(hx);drawField();drawLum();};
  [rIn,gIn,bIn].forEach(el=>el.onchange=rgbChanged);
  hexIn.onchange=()=>{let v=hexIn.value.trim();if(!v.startsWith('#'))v='#'+v;const c=hexToRgb(v);if(c){hsl=rgbToHsl(c.r,c.g,c.b);rIn.value=c.r;gIn.value=c.g;bIn.value=c.b;setSel(v);drawField();drawLum();}};
  // initialise the True Color fields from the current color without round-tripping through HSL
  // (which would drift the hex); then show the exact original selection + its index number.
  {const c=hexToRgb(sel)||{r:255,g:255,b:255};rIn.value=c.r;gIn.value=c.g;bIn.value=c.b;hexIn.value=sel;}
  drawField();drawLum();setSel(sel);

  // ----- tab switching -----
  ov.querySelectorAll('.cpTab').forEach(btn=>{
    btn.onclick=()=>{
      const tab=btn.dataset.tab;
      ov.querySelectorAll('.cpTab').forEach(b=>{const on=b.dataset.tab===tab;b.style.background=on?'var(--accent)':'transparent';b.style.borderColor=on?'var(--accent)':'var(--border)';b.style.color=on?'#fff':'var(--text-muted)';});
      idxWrap.style.display=tab==='index'?'block':'none';
      trueWrap.style.display=tab==='true'?'block':'none';
    };
  });

  const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  ov.querySelector('#cpCancel').onclick=close;
  ov.querySelector('#cpOk').onclick=()=>{close();if(onPick)onPick(sel);};
}
// Map a DXF hatch pattern name to the nearest LumoCAD pattern.
function mapHatchPattern(name,solid){
  if(solid||/solid/i.test(name||''))return 'Concrete';   // closest "filled-ish" look we have
  const n=(name||'').toUpperCase();
  if(n.includes('ANSI32')||n.includes('STEEL'))return 'Steel';
  if(n.includes('ANSI31')||n.includes('ANSI'))return 'ANSI31 (diagonal)';
  if(n.includes('CONC')||n.includes('AR-CONC')||n.includes('GRAVEL'))return 'Concrete';
  if(n.includes('NET')||n.includes('CROSS')||n.includes('GRID'))return 'Cross';
  if(n.includes('LINE')||n.includes('DOLMIT'))return 'Lines (horizontal)';
  return 'ANSI31 (diagonal)';
}
// Apply DXF per-entity overrides: color (code 62 ACI, OR code 420 true-color 24-bit RGB),
// lineweight (code 370, 1/100 mm), linetype (code 6).
// 256 = ByLayer (no override), 0 = ByBlock. -1/-2/-3 lw = ByLayer/ByBlock/Default.
// True color (420) wins over ACI so an exact RGB like 255,200,0 imports as-is, not rounded to a palette index.
function applyOverrides(o,aci,lw,lt,trueColor){
  if(trueColor!=null){
    const n=parseInt(trueColor,10);
    if(!isNaN(n)){const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
      o.color='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');}
  } else if(aci!=null){const n=parseInt(aci,10);if(!isNaN(n)&&n>0&&n!==256)o.color=hexFromAci(n);}
  if(lw!=null){const n=parseInt(lw,10);if(!isNaN(n)&&n>=0)o.lineweight=n/100;}
  if(lt!=null){const name=ltFromDXF(lt);if(name&&!/^bylayer$/i.test(lt)&&!/^byblock$/i.test(lt))o.linetype=name;}
  return o;
}
// OCS -> WCS for the common 2D case: when an entity's extrusion Z (code 230) is negative,
// its coordinates were given in a flipped object plane, so mirror X about the world Y axis.
// (The general "arbitrary axis" case is rare in 2D drawings; (0,0,±1) covers virtually all of them.)
function applyExtrusion(o,ez){
  if(ez==null)return o;
  const z=parseFloat(ez);
  if(!isNaN(z)&&z<0)mirrorObj(o,0,0,0,1);   // reflect across the Y axis (x -> -x)
  return o;
}
// Convert a DXF bulge list into our per-segment arc descriptors. bulge=tan(sweep/4).
function segsFromBulges(pts,closed,bulges){
  if(!bulges||!bulges.some(b=>b&&Math.abs(b)>1e-9))return null;
  const n=pts.length;const segCount=closed?n:n-1;const segs=[];
  for(let i=0;i<segCount;i++){
    const bu=bulges[i];if(!bu||Math.abs(bu)<1e-9)continue;
    const a=pts[i],b=pts[(i+1)%n];
    const chord=Math.hypot(b[0]-a[0],b[1]-a[1]);if(chord<1e-9)continue;
    const sweep=4*Math.atan(bu);                 // signed included angle
    const r=chord/(2*Math.sin(Math.abs(sweep)/2));
    // midpoint of chord, then offset along the perpendicular by the sagitta to find center
    const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
    const dx=(b[0]-a[0])/chord,dy=(b[1]-a[1])/chord;     // chord unit dir
    const h=r*Math.cos(Math.abs(sweep)/2);               // center distance from chord midpoint
    // perpendicular; sign from bulge (CCW positive)
    const sgn=bu>0?1:-1;
    const cx=mx-dy*h*sgn, cy=my+dx*h*sgn;
    const a1=Math.atan2(a[1]-cy,a[0]-cx), a2=Math.atan2(b[1]-cy,b[0]-cx);
    segs[i]={arc:true,cx,cy,r,a1,a2,sweep,bulge:bu};   // sweep>0 = CCW in world (bulge>0)
  }
  return segs.length?segs:null;
}
function openDXFFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.dxf,text/plain';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>importDXFText(rd.result);rd.readAsText(f);};
  inp.click();
}
