// ============================================================
//  LumoCAD — DXF R2000 ASCII export
// ============================================================
// ============================================================
//  DXF  IMPORT / EXPORT  (AutoCAD R12 ASCII — opens directly in AutoCAD)
// ============================================================
function dxfPair(code,val){return code+'\n'+val+'\n';}
// R2000 (AC1015) needs a unique hex handle (code 5) on every entity/table entry/block.
let _dxfHandle=0x100;
function nextHandle(){return (_dxfHandle++).toString(16).toUpperCase();}
// owner-pointer + entity handle preamble for a normal model-space entity
function entHandle(){return dxfPair(5,nextHandle());}
function exportDXF(){
  _dxfHandle=0x100;
  // Every name an entity uses has to exist in a table, and R2000 wants a fixed set of tables
  // whether or not the drawing uses them. A reader that meets a missing one does not fail —
  // it substitutes, which is worse, because the drawing opens looking subtly wrong.
  const bounds=drawingBounds();
  const curLayer=(doc.layers[doc.activeLayer]||doc.layers[0]||{name:'0'}).name;
  // linetypes actually referenced, plus the three every DXF carries
  const usedLt=new Set(['Continuous']);
  for(const l of doc.layers)if(l.linetype)usedLt.add(l.linetype);
  for(const o of doc.objects)if(o.linetype&&o.linetype!=='ByLayer')usedLt.add(o.linetype);
  for(const n in doc.blocks)for(const o of doc.blocks[n].objects)if(o.linetype&&o.linetype!=='ByLayer')usedLt.add(o.linetype);
  const ltList=[...usedLt].filter(n=>LINETYPES[n]);

  let s='';
  // ---- HEADER ----
  s+=dxfPair(0,'SECTION')+dxfPair(2,'HEADER');
  s+=dxfPair(9,'$ACADVER')+dxfPair(1,'AC1015');      // AutoCAD 2000 — real ELLIPSE/MTEXT/HATCH/DIMENSION
  s+=dxfPair(9,'$HANDSEED')+dxfPair(5,'__SEED__');   // patched once the highest handle is known
  s+=dxfPair(9,'$INSBASE')+dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0);
  s+=dxfPair(9,'$EXTMIN')+dxfPair(10,bounds.minx)+dxfPair(20,bounds.miny)+dxfPair(30,0);
  s+=dxfPair(9,'$EXTMAX')+dxfPair(10,bounds.maxx)+dxfPair(20,bounds.maxy)+dxfPair(30,0);
  s+=dxfPair(9,'$LIMMIN')+dxfPair(10,bounds.minx)+dxfPair(20,bounds.miny);
  s+=dxfPair(9,'$LIMMAX')+dxfPair(10,bounds.maxx)+dxfPair(20,bounds.maxy);
  s+=dxfPair(9,'$CLAYER')+dxfPair(8,curLayer);
  s+=dxfPair(9,'$LTSCALE')+dxfPair(40,1);
  s+=dxfPair(9,'$CELTYPE')+dxfPair(6,'ByLayer');
  s+=dxfPair(9,'$CECOLOR')+dxfPair(62,256);          // ByLayer
  s+=dxfPair(9,'$CELWEIGHT')+dxfPair(370,-1);        // ByLayer
  s+=dxfPair(9,'$INSUNITS')+dxfPair(70,4);           // millimetres
  s+=dxfPair(9,'$MEASUREMENT')+dxfPair(70,1);        // metric
  s+=dxfPair(9,'$DIMSCALE')+dxfPair(40,1);
  s+=dxfPair(9,'$TEXTSTYLE')+dxfPair(7,doc.textStyle||'Standard');
  s+=dxfPair(9,'$DIMSTYLE')+dxfPair(2,doc.dimStyle||'Standard');
  s+=dxfPair(9,'$PDMODE')+dxfPair(70,3);             // points draw as a cross, as LumoCAD draws them
  s+=dxfPair(9,'$PDSIZE')+dxfPair(40,0);
  s+=dxfPair(0,'ENDSEC');
  // ---- CLASSES (empty but present) ----
  s+=dxfPair(0,'SECTION')+dxfPair(2,'CLASSES')+dxfPair(0,'ENDSEC');
  // ---- TABLES ----
  s+=dxfPair(0,'SECTION')+dxfPair(2,'TABLES');

  // VPORT — one active viewport describing what the drawing was last looking at
  const vw=Math.max(1,bounds.maxx-bounds.minx), vh=Math.max(1,bounds.maxy-bounds.miny);
  s+=dxfPair(0,'TABLE')+dxfPair(2,'VPORT')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,1);
  s+=dxfPair(0,'VPORT')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbViewportTableRecord')
    +dxfPair(2,'*Active')+dxfPair(70,0)
    +dxfPair(10,0)+dxfPair(20,0)+dxfPair(11,1)+dxfPair(21,1)
    +dxfPair(12,(bounds.minx+bounds.maxx)/2)+dxfPair(22,(bounds.miny+bounds.maxy)/2)
    +dxfPair(13,0)+dxfPair(23,0)+dxfPair(14,10)+dxfPair(24,10)+dxfPair(15,10)+dxfPair(25,10)
    +dxfPair(16,0)+dxfPair(26,0)+dxfPair(36,1)+dxfPair(17,0)+dxfPair(27,0)+dxfPair(37,0)
    +dxfPair(40,vh*1.2)+dxfPair(41,vw/vh)+dxfPair(42,50)+dxfPair(43,0)+dxfPair(44,0)
    +dxfPair(50,0)+dxfPair(51,0)+dxfPair(71,0)+dxfPair(72,100)+dxfPair(73,1)+dxfPair(74,3)
    +dxfPair(75,0)+dxfPair(76,0)+dxfPair(77,0)+dxfPair(78,0);
  s+=dxfPair(0,'ENDTAB');

  // LTYPE — ByLayer and ByBlock, then a real definition for every pattern the drawing uses,
  // so a dashed layer stays dashed instead of silently falling back to continuous
  s+=dxfPair(0,'TABLE')+dxfPair(2,'LTYPE')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,ltList.length+2);
  for(const lt of ['ByLayer','ByBlock']){
    s+=dxfPair(0,'LTYPE')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbLinetypeTableRecord')
      +dxfPair(2,lt)+dxfPair(70,0)+dxfPair(3,'')+dxfPair(72,65)+dxfPair(73,0)+dxfPair(40,0);
  }
  for(const name of ltList){
    const pat=LINETYPES[name]||[];
    // our patterns alternate dash, gap, dash, gap...; DXF writes gaps as negative lengths
    const els=[];
    for(let i=0;i<pat.length;i++)els.push(i%2?-Math.abs(pat[i]):Math.abs(pat[i]));
    const total=els.reduce((a,v)=>a+Math.abs(v),0);
    s+=dxfPair(0,'LTYPE')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbLinetypeTableRecord')
      +dxfPair(2,dxfLinetypeName(name))+dxfPair(70,0)+dxfPair(3,name)
      +dxfPair(72,65)+dxfPair(73,els.length)+dxfPair(40,total);
    for(const e of els)s+=dxfPair(49,e)+dxfPair(74,0);
  }
  s+=dxfPair(0,'ENDTAB');

  // LAYER — name, colour, linetype, lineweight, and the on/freeze/lock/plot state
  s+=dxfPair(0,'TABLE')+dxfPair(2,'LAYER')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,doc.layers.length);
  doc.layers.forEach(l=>{
    let flags=0;
    if(l.frozen)flags|=1;          // bit 1: frozen
    if(l.locked)flags|=4;          // bit 4: locked
    const rgb=hexToRgb(l.color||'#ffffff');
    s+=dxfPair(0,'LAYER')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbLayerTableRecord')
      +dxfPair(2,l.name)+dxfPair(70,flags)
      +dxfPair(62,(l.on===false?-1:1)*Math.abs(aciFromHex(l.color)))   // negative = layer off
      +dxfPair(420,(rgb.r<<16)|(rgb.g<<8)|rgb.b)                      // 24-bit true colour, exact
      +dxfPair(6,dxfLinetypeName(l.linetype||'Continuous'))
      +dxfPair(290,l.plot===false?0:1)                                 // plot on/off
      +dxfPair(370,Math.round((l.lineweight!=null?l.lineweight:0.35)*100));
  });
  s+=dxfPair(0,'ENDTAB');

  // STYLE — every named text style the drawing carries
  const tsNames=Object.keys(doc.textStyles||{Standard:{}});
  s+=dxfPair(0,'TABLE')+dxfPair(2,'STYLE')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,tsNames.length);
  for(const n of tsNames){
    const st=doc.textStyles[n]||{};
    s+=dxfPair(0,'STYLE')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbTextStyleTableRecord')
      +dxfPair(2,n)+dxfPair(70,0)
      +dxfPair(40,st.h||0)                      // fixed height, 0 = variable
      +dxfPair(41,st.widthFactor||1)
      +dxfPair(50,st.oblique||0)
      +dxfPair(71,0)+dxfPair(42,2.5)
      +dxfPair(3,dxfFontFile(st))               // primary font file
      +dxfPair(4,'');
  }
  s+=dxfPair(0,'ENDTAB');

  // VIEW and UCS — required, and empty is a legitimate answer for both
  s+=dxfPair(0,'TABLE')+dxfPair(2,'VIEW')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,0)+dxfPair(0,'ENDTAB');
  s+=dxfPair(0,'TABLE')+dxfPair(2,'UCS')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,0)+dxfPair(0,'ENDTAB');

  // APPID — ACAD has to be there
  s+=dxfPair(0,'TABLE')+dxfPair(2,'APPID')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,1);
  s+=dxfPair(0,'APPID')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbRegAppTableRecord')
    +dxfPair(2,'ACAD')+dxfPair(70,0);
  s+=dxfPair(0,'ENDTAB');

  // DIMSTYLE — every named dimension style, with the DIM variables that carry its look
  const dsNames=Object.keys(doc.dimStyles||{Standard:{}});
  s+=dxfPair(0,'TABLE')+dxfPair(2,'DIMSTYLE')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,dsNames.length)+dxfPair(100,'AcDbDimStyleTable')+dxfPair(71,0);
  for(const n of dsNames){
    const st=doc.dimStyles[n]||{};
    const txt=(st.txtH>0)?st.txtH:annoText();
    s+=dxfPair(0,'DIMSTYLE')+dxfPair(105,nextHandle())+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbDimStyleTableRecord')
      +dxfPair(2,n)+dxfPair(70,0)
      +dxfPair(3,st.prefix||'')                                   // DIMPOST
      +dxfPair(40,1)                                              // DIMSCALE — geometry is already model size
      +dxfPair(41,(st.arrowSize||9)/9*ANNO_PAPER.arrow*annoScale) // DIMASZ, model units
      +dxfPair(42,(st.extOffset!=null?st.extOffset:ANNO_PAPER.gap)*annoScale)  // DIMEXO
      +dxfPair(44,(st.extExt!=null?st.extExt:ANNO_PAPER.ext)*annoScale)        // DIMEXE
      +dxfPair(140,txt)                                           // DIMTXT
      +dxfPair(147,txt*0.4)                                       // DIMGAP
      +dxfPair(271,st.precision==null?1:st.precision)             // DIMDEC
      +dxfPair(77,1);                                             // DIMTAD: text above the line
  }
  s+=dxfPair(0,'ENDTAB');

  // BLOCK_RECORD (model space, paper space, used blocks, + one anon block per dimension)
  const usedBlocks=new Set();
  for(const o of doc.objects)if(o.type==='block'&&doc.blocks[o.name])usedBlocks.add(o.name);
  let dimN=0;const dimBlocks=[];
  for(const o of doc.objects)if(o.type==='dim'){o._dimBlk='*D'+(dimN++);dimBlocks.push(o);}
  const allBlockNames=['*Model_Space','*Paper_Space',...usedBlocks,...dimBlocks.map(d=>d._dimBlk)];
  s+=dxfPair(0,'TABLE')+dxfPair(2,'BLOCK_RECORD')+entHandle()+dxfPair(100,'AcDbSymbolTable')+dxfPair(70,allBlockNames.length);
  for(const bn of allBlockNames){
    s+=dxfPair(0,'BLOCK_RECORD')+entHandle()+dxfPair(100,'AcDbSymbolTableRecord')+dxfPair(100,'AcDbBlockTableRecord')+dxfPair(2,bn)+dxfPair(70,0)+dxfPair(280,1)+dxfPair(281,0);
  }
  s+=dxfPair(0,'ENDTAB');
  s+=dxfPair(0,'ENDSEC');
  // ---- BLOCKS ----
  s+=dxfPair(0,'SECTION')+dxfPair(2,'BLOCKS');
  // mandatory model/paper space block definitions
  for(const bn of ['*Model_Space','*Paper_Space']){
    s+=dxfPair(0,'BLOCK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,'0')+dxfPair(100,'AcDbBlockBegin')+dxfPair(2,bn)+dxfPair(70,0)+dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0)+dxfPair(3,bn)+dxfPair(1,'');
    s+=dxfPair(0,'ENDBLK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,'0')+dxfPair(100,'AcDbBlockEnd');
  }
  for(const name of usedBlocks){
    const def=doc.blocks[name];
    s+=dxfPair(0,'BLOCK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,'0')+dxfPair(100,'AcDbBlockBegin')+dxfPair(2,name)+dxfPair(70,0)+dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0)+dxfPair(3,name)+dxfPair(1,'');
    for(const part of def.objects)s+=entityToDXF(part);
    s+=dxfPair(0,'ENDBLK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,'0')+dxfPair(100,'AcDbBlockEnd');
  }
  // anonymous dimension blocks: the drawn geometry (lines + measurement text) for each DIMENSION
  for(const d of dimBlocks){
    const L=d.layer||'0';
    s+=dxfPair(0,'BLOCK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+dxfPair(100,'AcDbBlockBegin')+dxfPair(2,d._dimBlk)+dxfPair(70,1)+dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0)+dxfPair(3,d._dimBlk)+dxfPair(1,'');
    for(const seg of dimSegments(d))s+=dxfPair(0,'LINE')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+dxfPair(100,'AcDbLine')+dxfPair(10,seg[0].x)+dxfPair(20,seg[0].y)+dxfPair(30,0)+dxfPair(11,seg[1].x)+dxfPair(21,seg[1].y)+dxfPair(31,0);
    const dt=dimTextInfo(d);if(dt)s+=dxfPair(0,'TEXT')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+dxfPair(100,'AcDbText')+dxfPair(10,dt.x)+dxfPair(20,dt.y)+dxfPair(30,0)+dxfPair(40,dt.h)+dxfPair(1,dt.str)+dxfPair(100,'AcDbText');
    s+=dxfPair(0,'ENDBLK')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+dxfPair(100,'AcDbBlockEnd');
  }
  s+=dxfPair(0,'ENDSEC');
  // ---- ENTITIES ----
  s+=dxfPair(0,'SECTION')+dxfPair(2,'ENTITIES');
  for(const o of doc.objects)s+=entityToDXF(o);
  s+=dxfPair(0,'ENDSEC');
  // ---- OBJECTS (root dictionary is mandatory in R2000) ----
  const dictH=nextHandle();
  s+=dxfPair(0,'SECTION')+dxfPair(2,'OBJECTS');
  s+=dxfPair(0,'DICTIONARY')+dxfPair(5,dictH)+dxfPair(100,'AcDbDictionary')+dxfPair(281,1);
  s+=dxfPair(0,'ENDSEC');
  s+=dxfPair(0,'EOF');
  // The seed has to be above every handle the file actually used — a fixed FFFF collides the
  // moment a drawing has more entities than that.
  s=s.replace('__SEED__',(_dxfHandle+16).toString(16).toUpperCase());
  downloadText('Drawing1.dxf',s);
  echo('Exported to DXF (AutoCAD 2000 format)');
}
// MTEXT stores a line break as \P, and treats a backslash and braces as control characters,
// so they have to be escaped on the way out and unescaped on the way back in.
// the DXF font file a text style maps to; AutoCAD reads txt.shx and the TrueType name alike
function dxfFontFile(st){
  const f=(st&&st.font||'monospace').split(',')[0].trim();
  if(/^monospace$/i.test(f))return 'txt';
  return f;
}
function dxfStyleName(o){
  const n=(o&&o.style)||doc.textStyle||'Standard';
  return (doc.textStyles&&doc.textStyles[n])?n:'Standard';
}
function mtextEscape(t){
  return String(t)
    .split('\\').join('\\\\')     // a literal backslash doubles
    .split('{').join('\\{')
    .split('}').join('\\}')
    .split('\r\n').join('\\P')
    .split('\n').join('\\P');
}
function entityToDXF(o){
  const L=o.layer||'0';let s='';
  const ov=ovrPairs(o);   // color (62) + lineweight (370) overrides, if any
  // R2000 entity preamble: handle + AcDbEntity + layer + overrides + entity subclass
  const head=(type,sub)=>dxfPair(0,type)+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+ov+dxfPair(100,sub);
  if(o.type==='line'){
    s+=head('LINE','AcDbLine')+dxfPair(10,o.x1)+dxfPair(20,o.y1)+dxfPair(30,0)+dxfPair(11,o.x2)+dxfPair(21,o.y2)+dxfPair(31,0);
  } else if(o.type==='circle'){
    s+=head('CIRCLE','AcDbCircle')+dxfPair(10,o.cx)+dxfPair(20,o.cy)+dxfPair(30,0)+dxfPair(40,o.r);
  } else if(o.type==='arc'){
    s+=head('ARC','AcDbCircle')+dxfPair(10,o.cx)+dxfPair(20,o.cy)+dxfPair(30,0)+dxfPair(40,o.r)+dxfPair(100,'AcDbArc')+dxfPair(50,o.a1*180/Math.PI)+dxfPair(51,o.a2*180/Math.PI);
  } else if(o.type==='rect'){
    const pts=[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]];
    s+=plineDXF(pts,true,L,null,ov);
  } else if(o.type==='pline'){
    s+=plineDXF(o.pts,o.closed,L,o.segs,ov);
  } else if(o.type==='text'){
    if(o.mtext){
      const mt=String(o.str).replace(/\n/g,'\\P');
      s+=head('MTEXT','AcDbMText')+dxfPair(10,o.x)+dxfPair(20,o.y)+dxfPair(30,0)
        +dxfPair(40,styleTextHeight(o,false))+(o.width?dxfPair(41,o.width):'')+dxfPair(71,1)+dxfPair(72,5)+(o.rot?dxfPair(50,o.rot):'')+dxfPair(1,mt)+dxfPair(7,dxfStyleName(o));
    } else {
      const lines=String(o.str).split('\n');const lh=o.h*1.35;
      lines.forEach((ln,i)=>{s+=head('TEXT','AcDbText')+dxfPair(10,o.x)+dxfPair(20,o.y-i*lh)+dxfPair(30,0)+dxfPair(40,styleTextHeight(o,false))+dxfPair(1,ln)+dxfPair(7,dxfStyleName(o))+(o.rot?dxfPair(50,o.rot):'')+dxfPair(100,'AcDbText');});
    }
  } else if(o.type==='point'){
    s+=head('POINT','AcDbPoint')+dxfPair(10,o.x)+dxfPair(20,o.y)+dxfPair(30,0);
  } else if(o.type==='ellipse'){
    const rot=o.rot||0;
    const mjx=o.rx*Math.cos(rot), mjy=o.rx*Math.sin(rot);
    const ratio=o.rx?(o.ry/o.rx):1;
    s+=head('ELLIPSE','AcDbEllipse')+dxfPair(10,o.cx)+dxfPair(20,o.cy)+dxfPair(30,0)
      +dxfPair(11,mjx)+dxfPair(21,mjy)+dxfPair(31,0)+dxfPair(40,ratio)+dxfPair(41,0)+dxfPair(42,2*Math.PI);
  } else if(o.type==='spline'){
    const pts=o.pts||[];
    if(pts.length>=2){
      s+=head('SPLINE','AcDbSpline')+dxfPair(70,8)+dxfPair(71,3)+dxfPair(74,pts.length);
      for(const q of pts)s+=dxfPair(11,q[0])+dxfPair(21,q[1])+dxfPair(31,0);
    }
  } else if(o.type==='hatch'){
    // one boundary path per HATCH entity: islands are not exported yet
    const rings=hatchRings(o);
    if(rings&&rings[0]&&rings[0].length>=2)s+=hatchToDXF(o,rings[0],L,ov,head);
  } else if(o.type==='leader'){
    // A real LEADER entity, not a polyline that happens to look like one — so AutoCAD shows a
    // leader, and so it comes back as a leader. The annotation is a separate MTEXT joined by a
    // hard reference (340), which is exactly how AutoCAD stores the pair.
    let lpts=(o.pts||[]).map(q=>[q[0],q[1]]);
    let textAt=lpts.length?lpts[lpts.length-1]:[0,0];
    if(o.mleader&&lpts.length>=2){
      const a=lpts[lpts.length-2],b=lpts[lpts.length-1];
      const goingRight=b[0]>=a[0];const land=(o.landing!=null?o.landing:8);
      const tail=[b[0]+(goingRight?1:-1)*land,b[1]];
      lpts.push(tail);textAt=tail;
    }
    const annH=(o.str?nextHandle():null);   // the annotation's handle, needed before the leader
    const txtH=o.txtH||annoText();
    if(lpts.length>=2){
      s+=dxfPair(0,'LEADER')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+ov+dxfPair(100,'AcDbLeader')
        +dxfPair(3,'Standard')            // dimension style
        +dxfPair(71,1)                    // arrowhead on
        +dxfPair(72,0)                    // straight segments
        +dxfPair(73,o.str?0:3)            // 0 = carries a text annotation, 3 = none
        +dxfPair(74,0)+dxfPair(75,0)
        +dxfPair(40,txtH)+dxfPair(41,0)
        +dxfPair(76,lpts.length);
      for(const q of lpts)s+=dxfPair(10,q[0])+dxfPair(20,q[1])+dxfPair(30,0);
      if(annH)s+=dxfPair(340,annH);
    }
    if(o.str){
      s+=dxfPair(0,'MTEXT')+dxfPair(5,annH)+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+ov+dxfPair(100,'AcDbMText')
        +dxfPair(10,textAt[0]+txtH*0.3)+dxfPair(20,textAt[1])+dxfPair(30,0)
        +dxfPair(40,txtH)+dxfPair(41,0)+dxfPair(71,1)+dxfPair(72,5)
        +dxfPair(1,mtextEscape(String(o.str)))+dxfPair(7,dxfStyleName(o));
    }
  } else if(o.type==='dim'){
    s+=dimToDXF(o,L,ov,head);
  } else if(o.type==='block'){
    if(doc.blocks[o.name]){
      s+=head('INSERT','AcDbBlockReference')+dxfPair(2,o.name)+dxfPair(10,o.x)+dxfPair(20,o.y)+dxfPair(30,0)
        +dxfPair(41,o.sx==null?1:o.sx)+dxfPair(42,o.sy==null?1:o.sy)+dxfPair(43,1)
        +dxfPair(50,(o.rot||0)*180/Math.PI);
    } else {
      for(const part of blockInstanceObjects(o))s+=entityToDXF(part);
    }
  }
  return s;
}
// sample a Catmull-Rom spline into a flat list of points (segPer points per span)
function sampleSpline(pts,segPer){
  if(pts.length<3)return pts.slice();
  const out=[];
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
    for(let t=0;t<segPer;t++){const u=t/segPer,u2=u*u,u3=u2*u;
      const x=0.5*((2*p1[0])+(-p0[0]+p2[0])*u+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*u2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*u3);
      const y=0.5*((2*p1[1])+(-p0[1]+p2[1])*u+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*u2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*u3);
      out.push([x,y]);
    }
  }
  out.push(pts[pts.length-1]);
  return out;
}
// world-space line segments of a dimension (extension lines + dim line), for export
function dimSegments(o){
  const kind=o.dim||'linear';const out=[];
  if(kind==='radius'||kind==='diameter'){
    const ang=o.ang||0;const ex=o.cx+o.r*Math.cos(ang),ey=o.cy+o.r*Math.sin(ang);
    if(kind==='diameter')out.push([{x:o.cx-o.r*Math.cos(ang),y:o.cy-o.r*Math.sin(ang)},{x:ex,y:ey}]);
    else out.push([{x:o.cx,y:o.cy},{x:ex,y:ey}]);
    return out;
  }
  if(kind==='angular')return out; // skip arc; text only
  // linear / aligned
  let wdx=o.x2-o.x1,wdy=o.y2-o.y1;
  if(kind==='linear'){if(Math.abs(wdx)>=Math.abs(wdy))wdy=0;else wdx=0;}
  const wlen=Math.hypot(wdx,wdy)||1,wnx=-wdy/wlen,wny=wdx/wlen;
  const sc=annoScale,sgn=o.off>=0?1:-1;
  const extOffset=(o.extOffset!=null?o.extOffset:ANNO_PAPER.gap)*sc;
  const extExt=(o.extExt!=null?o.extExt:ANNO_PAPER.ext)*sc;
  const ox=wnx*o.off,oy=wny*o.off;
  const a2={x:o.x1+ox,y:o.y1+oy},b2={x:o.x2+ox,y:o.y2+oy};
  out.push([a2,b2]); // dim line
  if(o.extLine1!==false)out.push([{x:o.x1+wnx*sgn*extOffset,y:o.y1+wny*sgn*extOffset},{x:a2.x+wnx*sgn*extExt,y:a2.y+wny*sgn*extExt}]);
  if(o.extLine2!==false)out.push([{x:o.x2+wnx*sgn*extOffset,y:o.y2+wny*sgn*extOffset},{x:b2.x+wnx*sgn*extExt,y:b2.y+wny*sgn*extExt}]);
  return out;
}
function dimTextInfo(o){
  const kind=o.dim||'linear';const h=o.txtH||annoText();
  if(kind==='radius')return{x:o.cx+o.r*Math.cos(o.ang||0),y:o.cy+o.r*Math.sin(o.ang||0),h,str:'R'+o.r.toFixed(o.precision!=null?o.precision:1)};
  if(kind==='diameter')return{x:o.cx,y:o.cy,h,str:'\u00d8'+(o.r*2).toFixed(o.precision!=null?o.precision:1)};
  if(kind==='angular'){let deg=((o.a2-o.a1)*180/Math.PI%360+360)%360;return{x:o.cx,y:o.cy,h,str:deg.toFixed(1)+'\u00b0'};}
  let wdx=o.x2-o.x1,wdy=o.y2-o.y1;
  if(kind==='linear'){if(Math.abs(wdx)>=Math.abs(wdy))wdy=0;else wdx=0;}
  const wlen=Math.hypot(wdx,wdy)||1,wnx=-wdy/wlen,wny=wdx/wlen;
  const ox=wnx*o.off,oy=wny*o.off;
  const mx=((o.x1+ox)+(o.x2+ox))/2,my=((o.y1+oy)+(o.y2+oy))/2;
  let measure=(kind==='linear')?(Math.abs(o.x2-o.x1)>=Math.abs(o.y2-o.y1)?Math.abs(o.x2-o.x1):Math.abs(o.y2-o.y1)):Math.hypot(o.x2-o.x1,o.y2-o.y1);
  let label=(o.textOverride&&o.textOverride.length)?o.textOverride:measure.toFixed(o.precision!=null?o.precision:1);
  label=(o.prefix||'')+label+(o.suffix||'');
  return{x:mx-label.length*h*0.3,y:my+h*0.3,h,str:label};
}
// world-space hatch fill segments for export (mirrors drawHatch geometry)
function hatchSegments(o){
  const rings=hatchRings(o);if(!rings)return[];
  const poly=rings[0];
  const pat=HATCH_PATTERNS[o.pattern]||HATCH_PATTERNS['ANSI31 (diagonal)'];
  let minx=1e18,miny=1e18,maxx=-1e18,maxy=-1e18;
  for(const[px,py]of poly){minx=Math.min(minx,px);miny=Math.min(miny,py);maxx=Math.max(maxx,px);maxy=Math.max(maxy,py);}
  const gap=(pat.gap||4)*(o.patScale||1)*annoScale*0.25;
  const out=[];const angs=pat.cross?[pat.ang,pat.ang+90]:[pat.ang];
  for(const angDeg of angs){
    const ang=angDeg*Math.PI/180,dx=Math.cos(ang),dy=Math.sin(ang),nx=-dy,ny=dx;
    const diag=Math.hypot(maxx-minx,maxy-miny),cx=(minx+maxx)/2,cy=(miny+maxy)/2;
    for(let d=-diag;d<=diag;d+=gap){
      const lx=cx+nx*d,ly=cy+ny*d;
      const p1={x:lx-dx*diag,y:ly-dy*diag},p2={x:lx+dx*diag,y:ly+dy*diag};
      for(const seg of clipLineToRings(p1,p2,rings))out.push(seg);
    }
  }
  return out;
}
// Map a LumoCAD pattern name to a DXF/AutoCAD pattern name.
function dxfHatchName(o){
  if(o.solid)return 'SOLID';
  const m={'ANSI31 (diagonal)':'ANSI31','Lines (horizontal)':'LINE','Cross':'NET','Steel':'ANSI32','Concrete':'AR-CONC'};
  return m[o.pattern]||'ANSI31';
}
// Real HATCH entity. boundary = array of [x,y] world points (one closed polyline path).
function hatchToDXF(o,boundary,L,ov,head){
  const solid=!!o.solid;const pname=dxfHatchName(o);
  let s=head('HATCH','AcDbHatch');
  s+=dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0);          // elevation point
  s+=dxfPair(210,0)+dxfPair(220,0)+dxfPair(230,1);       // extrusion (normal +Z)
  s+=dxfPair(2,pname);                                    // pattern name
  s+=dxfPair(70,solid?1:0);                               // solid fill flag
  s+=dxfPair(71,0);                                       // associativity off
  s+=dxfPair(91,1);                                       // one boundary path
  // boundary path: polyline type (bit 1 = polyline, bit 2 = closed)
  s+=dxfPair(92,3);                                       // flag: external(0)+polyline(2)... use 1|2
  s+=dxfPair(72,0);                                       // has bulge = no
  s+=dxfPair(73,1);                                       // is closed = yes
  s+=dxfPair(93,boundary.length);                         // number of vertices
  for(const p of boundary)s+=dxfPair(10,p[0])+dxfPair(20,p[1]);
  s+=dxfPair(97,0);                                       // source boundary objects = 0
  s+=dxfPair(75,1);                                       // hatch style = outer
  s+=dxfPair(76,1);                                       // pattern type = predefined
  if(!solid){
    s+=dxfPair(52,0);                                     // pattern angle
    s+=dxfPair(41,o.patScale||1);                         // pattern scale
    s+=dxfPair(77,0);                                     // not double
    s+=dxfPair(78,0);                                     // 0 pattern line defs (AutoCAD fills from name)
  }
  s+=dxfPair(98,1)+dxfPair(10,0)+dxfPair(20,0);           // seed points: 1
  return s;
}
// Real DIMENSION entity. Each references its anonymous geometry block (o._dimBlk) and carries
// the definition points so AutoCAD treats it as an editable, associative dimension.
function dimToDXF(o,L,ov,head){
  const kind=o.dim||'linear';
  const blk=o._dimBlk||'*D0';
  const dt=dimTextInfo(o);
  const tmx=dt?dt.x:0, tmy=dt?dt.y:0;     // text mid point
  let s=head('DIMENSION','AcDbDimension');
  s+=dxfPair(2,blk)+dxfPair(3,(o.dimStyle&&doc.dimStyles[o.dimStyle])?o.dimStyle:(doc.dimStyle||'Standard'));
  if(kind==='linear'||kind==='aligned'){
    // dimension line definition point (10,20) = location on the dim line; here use offset midpoint
    let wdx=o.x2-o.x1,wdy=o.y2-o.y1;
    if(kind==='linear'){if(Math.abs(wdx)>=Math.abs(wdy))wdy=0;else wdx=0;}
    const wlen=Math.hypot(wdx,wdy)||1,wnx=-wdy/wlen,wny=wdx/wlen;
    const dlx=o.x1+wnx*o.off, dly=o.y1+wny*o.off;
    const type=(kind==='aligned'?1:0)|32;       // +32 = block reference present
    s+=dxfPair(10,dlx)+dxfPair(20,dly)+dxfPair(30,0)+dxfPair(11,tmx)+dxfPair(21,tmy)+dxfPair(31,0)+dxfPair(70,type)+dxfPair(1,dt?dt.str:'');
    s+=dxfPair(100,'AcDbAlignedDimension');
    s+=dxfPair(13,o.x1)+dxfPair(23,o.y1)+dxfPair(33,0)+dxfPair(14,o.x2)+dxfPair(24,o.y2)+dxfPair(34,0);
    if(kind==='linear')s+=dxfPair(50,0)+dxfPair(100,'AcDbRotatedDimension');
  } else if(kind==='radius'){
    const ex=o.cx+o.r*Math.cos(o.ang||0), ey=o.cy+o.r*Math.sin(o.ang||0);
    s+=dxfPair(10,o.cx)+dxfPair(20,o.cy)+dxfPair(30,0)+dxfPair(11,tmx)+dxfPair(21,tmy)+dxfPair(31,0)+dxfPair(70,4|32)+dxfPair(1,dt?dt.str:'');
    s+=dxfPair(100,'AcDbRadialDimension')+dxfPair(15,ex)+dxfPair(25,ey)+dxfPair(35,0)+dxfPair(40,0);
  } else if(kind==='diameter'){
    const ex=o.cx+o.r*Math.cos(o.ang||0), ey=o.cy+o.r*Math.sin(o.ang||0);
    s+=dxfPair(10,o.cx)+dxfPair(20,o.cy)+dxfPair(30,0)+dxfPair(11,tmx)+dxfPair(21,tmy)+dxfPair(31,0)+dxfPair(70,3|32)+dxfPair(1,dt?dt.str:'');
    s+=dxfPair(100,'AcDbDiametricDimension')+dxfPair(15,ex)+dxfPair(25,ey)+dxfPair(35,0)+dxfPair(40,0);
  } else if(kind==='angular'){
    const r=o.r||30;
    const p1x=o.cx+r*Math.cos(o.a1||0), p1y=o.cy+r*Math.sin(o.a1||0);
    const p2x=o.cx+r*Math.cos(o.a2||0), p2y=o.cy+r*Math.sin(o.a2||0);
    s+=dxfPair(10,p1x)+dxfPair(20,p1y)+dxfPair(30,0)+dxfPair(11,tmx)+dxfPair(21,tmy)+dxfPair(31,0)+dxfPair(70,5|32)+dxfPair(1,dt?dt.str:'');
    s+=dxfPair(100,'AcDb3PointAngularDimension');
    s+=dxfPair(13,p1x)+dxfPair(23,p1y)+dxfPair(33,0)+dxfPair(14,p2x)+dxfPair(24,p2y)+dxfPair(34,0)+dxfPair(15,o.cx)+dxfPair(25,o.cy)+dxfPair(35,0)+dxfPair(16,o.cx)+dxfPair(26,o.cy)+dxfPair(36,0);
  }
  return s;
}
function plineDXF(pts,closed,L,segs,ov){
  // R2000 2D polyline: POLYLINE + VERTEX*n + SEQEND, each with a handle and subclass marker.
  let s=dxfPair(0,'POLYLINE')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+(ov||'')
    +dxfPair(100,'AcDb2dPolyline')+dxfPair(66,1)+dxfPair(70,closed?1:0)+dxfPair(10,0)+dxfPair(20,0)+dxfPair(30,0);
  const n=pts.length;
  for(let i=0;i<n;i++){
    const p=pts[i];
    let vs=dxfPair(0,'VERTEX')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L)+dxfPair(100,'AcDbVertex')+dxfPair(100,'AcDb2dVertex')
      +dxfPair(10,p[0])+dxfPair(20,p[1])+dxfPair(30,0);
    const seg=segs&&segs[i];
    if(seg&&seg.arc){
      const a=pts[i], b=pts[(i+1)%n];
      const bulge=bulgeFromArc(seg,a,b);
      if(bulge!==0)vs+=dxfPair(42,bulge);
    }
    s+=vs;
  }
  s+=dxfPair(0,'SEQEND')+entHandle()+dxfPair(100,'AcDbEntity')+dxfPair(8,L);
  return s;
}
// DXF bulge = tan(includedAngle/4); sign is + for CCW, - for CW (from vertex a to vertex b).
function bulgeFromArc(seg,a,b){
  const a1=Math.atan2(a[1]-seg.cy,a[0]-seg.cx);
  const a2=Math.atan2(b[1]-seg.cy,b[0]-seg.cx);
  // signed shortest sweep a1 -> a2
  let sweep=a2-a1; while(sweep<=-Math.PI)sweep+=2*Math.PI; while(sweep>Math.PI)sweep-=2*Math.PI;
  return Math.tan(sweep/4);
}
// DXF override pairs for an object's own color (62) and lineweight (370). Empty if none.
function ovrPairs(o){
  let s='';
  if(o.color){
    const aci=aciFromHex(o.color);
    s+=dxfPair(62,aci);
    // if the color isn't an exact ACI palette match, also write the true 24-bit RGB (code 420)
    // so an exact color like 255,200,0 round-trips unchanged instead of snapping to the index.
    if(hexFromAci(aci)!==(o.color||'').toLowerCase()){
      const c=hexToRgb(o.color);
      if(c)s+=dxfPair(420,(c.r<<16)|(c.g<<8)|c.b);
    }
  }
  if(o.linetype&&o.linetype!=='ByLayer'&&o.linetype!=='Continuous')s+=dxfPair(6,dxfLinetypeName(o.linetype));
  if(o.lineweight!=null)s+=dxfPair(370,Math.round(o.lineweight*100));
  return s;
}
// Find the nearest AutoCAD Color Index for a hex color, searching the full 255-color palette
// so exported colors round-trip back to the same swatch in AutoCAD.
function aciFromHex(hex){
  const exact={'#ff0000':1,'#ffff00':2,'#00ff00':3,'#00ffff':4,'#0000ff':5,'#ff00ff':6,'#ffffff':7};
  const h=(hex||'').toLowerCase();
  if(exact[h])return exact[h];
  const c=hexToRgb(h)||{r:255,g:255,b:255};
  if(!_ACI_CACHE)_ACI_CACHE=_buildAciTable();
  let best=7,bd=1e18;
  for(let ci=1;ci<=255;ci++){
    const t=hexToRgb(_ACI_CACHE[ci]);if(!t)continue;
    const d=(c.r-t.r)**2+(c.g-t.g)**2+(c.b-t.b)**2;
    if(d<bd){bd=d;best=ci;if(d===0)break;}
  }
  return best;
}
function hexToRgb(h){if(!h)return null;h=h.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function dxfLinetypeName(lt){const map={'Continuous':'CONTINUOUS','Dashed':'DASHED','Hidden':'HIDDEN','Dotted':'DOT','Dash-Dot':'DASHDOT','Center':'CENTER','Phantom':'PHANTOM'};return map[lt]||'CONTINUOUS';}
function ltFromDXF(name){const map={'CONTINUOUS':'Continuous','DASHED':'Dashed','HIDDEN':'Hidden','DOT':'Dotted','DASHDOT':'Dash-Dot','CENTER':'Center','PHANTOM':'Phantom'};return map[(name||'').toUpperCase()]||'Continuous';}

function downloadText(filename,text){
  const blob=new Blob([text],{type:'application/dxf'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

