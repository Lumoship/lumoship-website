/* ============================================================================
   Shared impact machinery — BV NR467 Pt B, Ch 7 Sec 4/5 and Ch 11 Sec 1 / 3.

   The fore part and the aft part are the same shape of problem: an impact
   pressure drives a plating and a stiffener check under acceptance criteria
   AC-4, sitting on top of a set of prescriptive minima and dimensional rules.
   Everything both parts do identically lives here so neither has to reach into
   the other. What differs stays in its own module:

     fore   bottom slamming and bow flare impact, two pressures, two alphas
     aft    stern slamming only, one pressure, a fixed alpha, and its own h_SL

   The two also disagree about which draught the impact height is measured
   from — the fore part uses TF, the aft part TLC — and about T_RZ, so those
   are deliberately NOT shared.
   ============================================================================ */

window.NR467IMPACT = (function () {
  'use strict';

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  /* AC-4 · Ch 7 Sec 4 [4.1.1] and Sec 5 [1.3.1]. Impact is a one-off extreme
     event, so the plating is allowed to reach yield where the AC-2 checks the
     deckhouse runs hold it to 0,85. */
  var AC4 = { Ca: 1, Cs: 0.9, Ct: 1 };

  /* End fixity · fbdg = 8 (1 + ns/2): 8 simply supported, 12 one end fixed,
     16 continuous. */
  function fbdgOf(ns) { return 8 * (1 + n(ns) / 2); }

  /* cE · Ch 11 Sec 1 symbols — a small-ship allowance that has faded out
     entirely by 90 m. */
  function cE(L) {
    if (L <= 65) return 1;
    if (L >= 90) return 0;
    return 3 - L / 32.5;
  }

  /* Plate aspect coefficient · Ch 7 Sec 4, never above 1. */
  function alphaP(s_mm, lbdg_m) {
    return Math.min(1.2 - n(s_mm) / (2.1 * n(lbdg_m) * 1000), 1);
  }

  /* Corrosion total with the under-10 mm plate-panel cap. The second exposure
     is optional: a plate with sea on one face and nothing declared on the
     other gets the one addition plus the reserve. Ch 4 Sec 3 Tab 1 is shared
     across the whole app — see 10-inputs.js. */
  function tcTotal(exp1, exp2, tSel, tRes) {
    var a = NRIN.tcOf(exp1);
    var b = exp2 ? NRIN.tcOf(exp2) : 0;
    var sum = a + b + n(tRes);
    return tSel <= 10 ? Math.min(sum, 0.2 * tSel) : sum;
  }

  /* ------------------------------------------------------ impact panel ----
     Ch 11 Sec 1 [3.2] / Ch 11 Sec 3 [5], with Ch 7 Sec 4 for the plating and
     Ch 7 Sec 5 for the stiffener.

     Cd DIVIDES the pressure form, so a larger Cd makes the required plate
     thinner. It is a dynamic-load coefficient, not a safety factor, and
     reading it as the latter would put it on the wrong side of the fraction.

     `ctx` supplies the reserve thickness. */
  function panelRow(el, ctx, P, Cd) {
    var s = n(el.s), lbdg = n(el.lbdg), tSel = n(el.tSel);
    var ReH = n(el.ReH, 235);
    var ap = alphaP(s, lbdg);
    var tc = tcTotal(el.exposure1, el.exposure2, tSel, ctx.tRes);
    var fbdg = fbdgOf(el.ns);

    var tReq = 0.0158 * ap * s * Math.sqrt(P / (AC4.Ca * ReH)) / Cd + tc;
    var Zreq = (fbdg * AC4.Cs * ReH) > 0
      ? P * (s / 1000) * lbdg * lbdg * 1000 / (fbdg * AC4.Cs * ReH) : 0;

    /* The combined modulus is computed for THIS panel's spacing and selected
       plate. Both workbooks read it from a column tabulated for a different
       plate instead; see the note in the verifiers. */
    var sec = NR467SEC.modulusOf(el.stiffener, s, tSel);
    var Zsel = sec ? sec.Zgov : 0;

    return {
      name: el.name || 'panel', location: el.location || '',
      exposure1: el.exposure1, exposure2: el.exposure2 || '',
      ns: n(el.ns), s: s, lbdg: lbdg, dShr: n(el.dShr),
      alphaP: ap, P: P, Cd: Cd, ReH: ReH, k: NRIN.kOf(ReH), tc: tc, fbdg: fbdg,
      tReq: tReq, Zreq: Zreq, tSel: tSel,
      stiffener: el.stiffener || '', section: sec, Zsel: Zsel,
      UCt: tSel > 0 ? tReq / tSel : null,
      UCz: Zsel > 0 ? Zreq / Zsel : null
    };
  }

  /* ------------------------------------------------- prescriptive rows ----
     Both parts carry pages of closed forms checked against a selected value.
     They come in two directions and mixing them up inverts the verdict:

       req  a minimum — UC = required / selected, over 1,00 fails
       lim  a maximum — UC = actual / limit, over 1,00 exceeds  */

  function req(name, required, selected, unit, ref) {
    var sel = n(selected);
    return {
      name: name, kind: 'minimum', required: required, selected: sel, unit: unit, ref: ref,
      UC: sel > 0 ? required / sel : null,
      status: sel > 0 ? (required / sel <= 1 ? 'OK' : 'FAIL') : 'n/a'
    };
  }

  /* `limit` of null means the rule gives no number here. Both workbooks
     compare such rows against a dash, which Excel reads as "any number is
     less than any text" and prints OK; saying so plainly is better than
     reproducing that artefact. */
  function lim(name, limit, actual, unit, ref) {
    var a = n(actual);
    if (limit === null || limit === undefined) {
      return { name: name, kind: 'maximum', limit: null, actual: a, unit: unit, ref: ref,
        UC: null, status: 'no numeric limit' };
    }
    return {
      name: name, kind: 'maximum', limit: n(limit), actual: a, unit: unit, ref: ref,
      UC: n(limit) > 0 ? a / n(limit) : null,
      status: a <= n(limit) ? 'OK' : 'EXCEEDS'
    };
  }

  /* A yes/no rule that turns on past a threshold, reported rather than scored. */
  function trigger(name, on, ref) {
    return { name: name, kind: 'trigger', required: on, ref: ref,
      status: on ? 'REQUIRED' : 'not required' };
  }

  /* Worst utilisation over a mixed list of rows, with the row that set it. */
  function worstOf(rows, keys) {
    var worst = null, who = '';
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var v = r[k];
        if (v !== null && v !== undefined && (worst === null || v > worst)) {
          worst = v; who = r.name;
        }
      });
    });
    return { worst: worst, governing: who };
  }

  return {
    AC4: AC4, fbdgOf: fbdgOf, cE: cE, alphaP: alphaP, tcTotal: tcTotal,
    panelRow: panelRow, req: req, lim: lim, trigger: trigger, worstOf: worstOf
  };
})();
