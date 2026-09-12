/* ============================================================================
   Profile library and combined section modulus.

   Shared by every module that selects a stiffener, which by now is the
   deckhouse and the fore part. It lives on its own rather than inside one of
   them so neither has to reach into the other.

   The library carries only what belongs to the profile itself — area, the
   distance from its plate-attached edge to its own neutral axis, its own
   inertia, its height, and the web dimensions. The combined modulus with
   attached plating is ALWAYS recomputed for the actual stiffener spacing and
   plate thickness, because it changes with both. The `Zgov740x8` field in the
   data file is the workbook's own tabulation for one particular 740 mm x 8 mm
   plate and exists only so the verifiers can check the combining maths against
   it; nothing in the app reads it as an answer.
   ============================================================================ */

window.NR467SEC = (function () {
  'use strict';

  var SECTIONS = null, BY_NAME = {};

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  function setSections(json) {
    SECTIONS = (json && json.profiles) ? json.profiles : (json || []);
    BY_NAME = {};
    SECTIONS.forEach(function (p) { BY_NAME[p.name] = p; });
  }
  function ready() { return !!SECTIONS; }
  function profiles() { return SECTIONS || []; }
  function profile(name) { return BY_NAME[name] || null; }

  /* Stiffener plus its attached plating, about the combined neutral axis.
     Everything is in centimetres: the library is in cm while s and t arrive in
     mm. The governing modulus is the smaller of the two extreme fibres — at
     the plate and at the top of the profile — because either can be the one
     that yields first. */
  function sectionModulus(prof, s_mm, t_mm) {
    if (!prof) return null;
    var bw = n(s_mm) / 10, tp = n(t_mm) / 10;
    var Ap = bw * tp, As = n(prof.A);
    if (As + Ap <= 0) return null;
    var zs = tp + n(prof.cy);                       // profile NA above the plate underside
    var zNA = (Ap * tp / 2 + As * zs) / (As + Ap);
    var I = n(prof.I) + As * Math.pow(zs - zNA, 2)
      + bw * Math.pow(tp, 3) / 12 + Ap * Math.pow(tp / 2 - zNA, 2);
    var top = tp + n(prof.H);
    var Zplate = zNA > 0 ? I / zNA : 0;
    var Ztop = top - zNA > 0 ? I / (top - zNA) : 0;
    return {
      name: prof.name, zNA: zNA, I: I, height: top,
      Zplate: Zplate, Ztop: Ztop, Zgov: Math.min(Zplate, Ztop)
    };
  }

  /* Convenience: look the profile up and combine in one call. */
  function modulusOf(name, s_mm, t_mm) {
    return sectionModulus(profile(name), s_mm, t_mm);
  }

  return {
    setSections: setSections, ready: ready, profiles: profiles, profile: profile,
    sectionModulus: sectionModulus, modulusOf: modulusOf
  };
})();
