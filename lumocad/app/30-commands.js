// ============================================================
//  LumoCAD — command registry, command state machine, point feed
// ============================================================
// ============================================================
//  COMMAND SYSTEM
// ============================================================
const cmd={active:null,step:0,pts:[],preview:null,data:null};
let lastCmd=null;
const COMMANDS={
  LINE:{aliases:['L','LINE'],name:'Line',grp:'draw'},
  PLINE:{aliases:['PL','PLINE'],name:'Polyline',grp:'draw'},
  CIRCLE:{aliases:['C','CIRCLE'],name:'Circle',grp:'draw'},
  ARC:{aliases:['A','ARC'],name:'Arc',grp:'draw'},
  ELLIPSE:{aliases:['EL','ELLIPSE'],name:'Ellipse',grp:'draw'},
  SPLINE:{aliases:['SPL','SPLINE'],name:'Spline',grp:'draw'},
  RECT:{aliases:['REC','RECT','RECTANGLE'],name:'Rectangle',grp:'draw'},
  POLYGON:{aliases:['POL','POLYGON'],name:'Polygon',grp:'draw'},
  POINT:{aliases:['PO','POINT'],name:'Point',grp:'draw'},
  XLINE:{aliases:['XL','XLINE'],name:'Xline',grp:'draw'},
  RAY:{aliases:['RAY'],name:'Ray',grp:'draw'},
  REVCLOUD:{aliases:['REVCLOUD','RC','CLOUD'],name:'RevCloud',grp:'draw'},
  SHEET:{aliases:['SHEET','PAPER','LAYOUT','TITLEBLOCK'],name:'Sheet',grp:'annotate'},
  TEXT:{aliases:['T','TEXT','DT'],name:'Text',grp:'annotate'},
  MTEXT:{aliases:['MT','MTEXT'],name:'MText',grp:'annotate'},
  MOVE:{aliases:['M','MOVE'],name:'Move',grp:'modify'},
  COPY:{aliases:['CO','CP','COPY'],name:'Copy',grp:'modify'},
  ROTATE:{aliases:['RO','ROTATE'],name:'Rotate',grp:'modify'},
  SCALE:{aliases:['SC','SCALE'],name:'Scale',grp:'modify'},
  MIRROR:{aliases:['MI','MIRROR'],name:'Mirror',grp:'modify'},
  OFFSET:{aliases:['O','OFFSET'],name:'Offset',grp:'modify'},
  TRIM:{aliases:['TR','TRIM'],name:'Trim',grp:'modify'},
  EXTEND:{aliases:['EX','EXTEND'],name:'Extend',grp:'modify'},
  FILLET:{aliases:['F','FILLET'],name:'Fillet',grp:'modify'},
  CHAMFER:{aliases:['CHA','CHAMFER'],name:'Chamfer',grp:'modify'},
  BREAK:{aliases:['BR','BREAK'],name:'Break',grp:'modify'},
  LENGTHEN:{aliases:['LEN','LENGTHEN'],name:'Lengthen',grp:'modify'},
  DIVIDE:{aliases:['DIV','DIVIDE'],name:'Divide',grp:'modify'},
  STRETCH:{aliases:['S','STRETCH'],name:'Stretch',grp:'modify'},
  JOIN:{aliases:['J','JOIN'],name:'Join',grp:'modify'},
  EXPLODE:{aliases:['X','EXPLODE'],name:'Explode',grp:'modify'},
  MATCHPROP:{aliases:['MA','MATCHPROP','PAINTER'],name:'Match Prop',grp:'modify'},
  ALIGN:{aliases:['AL','ALIGN'],name:'Align',grp:'modify'},
  BLOCK:{aliases:['B','BLOCK'],name:'Block',grp:'modify'},
  INSERT:{aliases:['I','INSERT'],name:'Insert',grp:'modify'},
  REFEDIT:{aliases:['REFEDIT','BEDIT'],name:'Edit Block',grp:'modify'},
  REFCLOSE:{aliases:['REFCLOSE'],name:'Close Block',grp:'modify'},
  ERASE:{aliases:['E','ERASE','DEL'],name:'Erase',grp:'modify'},
  ARRAY:{aliases:['AR','ARRAY'],name:'Array',grp:'modify'},
  DIM:{aliases:['DI','DIM','DIMLINEAR'],name:'Linear',grp:'annotate'},
  DIMCONTINUE:{aliases:['DCO','DIMCONT','DIMCONTINUE'],name:'Continue',grp:'annotate'},
  DIMBASELINE:{aliases:['DBA','DIMBASE','DIMBASELINE'],name:'Baseline',grp:'annotate'},
  DIMALIGNED:{aliases:['DAL','DIMALIGNED'],name:'Aligned',grp:'annotate'},
  DIMANGULAR:{aliases:['DAN','DIMANG','DIMANGULAR'],name:'Angular',grp:'annotate'},
  DIMRADIUS:{aliases:['DRA','DIMRAD','DIMRADIUS'],name:'Radius',grp:'annotate'},
  DIMDIAMETER:{aliases:['DDI','DIMDIA','DIMDIAMETER'],name:'Diameter',grp:'annotate'},
  LEADER:{aliases:['LE','LEADER','QLEADER'],name:'Leader',grp:'annotate'},
  MLEADER:{aliases:['ML','MLEADER','MLD'],name:'MLeader',grp:'annotate'},
  HATCH:{aliases:['H','HATCH','BHATCH'],name:'Hatch',grp:'annotate'},
  REGION:{aliases:['REG','REGION'],name:'Region',grp:'view'},
  MASSPROP:{aliases:['MASSPROP','MP'],name:'Mass Prop',grp:'view'},
  AREA:{aliases:['AA','AREA'],name:'Area',grp:'view'},
  LIST:{aliases:['LI','LIST'],name:'List',grp:'view'},
  UCS:{aliases:['UCS'],name:'UCS',grp:'view'},
  UCSWORLD:{aliases:['UCSW','WORLD'],name:'World UCS',grp:'view'},
  PICKFIRST:{aliases:['PICKFIRST','PICK'],name:'PickFirst',grp:'settings'},
  OSNAP:{aliases:['OS','OSNAP'],name:'Snap Set',grp:'settings'},
  SELECTALL:{aliases:['SELALL'],name:'Sel All',grp:'view'},
  UNDO:{aliases:['U','UNDO'],name:'Undo',grp:'view'},
  REDO:{aliases:['RE','REDO'],name:'Redo',grp:'view'},
  ZOOMEXT:{aliases:['ZE','ZOOMEXT','ZOOM'],name:'Zoom Ext',grp:'view'},
  LAYER:{aliases:['LA','LAYER'],name:'Layers',grp:'view'},
  DXFOUT:{aliases:['DXFOUT','SAVEDXF','EXPORT'],name:'Export DXF',grp:'output'},
  DXFIN:{aliases:['DXFIN','OPENDXF','IMPORT'],name:'Import DXF',grp:'output'},
  PDFOUT:{aliases:['PDF','PDFOUT','PLOT','PRINT'],name:'Export PDF',grp:'output'},
  ANNOSCALE:{aliases:['ANNOSCALE','DRAWSCALE','DSCALE'],name:'Drawing Scale',grp:'settings'},
  GRIDSET:{aliases:['GRIDSET','GRIDSIZE','GS'],name:'Grid Size',grp:'settings'},
  CURSORSIZE:{aliases:['CURSORSIZE','CURSOR','CROSSHAIR','CHSIZE'],name:'Crosshair Size',grp:'settings'},
};
function resolveCmd(raw){const u=raw.trim().toUpperCase();if(COMMANDS[u])return u;for(const k in COMMANDS)if(COMMANDS[k].aliases.includes(u))return k;return null;}

function needsSelection(k){return['MOVE','COPY','ROTATE','SCALE','MIRROR','ARRAY'].includes(k);}

function startCommand(key){
  cancelCommand(true);
  if(typeof closeGripMenu==='function')closeGripMenu();hoverGrip=null;
  lastCmd=key;
  cmd.active=key;cmd.step=0;cmd.pts=[];cmd.preview=null;cmd.data=null;setActiveTool(key);
  // commands that live in 78-acad.js (ZOOM, PAN, clipboard, MEASURE, DIST, ...)
  if(ACAD_INSTANT[key]){ACAD_INSTANT[key]();endCmd();return;}
  if(ACAD_START[key]){ACAD_START[key]();return;}
  // instant commands
  if(key==='UNDO'){undo();endCmd();return;}
  if(key==='REDO'){redo();endCmd();return;}
  if(key==='ZOOMEXT'){zoomExtents();endCmd();return;}
  if(key==='SELECTALL'){selection.clear();doc.objects.forEach((o,i)=>{if(layerEditable(o.layer))selection.add(idAt(i));});echo(`${selection.size} objects selected`);renderProps();render();endCmd();return;}
  if(key==='NEW'){newDrawing();endCmd();return;}
  if(key==='OPEN'){openDrawing();endCmd();return;}
  if(key==='SAVE'){saveDrawing(false);endCmd();return;}
  if(key==='SAVEAS'){saveDrawing(true);endCmd();return;}
  if(key==='LAYER'){openLayerManager();endCmd();return;}
  if(key==='STYLE'){openTextStyleManager();endCmd();return;}
  if(key==='DIMSTYLE'){openDimStyleManager();endCmd();return;}
  if(key==='DXFOUT'){exportDXF();endCmd();return;}
  if(key==='DXFIN'){openDXFFile();endCmd();return;}
  if(key==='PDFOUT'){openPdfDialog();endCmd();return;}
  if(key==='ANNOSCALE'){openScaleDialog();endCmd();return;}
  if(key==='GRIDSET'){openGridDialog();endCmd();return;}
  if(key==='CURSORSIZE'){openCursorSizeDialog();endCmd();return;}
  if(key==='OSNAP'){openOsnapDialog();endCmd();return;}
  if(key==='UCSWORLD'){ucs.ox=0;ucs.oy=0;ucs.ang=0;echo('UCS reset to World');render();endCmd();return;}
  if(key==='PICKFIRST'){toggleSetting('pickfirst');echo(`PICKFIRST ${settings.pickfirst?'on (select then command)':'off (command then select)'}`);endCmd();return;}
  if(key==='REGION'){doRegion();endCmd();return;}
  if(key==='SHEET'){openSheetDialog();endCmd();return;}
  if(key==='MATCHPROP'){echo('MATCHPROP: click the source object to copy properties from',true);cmd.active='MATCHPROP';cmd.step=0;render();return;}
  if(key==='AREA'){
    const sel=selObjects();
    if(sel.length){let A=0,P=0,ok=false;for(const o of sel){const r=areaOf(o);if(r){A+=r.area;P+=r.perim;ok=true;}}
      if(ok){echo(`AREA: ${A.toFixed(2)} mm²  (${(A/1e6).toFixed(4)} m²)  ·  Perimeter: ${P.toFixed(2)} mm`);endCmd();return;}}
    echo('AREA: click a closed shape (circle, rectangle, closed polyline, polygon)',true);cmd.active='AREA';cmd.step=0;render();return;
  }
  if(key==='LIST'){
    const sel=selObjects();
    if(sel.length){echo(listInfo(sel[0]));endCmd();return;}
    echo('LIST: click an object to see its properties',true);cmd.active='LIST';cmd.step=0;render();return;
  }
  if(key==='ALIGN'){
    if(selection.size===0){echo('ALIGN: select object(s) first, then run ALIGN',true);endCmd();return;}
    cmd.active='ALIGN';cmd.step=0;cmd.pts=[];cmd.data={sel:[...selection]};
    echo('ALIGN: specify FIRST source point (on the selection)',true);render();return;
  }
  if(key==='MASSPROP'){doMassProp();endCmd();return;}
  if(key==='HATCH'){doHatch();endCmd();return;}
  if(key==='DIMCONTINUE'){startDimContinue('continue');return;}
  if(key==='DIMBASELINE'){startDimContinue('baseline');return;}
  if(key==='JOIN'){doJoin();endCmd();return;}
  if(key==='EXPLODE'){doExplode();endCmd();return;}
  if(key==='REFCLOSE'){if(editingBlock)saveBlockEdit();else echo('REFCLOSE: not editing a block');endCmd();return;}
  if(key==='REFEDIT'){
    if(editingBlock){echo('Already editing — REFCLOSE to finish');endCmd();return;}
    // find a selected block instance, else ask user to pick one
    const sel=selObjects().filter(o=>o.type==='block');
    if(sel.length){enterBlockEdit(idIndex(sel[0].id));endCmd();return;}
    echo('REFEDIT: click the block you want to edit',true);cmd.active='REFEDIT';cmd.step=0;render();return;
  }
  if(key==='BLOCK'){
    if(selection.size===0){echo('BLOCK: select objects first, then run BLOCK',true);cmd.step=-1;cmd.active='BLOCK';render();return;}
    startBlockDefinition();return;
  }
  if(key==='INSERT'){
    const names=Object.keys(doc.blocks);
    if(!names.length){echo('INSERT: no blocks defined yet — use BLOCK to create one first');endCmd();return;}
    choiceDialog({
      title:'Insert Block', label:'Choose a block to place', choices:names,
      onPick:(name)=>{
        if(!doc.blocks[name]){echo('INSERT: unknown block');endCmd();render();return;}
        cmd.active='INSERT';cmd.data={name};cmd.step=0;echo(`INSERT: specify insertion point for "${name}"`,true);render();
      },
      onCancel:()=>{echo('INSERT: cancelled');endCmd();render();}
    });
    return;
  }
  // ERASE: if objects are already selected AND pickfirst is on (noun-verb), delete them immediately.
  if(key==='ERASE'&&settings.pickfirst&&selection.size>0){
    pushUndo();idsToIndices(selection).forEach(i=>doc.objects.splice(i,1));
    selection.clear();echo('Erased selection');endCmd();renderProps();render();updateInfo();return;
  }
  // STRETCH flow: "draw a window, then run STRETCH, then move".
  // If objects are selected AND we have the selection box that produced them, use that box
  // as the vertex filter (only vertices inside it move) and jump straight to the base point.
  if(key==='STRETCH'){
    if(selection.size>0&&lastSelWindow){
      cmd.active='STRETCH';cmd.data={win:lastSelWindow};cmd.step=0;setActiveTool('STRETCH');
      // a rectangle can't move single corners, so promote any selected rect to a 4-vertex polyline
      for(const id of [...selection]){const i=idIndex(id);if(i<0)continue;const o=doc.objects[i];
        if(o.type==='rect')doc.objects[i]={id:o.id,type:'pline',layer:o.layer,closed:true,pts:[[o.x1,o.y1],[o.x2,o.y1],[o.x2,o.y2],[o.x1,o.y2]]};}
      lastSelWindow=null;  // consume it
      echo(`STRETCH: ${selection.size} object(s) — specify base point`,true);render();return;
    }
    // no window yet: ask the user to drag a crossing window first
    selection.clear();cmd.data={};cmd.step=-1;
    echo('STRETCH: select objects to stretch with a crossing window',true);render();return;
  }
  // commands needing a pre-selection
  if(needsSelection(key)){
    // PICKFIRST off: ignore any pre-selection and force the command's own selection step (verb-noun)
    if(!settings.pickfirst&&selection.size>0){selection.clear();renderProps();}
    if(selection.size===0){
      echo(`${COMMANDS[key].name.toUpperCase()}: select objects, then click base point`,true);
      cmd.step=-1;render();return;
    }
  }
  promptFor(key);
  render();
}
function endCmd(){cmd.active=null;cmd.step=0;cmd.pts=[];cmd.preview=null;cmd.data=null;setActiveTool(null);if(typeof dynReset==='function'){dynReset();dynEl&&dynEl.classList.remove('on');}}
function cancelCommand(silent){const wasPline=cmd.active==='PLINE'&&cmd.pts.length>=2;endCmd();if(wasPline)return;if(!silent)echo('* Cancelled *');render();}

function promptFor(k){
  const M={
    LINE:'LINE: specify first point',
    PLINE:'POLYLINE: specify first point (Enter=finish, C=close)',
    CIRCLE:'CIRCLE: specify center point',
    ARC:'ARC: specify start point',
    RECT:'RECTANGLE: specify first corner',
    POLYGON:'POLYGON: enter number of sides in command line (default 6)',
    POINT:'POINT: specify location',
    TEXT:'TEXT: specify insertion point',
    MTEXT:'MTEXT: specify insertion point',
    STRETCH:'STRETCH: specify base point',
    MOVE:'MOVE: specify base point',
    COPY:'COPY: specify base point',
    ROTATE:'ROTATE: specify base point',
    SCALE:'SCALE: specify base point',
    MIRROR:'MIRROR: specify first point of mirror line',
    OFFSET:'OFFSET: type distance in command line, then Enter',
    TRIM:'TRIM: click the part to remove — keep clicking to trim more (Esc to finish)',
    EXTEND:'EXTEND: click a line, polyline or arc near the end to extend to the nearest object',
    FILLET:'FILLET: type radius, then pick two edges — or type P for a whole polyline',
    CHAMFER:'CHAMFER: type distance, then pick two edges — or type P for a whole polyline',
    BREAK:'BREAK: click first break point on a line, polyline, rectangle, arc or circle',
    LENGTHEN:'LENGTHEN: type the new total length, then click a line',
    DIVIDE:'DIVIDE: type the number of segments, then click a line/pline/circle',
    ELLIPSE:'ELLIPSE: specify center point (then first axis end, then minor axis)',
    SPLINE:'SPLINE: specify first point',
    ERASE:'ERASE: click objects to delete (or select first)',
    ARRAY:'ARRAY: specify base point, then enter count & spacing',
    DIM:'LINEAR DIM: specify first point',
    DIMALIGNED:'ALIGNED DIM: specify first point',
    DIMANGULAR:'ANGULAR DIM: pick first line',
    DIMRADIUS:'RADIUS DIM: pick a circle or arc',
    DIMDIAMETER:'DIAMETER DIM: pick a circle or arc',
    UCS:'UCS: specify new origin point (then X-axis direction)',
    REGION:'REGION: click a closed polyline or circle to convert',
    POLYGON:'POLYGON: type the number of sides (e.g. 6), then pick center',
    ARC:'ARC: specify start point (3-point arc: start, point on arc, end)',
  };
  echo(M[k]||k,true);
  if(k==='POLYGON'){cmd.data={sides:6};}
  if(k==='OFFSET'){cmd.data={dist:null};}
  if(k==='FILLET'){cmd.data={r:lastFilletR,first:null};}
  if(k==='CHAMFER'){cmd.data={d:lastChamferD,first:null};}
  if(k==='LENGTHEN'){cmd.data={len:null};}
  if(k==='DIVIDE'){cmd.data={n:null};}
  if(k==='BREAK'){cmd.data={idx:null,first:null};}
  if(k==='ARRAY'){cmd.data={cols:null,rows:null,dx:null,dy:null,phase:'grid'};echo('ARRAY: type columns,rows (e.g. 3,2)',true);}
  if(k==='DIMANGULAR'){cmd.data={first:null};}
}

// The current layer, by name. doc.activeLayer is an INDEX, and almost every command that
// creates anything goes through here — so a stale index (a layer purged or deleted from under
// it, a hand-edited file) must not be able to take the whole app down. It falls back to the
// first layer, which always exists.
function layerName(){
  const l=doc.layers[doc.activeLayer]||doc.layers[0];
  return l?l.name:'0';
}

// ---- point feed (clicks / typed coords) ----
function feedPoint(p){
  const k=cmd.active;if(!k)return;
  if(ACAD_FEED[k]){ACAD_FEED[k](p);return;}
  switch(k){
    case 'LINE':
      cmd.pts.push(p);
      if(cmd.pts.length===2){pushUndo();add({type:'line',x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:p.x,y2:p.y});cmd.pts=[p];echo('LINE: next point — or type a length (e.g. 1000), @dx,dy, @len<ang  ·  Esc to finish',true);}
      else echo('LINE: next point — or type a length (e.g. 1000), @dx,dy, @len<ang',true);
      break;
    case 'PLINE': cmd.pts.push(p);echo(`POLYLINE: point ${cmd.pts.length} — type length / @dx,dy / @len<ang  ·  Enter=finish, C=close`,true);break;
    case 'REVCLOUD': {
      cmd.pts.push(p);
      if(cmd.pts.length===1){echo('REVCLOUD: specify opposite corner',true);break;}
      const o=makeRevCloud(cmd.pts[0],cmd.pts[1]);
      if(o){pushUndo();add(o);}
      endCmd();render();updateInfo();
      break;
    }
    case 'XLINE':
    case 'RAY': {
      cmd.pts.push(p);
      if(cmd.pts.length===1){echo(`${cmd.active}: specify the point it passes through (direction)`,true);break;}
      const a=cmd.pts[0],b=cmd.pts[1];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const ux=dx/len,uy=dy/len;const BIG=1e6;
      let x1,y1,x2,y2;
      if(cmd.active==='XLINE'){x1=a.x-ux*BIG;y1=a.y-uy*BIG;x2=a.x+ux*BIG;y2=a.y+uy*BIG;}
      else{x1=a.x;y1=a.y;x2=a.x+ux*BIG;y2=a.y+uy*BIG;}
      // anchor = the base point the user clicked; thru = the direction point — both are real,
      // meaningful snap targets (unlike the ±1e6 endpoints).
      pushUndo();add({type:'line',construction:true,x1,y1,x2,y2,anchor:{x:a.x,y:a.y},thru:{x:b.x,y:b.y}});
      cmd.pts=[];echo(`${cmd.active}: specify next through point  ·  Esc to finish`,true);
      break;
    }
    case 'CIRCLE':
      if(cmd.step===0){cmd.pts.push(p);cmd.step=1;echo('CIRCLE: specify radius (or type value)',true);}
      else{pushUndo();add({type:'circle',cx:cmd.pts[0].x,cy:cmd.pts[0].y,r:dist(cmd.pts[0],p)});endCmd();}
      break;
    case 'ARC':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo('ARC: specify second (mid) point',true);
      else if(cmd.pts.length===2)echo('ARC: specify end point',true);
      else{pushUndo();const arc=arc3(cmd.pts[0],cmd.pts[1],cmd.pts[2]);if(arc)add(arc);endCmd();}
      break;
    case 'ELLIPSE':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo('ELLIPSE: specify first axis endpoint — F8 ortho locks H/V, or type half-length',true);
      else if(cmd.pts.length===2)echo('ELLIPSE: specify the other (minor) axis distance — or type a value',true);
      else{
        pushUndo();
        const c=cmd.pts[0], ax=cmd.pts[1];
        const rx=dist(c,ax);const rot=Math.atan2(ax.y-c.y,ax.x-c.x);
        // ry = perpendicular distance from the 3rd point to the major axis
        const ry=Math.abs((p.x-c.x)*-Math.sin(rot)+(p.y-c.y)*Math.cos(rot));
        add({type:'ellipse',cx:c.x,cy:c.y,rx,ry,rot});endCmd();
      }
      break;
    case 'SPLINE':
      cmd.pts.push(p);
      echo(`SPLINE: point ${cmd.pts.length} — Enter/right-click to finish`,true);
      break;
    case 'DIMCONTINUE': case 'DIMBASELINE':
      feedDimChain(p);break;
    case 'RECT':
      if(cmd.step===0){cmd.pts.push(p);cmd.step=1;echo('RECTANGLE: pick opposite corner — or type width,height (e.g. 1000,500) or D',true);}
      else{
        const c=cmd.pts[0];
        if(cmd.data&&cmd.data.dimMode==='w'){echo('RECTANGLE: type the width value first',true);break;} // ignore clicks until width typed
        if(cmd.data&&cmd.data.dimMode==='h'){ // width locked, take height from this click
          const w=cmd.data.w; const h=p.y-c.y;
          pushUndo();add({type:'rect',x1:c.x,y1:c.y,x2:c.x+w,y2:c.y+(h||w)});endCmd();break;
        }
        pushUndo();add({type:'rect',x1:c.x,y1:c.y,x2:p.x,y2:p.y});endCmd();
      }
      break;
    case 'POLYGON':
      if(cmd.step===0){cmd.pts.push(p);cmd.step=1;echo(`POLYGON (${cmd.data.sides} sides): pick a vertex, or type the radius (center→corner)`,true);}
      else{pushUndo();add(makePolygon(cmd.pts[0],p,cmd.data.sides));endCmd();}
      break;
    case 'POINT': pushUndo();add({type:'point',x:p.x,y:p.y});echo('POINT: specify location',true);break;
    case 'TEXT':{
      const tx=p.x,ty=p.y;
      textDialog({multiline:false,init:{h:Math.round(annoText())},onOk:(props)=>{if(props.str){pushUndo();add(Object.assign({type:'text',style:doc.textStyle,x:tx,y:ty},props));}endCmd();render();updateInfo();},onCancel:()=>{endCmd();render();}});
      break;
    }
    case 'MTEXT': {
      cmd.pts.push(p);
      if(cmd.pts.length===1){echo('MTEXT: specify opposite corner of the text box',true);break;}
      // two corners -> text box; width = horizontal span (wrap width)
      const x1=Math.min(cmd.pts[0].x,cmd.pts[1].x), x2=Math.max(cmd.pts[0].x,cmd.pts[1].x);
      const yTop=Math.max(cmd.pts[0].y,cmd.pts[1].y);
      const width=Math.max(x2-x1, annoText()*2);
      const tx=x1, ty=yTop;
      textDialog({multiline:true,init:{h:Math.round(annoText())},
        onOk:(props)=>{if(props.str){pushUndo();add(Object.assign({type:'text',style:doc.textStyle,x:tx,y:ty,mtext:true,width},props));}endCmd();render();updateInfo();},
        onCancel:()=>{endCmd();render();}});
      break;
    }
    case 'STRETCH':
      if(cmd.step===0){cmd.data=cmd.data||{};cmd.data.base=p;cmd.step=1;echo('STRETCH: specify destination point',true);}
      else{commitStretch(p);}
      break;
    case 'MOVE': case 'COPY':
      if(cmd.step===0){cmd.data={base:p};cmd.step=1;echo(`${k}: specify destination point`,true);}
      else{commitMoveCopy(k,p);}
      break;
    case 'ROTATE':
      if(cmd.step===0){cmd.data={base:p};cmd.step=1;echo('ROTATE: specify rotation angle — click / type degrees, or R for Reference',true);}
      else if(cmd.data.ref){
        const r=cmd.data.ref;
        if(r.stage==='cur'){
          if(!r.p1){r.p1=p;echo('ROTATE Reference: pick the second point of the reference angle',true);}
          else{r.curAng=Math.atan2(p.y-r.p1.y,p.x-r.p1.x);r.stage='new';echo('ROTATE Reference: specify the new angle — click a point or type degrees',true);}
        } else { // new
          const newAng=Math.atan2(p.y-cmd.data.base.y,p.x-cmd.data.base.x);
          commitRotate(newAng-(r.curAng||0));
        }
      }
      else{const ang=Math.atan2(p.y-cmd.data.base.y,p.x-cmd.data.base.x);commitRotate(ang);}
      break;
    case 'SCALE':
      if(cmd.step===0){cmd.data={base:p};cmd.step=1;echo('SCALE: specify scale factor — click / type value, or R for Reference',true);}
      else if(cmd.data.ref){
        const r=cmd.data.ref;
        if(r.stage==='cur'){
          if(!r.p1){r.p1=p;echo('SCALE Reference: pick the second point of the reference length',true);}
          else{r.curLen=dist(r.p1,p)||1;r.stage='new';echo('SCALE Reference: specify the new length — click a point (from base) or type the value',true);}
        } else { // new
          const newLen=dist(cmd.data.base,p);
          if(r.curLen&&newLen>0)commitScale(newLen/r.curLen);
        }
      }
      else{const f=dist(cmd.data.base,p)/50;commitScale(f||1);}
      break;
    case 'MIRROR':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo('MIRROR: specify second point of mirror line',true);
      else{commitMirror(cmd.pts[0],cmd.pts[1]);}
      break;
    case 'OFFSET':
      if(cmd.data.dist==null){echo('OFFSET: type a distance value first, then Enter',true);break;}
      doOffset(p);break;
    case 'TRIM': doTrim(p);break;
    case 'EXTEND': doExtend(p);break;
    case 'FILLET': doFillet(p);break;
    case 'CHAMFER': doChamfer(p);break;
    case 'BREAK': doBreak(p);break;
    case 'LENGTHEN': doLengthen(p);break;
    case 'DIVIDE': doDivide(p);break;
    case 'ERASE': {const i=pickObject(p.x,p.y);if(i>=0){pushUndo();doc.objects.splice(i,1);echo('Object deleted');updateInfo();renderProps();}break;}
    case 'ALIGN': {
      cmd.pts.push(p);
      const n=cmd.pts.length;
      if(n===1)echo('ALIGN: specify FIRST destination point',true);
      else if(n===2)echo('ALIGN: specify SECOND source point (or Enter to move only)',true);
      else if(n===3)echo('ALIGN: specify SECOND destination point',true);
      else if(n===4){commitAlign(cmd.data.sel,cmd.pts);endCmd();render();updateInfo();}
      break;
    }
    case 'AREA': {
      const i=pickObject(p.x,p.y);
      if(i<0){echo('AREA: nothing there — click a closed shape',true);break;}
      const o=doc.objects[i];const info=areaOf(o);
      if(!info){echo('AREA: that object has no measurable area (needs a closed shape)',true);break;}
      echo(`AREA: ${info.area.toFixed(2)} mm²  (${(info.area/1e6).toFixed(4)} m²)  ·  Perimeter: ${info.perim.toFixed(2)} mm`);
      break;
    }
    case 'LIST': {
      const i=pickObject(p.x,p.y);
      if(i<0){echo('LIST: nothing there — click an object',true);break;}
      echo(listInfo(doc.objects[i]));
      break;
    }
    case 'MATCHPROP': {
      const i=pickObject(p.x,p.y);
      if(i<0){echo('MATCHPROP: nothing there — click an object',true);break;}
      if(!cmd.data||!cmd.data.src){
        // first click = source object whose properties we copy
        cmd.data={src:doc.objects[i]};
        echo('MATCHPROP: now click destination object(s) to paint; Esc to finish',true);
      } else {
        // subsequent clicks = destinations
        pushUndo();
        applyMatchProps(cmd.data.src,doc.objects[i]);
        echo('MATCHPROP: properties applied — click another, or Esc to finish');
        renderProps();
      }
      break;
    }
    case 'ARRAY':
      // base point not needed; we drive everything from typed values. Clicking just confirms defaults.
      commitArray();
      break;
    case 'DIM': case 'DIMALIGNED':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo(`${k==='DIM'?'LINEAR':'ALIGNED'} DIM: specify second point`,true);
      else if(cmd.pts.length===2){cmd.step=1;echo('DIM: specify dimension line offset (click where the dimension line goes)',true);}
      else{
        pushUndo();
        const off=dimOffset(cmd.pts[0],cmd.pts[1],p,k==='DIM');
        add({type:'dim',dimStyle:doc.dimStyle,dim:k==='DIM'?'linear':'aligned',layer:dimLayer(),
             x1:cmd.pts[0].x,y1:cmd.pts[0].y,x2:cmd.pts[1].x,y2:cmd.pts[1].y,off,txtH:annoText(),
             ref1:refOf(cmd.pts[0]),ref2:refOf(cmd.pts[1])});
        endCmd();render();updateInfo();
      }
      break;
    case 'DIMANGULAR': {
      const i=pickObject(p.x,p.y);if(i<0||doc.objects[i].type!=='line'){echo('ANGULAR DIM: pick a line');break;}
      if(cmd.data.first===null){cmd.data.first=i;echo('ANGULAR DIM: pick second line',true);break;}
      const a=doc.objects[cmd.data.first],b=doc.objects[i];const ip=segIntInfinite(a,b);
      if(!ip){echo('ANGULAR DIM: lines are parallel');endCmd();break;}
      const a1=Math.atan2(a.y2-a.y1,a.x2-a.x1),a2=Math.atan2(b.y2-b.y1,b.x2-b.x1);
      pushUndo();add({type:'dim',dimStyle:doc.dimStyle,dim:'angular',layer:'Dimensions',cx:ip.x,cy:ip.y,a1,a2});endCmd();render();updateInfo();
      break;
    }
    case 'DIMRADIUS': case 'DIMDIAMETER': {
      const i=pickObject(p.x,p.y);if(i<0||(doc.objects[i].type!=='circle'&&doc.objects[i].type!=='arc')){echo(`${k==='DIMRADIUS'?'RADIUS':'DIAMETER'} DIM: pick a circle or arc`);break;}
      const o=doc.objects[i];const ang=Math.atan2(p.y-o.cy,p.x-o.cx);
      pushUndo();add({type:'dim',dimStyle:doc.dimStyle,dim:k==='DIMRADIUS'?'radius':'diameter',layer:'Dimensions',cx:o.cx,cy:o.cy,r:o.r,ang,refObj:o.id});endCmd();render();updateInfo();
      break;
    }
    case 'HATCH': hatchAtPoint(p); break;
    case 'LEADER':
    case 'MLEADER':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo(`${cmd.active}: specify next point (the arrow points here) — click landing point, Enter to finish`,true);
      else echo(`${cmd.active}: specify next point, or Enter/right-click to add the text`,true);
      break;
    case 'UCS':
      cmd.pts.push(p);
      if(cmd.pts.length===1)echo('UCS: specify point on the new X-axis (or Enter to keep axis horizontal)',true);
      else{
        ucs.ox=cmd.pts[0].x;ucs.oy=cmd.pts[0].y;
        ucs.ang=Math.atan2(cmd.pts[1].y-cmd.pts[0].y,cmd.pts[1].x-cmd.pts[0].x);
        echo(`UCS set — origin (${ucs.ox.toFixed(1)}, ${ucs.oy.toFixed(1)}), rotation ${(ucs.ang*180/Math.PI).toFixed(1)}°`);
        endCmd();
      }
      break;
    case 'BLOCK':
      defineBlock(p);   // p is the base point
      break;
    case 'INSERT':
      insertBlock(cmd.data.name,p);
      break;
    case 'REFEDIT': {
      const bi=pickObject(p.x,p.y);
      if(bi<0||doc.objects[bi].type!=='block'){echo('REFEDIT: click a block instance',true);break;}
      endCmd();enterBlockEdit(bi);
      break;
    }
  }
  render();updateInfo();
}
function add(o){
  if(isDegenerate(o)){echo('Skipped a zero-size object');return;}
  if(!o.layer)o.layer=layerName();
  return pushObj(o);       // pushObj mints the id
}
// reject zero-size geometry that would be invisible but still selectable/snappable/exported
// reject zero-size geometry that would be invisible but still selectable/snappable/exported
function isDegenerate(o){return entityCall(o,'degenerate',false);}
// REVCLOUD: a closed polyline whose every segment is a small outward arc (revision-cloud look).
// Built from a rectangle defined by two opposite corners.
function makeRevCloud(c1,c2){
  const x1=Math.min(c1.x,c2.x),x2=Math.max(c1.x,c2.x),y1=Math.min(c1.y,c2.y),y2=Math.max(c1.y,c2.y);
  const w=x2-x1,h=y2-y1;if(w<1e-6||h<1e-6)return null;
  // arc chord length scales with size but stays sensible
  const arcLen=Math.max(Math.min(w,h)/4, (w+h)/24);
  const corners=[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
  const pts=[];
  for(let e=0;e<4;e++){
    const a=corners[e],b=corners[(e+1)%4];
    const segLen=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const n=Math.max(2,Math.round(segLen/arcLen));
    for(let i=0;i<n;i++){           // points along this edge (excluding the end corner; next edge adds it)
      const t=i/n;
      pts.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]);
    }
  }
  // bulge for each segment: outward arc. Rectangle is CW in screen-y? Use negative bulge for outward.
  // Determine outward sign from polygon orientation (shoelace).
  let area2=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area2+=a[0]*b[1]-b[0]*a[1];}
  const ccw=area2>0;const bulge=(ccw?-1:1)*0.5;   // ~53° arc bowing outward
  const bulges=pts.map(()=>bulge);
  const segs=segsFromBulges(pts,true,bulges);
  const o={type:'pline',closed:true,pts,revcloud:true};
  if(segs)o.segs=segs;
  return o;
}
// AREA: area + perimeter of a closed shape (or null if not measurable)
function areaOf(o){return o?entityCall(o,'area',null):null;}
// LIST: a compact one-line property summary of an object
function listInfo(o){
  if(!o)return 'LIST: nothing';
  const f=v=>(Math.round(v*100)/100);
  const lw=o.lineweight!=null?o.lineweight+'mm':'ByLayer';
  const base=`${o.type.toUpperCase()} · layer "${o.layer||'0'}" · ${o.color?('color '+o.color):'ByLayer'} · lw ${lw}`;
  if(o.type==='line')return `${base} · from (${f(o.x1)},${f(o.y1)}) to (${f(o.x2)},${f(o.y2)}) · length ${f(Math.hypot(o.x2-o.x1,o.y2-o.y1))}`;
  if(o.type==='circle')return `${base} · center (${f(o.cx)},${f(o.cy)}) · radius ${f(o.r)} · area ${f(Math.PI*o.r*o.r)}`;
  if(o.type==='arc')return `${base} · center (${f(o.cx)},${f(o.cy)}) · radius ${f(o.r)} · ${f(o.a1*180/Math.PI)}°→${f(o.a2*180/Math.PI)}°`;
  if(o.type==='rect')return `${base} · corners (${f(o.x1)},${f(o.y1)})–(${f(o.x2)},${f(o.y2)}) · ${f(Math.abs(o.x2-o.x1))}×${f(Math.abs(o.y2-o.y1))}`;
  if(o.type==='ellipse')return `${base} · center (${f(o.cx)},${f(o.cy)}) · rx ${f(o.rx)} ry ${f(o.ry)} · rot ${f((o.rot||0)*180/Math.PI)}°`;
  if(o.type==='pline'){const ar=areaOf(o);return `${base} · ${o.pts.length} vertices · ${o.closed?'closed':'open'}${ar?' · area '+f(ar.area):''}`;}
  if(o.type==='spline')return `${base} · spline · ${o.pts.length} fit points`;
  if(o.type==='text')return `${base} · ${o.mtext?'MTEXT':'TEXT'} h${f(o.h)} · "${String(o.str).slice(0,30)}"`;
  if(o.type==='dim')return `${base} · ${(o.dim||'linear')} dimension`;
  if(o.type==='hatch')return `${base} · hatch "${o.pattern}"${o.solid?' (solid)':''}`;
  if(o.type==='block')return `${base} · block "${o.name}" at (${f(o.x)},${f(o.y)})`;
  if(o.type==='point')return `${base} · point (${f(o.x)},${f(o.y)})`;
  if(o.type==='leader')return `${base} · ${o.mleader?'mleader':'leader'} · "${String(o.str||'').slice(0,30)}"`;
  return base;
}
// MATCHPROP: copy general properties from a source object onto a destination object.
function applyMatchProps(src,dst){
  if(!src||!dst||src===dst)return;
  dst.layer=src.layer;
  // color / lineweight / linetype: copy if source has an override, else clear to ByLayer
  if(src.color!=null)dst.color=src.color; else delete dst.color;
  if(src.lineweight!=null)dst.lineweight=src.lineweight; else delete dst.lineweight;
  if(src.linetype!=null)dst.linetype=src.linetype; else delete dst.linetype;
  // text-specific: height, font, style flags (only when both are text)
  if(dst.type==='text'&&src.type==='text'){
    if(src.h!=null)dst.h=src.h;
    if(src.font!=null)dst.font=src.font;
    dst.bold=src.bold;dst.italic=src.italic;
    if(src.align!=null)dst.align=src.align;
  }
}

