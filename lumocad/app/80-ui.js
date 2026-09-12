// ============================================================
//  LumoCAD — ribbon, layer manager, properties palette
// ============================================================
const ICON={
  STYLE:'<path d="M5 6V4h14v2M12 4v16M9 20h6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  DIMSTYLE:'<path d="M3 16h18M5 13v6M19 13v6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h8M10 5l-2 3 2 3M14 5l2 3-2 3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  ZOOM:'<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 16l5 5M8 11h6M11 8v6" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  PAN:'<path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.5"/><path d="M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  REGEN:'<path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  REDRAW:'<path d="M4 12a8 8 0 1 0 2.3-5.7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 4v5h5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  ID:'<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" stroke-width="1.6"/>',
  PURGE:'<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  COPYCLIP:'<rect x="9" y="3" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15 21H4.5A1.5 1.5 0 0 1 3 19.5V8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  CUTCLIP:'<circle cx="6" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 16L18 4M16 16L6 4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  PASTECLIP:'<rect x="5" y="4" width="14" height="17" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="2" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  DIST:'<path d="M4 12h16M4 9v6M20 9v6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  NEW:'<path d="M6 3h7l5 5v13H6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 3v5h5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  OPEN:'<path d="M3 7h6l2 2h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  SAVE:'<path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4v6h7V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  SAVEAS:'<path d="M5 4h11l3 3v9H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4v5h7V4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 21l2-.5 5-5-1.5-1.5-5 5z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  LINE:'<line x1="3" y1="19" x2="19" y2="5" stroke="currentColor" stroke-width="2"/><circle cx="3" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/>',
  PLINE:'<polyline points="3,18 8,9 13,14 21,5" fill="none" stroke="currentColor" stroke-width="2"/>',
  CIRCLE:'<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  ARC:'<path d="M4 18 A11 11 0 0 1 20 8" fill="none" stroke="currentColor" stroke-width="2"/>',
  ELLIPSE:'<ellipse cx="12" cy="12" rx="9" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  SPLINE:'<path d="M3 17c4 0 4-10 8-10s4 10 8 6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  RECT:'<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2"/>',
  POLYGON:'<polygon points="12,3 21,9 17,20 7,20 3,9" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  POINT:'<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="currentColor" stroke-width="1.5"/>',
  XLINE:'<path d="M2 18L22 6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="9" cy="13.2" r="1.6" fill="currentColor"/><circle cx="15" cy="9.6" r="1.6" fill="currentColor"/>',
  RAY:'<path d="M5 18L22 7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="5" cy="18" r="2" fill="currentColor"/>',
  REVCLOUD:'<path d="M6 14a3 3 0 01.3-5.9 3.5 3.5 0 016.7-1.6A3 3 0 0117 8a3 3 0 01.5 6H6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  SHEET:'<rect x="3" y="5" width="18" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="5" y="7" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1"/><rect x="13" y="13" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1"/>',
  TEXT:'<path d="M5 6h14M12 6v13" stroke="currentColor" stroke-width="2" fill="none"/>',
  MOVE:'<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  COPY:'<rect x="4" y="4" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="9" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  ROTATE:'<path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  SCALE:'<path d="M5 19V9M5 19h10" stroke="currentColor" stroke-width="1.8" fill="none"/><rect x="13" y="5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 9l4-4" stroke="currentColor" stroke-width="1.5"/>',
  MIRROR:'<path d="M12 3v18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M9 7L4 12l5 5z M15 7l5 5-5 5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  OFFSET:'<rect x="6" y="6" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2"/>',
  TRIM:'<path d="M4 8l16 8M4 16l16-8" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="7" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  EXTEND:'<path d="M3 12h13M16 8l4 4-4 4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M20 5v14" stroke="currentColor" stroke-width="1.4"/>',
  FILLET:'<path d="M5 19V11a6 6 0 0 1 6-6h8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  CHAMFER:'<path d="M5 19V12l7-7h7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  BREAK:'<path d="M3 12h6M15 12h6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8l-2 8M16 8l-2 8" stroke="currentColor" stroke-width="1.3"/>',
  LENGTHEN:'<path d="M3 12h14M13 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  DIVIDE:'<path d="M3 12h18" stroke="currentColor" stroke-width="1.5"/><path d="M8 9v6M16 9v6" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="12" r="1.4" fill="currentColor"/><circle cx="16" cy="12" r="1.4" fill="currentColor"/>',
  ERASE:'<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  ARRAY:'<rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="14" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  DIM:'<path d="M3 12h18M3 9v6M21 9v6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  DIMCONTINUE:'<path d="M3 12h18M3 9v6M11 9v6M21 9v6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  DIMBASELINE:'<path d="M3 8h14M3 14h10M3 6v12" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  HATCH:'<rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 17L17 7M11 17L17 11M7 13L13 7" stroke="currentColor" stroke-width="1"/>',
  DIMALIGNED:'<path d="M4 20L20 4M4 16v4h4M16 4h4v4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  DIMANGULAR:'<path d="M4 20h16M4 20L16 6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 20a10 10 0 0 1 4-7" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  DIMRADIUS:'<circle cx="11" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 13L21 3" stroke="currentColor" stroke-width="1.6"/>',
  DIMDIAMETER:'<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="1.6"/>',
  MEASURE:'<path d="M3 17L17 3l4 4L7 21z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2" stroke="currentColor" stroke-width="1.3"/>',
  LEADER:'<path d="M3 20l7-7M10 13l-1.5 0.5L9 12z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 13h6M16 9v8" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  MLEADER:'<path d="M3 19l6-5M9 14l-1.4 0.4L8.6 13z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 14h5M14 14h7M14 8v12" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  STRETCH:'<path d="M4 12h7m2 0h7M4 9v6M20 9v6M11 8l2 4-2 4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  JOIN:'<path d="M4 8a6 6 0 0 1 6 6M20 16a6 6 0 0 0-6-6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  EXPLODE:'<path d="M12 12l5-7M12 12l7 3M12 12l-3 7M12 12l-6-2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  MATCHPROP:'<path d="M14 4l6 6-7 7-6-6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 11l-3 6 6-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  ALIGN:'<path d="M4 7h7M4 7l2-2M4 7l2 2M20 17h-7M20 17l-2-2M20 17l-2 2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="7" r="1.5" fill="currentColor"/><circle cx="11" cy="17" r="1.5" fill="currentColor"/>',
  OSNAP:'<rect x="6" y="6" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3" stroke="currentColor" stroke-width="1.5"/>',
  PICKFIRST:'<rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2"/><path d="M12 12l7 3-2.6 1.1L18 20l-2 0.9-1.6-3.6L12 19z" fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/>',
  UNDO:'<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  REDO:'<path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  ZOOMEXT:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  SELECTALL:'<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M8 12l3 3 5-6" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  LAYER:'<path d="M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  DXFOUT:'<path d="M12 3v11M12 14l-4-4M12 14l4-4M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  DXFIN:'<path d="M12 14V3M12 3L8 7M12 3l4 4M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  PDFOUT:'<rect x="5" y="3" width="14" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.3"/>',
  ANNOSCALE:'<path d="M3 8h18v8H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8v4M11 8v3M15 8v4M19 8v3" stroke="currentColor" stroke-width="1.2"/>',
  GRIDSET:'<path d="M3 3h18v18H3z M9 3v18M15 3v18M3 9h18M3 15h18" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  CURSORSIZE:'<path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="10" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  MTEXT:'<path d="M4 5h16M4 5v2M20 5v2M12 5v14M9 19h6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  REGION:'<path d="M5 8c0-2 2-3 5-3s5 2 7 1M4 14c2 2 5 1 8 2s5 1 7-1M5 8v6M19 9v4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2"/>',
  MASSPROP:'<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 6v3M12 15v3M6 12h3M15 12h3" stroke="currentColor" stroke-width="1.3"/>',
  AREA:'<path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 6l16 12" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>',
  LIST:'<path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="4" cy="6" r="1.3" fill="currentColor"/><circle cx="4" cy="12" r="1.3" fill="currentColor"/><circle cx="4" cy="18" r="1.3" fill="currentColor"/>',
  UCS:'<path d="M5 19V5M5 19h14M5 19l-2-2M5 19l2-2M19 19l-2-2M19 19l-2 2" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="14" y="11" font-size="6" fill="currentColor">y</text>',
  UCSWORLD:'<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="1.1"/>',
  BLOCK:'<rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  INSERT:'<rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.4"/>',
};
// The ribbon is tabbed, the way AutoCAD's is, and for the same reason: laid out flat it came
// to 2185 px on a 1920 px screen, so the Output group sat off the end behind a scrollbar.
// Each tab now fits at 1366 px with room to spare. A group shows its `primary` commands and
// keeps the rest one click away in the flyout under its label.
const RIBBON_TABS=[
  {tab:'Home',groups:[
    {label:'Draw',primary:['LINE','PLINE','CIRCLE','ARC','RECT'],
     keys:['LINE','PLINE','CIRCLE','ARC','RECT','ELLIPSE','SPLINE','POLYGON','POINT','XLINE','RAY','REVCLOUD']},
    {label:'Modify',primary:['MOVE','COPY','ROTATE','TRIM','OFFSET'],
     keys:['MOVE','COPY','ROTATE','TRIM','OFFSET','SCALE','MIRROR','EXTEND','STRETCH','ERASE']},
    {label:'Layers',primary:['LAYER','LAYISO','LAYFRZ','LAYLCK'],
     keys:['LAYER','LAYISO','LAYUNISO','LAYFRZ','LAYTHW','LAYLCK','LAYULK','LAYOFF','LAYON','LAYMCUR']},
    {label:'Block',primary:['BLOCK','INSERT','EXPLODE'],keys:['BLOCK','INSERT','REFEDIT','EXPLODE']},
    {label:'Clipboard',primary:['COPYCLIP','PASTECLIP'],keys:['COPYCLIP','CUTCLIP','PASTECLIP']},
  ]},
  {tab:'Annotate',groups:[
    {label:'Text',primary:['TEXT','MTEXT'],keys:['TEXT','MTEXT']},
    {label:'Dimensions',primary:['DIM','DIMALIGNED','DIMANGULAR','DIMRADIUS','DIMDIAMETER'],
     keys:['DIM','DIMALIGNED','DIMANGULAR','DIMRADIUS','DIMDIAMETER','DIMCONTINUE','DIMBASELINE']},
    {label:'Leaders',primary:['LEADER','MLEADER'],keys:['LEADER','MLEADER']},
    {label:'Fill',primary:['HATCH','REGION'],keys:['HATCH','REGION']},
    {label:'Styles',primary:['STYLE','DIMSTYLE'],keys:['STYLE','DIMSTYLE']},
    {label:'Sheet',primary:['SHEET','ANNOSCALE'],keys:['SHEET','ANNOSCALE']},
  ]},
  {tab:'Modify',groups:[
    {label:'Corners',primary:['FILLET','CHAMFER'],keys:['FILLET','CHAMFER']},
    {label:'Length',primary:['BREAK','LENGTHEN','JOIN'],keys:['BREAK','LENGTHEN','JOIN']},
    {label:'Pattern',primary:['ARRAY','DIVIDE','MEASURE'],keys:['ARRAY','DIVIDE','MEASURE']},
    {label:'Arrange',primary:['ALIGN','MATCHPROP','SELECTALL'],keys:['ALIGN','MATCHPROP','SELECTALL','PURGE']},
  ]},
  {tab:'View',groups:[
    {label:'Navigate',primary:['ZOOM','PAN','ZOOMEXT','REGEN'],keys:['ZOOM','PAN','ZOOMEXT','REGEN','REDRAW']},
    {label:'Coordinates',primary:['UCS','UCSWORLD'],keys:['UCS','UCSWORLD']},
    {label:'Inquiry',primary:['DIST','AREA','LIST','MASSPROP'],keys:['DIST','ID','AREA','LIST','MASSPROP']},
    {label:'Drafting',primary:['OSNAP','GRIDSET','CURSORSIZE','PICKFIRST'],
     keys:['OSNAP','GRIDSET','CURSORSIZE','PICKFIRST','ANNOSCALE']},
  ]},
  {tab:'Output',groups:[
    {label:'Import',primary:['DXFIN'],keys:['DXFIN']},
    {label:'Export',primary:['DXFOUT','PDFOUT'],keys:['DXFOUT','PDFOUT']},
    {label:'Drawing',primary:['NEW','OPEN','SAVE','SAVEAS'],keys:['NEW','OPEN','SAVE','SAVEAS']},
  ]},
];
const ribbonEl=document.getElementById('ribbon');
const ribbonTabsEl=document.getElementById('ribbonTabs');
// flyout panel (drops down)
const flyout=document.createElement('div');flyout.id='ribbonFlyout';document.getElementById('app').appendChild(flyout);
let flyoutGroup=null;
const RB_SHORT={SAVEAS:'Save As',STYLE:'Text Style',DIMSTYLE:'Dim Style',LAYFRZ:'Freeze',LAYTHW:'Thaw All',LAYLCK:'Lock',LAYULK:'Unlock',LAYOFF:'Layer Off',LAYON:'Layers On',LAYISO:'Isolate',LAYUNISO:'Un-isolate',LAYMCUR:'Set Current',RECT:'Rectangle',COPYCLIP:'Copy',CUTCLIP:'Cut',PASTECLIP:'Paste',ZOOMEXT:'Extents',PICKFIRST:'Pick First',OSNAP:'Osnap',ANNOSCALE:'Scale',GRIDSET:'Grid',CURSORSIZE:'Crosshair',DXFIN:'Import DXF',DXFOUT:'Export DXF',PDFOUT:'Plot PDF',SELECTALL:'Select All',UCSWORLD:'World',MASSPROP:'Mass Prop',DIMALIGNED:'Aligned',DIMANGULAR:'Angular',DIMRADIUS:'Radius',DIMDIAMETER:'Diameter',DIMCONTINUE:'Continue',DIMBASELINE:'Baseline',MATCHPROP:'Match',REFEDIT:'Edit Block'};
function buildRbButton(k){
  const c=COMMANDS[k];
  const b=document.createElement('div');b.className='rb';b.dataset.key=k;
  const alias=(c.aliases||[]).filter(a=>a!==k).sort((a,b)=>a.length-b.length)[0];
  b.title=c.name+(alias?'   ('+alias+')':'');
  b.innerHTML='<svg viewBox="0 0 24 24">'+(ICON[k]||'')+'</svg><span>'+(RB_SHORT[k]||c.name)+'</span>';
  return b;
}
function buildRibbonPanel(tab){
  const panel=document.createElement('div');
  panel.className='ribbon-panel';panel.dataset.tab=tab.tab;
  tab.groups.forEach(g=>{
    const grp=document.createElement('div');grp.className='ribbon-group';
    const tools=document.createElement('div');tools.className='ribbon-tools';
    const shown=g.primary||g.keys;
    shown.forEach(k=>{
      if(!COMMANDS[k])return;               // a group may name a command this build lacks
      const b=buildRbButton(k);b.onclick=()=>startCommand(k);tools.appendChild(b);
    });
    const lab=document.createElement('div');lab.className='ribbon-label';
    const hasMore=g.keys.length>shown.length;
    lab.innerHTML='<span>'+g.label+'</span>'+(hasMore?'<span class="exp">\u2304</span>':'');
    if(hasMore)lab.onclick=()=>toggleFlyout(g,lab);
    grp.appendChild(tools);grp.appendChild(lab);panel.appendChild(grp);
  });
  return panel;
}
let activeRibbonTab=RIBBON_TABS[0].tab;
function showRibbonTab(name){
  activeRibbonTab=name;
  closeFlyout();
  ribbonTabsEl.querySelectorAll('.ribbon-tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===name));
  ribbonEl.querySelectorAll('.ribbon-panel').forEach(p=>p.classList.toggle('on',p.dataset.tab===name));
}
RIBBON_TABS.forEach(tab=>{
  const t=document.createElement('div');
  t.className='ribbon-tab';t.dataset.tab=tab.tab;t.textContent=tab.tab;
  t.onclick=()=>showRibbonTab(tab.tab);
  ribbonTabsEl.appendChild(t);
  ribbonEl.appendChild(buildRibbonPanel(tab));
});
showRibbonTab(activeRibbonTab);

function toggleFlyout(g,labEl){
  const isOpen=flyoutGroup===g.label&&flyout.classList.contains('open');
  document.querySelectorAll('.ribbon-label').forEach(l=>l.classList.remove('expanded'));
  if(isOpen){flyout.classList.remove('open');flyoutGroup=null;return;}
  flyoutGroup=g.label;labEl.classList.add('expanded');
  const shown=g.primary||g.keys;
  const extras=g.keys.filter(k=>!shown.includes(k));   // only commands NOT already on the ribbon
  flyout.innerHTML=`<div class="fly-title">${g.label} — More${'<span class="fly-close" id="flyClose">✕</span>'}</div><div class="fly-grid" id="flyGrid"></div>`;
  const fg=flyout.querySelector('#flyGrid');
  extras.forEach(k=>{const b=buildRbButton(k);b.onclick=()=>{startCommand(k);closeFlyout();};fg.appendChild(b);});
  flyout.querySelector('#flyClose').onclick=closeFlyout;
  flyout.classList.add('open');
  // position the flyout directly under the group it belongs to
  const grpEl=labEl.parentElement;
  const grpRect=grpEl.getBoundingClientRect();
  // let it be at least as wide as the group, but size to its content otherwise
  flyout.style.minWidth=Math.round(grpRect.width)+'px';
  flyout.style.left='0px';                          // measure natural width at 0
  const flyW=flyout.offsetWidth;
  let left=grpRect.left;
  const maxLeft=window.innerWidth-flyW-12;          // keep on screen
  if(left>maxLeft)left=Math.max(12,maxLeft);
  flyout.style.left=left+'px';
}
function closeFlyout(){flyout.classList.remove('open');flyoutGroup=null;document.querySelectorAll('.ribbon-label').forEach(l=>l.classList.remove('expanded'));}
// close flyout when clicking on the canvas
document.getElementById('canvas-wrap').addEventListener('mousedown',()=>{if(flyout.classList.contains('open'))closeFlyout();});
function setActiveTool(key){document.querySelectorAll('.rb').forEach(el=>el.classList.toggle('active',el.dataset.key===key));}

// command reference (right panel)
const cmdRef=document.getElementById('cmdRef');
function renderCmdRef(){
  let html='';
  // Walk the tabs, and list every command once — a few appear on more than one tab.
  const listed=new Set();
  RIBBON_TABS.forEach(tab=>{
    tab.groups.forEach(g=>{
      const keys=g.keys.filter(k=>COMMANDS[k]&&!listed.has(k));
      if(!keys.length)return;
      html+=`<div class="prop-type">${tab.tab} &middot; ${g.label}</div>`;
      keys.forEach(k=>{
        listed.add(k);
        const c=COMMANDS[k];
        const alias=(c.aliases||[]).filter(a=>a!==k).sort((a,b)=>a.length-b.length)[0]||k;
        html+=`<div class="prop-row" style="cursor:pointer" data-k="${k}"><label>${c.name}</label><span class="pval" style="color:var(--accent)">${alias}</span></div>`;
      });
    });
  });
  cmdRef.innerHTML=html;
  cmdRef.querySelectorAll('[data-k]').forEach(el=>el.onclick=()=>{startCommand(el.dataset.k);document.getElementById('right').classList.remove('open');});
}

// ============================================================
//  LAYERS
// ============================================================
//  LAYER MANAGER (modal dialog, opened via the LAYER command)
// ============================================================
const PALETTE=['#3b82f6','#ef4444','#f59e0b','#22c55e','#06b6d4','#a855f7','#ec4899','#f1f5f9','#eab308','#14b8a6'];
function renderLayers(){ // refreshes the open layer dialog if present, and the active-layer chip
  updateLayerChip();
  const dlg=document.getElementById('layerDlg');
  if(dlg)buildLayerDlgBody();
}
function openLayerManager(){
  let dlg=document.getElementById('layerDlg');if(dlg){dlg.remove();return;}
  const ov=document.createElement('div');ov.id='layerDlgOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(5,8,15,0.5);backdrop-filter:blur(2px);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding-top:90px';
  dlg=document.createElement('div');dlg.id='layerDlg';
  dlg.style.cssText='background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,0.6);width:780px;max-width:96vw;font-family:var(--font-body)';
  dlg.innerHTML=`<div style="display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)">
      <span style="font-family:var(--font-display);font-size:13px;text-transform:uppercase;letter-spacing:1.1px;color:var(--accent);font-weight:600">Layer Manager</span>
      <button id="layAdd" style="margin-left:auto;background:var(--accent);border:none;color:#fff;font-family:var(--font-display);font-size:11px;padding:7px 14px;border-radius:7px;cursor:pointer;font-weight:600">+ New Layer</button>
      <button id="layClose" style="margin-left:8px;background:transparent;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 4px">✕</button>
    </div>
    <div id="layBody" style="max-height:50vh;overflow:auto;padding:8px 12px 14px"></div>`;
  ov.appendChild(dlg);document.body.appendChild(ov);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)closeLayerManager();});
  dlg.querySelector('#layClose').onclick=closeLayerManager;
  dlg.querySelector('#layAdd').onclick=()=>{addLayer();buildLayerDlgBody();};
  buildLayerDlgBody();
}
function closeLayerManager(){const ov=document.getElementById('layerDlgOverlay');if(ov)ov.remove();}
function layerPreviewSVG(l){
  const pat=LINETYPES[l.linetype||'Continuous']||[];
  const dash=pat.length?pat.map(v=>Math.max(1,v*0.6)).join(' '):'';
  const lw=Math.max(1,(l.lineweight||0.35)*2.2);  // visualize thickness
  return `<svg width="100" height="22" style="display:block"><line x1="4" y1="11" x2="96" y2="11" stroke="${l.color}" stroke-width="${lw}" ${dash?`stroke-dasharray="${dash}"`:''} stroke-linecap="round"/></svg>`;
}
function buildLayerDlgBody(){
  const bd=document.getElementById('layBody');if(!bd)return;
  const GRID='grid-template-columns:26px 1fr 48px 104px 84px 92px 34px 34px 34px 34px 44px;gap:6px';
  let h=`<div style="display:grid;${GRID};padding:6px 8px;font-family:var(--font-display);font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">
      <span></span><span>Name</span><span>Color</span><span>Linetype</span><span>Weight</span><span>Preview</span>
      <span title="On / off">On</span><span title="Freeze — hidden and out of Zoom Extents">Frz</span>
      <span title="Lock — visible but not selectable">Lck</span><span title="Plot — include in the PDF">Plt</span>
      <span></span></div>`;
  doc.layers.forEach((l,i)=>{
    const active=i===doc.activeLayer;
    const count=doc.objects.filter(o=>o.layer===l.name).length;
    const ltOpts=LINETYPE_NAMES.map(n=>`<option value="${n}" ${(l.linetype||'Continuous')===n?'selected':''}>${n}</option>`).join('');
    const lwOpts=LINEWEIGHTS.map(w=>`<option value="${w}" ${(l.lineweight||0.35)==w?'selected':''}>${w.toFixed(2)}</option>`).join('');
    h+=`<div class="lay-row" data-i="${i}" style="display:grid;${GRID};align-items:center;padding:7px 8px;border-radius:8px;margin-bottom:3px;background:${active?'rgba(59,130,246,0.12)':'transparent'};border:1px solid ${active?'var(--accent)':'transparent'}">
        <button class="lay-active" data-i="${i}" title="Set current" style="width:18px;height:18px;border-radius:50%;border:2px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent)':'transparent'};cursor:pointer"></button>
        <input class="lay-name" data-i="${i}" value="${l.name}" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-family:var(--font-mono);font-size:12px;padding:5px 7px;outline:none;min-width:0">
        <span class="lay-color" data-i="${i}" title="Select color" style="width:48px;height:24px;border:1px solid var(--border);border-radius:5px;cursor:pointer;display:inline-block;background:${l.color}"></span>
        <select class="lay-lt" data-i="${i}" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-family:var(--font-mono);font-size:11px;padding:4px;outline:none">${ltOpts}</select>
        <select class="lay-lw" data-i="${i}" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-family:var(--font-mono);font-size:11px;padding:4px;outline:none">${lwOpts}</select>
        <div class="lay-prev" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:5px;padding:0 4px">${layerPreviewSVG(l)}</div>
        <button class="lay-eye" data-i="${i}" title="${l.on?'Visible — click to hide':'Hidden — click to show'}" style="background:transparent;border:none;color:${l.on?'var(--accent)':'var(--text-muted)'};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${l.on?'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/>':'<path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5"/><path d="M4 4l16 16"/>'}</svg>
        </button>
        <button class="lay-frz" data-i="${i}" title="${l.frozen?'Frozen — click to thaw':'Thawed — click to freeze'}" style="background:transparent;border:none;color:${l.frozen?'var(--cyan)':'var(--text-muted)'};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${l.frozen?'<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>':'<circle cx="12" cy="12" r="7"/><path d="M12 8v8"/>'}</svg>
        </button>
        <button class="lay-lck" data-i="${i}" title="${l.locked?'Locked — click to unlock':'Unlocked — click to lock'}" style="background:transparent;border:none;color:${l.locked?'var(--warning)':'var(--text-muted)'};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/>${l.locked?'<path d="M8 11V8a4 4 0 0 1 8 0v3"/>':'<path d="M8 11V8a4 4 0 0 1 7.5-2"/>'}</svg>
        </button>
        <button class="lay-plt" data-i="${i}" title="${l.plot===false?'Not plotted — click to include':'Plotted — click to exclude'}" style="background:transparent;border:none;color:${l.plot===false?'var(--text-muted)':'var(--accent)'};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 9V4h10v5M7 18h10v3H7z"/><rect x="3" y="9" width="18" height="8" rx="1.5"/>${l.plot===false?'<path d="M4 20L20 4" stroke-width="2"/>':''}</svg>
        </button>
        <button class="lay-del" data-i="${i}" title="Delete (${count} object${count===1?'':'s'})" style="background:transparent;border:1px solid var(--border);color:${doc.layers.length<=1?'var(--text-muted)':'#ef4444'};font-size:11px;padding:4px 6px;border-radius:5px;cursor:${doc.layers.length<=1?'not-allowed':'pointer'}">Del</button>
      </div>`;
  });
  bd.innerHTML=h;
  bd.querySelectorAll('.lay-active').forEach(b=>b.onclick=()=>{pushUndo();doc.activeLayer=+b.dataset.i;buildLayerDlgBody();updateLayerChip();});
  bd.querySelectorAll('.lay-name').forEach(inp=>inp.onchange=()=>{
    const i=+inp.dataset.i,nn=inp.value.trim();if(!nn)return;
    const old=doc.layers[i].name;
    if(doc.layers.some((l,j)=>j!==i&&l.name===nn)){echo('Layer name already exists');inp.value=old;return;}
    pushUndo();doc.objects.forEach(o=>{if(o.layer===old)o.layer=nn;});doc.layers[i].name=nn;render();renderProps();
  });
  bd.querySelectorAll('.lay-color').forEach(sw=>sw.onclick=()=>{const i=+sw.dataset.i;openColorPicker(doc.layers[i].color,hex=>{pushUndo();doc.layers[i].color=hex;buildLayerDlgBody();render();});});
  bd.querySelectorAll('.lay-lt').forEach(sel=>sel.onchange=()=>{pushUndo();doc.layers[+sel.dataset.i].linetype=sel.value;buildLayerDlgBody();render();renderProps();});
  bd.querySelectorAll('.lay-lw').forEach(sel=>sel.onchange=()=>{pushUndo();doc.layers[+sel.dataset.i].lineweight=parseFloat(sel.value);buildLayerDlgBody();render();renderProps();});
  bd.querySelectorAll('.lay-eye').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;pushUndo();doc.layers[i].on=!doc.layers[i].on;buildLayerDlgBody();render();});
  bd.querySelectorAll('.lay-frz').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;
    if(i===doc.activeLayer){echo('Cannot freeze the current layer');return;}
    pushUndo();doc.layers[i].frozen=!doc.layers[i].frozen;buildLayerDlgBody();render();renderProps();});
  bd.querySelectorAll('.lay-lck').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;
    pushUndo();doc.layers[i].locked=!doc.layers[i].locked;
    if(doc.layers[i].locked)dropUneditableFromSelection();
    buildLayerDlgBody();render();renderProps();});
  bd.querySelectorAll('.lay-plt').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;
    pushUndo();doc.layers[i].plot=(doc.layers[i].plot===false);buildLayerDlgBody();});
  bd.querySelectorAll('.lay-del').forEach(b=>b.onclick=()=>deleteLayer(+b.dataset.i));
}
function addLayer(){
  pushUndo();
  let k=doc.layers.length+1;let name='Layer '+k;
  while(doc.layers.some(l=>l.name===name)){k++;name='Layer '+k;}
  doc.layers.push({name,color:PALETTE[doc.layers.length%PALETTE.length],on:true,frozen:false,locked:false,plot:true,linetype:'Continuous',lineweight:0.35});
  doc.activeLayer=doc.layers.length-1;updateLayerChip();echo(`Layer "${name}" added`);
}
function deleteLayer(i){
  if(doc.layers.length<=1){echo('Cannot delete the last remaining layer');return;}
  const l=doc.layers[i];
  const count=doc.objects.filter(o=>o.layer===l.name).length;
  const doDelete=()=>{
    pushUndo();
    // move this layer's objects to the first remaining layer
    const fallback=doc.layers[i===0?1:0].name;
    doc.objects.forEach(o=>{if(o.layer===l.name)o.layer=fallback;});
    // Follow the current layer by NAME, not by index: deleting a layer above it shifts every
    // index below, and comparing indices silently made a different layer current.
    const activeName=(doc.layers[doc.activeLayer]||doc.layers[0]).name;
    doc.layers.splice(i,1);
    const at=doc.layers.findIndex(x=>x.name===activeName);
    doc.activeLayer=at>=0?at:0;                 // the current layer itself was deleted -> layer 0
    echo(`Layer "${l.name}" deleted`);buildLayerDlgBody();updateLayerChip();render();renderProps();updateInfo();
  };
  if(count>0){
    if(confirm(`Layer "${l.name}" has ${count} object(s). Delete the layer and move them to another layer?`))doDelete();
  } else doDelete();
}
function updateLayerChip(){
  const chip=document.getElementById('activeLayerChip');
  if(chip){const l=doc.layers[doc.activeLayer]||doc.layers[0];chip.innerHTML=`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${l.color};margin-right:6px;vertical-align:middle"></span>${l.name}`;}
}

// ---- OSNAP settings dialog ----
function openOsnapDialog(){
  let dlg=document.getElementById('osnapDlg');
  if(dlg)dlg.remove();
  dlg=document.createElement('div');dlg.id='osnapDlg';
  dlg.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:18px 20px;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,0.6);min-width:240px;font-family:var(--font-body)';
  const modes=[['end','Endpoint'],['mid','Midpoint'],['center','Center'],['quad','Quadrant'],['intersection','Intersection'],['perp','Perpendicular'],['nearest','Nearest'],['node','Node']];
  let rows=modes.map(([k,label])=>`<label style="display:flex;align-items:center;gap:9px;padding:6px 0;font-size:13px;color:var(--text-primary);cursor:pointer"><input type="checkbox" data-os="${k}" ${osnap[k]?'checked':''} style="width:15px;height:15px;accent-color:var(--accent)"> ${label}</label>`).join('');
  dlg.innerHTML=`<div style="font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:4px;font-weight:600">Object Snap Settings</div><div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Choose which snap points are active</div>${rows}<div style="display:flex;gap:8px;margin-top:8px"><button id="osAll" style="flex:1;padding:6px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer">Select All</button><button id="osNone" style="flex:1;padding:6px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer">Clear All</button></div><div style="display:flex;gap:8px;margin-top:10px"><button id="osOk" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-family:var(--font-display);font-size:12px;cursor:pointer">OK</button><button id="osClose" style="padding:8px 14px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer">Cancel</button></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#osAll').onclick=()=>dlg.querySelectorAll('[data-os]').forEach(cb=>cb.checked=true);
  dlg.querySelector('#osNone').onclick=()=>dlg.querySelectorAll('[data-os]').forEach(cb=>cb.checked=false);
  dlg.querySelector('#osOk').onclick=()=>{dlg.querySelectorAll('[data-os]').forEach(cb=>osnap[cb.dataset.os]=cb.checked);saveSettings();echo('Object snap settings updated');dlg.remove();};
  dlg.querySelector('#osClose').onclick=()=>dlg.remove();
}

// ============================================================
//  PROPERTIES
// ============================================================
function renderProps(){
  const body=document.getElementById('propBody');
  if(selection.size===0){
    // Nothing selected: show the drawing's general/default settings (like AutoCAD)
    const lay=doc.layers[doc.activeLayer]||doc.layers[0];
    const gridLabel=gridSize>0?gridSize+' mm':'Auto';
    let h=`<div class="prop-type">Drawing</div>`;
    h+=`<div class="prop-section">General</div>`;
    h+=`<div class="prop-row" data-go="layer" style="cursor:pointer"><label>Current layer</label><span class="pval"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${lay.color};margin-right:5px;vertical-align:middle"></span>${lay.name}</span></div>`;
    h+=`<div class="prop-row"><label>Layer linetype</label><span class="pval">${lay.linetype||'Continuous'}</span></div>`;
    h+=`<div class="prop-row"><label>Layer lineweight</label><span class="pval">${(lay.lineweight||0.35).toFixed(2)} mm</span></div>`;
    h+=`<div class="prop-section">Annotation</div>`;
    h+=`<div class="prop-row" data-go="scale" style="cursor:pointer"><label>Drawing scale</label><span class="pval">1:${annoScale}</span></div>`;
    h+=`<div class="prop-row"><label>Text height (paper)</label><span class="pval">${ANNO_PAPER.text} mm</span></div>`;
    h+=`<div class="prop-row"><label>Text height (model)</label><span class="pval">${Math.round(annoText())} mm</span></div>`;
    h+=`<div class="prop-section">Drafting</div>`;
    h+=`<div class="prop-row" data-go="grid" style="cursor:pointer"><label>Grid spacing</label><span class="pval">${gridLabel}</span></div>`;
    h+=`<div class="prop-row"><label>Snap</label><span class="pval">${settings.snap?'On':'Off'}</span></div>`;
    h+=`<div class="prop-row"><label>Ortho</label><span class="pval">${settings.ortho?'On':'Off'}</span></div>`;
    h+=`<div class="prop-row"><label>Units</label><span class="pval">Millimeters</span></div>`;
    h+=`<div class="prop-section">Drawing</div>`;
    h+=`<div class="prop-row"><label>Objects</label><span class="pval">${doc.objects.length}</span></div>`;
    h+=`<div class="prop-row"><label>Layers</label><span class="pval">${doc.layers.length}</span></div>`;
    body.innerHTML=h;
    // make the clickable rows open their dialogs
    const goLayer=body.querySelector('[data-go="layer"]');if(goLayer)goLayer.onclick=()=>openLayerManager();
    const goScale=body.querySelector('[data-go="scale"]');if(goScale)goScale.onclick=()=>openScaleDialog();
    const goGrid=body.querySelector('[data-go="grid"]');if(goGrid)goGrid.onclick=()=>openGridDialog();
    return;
  }
  if(selection.size>1){
    // multi-selection: show count, combined length/area where it makes sense
    const objs=selObjects();
    let totLen=0,totArea=0,n=objs.length;
    for(const o of objs){
      if(o.type==='line')totLen+=dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
      else if(o.type==='circle'){totLen+=2*Math.PI*o.r;totArea+=Math.PI*o.r*o.r;}
      else if(o.type==='rect'||o.type==='pline'){try{const m=shapeMass(o);totArea+=Math.abs(m.area);totLen+=m.perim;}catch(e){}}
    }
    let h=`<div class="prop-type">${n} objects</div>`;
    const counts={};objs.forEach(o=>counts[o.type]=(counts[o.type]||0)+1);
    h+=`<div class="prop-section">Selection</div>`;
    for(const t in counts)h+=propNum(t,counts[t]);
    h+=`<div class="prop-section">Totals</div>`;
    if(totLen)h+=propCalc('Total length',totLen.toFixed(2));
    if(totArea)h+=propCalc('Total area',totArea.toFixed(2));
    body.innerHTML=h;return;
  }
  const o=selObjects()[0];
  if(!o){body.innerHTML='<div class="prop-empty">No selection</div>';return;}
  const U=(x,y)=>ucsActive()?world2ucs(x,y):{x,y};   // show coords in current UCS
  let h=`<div class="prop-type">${prettyType(o)}</div>`;

  // ---- General (matches AutoCAD's Properties palette order) ----
  h+=`<div class="prop-section">General</div>`;
  h+=`<div class="prop-row"><label>Color</label>${colorByLayerSelect(o)}</div>`;
  h+=`<div class="prop-row"><label>Layer</label>${layerSelect(o.layer)}</div>`;
  h+=`<div class="prop-row"><label>Linetype</label>${linetypeSelect(o)}</div>`;
  h+=`<div class="prop-row"><label>Linetype scale</label><input data-gen="ltscale" type="number" min="0.01" step="0.1" value="${o.ltscale!=null?o.ltscale:1}" style="width:90px"></div>`;
  h+=`<div class="prop-row"><label>Plot style</label><span class="pval" style="color:var(--text-muted)">ByColor</span></div>`;
  h+=`<div class="prop-row"><label>Lineweight</label>${lineweightSelect(o)}</div>`;
  h+=`<div class="prop-row"><label>Transparency</label><input data-gen="transparency" type="number" min="0" max="90" step="5" value="${o.transparency!=null?o.transparency:0}" style="width:90px"></div>`;
  h+=`<div class="prop-row"><label>Hyperlink</label><input data-gen="hyperlink" type="text" placeholder="(none)" value="${(o.hyperlink||'').replace(/"/g,'&quot;')}" style="width:120px"></div>`;
  h+=`<div class="prop-row"><label>Thickness</label><input data-gen="thickness" type="number" step="1" value="${o.thickness!=null?o.thickness:0}" style="width:90px"></div>`;

  // ---- Geometry + Calculated, per type ----
  if(o.type==='line'){
    const a=U(o.x1,o.y1),b2=U(o.x2,o.y2);
    const len=dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
    const ang=((Math.atan2(o.y2-o.y1,o.x2-o.x1)*180/Math.PI)+360)%360;
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Start X',a.x.toFixed(2));h+=propNum('Start Y',a.y.toFixed(2));
    h+=propNum('End X',b2.x.toFixed(2));h+=propNum('End Y',b2.y.toFixed(2));
    h+=propNum('ΔX',(o.x2-o.x1).toFixed(2));h+=propNum('ΔY',(o.y2-o.y1).toFixed(2));
    h+=`<div class="prop-section">Calculated</div>`;
    h+=propCalc('Length',len.toFixed(3));
    h+=propCalc('Angle',ang.toFixed(2)+'°');
  }
  else if(o.type==='circle'){
    const c=U(o.cx,o.cy);
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propEdit('Radius','r',o.r.toFixed(3));
    h+=propNum('Diameter',(o.r*2).toFixed(3));
    h+=propNum('Center X',c.x.toFixed(2));h+=propNum('Center Y',c.y.toFixed(2));
    h+=`<div class="prop-section">Calculated</div>`;
    h+=propCalc('Circumference',(2*Math.PI*o.r).toFixed(3));
    h+=propCalc('Area',(Math.PI*o.r*o.r).toFixed(3));
  }
  else if(o.type==='arc'){
    const c=U(o.cx,o.cy);
    const sweep=Math.abs(((o.a2-o.a1)*180/Math.PI));
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Radius',o.r.toFixed(3));
    h+=propNum('Center X',c.x.toFixed(2));h+=propNum('Center Y',c.y.toFixed(2));
    h+=propNum('Start angle',(o.a1*180/Math.PI).toFixed(1)+'°');
    h+=propNum('End angle',(o.a2*180/Math.PI).toFixed(1)+'°');
    h+=`<div class="prop-section">Calculated</div>`;
    h+=propCalc('Arc length',(o.r*Math.abs(o.a2-o.a1)).toFixed(3));
    h+=propCalc('Sweep',sweep.toFixed(1)+'°');
  }
  else if(o.type==='rect'){
    const w=Math.abs(o.x2-o.x1),ht=Math.abs(o.y2-o.y1);
    const c=U((o.x1+o.x2)/2,(o.y1+o.y2)/2);
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Width',w.toFixed(3));h+=propNum('Height',ht.toFixed(3));
    h+=propNum('Center X',c.x.toFixed(2));h+=propNum('Center Y',c.y.toFixed(2));
    h+=`<div class="prop-section">Calculated</div>`;
    h+=propCalc('Area',(w*ht).toFixed(3));
    h+=propCalc('Perimeter',(2*(w+ht)).toFixed(3));
  }
  else if(o.type==='pline'){
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Vertices',o.pts.length);
    h+=propNum('Closed',o.closed?'Yes':'No');
    let per=0;for(let i=0;i<o.pts.length-1;i++)per+=Math.hypot(o.pts[i+1][0]-o.pts[i][0],o.pts[i+1][1]-o.pts[i][1]);
    if(o.closed&&o.pts.length>2)per+=Math.hypot(o.pts[0][0]-o.pts[o.pts.length-1][0],o.pts[0][1]-o.pts[o.pts.length-1][1]);
    h+=`<div class="prop-section">Calculated</div>`;
    h+=propCalc(o.closed?'Perimeter':'Length',per.toFixed(3));
    if(o.closed&&o.pts.length>=3){try{const m=shapeMass(o);h+=propCalc('Area',Math.abs(m.area).toFixed(3));const cc=U(m.cx,m.cy);h+=propCalc('Centroid X',cc.x.toFixed(2));h+=propCalc('Centroid Y',cc.y.toFixed(2));}catch(e){}}
  }
  else if(o.type==='text'){
    const c=U(o.x,o.y);
    h+=`<div class="prop-section">Text</div>`;
    h+=`<div class="prop-row"><label>Contents</label><input data-txt="str" type="text" value="${String(o.str||'').replace(/\n/g,'\\n').replace(/"/g,'&quot;')}" style="width:120px"></div>`;
    h+=`<div class="prop-row"><label>Text style</label>${namedStyleSelect(o,'text')}</div>`;
    h+=`<div class="prop-row"><label>Font override</label>${textFontSelect(o)}</div>`;
    h+=`<div class="prop-row"><label>Justify</label>${textJustifySelect(o)}</div>`;
    h+=`<div class="prop-row"><label>Text height</label><input data-txt="h" type="number" min="1" value="${o.h}" style="width:90px"></div>`;
    h+=`<div class="prop-row"><label>Rotation</label><input data-txt="rot" type="number" value="${o.rot||0}" style="width:90px"></div>`;
    h+=`<div class="prop-row"><label>Bold</label>${textToggleSelect(o,'bold')}</div>`;
    h+=`<div class="prop-row"><label>Italic</label>${textToggleSelect(o,'italic')}</div>`;
    h+=`<div class="prop-row"><label>Color</label><span class="color-swatch" data-colorpick="txt" data-cur="${o.color||layerColor(o.layer)}" title="Select color" style="width:90px;height:24px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:${o.color||layerColor(o.layer)}"></span></div>`;
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Position X',c.x.toFixed(2));h+=propNum('Position Y',c.y.toFixed(2));
    h+=propNum('Lines',String(o.str||'').split('\n').length);
  }
  else if(o.type==='block'){
    const c=U(o.x,o.y);const def=doc.blocks[o.name];
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Name',o.name);
    h+=propNum('Insertion X',c.x.toFixed(2));h+=propNum('Insertion Y',c.y.toFixed(2));
    h+=propNum('Sub-objects',def?def.objects.length:0);
  }
  else if(o.type==='point'){
    const c=U(o.x,o.y);
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('X',c.x.toFixed(3));h+=propNum('Y',c.y.toFixed(3));
  }
  else if(o.type==='dim'){
    const kindLabel={linear:'Linear',aligned:'Aligned',angular:'Angular',radius:'Radius',diameter:'Diameter'}[o.dim||'linear'];
    h+=`<div class="prop-section">Geometry</div>`;
    h+=propNum('Type',kindLabel);
    if(o.dim==='angular')h+=propNum('Angle',(((o.a2-o.a1)*180/Math.PI%360+360)%360).toFixed(2)+'°');
    else if(o.dim==='radius')h+=propNum('Radius',o.r.toFixed(2));
    else if(o.dim==='diameter')h+=propNum('Diameter',(o.r*2).toFixed(2));
    else h+=propNum('Measured',dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}).toFixed(2));
    // --- Dimension style controls (AutoCAD-like) ---
    h+=`<div class="prop-section">Style</div>`;
    h+=`<div class="prop-row"><label>Dimension style</label>${namedStyleSelect(o,'dim')}</div>`;
    h+=`<div class="prop-row"><label>Associative</label><span class="pval" style="color:${isAssociative(o)?'var(--success)':'var(--text-muted)'}">${isAssociative(o)?'follows geometry':'fixed'}</span></div>`;
    // --- Lines & Arrows (AutoCAD: Symbols and Arrows) ---
    h+=`<div class="prop-section">Lines &amp; Arrows</div>`;
    h+=`<div class="prop-row"><label>Arrow 1 (start)</label>${dimArrowSelect(o,'arrow1')}</div>`;
    h+=`<div class="prop-row"><label>Arrow 2 (end)</label>${dimArrowSelect(o,'arrow2')}</div>`;
    h+=`<div class="prop-row"><label>Arrow size</label><input data-dim="arrowSize" type="number" min="1" value="${o.arrowSize||9}"></div>`;
    h+=`<div class="prop-row"><label>Line width</label><input data-dim="lineWidth" type="number" min="0.5" step="0.1" value="${o.lineWidth||1.2}"></div>`;
    h+=`<div class="prop-row"><label>Line color</label><span class="color-swatch" data-colorpick="dim" data-cur="${o.color||layerColor(o.layer)}" title="Select color" style="width:90px;height:24px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:${o.color||layerColor(o.layer)}"></span></div>`;
    h+=`<div class="prop-row"><label>Dim line ext</label><input data-dim="dimLineExt" type="number" min="0" step="0.5" value="${o.dimLineExt!=null?o.dimLineExt:0}"></div>`;
    // --- Extension lines ---
    h+=`<div class="prop-section">Extension Lines</div>`;
    h+=`<div class="prop-row"><label>Ext line 1</label>${dimToggleSelect(o,'extLine1')}</div>`;
    h+=`<div class="prop-row"><label>Ext line 2</label>${dimToggleSelect(o,'extLine2')}</div>`;
    h+=`<div class="prop-row"><label>Ext beyond dim</label><input data-dim="extExt" type="number" min="0" step="0.25" value="${o.extExt!=null?o.extExt:ANNO_PAPER.ext}"></div>`;
    h+=`<div class="prop-row"><label>Ext offset</label><input data-dim="extOffset" type="number" min="0" step="0.25" value="${o.extOffset!=null?o.extOffset:ANNO_PAPER.gap}"></div>`;
    // --- Text (AutoCAD: Text tab) ---
    h+=`<div class="prop-section">Text</div>`;
    h+=`<div class="prop-row"><label>Text height</label><input data-dim="txtH" type="number" min="1" value="${Math.round(o.txtH||annoText())}"></div>`;
    h+=`<div class="prop-row"><label>Text color</label><span class="color-swatch" data-colorpick="dimtext" data-cur="${o.textColor||o.color||layerColor(o.layer)}" title="Select color" style="width:90px;height:24px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:${o.textColor||o.color||layerColor(o.layer)}"></span></div>`;
    h+=`<div class="prop-row"><label>Text position</label><select data-dim="textPos"><option value="above" ${(o.textPos||'above')==='above'?'selected':''}>Above line</option><option value="center" ${o.textPos==='center'?'selected':''}>Centered</option></select></div>`;
    h+=`<div class="prop-row"><label>Fill color</label>${dimFillSelect(o)}</div>`;
    h+=`<div class="prop-row"><label>Precision</label><select data-dim="precision">${[0,1,2,3].map(n=>`<option value="${n}" ${(o.precision!=null?o.precision:1)===n?'selected':''}>${n} decimals</option>`).join('')}</select></div>`;
    h+=`<div class="prop-row"><label>Prefix</label><input data-dim="prefix" type="text" placeholder="e.g. Ø" value="${o.prefix||''}" style="width:110px"></div>`;
    h+=`<div class="prop-row"><label>Suffix</label><input data-dim="suffix" type="text" placeholder="e.g. mm" value="${o.suffix||''}" style="width:110px"></div>`;
    h+=`<div class="prop-row"><label>Text override</label><input data-dim="textOverride" type="text" placeholder="(measured)" value="${o.textOverride||''}" style="width:110px"></div>`;
  }
  if(ucsActive())h+=`<div class="prop-section" style="color:var(--orange,#f59e0b)">Coordinates shown in current UCS</div>`;
  body.innerHTML=h;

  // color swatches -> open the AutoCAD-style Select Color dialog
  body.querySelectorAll('.color-swatch[data-colorpick]').forEach(sw=>{
    sw.onclick=()=>{
      const kind=sw.dataset.colorpick;
      // General "Color" swatch is disabled while ByLayer
      if(kind==='gen'){const mode=body.querySelector('[data-gen="colorMode"]');if(mode&&mode.value==='bylayer')return;}
      openColorPicker(sw.dataset.cur,hex=>{
        pushUndo();
        if(kind==='gen'||kind==='txt'||kind==='dim')o.color=hex;
        else if(kind==='dimtext')o.textColor=hex;
        render();renderProps();updateInfo();
      });
    };
  });
  // General-section property controls (Color/ByLayer, LT scale, Transparency, Hyperlink, Thickness)
  body.querySelectorAll('[data-gen]').forEach(el=>{
    const apply=()=>{
      pushUndo();
      const key=el.dataset.gen;
      if(key==='colorMode'){
        if(el.value==='bylayer')delete o.color; else o.color=layerColor(o.layer);
      } else if(key==='color'){
        o.color=el.value;
      } else if(key==='ltscale'){
        const v=parseFloat(el.value);o.ltscale=(isFinite(v)&&v>0)?v:1;
      } else if(key==='transparency'){
        let v=parseInt(el.value,10);if(!isFinite(v))v=0;o.transparency=Math.max(0,Math.min(90,v));
      } else if(key==='hyperlink'){
        if(el.value.trim())o.hyperlink=el.value.trim(); else delete o.hyperlink;
      } else if(key==='thickness'){
        const v=parseFloat(el.value);o.thickness=isFinite(v)?v:0;
      }
      render();renderProps();updateInfo();
    };
    el.onchange=apply;
  });
  // wire up editable fields
  const ri=body.querySelector('input[data-edit="r"]');
  if(ri)ri.onchange=()=>{pushUndo();o.r=parseFloat(ri.value)||o.r;render();renderProps();updateInfo();};
  const hi=body.querySelector('input[data-edit="h"]');
  if(hi)hi.onchange=()=>{pushUndo();o.h=parseFloat(hi.value)||o.h;render();renderProps();};
  const ls=body.querySelector('select[data-edit="layer"]');
  if(ls)ls.onchange=()=>{pushUndo();o.layer=ls.value;render();renderProps();};
  const lt=body.querySelector('select[data-edit="linetype"]');
  if(lt)lt.onchange=()=>{pushUndo();o.linetype=lt.value;render();renderProps();};
  const lw=body.querySelector('select[data-edit="lineweight"]');
  if(lw)lw.onchange=()=>{pushUndo();o.lineweight=(lw.value==='ByLayer'?null:parseFloat(lw.value));render();renderProps();};
  // dimension-style controls
  body.querySelectorAll('[data-dim]').forEach(el=>{
    el.onchange=()=>{
      pushUndo();
      const key=el.dataset.dim;
      const colorKeys=['color','textColor'];
      const strKeys=['arrow','arrow1','arrow2','textOverride','textPos','prefix','suffix'];
      const toggleKeys=['extLine1','extLine2'];
      if(colorKeys.includes(key))o[key]=el.value;
      else if(key==='fillColor'){
        if(el.value==='__pick'){o.fillColor='#1e2738';renderProps();return;}
        o.fillColor=el.value;
      }
      else if(toggleKeys.includes(key))o[key]=(el.value==='on');
      else if(strKeys.includes(key))o[key]=el.value;
      else if(key==='precision')o.precision=parseInt(el.value,10);
      else o[key]=parseFloat(el.value);
      render();renderProps();
    };
  });
  // text-object property controls
  body.querySelectorAll('[data-style]').forEach(el=>el.onchange=()=>{
    const kind=el.dataset.style, key=kind==='dim'?'dimStyle':'style';
    pushUndo();
    for(const t of selObjects())t[key]=el.value;
    render();renderProps();updateInfo();
  });
  body.querySelectorAll('[data-txt]').forEach(el=>{
    el.onchange=()=>{
      pushUndo();
      const key=el.dataset.txt;
      if(key==='str')o.str=el.value.replace(/\\n/g,'\n');
      else if(key==='color')o.color=el.value;
      else if(key==='font'||key==='align')o[key]=el.value;
      else if(key==='bold'||key==='italic')o[key]=(el.value==='on');
      else o[key]=parseFloat(el.value)||0;
      render();renderProps();
    };
  });
}
function prettyType(o){const m={line:'Line',circle:'Circle',arc:'Arc',rect:'Rectangle',pline:'Polyline',text:'Text',block:'Block: '+o.name,point:'Point',dim:'Dimension'};return m[o.type]||o.type;}
// Color control for the General section: "ByLayer" or an explicit colour, like AutoCAD.
function colorByLayerSelect(o){
  const byLayer=(o.color==null);
  const swatch=byLayer?layerColor(o.layer):o.color;
  // when a custom color is set, label it with its AutoCAD Color Index (exact, or ≈ for true colors)
  let customLabel='Custom';
  if(!byLayer){const n=aciFromHex(o.color);customLabel=(hexFromAci(n)===(o.color||'').toLowerCase())?('ACI '+n):('\u2248 '+n);}
  return `<span style="display:inline-flex;align-items:center;gap:6px">`
    +`<select data-gen="colorMode" style="width:78px"><option value="bylayer" ${byLayer?'selected':''}>ByLayer</option><option value="custom" ${!byLayer?'selected':''}>${customLabel}</option></select>`
    +`<span class="color-swatch" data-colorpick="gen" data-cur="${swatch}" title="Select color" style="width:34px;height:22px;border:1px solid var(--border);border-radius:4px;cursor:${byLayer?'not-allowed':'pointer'};background:${swatch};${byLayer?'opacity:0.4':''}"></span>`
    +`</span>`;
}
const DIM_ARROWS=[['closed','Closed filled'],['open','Open'],['dot','Dot'],['oblique','Oblique (tick)'],['none','None']];
// a picker listing the named styles, so an existing annotation can be moved between them
function namedStyleSelect(o,kind){
  const table=kind==='dim'?doc.dimStyles:doc.textStyles;
  const key=kind==='dim'?'dimStyle':'style';
  const cur=o[key]||(kind==='dim'?doc.dimStyle:doc.textStyle)||'Standard';
  const opts=Object.keys(table).map(n=>`<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('');
  return `<select data-style="${kind}" style="width:110px">${opts}</select>`;
}
function textFontSelect(o){
  const cur=o.font||'monospace';
  return `<select data-txt="font">`+TEXT_FONTS.map(f=>`<option value="${f}" ${cur===f?'selected':''}>${f.split(',')[0]}</option>`).join('')+`</select>`;
}
function textJustifySelect(o){
  const cur=o.align||'left';
  return `<select data-txt="align">`+[['left','Left'],['center','Center'],['right','Right']].map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')+`</select>`;
}
function textToggleSelect(o,key){
  const on=!!o[key];
  return `<select data-txt="${key}"><option value="off" ${!on?'selected':''}>No</option><option value="on" ${on?'selected':''}>Yes</option></select>`;
}
function dimArrowSelect(o,key){
  key=key||'arrow';
  const cur=o[key]||o.arrow||'closed';
  return `<select data-dim="${key}">`+DIM_ARROWS.map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')+`</select>`;
}
function dimToggleSelect(o,key){
  const on=o[key]!==false;  // default On
  return `<select data-dim="${key}"><option value="on" ${on?'selected':''}>On</option><option value="off" ${!on?'selected':''}>Off</option></select>`;
}
function dimFillSelect(o){
  const cur=o.fillColor||'none';
  if(cur==='none')return `<select data-dim="fillColor"><option value="none" selected>None</option><option value="__pick">Pick color…</option></select>`;
  return `<input data-dim="fillColor" type="color" value="${cur}" style="width:90px;height:26px;padding:1px;cursor:pointer">`;
}
function layerSelect(cur){
  return `<select data-edit="layer">`+doc.layers.map(l=>`<option value="${l.name}" ${l.name===cur?'selected':''}>${l.name}</option>`).join('')+`</select>`;
}
function linetypeSelect(o){
  const cur=o.linetype||'ByLayer';
  let opts=`<option value="ByLayer" ${cur==='ByLayer'?'selected':''}>ByLayer</option>`;
  opts+=LINETYPE_NAMES.map(n=>`<option value="${n}" ${cur===n?'selected':''}>${n}</option>`).join('');
  return `<select data-edit="linetype">${opts}</select>`;
}
function lineweightSelect(o){
  const cur=o.lineweight==null?'ByLayer':o.lineweight;
  let opts=`<option value="ByLayer" ${cur==='ByLayer'?'selected':''}>ByLayer</option>`;
  opts+=LINEWEIGHTS.map(w=>`<option value="${w}" ${cur==w?'selected':''}>${w.toFixed(2)} mm</option>`).join('');
  return `<select data-edit="lineweight">${opts}</select>`;
}
function propNum(label,val){return `<div class="prop-row"><label>${label}</label><span class="pval">${val}</span></div>`;}
function propCalc(label,val){return `<div class="prop-row"><label>${label}</label><span class="pval calc">${val}</span></div>`;}
function propEdit(label,key,val){return `<div class="prop-row"><label>${label}</label><input data-edit="${key}" value="${val}"></div>`;}

// ============================================================
//  STATUS / NAV
// ============================================================
function bindToggle(id,key){const el=document.getElementById(id);el.onclick=()=>toggleSetting(key);}
function toggleSetting(key){
  settings[key]=!settings[key];
  const map={snap:'tSnap',ortho:'tOrtho',grid:'tGrid',polar:'tPolar',pickfirst:'tPick',dynInput:'tDyn'};
  const el=document.getElementById(map[key]);if(el)el.classList.toggle('on',settings[key]);
  echo(`${key.toUpperCase()} ${settings[key]?'on':'off'}`);
  if(key==='dynInput'&&!settings.dynInput){dynReset&&dynReset();dynEl&&dynEl.classList.remove('on');}
  render();if(selection.size===0)renderProps();
  saveSettings();
}
bindToggle('tSnap','snap');bindToggle('tOrtho','ortho');bindToggle('tGrid','grid');bindToggle('tPolar','polar');bindToggle('tPick','pickfirst');bindToggle('tDyn','dynInput');
document.getElementById('tGrid').addEventListener('contextmenu',e=>{e.preventDefault();openGridDialog();});
document.getElementById('tSnap').addEventListener('contextmenu',e=>{e.preventDefault();openOsnapDialog();});
