// The attribution bar along the bottom of the app.
//
// Honest about what this is: the app is served from a folder the reader owns, so
// nothing here is tamper-proof and it is not encryption.  What it does is make the
// bar survive the ways it would ordinarily disappear:
//
//   * it is not in index.html, so editing that file does not remove it - the
//     server injects it into every response
//   * neither string is a plain string anywhere on disk, so searching the source
//     for the name does not lead straight to it
//   * it rebuilds itself if either half is deleted, hidden, emptied or restyled
//   * its own CSS travels with it, so deleting rules from app.css does not blank it
//
// Anyone editing this file removes it in one line.  That is unavoidable in a
// local web app and pretending otherwise would be dishonest.
const NAME = 'Created by Ebubekir Akarsu';
const RIGHTS = '© Lumoship 2026–2027 · All rights reserved';
const KEY = 0x5b;

// XOR over the UTF-8 bytes, not the code units: the rights line carries © and
// an en dash, and masking those per character would overflow a byte and corrupt
// the round trip.
const pack = s => Buffer.from(Buffer.from(s, 'utf8').map(b => b ^ KEY)).toString('base64');

const P_NAME = pack(NAME);
const P_RIGHTS = pack(RIGHTS);
const FOOT_H = 26;

/* The injected client script. One self-contained IIFE with short names so it
   stays small; it runs before the app's own boot finishes. */
const SNIPPET = `
<style id="__cfs">
:root{--foot-h:${FOOT_H}px}
.shell{height:calc(100vh - var(--bar-h) - var(--foot-h))!important}
.ask{bottom:var(--foot-h)!important}
#__cfsig{position:fixed;left:0;right:0;bottom:0;height:var(--foot-h);z-index:200;
  display:flex;align-items:center;justify-content:space-between;padding:0 14px;
  font:11.5px/1 var(--f-mono,ui-monospace,Consolas,monospace);letter-spacing:.04em;
  color:var(--tx-3,#8b8b8b);background:var(--bg-2,#141414);
  border-top:1px solid var(--line,#2a2a2a);user-select:none;pointer-events:none}
#__cfsig b{font-weight:600;color:var(--tx-2,#bbb)}
#__cfsig .r{opacity:.75}
@media (max-width:640px){#__cfsig .r{display:none}}
</style>
<script>(function(){
var A='${P_NAME}',B='${P_RIGHTS}',K=${KEY},ID='__cfsig',ca=null,cb=null,pend=0;
function dec(p){var b=atob(p),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i)^K;return new TextDecoder().decode(u)}
function nm(){return ca||(ca=dec(A))}
function rt(){return cb||(cb=dec(B))}
function make(){
  var el=document.createElement('div');el.id=ID;
  var n=nm(),i=n.lastIndexOf(' ',n.lastIndexOf(' ')-1);
  var l=document.createElement('span');l.className='l';
  l.appendChild(document.createTextNode(n.slice(0,i+1)));
  var b=document.createElement('b');b.textContent=n.slice(i+1);l.appendChild(b);
  var r=document.createElement('span');r.className='r';
  r.textContent=rt();
  el.appendChild(l);el.appendChild(r);
  document.body.appendChild(el);
}
function vis(e){
  var s=getComputedStyle(e);
  return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity||1)>.35;
}
function sound(el){
  if(!el||!el.isConnected)return false;
  var t=el.textContent.replace(/\\s+/g,' ');
  if(t.indexOf(nm())<0||t.indexOf(rt())<0)return false;
  if(!vis(el)||el.getBoundingClientRect().height<6)return false;
  var l=el.querySelector('.l'),r=el.querySelector('.r');
  return !!l&&!!r&&vis(l)&&(innerWidth<640||vis(r));
}
function check(){
  pend=0;
  if(!document.body)return;
  var el=document.getElementById(ID);
  if(sound(el))return;
  if(el)el.remove();
  if(!document.getElementById('__cfs')){var d=document.createElement('div');
    d.innerHTML='<style id="__cfs">'+STYLE+'</style>';document.head.appendChild(d.firstChild)}
  make();
}
var STYLE=(document.getElementById('__cfs')||{}).textContent||'';
// setTimeout, not requestAnimationFrame: rAF is suspended while the tab is
// hidden, and the interval below is throttled to about once a minute there,
// so a bar removed in a background tab would stay gone until it was looked at.
function schedule(){if(!pend){pend=1;setTimeout(check,0)}}
if(document.body)check();else document.addEventListener('DOMContentLoaded',check);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
setInterval(check,1500);
window.addEventListener('resize',schedule);
})();</script>`;

module.exports = { NAME, RIGHTS, SNIPPET };
