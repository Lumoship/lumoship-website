// ============================================================
//  LumoCAD — block definition, insert, in-place block edit (REFEDIT)
// ============================================================
function startBlockDefinition(){
  inputDialog({
    title:'Create Block', label:'Block name',
    value:'Block'+(Object.keys(doc.blocks).length+1),
    onOk:(name)=>{
      if(!name||!name.trim()){echo('BLOCK: cancelled');endCmd();render();return;}
      cmd.active='BLOCK';cmd.data={name:name.trim()};cmd.step=0;
      echo(`BLOCK "${name.trim()}": specify base point (insertion handle)`,true);render();
    },
    onCancel:()=>{echo('BLOCK: cancelled');endCmd();render();}
  });
}
// Step 2 of BLOCK: base point picked -> store definition relative to base, replace selection with an instance.
function defineBlock(base){
  const name=cmd.data.name;
  const objs=selObjects().map(cloneObj);
  if(!objs.length){echo('BLOCK: nothing selected');endCmd();return;}
  // store geometry relative to the base point so it can be placed anywhere
  const rel=objs.map(o=>{const c=cloneObj(o);delete c.id;translateObj(c,-base.x,-base.y);return c;});
  pushUndo();
  doc.blocks[name]={base:{x:0,y:0},objects:rel};
  // remove the original loose objects and drop one block instance in their place
  idsToIndices(selection).forEach(i=>doc.objects.splice(i,1));
  pushObj({type:'block',name,x:base.x,y:base.y,layer:layerName(),sx:1,sy:1,rot:0});
  selection.clear();
  echo(`Block "${name}" defined (${rel.length} object(s)). Use INSERT to place more.`);
  endCmd();renderProps();render();updateInfo();
}
// expand a block instance into world-space copies of its definition objects
function blockInstanceObjects(inst){
  const def=doc.blocks[inst.name];if(!def)return[];
  const sx=inst.sx==null?1:inst.sx, sy=inst.sy==null?1:inst.sy, rot=inst.rot||0;
  return def.objects.map(o=>{
    const c=copyObj(o);
    if(sx!==1||sy!==1)scaleObjXY(c,0,0,sx,sy);   // scale about the block's own origin
    if(rot)rotateObj(c,0,0,rot);                 // then rotate
    translateObj(c,inst.x,inst.y);               // then place
    if(!c.layer)c.layer=inst.layer;
    return c;
  });
}

// ============================================================
//  REFEDIT — edit a block's contents in place
//  Enter: the chosen instance is exploded into live, editable objects (tagged _refedit);
//         everything else on screen is ghosted. Edit freely (move/draw/erase/etc).
//  Save (REFCLOSE): the edited objects are written back into the block definition (relative to
//         the instance's base), so EVERY instance of that block updates. Other instances reappear.
//  Cancel: edits are discarded and the drawing reverts.
// ============================================================
function enterBlockEdit(instIdx){
  if(editingBlock){echo('Already editing a block — close it first (REFCLOSE)');return;}
  const inst=doc.objects[instIdx];
  if(!inst||inst.type!=='block'){echo('REFEDIT: select a block first');return;}
  const def=doc.blocks[inst.name];if(!def){echo('REFEDIT: block definition missing');return;}
  pushUndo();
  cancelCommand(true);selection.clear();
  const base={x:inst.x,y:inst.y};
  // explode this instance into live objects at the instance position
  const parts=blockInstanceObjects(inst).map(o=>{o._refedit=true;return o;});
  // remove the instance we're entering (its parts now stand in for it)
  doc.objects.splice(instIdx,1);
  parts.forEach(o=>pushObj(o));
  editingBlock={name:inst.name, base};
  showRefeditBanner(inst.name);
  echo(`Editing block "${inst.name}" — edit its parts, then click Save (or type REFCLOSE)`);
  renderProps();render();updateInfo();
}
function saveBlockEdit(){
  if(!editingBlock)return;
  const {name,base}=editingBlock;
  // gather the edited parts, store them back relative to the base
  const parts=doc.objects.filter(o=>o._refedit);
  const rel=parts.map(o=>{const c=cloneObj(o);delete c._refedit;delete c.id;translateObj(c,-base.x,-base.y);return c;});
  pushUndo();
  doc.blocks[name]={base:{x:0,y:0},objects:rel};
  // remove the live edit parts
  for(let i=doc.objects.length-1;i>=0;i--)if(doc.objects[i]._refedit)doc.objects.splice(i,1);
  // put the edited instance back where we entered it
  pushObj({type:'block',name,x:base.x,y:base.y,layer:layerName(),sx:1,sy:1,rot:0});
  editingBlock=null;hideRefeditBanner();selection.clear();
  echo(`Saved changes to block "${name}" — all instances updated`);
  renderProps();render();updateInfo();
}
function cancelBlockEdit(){
  if(!editingBlock)return;
  const {name,base}=editingBlock;
  // drop edit parts, restore the original instance unchanged
  for(let i=doc.objects.length-1;i>=0;i--)if(doc.objects[i]._refedit)doc.objects.splice(i,1);
  pushObj({type:'block',name,x:base.x,y:base.y,layer:layerName(),sx:1,sy:1,rot:0});
  editingBlock=null;hideRefeditBanner();selection.clear();
  echo(`Cancelled editing "${name}" — no changes made`);
  renderProps();render();updateInfo();
}
// floating banner shown while in block-edit mode, with Save / Cancel buttons
function showRefeditBanner(name){
  hideRefeditBanner();
  const el=document.createElement('div');el.id='refeditBanner';
  el.style.cssText='position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:500;display:flex;align-items:center;gap:14px;background:rgba(17,24,39,0.96);border:1px solid var(--accent);border-radius:10px;padding:9px 14px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:var(--font-body)';
  el.innerHTML=`<span style="font-size:13px;color:var(--text-primary)">Editing block <b style="color:var(--accent)">${name}</b></span>
    <button id="refSave" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-family:var(--font-display);font-size:12px;cursor:pointer">Save & Close</button>
    <button id="refCancel" style="padding:6px 12px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer">Cancel</button>`;
  document.body.appendChild(el);
  el.querySelector('#refSave').onclick=()=>saveBlockEdit();
  el.querySelector('#refCancel').onclick=()=>cancelBlockEdit();
}
function hideRefeditBanner(){const el=document.getElementById('refeditBanner');if(el)el.remove();}
// place a block instance
function insertBlock(name,at){
  pushUndo();
  pushObj({type:'block',name,x:at.x,y:at.y,layer:layerName(),sx:1,sy:1,rot:0});
  echo(`Inserted "${name}"`);endCmd();renderProps();render();updateInfo();
}


// ---- offset ----
