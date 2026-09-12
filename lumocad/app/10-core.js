// ============================================================
//  LumoCAD — core state: document, view, UCS, undo/redo, world<->screen
// ============================================================
// ============================================================
//  LumoCAD v0.2 — 2D drawing engine prototype
// ============================================================
const cv=document.getElementById('cv'), ctx=cv.getContext('2d'), wrap=document.getElementById('canvas-wrap');
const view={ox:0,oy:0,scale:1}; let W=0,H=0,DPR=window.devicePixelRatio||1;
// User Coordinate System: an origin + rotation laid over world coords.
// World data is always stored in WCS; UCS only changes what the user types/sees.
const ucs={ox:0,oy:0,ang:0};   // ang in radians
// convert a UCS point (what the user types) -> world point (how it's stored)
function ucs2world(x,y){const c=Math.cos(ucs.ang),s=Math.sin(ucs.ang);return{x:ucs.ox+x*c-y*s,y:ucs.oy+x*s+y*c};}
// convert a world point -> UCS coordinates (what we display)
function world2ucs(x,y){const c=Math.cos(ucs.ang),s=Math.sin(ucs.ang),dx=x-ucs.ox,dy=y-ucs.oy;return{x:dx*c+dy*s,y:-dx*s+dy*c};}
function ucsActive(){return ucs.ox!==0||ucs.oy!==0||ucs.ang!==0;}

const doc={
  objects:[],
  layers:[
    {name:'Layer 1',color:'#3b82f6',on:true,frozen:false,locked:false,plot:true,linetype:'Continuous',lineweight:0.35},
  ],
  activeLayer:0,
  blocks:{},   // name -> {base:{x,y}, objects:[...]}  block definitions
  // Named styles, the way AutoCAD carries them. An object stores only what it overrides; the
  // rest is read from its style, so restyling a drawing is one edit rather than hundreds.
  // A height of 0 means "follow the annotation scale", which is AutoCAD's variable height.
  textStyles:{Standard:{font:'monospace',h:0,bold:false,italic:false,widthFactor:1,oblique:0}},
  dimStyles:{Standard:{txtH:0,arrow:'closed',arrowSize:9,extOffset:1.0,extExt:1.25,dimLineExt:0,
                       precision:1,prefix:'',suffix:'',textPos:'above'}},
  textStyle:'Standard',   // the style new text is created with
  dimStyle:'Standard',    // the style new dimensions are created with
};
// ---- stable object identity ----
// Almost every editing command splices doc.objects, which shifts the array position of
// everything after the cut. So nothing that has to name an object across an edit may store
// an index: selections and hatch boundaries store `id`, and resolve to a position only at
// the moment they touch the array.
let nextObjId=1;
function newId(){return nextObjId++;}
// Give an id to anything that arrived without one (DXF import, EXPLODE, ARRAY, block
// expansion, an .lcad file written before ids existed) and keep the counter clear of them.
function ensureIds(list){
  const arr=list||doc.objects;
  for(const o of arr){
    if(!o)continue;
    if(!o.id)o.id=nextObjId++;
    else if(o.id>=nextObjId)nextObjId=o.id+1;
  }
  return arr;
}
// id -> array position. The map is rebuilt whenever it can no longer be trusted: the array
// changed length, or the slot it points at no longer holds that id. That covers every splice
// in the app without asking each call site to remember to invalidate.
let _idMap=null,_idMapCount=-1;
function _rebuildIdMap(){_idMap=new Map();for(let i=0;i<doc.objects.length;i++){const o=doc.objects[i];if(o&&o.id!=null)_idMap.set(o.id,i);}_idMapCount=doc.objects.length;}
function idIndex(id){
  if(id==null)return -1;
  if(!_idMap||_idMapCount!==doc.objects.length)_rebuildIdMap();
  let i=_idMap.get(id);
  if(i==null||!doc.objects[i]||doc.objects[i].id!==id){_rebuildIdMap();i=_idMap.get(id);}
  return (i==null)?-1:i;
}
function byId(id){const i=idIndex(id);return i<0?null:doc.objects[i];}
// The only way geometry enters the document. add() checks for degeneracy first; the editing
// commands that rebuild geometry (trim, break, explode, array...) come straight here.
// A fresh id is minted both for an object that has none and for one whose id is already
// taken - COPY/MIRROR/ARRAY and block expansion all push deep clones that still carry the
// source's id, and two objects sharing an id would break selection and hatch hosting.
// The append keeps the id map current instead of invalidating it, so pushing n objects in a
// row (ARRAY, EXPLODE, a DXF import) stays linear rather than rebuilding the map each time.
function pushObj(o){
  if(o&&(o.id==null||idIndex(o.id)>=0))o.id=newId();
  doc.objects.push(o);
  if(o&&_idMap&&_idMapCount===doc.objects.length-1){_idMap.set(o.id,doc.objects.length-1);_idMapCount=doc.objects.length;}
  return o;
}
// the id of the object at an array position, minting one if some path missed pushObj
function idAt(i){const o=doc.objects[i];if(!o)return null;if(!o.id)o.id=newId();return o.id;}
// ids -> positions, highest first, so a caller can splice them out without shifting the rest
function idsToIndices(ids){return [...ids].map(idIndex).filter(i=>i>=0).sort((a,b)=>b-a);}
// the selected objects themselves, in selection order, skipping anything already gone
function selObjects(){return [...selection].map(byId).filter(Boolean);}

const undoStack=[], redoStack=[];
let editingBlock=null;   // {name, base:{x,y}} while editing a block's contents in place (REFEDIT)
let settings={snap:true,ortho:true,grid:true,polar:true,pickfirst:true,cursorSize:8,dynInput:true};
// Annotation scale: geometry is drawn 1:1 (mm). Annotations (text, dims, arrows, leaders)
// are sized = paper-size × scale, so they print at the standard paper size.
let annoScale=50;            // current drawing scale denominator (1:50)
let gridSize=0;              // grid spacing in mm; 0 = automatic (zoom-based)
const ANNO_PAPER={text:2.5, arrow:2.5, gap:1.0, ext:1.25};  // target sizes in mm on paper
const SCALE_LIST=[10,20,25,50,100,125,150,200,250];
function annoText(){return ANNO_PAPER.text*annoScale;}   // model-space text height
function annoArrow(){return ANNO_PAPER.arrow*annoScale;} // model-space arrowhead length
let osnap={end:true,mid:true,center:true,quad:true,perp:true,node:true,nearest:true,intersection:true};

// A full-document snapshot for undo/redo. Capturing only doc.objects meant layer edits,
// active-layer changes, block-definition edits and the annotation scale couldn't be undone.
function snapshotState(){
  return JSON.stringify({
    objects:doc.objects,
    layers:doc.layers,
    activeLayer:doc.activeLayer,
    blocks:doc.blocks,
    textStyles:doc.textStyles,
    dimStyles:doc.dimStyles,
    textStyle:doc.textStyle,
    dimStyle:doc.dimStyle,
    annoScale
  });
}
function restoreState(json){
  const s=JSON.parse(json);
  doc.objects=s.objects||[];
  if(s.layers)doc.layers=s.layers;
  if(s.activeLayer!=null)doc.activeLayer=Math.max(0,Math.min(s.activeLayer|0,(s.layers||doc.layers).length-1));
  if(s.blocks)doc.blocks=s.blocks;
  if(s.textStyles)doc.textStyles=s.textStyles;
  if(s.dimStyles)doc.dimStyles=s.dimStyles;
  if(s.textStyle)doc.textStyle=s.textStyle;
  if(s.dimStyle)doc.dimStyle=s.dimStyle;
  if(s.annoScale!=null)annoScale=s.annoScale;
  _layerMap=null;                 // layer list may have changed -> drop cache
  _idMap=null;                    // whole array was replaced -> drop the id index
  // ensureIds only ever raises the counter, so undoing back past a creation can never
  // hand a later object an id that is still referenced somewhere in the redo stack.
  ensureIds();
}
// Undo is still a full-document snapshot per step, which is honest but not cheap: measured at
// 20 000 objects a snapshot costs ~17 ms and ~1.6 MB, so a 120-deep stack was ~200 MB. Until
// this becomes a delta log the stack is bounded by MEMORY as well as by depth — a big drawing
// keeps fewer steps rather than eating the tab.
const UNDO_MAX_STEPS=120;    // plenty on a normal drawing
const UNDO_MIN_STEPS=10;     // never trim below this, however large the drawing
const UNDO_MAX_BYTES=64*1024*1024;
function trimUndoStack(st){
  while(st.length>UNDO_MAX_STEPS)st.shift();
  let bytes=0;for(const s of st)bytes+=s.length*2;      // JS strings are UTF-16
  while(st.length>UNDO_MIN_STEPS&&bytes>UNDO_MAX_BYTES){bytes-=st[0].length*2;st.shift();}
}
function undoStackBytes(){let n=0;for(const s of undoStack)n+=s.length*2;for(const s of redoStack)n+=s.length*2;return n;}
// Every mutating command calls this before it changes anything, so it doubles as the
// document-changed signal that drives the dirty flag and the autosave timer.
function pushUndo(){undoStack.push(snapshotState());redoStack.length=0;trimUndoStack(undoStack);bumpGeom();if(typeof onDocumentChanged==='function')onDocumentChanged();}
function popUndoQuiet(){if(undoStack.length)undoStack.pop();}
function undo(){if(!undoStack.length){echo('Nothing to undo');return;}redoStack.push(snapshotState());trimUndoStack(redoStack);restoreState(undoStack.pop());selection.clear();bumpGeom();render();updateInfo();renderProps();updateLayerChip&&updateLayerChip();renderLayers&&renderLayers();onDocumentChanged();echo('Undone');}
function redo(){if(!redoStack.length){echo('Nothing to redo');return;}undoStack.push(snapshotState());trimUndoStack(undoStack);restoreState(redoStack.pop());selection.clear();bumpGeom();render();updateInfo();renderProps();updateLayerChip&&updateLayerChip();renderLayers&&renderLayers();onDocumentChanged();echo('Redone');}

function w2s(x,y){return{x:view.ox+x*view.scale,y:view.oy-y*view.scale};}
function s2w(px,py){return{x:(px-view.ox)/view.scale,y:(view.oy-py)/view.scale};}

function resize(){W=wrap.clientWidth;H=wrap.clientHeight;DPR=window.devicePixelRatio||1;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0);if(view.ox===0&&view.oy===0){view.ox=W*0.5;view.oy=H*0.5;}render();}

