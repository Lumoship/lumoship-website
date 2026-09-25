// =============================================================================
// 66-dnv-section.js — kesit özellikleri (net50) + düşey kesme için birim kesme akışı q_v (çok hücreli kapalı kesit) — M4b
//   Ch 5 Sec 3 [4.2]: τ = Q·q_v/t·10³ ; q_v: Q = 1 kN için kesme akışı (kN/mm… burada N/mm per kN → τ N/mm² = Q[kN]·q_v[1/mm]/t[mm]·10³)
//   Yöntem: yarım kesit (y ≥ 0), CL'de kesilen plakalar serbest uç (simetriden q = 0). Plakalar küçük parçalara bölünür,
//   graf: düğüm = plaka uçları (3 mm), kenar = parça. Yayılan ağaç + kirişler (chord): kesilmiş ağaç akışı + hücre başına sabit akış,
//   uyumluluk ∮(q/t)ds = 0 ile çözülür. Profiller bağlantı noktasında nokta alan.
// Girdi (mm, mm²): plates [{y0,z0,y1,z1,t, arc:{R} (ops: uçlardan geçen yay, merkez kesit içinde)}], stiffs [{y,z,A}]
// SAF. Doğrulama: _dev/dnv-ref/verify-dnv-shearflow.js
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNVSection = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TOL = 3;   // düğüm birleştirme (mm)

  // plakayı parçalara böl → [{y0,z0,y1,z1,t,ds,ym,zm,plate:i,s0 (girth başlangıcı)}]
  function discretize(plates0, maxDs, extraPts) {
    const segs = [];
    // Ön adım: bir plakanın ucu başka bir plakanın üzerine SNAP (100 mm) içinde düşüyorsa uç o noktaya taşınır (model kırıkları)
    const plates = plates0.map(p => Object.assign({}, p));
    const SNAP0 = 100;
    const nearestOn = (q, y, z) => {
      if (q.arc && q.arc.R) {
        const dy = q.y1 - q.y0, dz = q.z1 - q.z0, c = Math.hypot(dy, dz), R = Math.max(q.arc.R, c / 2 + 1e-6), hm = Math.sqrt(R * R - c * c / 4);
        const side = q.arc.side != null ? q.arc.side : 1, cy = (q.y0 + q.y1) / 2 + side * (-dz / c) * hm, cz = (q.z0 + q.z1) / 2 + side * (dy / c) * hm;
        const d = Math.hypot(y - cy, z - cz) || 1; const py = cy + (y - cy) / d * R, pz = cz + (z - cz) / d * R;
        return { d: Math.hypot(py - y, pz - z), y: py, z: pz };
      }
      const dy = q.y1 - q.y0, dz = q.z1 - q.z0, L2 = dy * dy + dz * dz || 1;
      let t = ((y - q.y0) * dy + (z - q.z0) * dz) / L2; t = Math.max(0, Math.min(1, t));
      const py = q.y0 + t * dy, pz = q.z0 + t * dz; return { d: Math.hypot(py - y, pz - z), y: py, z: pz };
    };
    plates.forEach((p, i) => {
      for (const end of ['0', '1']) {
        const y = p['y' + end], z = p['z' + end]; let best = null;
        plates.forEach((q, j) => { if (j === i) return; const r = nearestOn(q, y, z); if (r.d <= SNAP0 && (!best || r.d < best.d)) best = r; });
        if (best && best.d > 1e-6) { p['y' + end] = best.y; p['z' + end] = best.z; }
      }
    });
    // T-bağlantıları ve profil bağlantı noktaları: bu plakanın üzerine düşen her nokta düğüm olur (düz plakalar; parametre t)
    const endpoints = []; plates.forEach(p => { endpoints.push([p.y0, p.z0], [p.y1, p.z1]); });
    (extraPts || []).forEach(q => endpoints.push([q.y, q.z]));
    const SNAP = TOL;   // uçlar yukarıda yapıştırıldı; burada yalnız tam üstüne düşenler
    const forcedT = p => {
      if (p.arc && p.arc.R) return [];
      const dy = p.y1 - p.y0, dz = p.z1 - p.z0, L2 = dy * dy + dz * dz || 1, out = [];
      for (const [ey, ez] of endpoints) {
        const t = ((ey - p.y0) * dy + (ez - p.z0) * dz) / L2; if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const d = Math.hypot(ey - (p.y0 + t * dy), ez - (p.z0 + t * dz)); if (d <= SNAP) out.push(t);
      }
      return out.sort((a, b) => a - b);
    };
    // yay: merkez/açı hesabı ve yay üzerine düşen noktalar (açı parametresi)
    const arcGeom = p => {
      const dy = p.y1 - p.y0, dz = p.z1 - p.z0, c = Math.hypot(dy, dz), R = Math.max(p.arc.R, c / 2 + 1e-6);
      const hm = Math.sqrt(R * R - c * c / 4), mx = (p.y0 + p.y1) / 2, mz = (p.z0 + p.z1) / 2;
      const nx = -dz / c, nz = dy / c, side = p.arc.side != null ? p.arc.side : 1;
      const cy = mx + side * nx * hm, cz = mz + side * nz * hm;
      let a0 = Math.atan2(p.z0 - cz, p.y0 - cy), a1 = Math.atan2(p.z1 - cz, p.y1 - cy);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      return { R, cy, cz, a0, da };
    };
    const forcedArc = (p, g) => {
      const out = [];
      for (const [ey, ez] of endpoints) {
        const d = Math.hypot(ey - g.cy, ez - g.cz); if (Math.abs(d - g.R) > SNAP) continue;
        let u = (Math.atan2(ez - g.cz, ey - g.cy) - g.a0) / g.da; while (u > 1.5) u -= 2 * Math.PI / Math.abs(g.da); while (u < -0.5) u += 2 * Math.PI / Math.abs(g.da);
        if (u > 1e-3 && u < 1 - 1e-3) out.push(u);
      }
      return out.sort((a, b) => a - b);
    };
    plates.forEach((p, i) => {
      if (p.arc && p.arc.R) {
        const g = arcGeom(p), R = g.R, cy = g.cy, cz = g.cz, a0 = g.a0, da = g.da; let s = 0;
        const cuts = [0].concat(forcedArc(p, g), [1]);
        for (let c = 0; c < cuts.length - 1; c++) {
          const ua = cuts[c], ub = cuts[c + 1]; if (ub - ua <= 1e-6) continue;
          const n = Math.max(2, Math.ceil(Math.abs(da) * (ub - ua) * R / maxDs));
          for (let k = 0; k < n; k++) {
            const t0 = a0 + da * (ua + (ub - ua) * k / n), t1 = a0 + da * (ua + (ub - ua) * (k + 1) / n);
            const y0 = cy + R * Math.cos(t0), z0 = cz + R * Math.sin(t0), y1 = cy + R * Math.cos(t1), z1 = cz + R * Math.sin(t1);
            const ds = Math.hypot(y1 - y0, z1 - z0);
            segs.push({ y0, z0, y1, z1, t: p.t, ds, ym: (y0 + y1) / 2, zm: (z0 + z1) / 2, plate: i, s0: s }); s += ds;
          }
        }
      } else {
        const L = Math.hypot(p.y1 - p.y0, p.z1 - p.z0); let s = 0;
        const cuts = [0].concat(forcedT(p), [1]);
        for (let c = 0; c < cuts.length - 1; c++) {
          const ta = cuts[c], tb = cuts[c + 1], Lc = (tb - ta) * L; if (Lc <= 1e-6) continue;
          const n = Math.max(1, Math.ceil(Lc / maxDs));
          for (let k = 0; k < n; k++) {
            const u0 = ta + (tb - ta) * k / n, u1 = ta + (tb - ta) * (k + 1) / n;
            const y0 = p.y0 + (p.y1 - p.y0) * u0, z0 = p.z0 + (p.z1 - p.z0) * u0, y1 = p.y0 + (p.y1 - p.y0) * u1, z1 = p.z0 + (p.z1 - p.z0) * u1;
            const ds = Lc / n; segs.push({ y0, z0, y1, z1, t: p.t, ds, ym: (y0 + y1) / 2, zm: (z0 + z1) / 2, plate: i, s0: s }); s += ds;
          }
        }
      }
    });
    return segs;
  }
  // kesit özellikleri (tam kesit = yarım × 2). Dönüş: A (mm²), zn (mm), Iy (mm⁴), Iz (mm⁴)
  function properties(segs, stiffs) {
    let A = 0, Sz = 0, Sy = 0;
    for (const s of segs) { const a = s.ds * s.t; A += a; Sz += a * s.zm; }
    for (const st of stiffs) { A += st.A; Sz += st.A * st.z; }
    const zn = Sz / A; let Iy = 0, Iz = 0;
    for (const s of segs) { const a = s.ds * s.t, dz = s.z1 - s.z0, dy = s.y1 - s.y0; Iy += a * Math.pow(s.zm - zn, 2) + s.t * s.ds * dz * dz / 12; Iz += a * s.ym * s.ym + s.t * s.ds * dy * dy / 12; }
    for (const st of stiffs) { Iy += st.A * Math.pow(st.z - zn, 2); Iz += st.A * st.y * st.y; }
    return { A: 2 * A, zn, Iy: 2 * Iy, Iz: 2 * Iz, Ahalf: A };
  }
  // ---------------------------------------------------------- graf + kesme akışı
  function nodeKey(nodes, y, z) {
    for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].y - y) <= TOL && Math.abs(nodes[i].z - z) <= TOL) return i;
    nodes.push({ y, z, edges: [], A: 0 }); return nodes.length - 1;
  }
  // q_v: her parça için birim kesme (Q = 1) akışı — ortasında. Dönüş: {q: [per seg], props}
  function shearFlow(plates, stiffs, opts) {
    const maxDs = (opts && opts.maxDs) || 40;
    const segs = discretize(plates, maxDs, stiffs), pr = properties(segs, stiffs);
    const nodes = [];
    segs.forEach((s, i) => { s.a = nodeKey(nodes, s.y0, s.z0); s.b = nodeKey(nodes, s.y1, s.z1); s.i = i; nodes[s.a].edges.push(i); nodes[s.b].edges.push(i); });
    // profil nokta alanları → en yakın düğüm (bağlantı plakası üzerinde en yakın parça ucu)
    for (const st of stiffs) { let bi = -1, bd = Infinity; nodes.forEach((n, i) => { const d = Math.hypot(n.y - st.y, n.z - st.z); if (d < bd) { bd = d; bi = i; } }); nodes[bi].A += st.A; nodes[bi].Sz = (nodes[bi].Sz || 0) + st.A * (st.z - pr.zn); }
    // CL düğümleri (y ≈ 0): serbest uç → derece 1 gibi (akış 0)
    const isCL = n => Math.abs(n.y) <= TOL;
    // yayılan ağaç (BFS, CL/serbest uçlardan bağımsız); kirişler = ağaç dışı kenarlar
    const inTree = new Array(segs.length).fill(false), parentEdge = new Array(nodes.length).fill(-1), depth = new Array(nodes.length).fill(-1), order = [];
    for (let r = 0; r < nodes.length; r++) {
      if (depth[r] >= 0) continue; depth[r] = 0; const q = [r]; order.push(r);
      while (q.length) { const u = q.shift(); for (const e of nodes[u].edges) { const s = segs[e], v = s.a === u ? s.b : s.a; if (depth[v] < 0) { depth[v] = depth[u] + 1; parentEdge[v] = e; inTree[e] = true; order.push(v); q.push(v); } } }
    }
    const chords = segs.filter(s => !inTree[s.i]);
    const m = chords.length, dim = 1 + m;
    // her parçanın akışı: vektör [açık, chord1..m]. Ağaç akışı: yapraklardan köke; chord uçları kesik (akış 0 + kendi sabiti)
    // ağaç kenarı için q(ortası) = alt ağaç katkısı + parçanın yarısı ; alt ağaç = düğüm katkıları (profil) + alt kenar katkıları
    // Yön: kenar e, düğüm child→parent. "yük" = Σ z'·dA (mm³) ; q = −yük/I (Q=1 için, I tam kesit) ; işaret sonra kontrol
    const zc = s => s.zm - pr.zn;
    const segQ = segs.map(() => new Float64Array(dim));   // akış vektörü (ortada)
    const nodeLoad = nodes.map(() => new Float64Array(dim));   // düğümde biriken yük (çocuklardan + profil)
    const contrib = new Array(segs.length).fill(null);          // kenarın parent ucundaki toplam yük vektörü
    for (const n of nodes) { const v = nodeLoad[nodes.indexOf(n)]; v[0] += n.Sz || 0; }
    // chord'lar: her chord kesik kabul; chord'un kendi yükü iki ucuna yarı yarıya; chord sabiti k → uçlarına ±1 taşır
    chords.forEach((s, k) => {
      const half = zc(s) * s.ds * s.t / 2;
      nodeLoad[s.a][0] += half; nodeLoad[s.b][0] += half;           // kesilmiş: uçlara yük
      // sabit akış chord boyunca a→b yönünde +1: a düğümüne −1 (çıkan), b düğümüne +1 (giren) etkisi
      nodeLoad[s.a][1 + k] -= 1; nodeLoad[s.b][1 + k] += 1;
      const q = segQ[s.i]; q[0] = 0; q[1 + k] = 1;                 // (kendi yükü uçlara verildi; ortada yaklaşık sabit)
    });
    // ağaç: derinlik azalan sırayla (yapraktan köke)
    const byDepth = order.slice().sort((u, v) => depth[v] - depth[u]);
    for (const v of byDepth) {
      const e = parentEdge[v]; if (e < 0) continue;
      const s = segs[e], u = s.a === v ? s.b : s.a;                  // v child, u parent
      const own = zc(s) * s.ds * s.t;
      const q = segQ[e];
      for (let j = 0; j < dim; j++) q[j] = nodeLoad[v][j] + (j === 0 ? own / 2 : 0);
      // yön: akış child→parent pozitif; parent düğümüne ekle
      for (let j = 0; j < dim; j++) nodeLoad[u][j] += nodeLoad[v][j] + (j === 0 ? own : 0);
      s.dir = (s.a === v) ? 1 : -1;                                   // +1: a→b child→parent
    }
    chords.forEach(s => { s.dir = 1; });
    // uyumluluk: her chord k için döngü = chord + ağaç yolu (b → ... → a). ∮ q/t ds = 0
    const parentOf = x => parentEdge[x] < 0 ? -1 : (segs[parentEdge[x]].a === x ? segs[parentEdge[x]].b : segs[parentEdge[x]].a);
    const path = (from, to) => { // ağaçta from → to düğüm yolu, [{e, from, to}] (kenar yönü döngü yönünde)
      const anc = new Set(); for (let x = from; x >= 0; x = parentOf(x)) anc.add(x);
      let lca = to; while (!anc.has(lca)) lca = parentOf(lca);
      const seq1 = []; for (let x = from; x !== lca; x = parentOf(x)) seq1.push({ e: parentEdge[x], from: x, to: parentOf(x) });          // from → lca
      const seq2 = []; for (let y = to; y !== lca; y = parentOf(y)) seq2.push({ e: parentEdge[y], from: parentOf(y), to: y });            // (lca → to) ters sırada
      return seq1.concat(seq2.reverse());
    };
    const M = [], rhs = [];
    chords.forEach((c, k) => {
      const loop = [{ e: c.i, from: c.a, to: c.b }].concat(path(c.b, c.a));
      const row = new Float64Array(m); let b = 0;
      for (const h of loop) {
        const s = segs[h.e];
        // parçadaki hesaplanan akış yönü: child→parent (s.dir) ; döngü yönü from→to ; a→b ise +
        const flowAB = (h.from === s.a) ? 1 : -1;                     // döngü yönü a→b mi
        const sgn = flowAB * s.dir, w = s.ds / s.t;
        const q = segQ[h.e]; b -= sgn * q[0] * w;
        for (let j = 0; j < m; j++) row[j] += sgn * q[1 + j] * w;
      }
      M.push(row); rhs.push(b);
    });
    const qc = solve(M, rhs);
    // toplam akış (a→b yönünde, Q = 1 kN, I mm⁴: q = −load/I → kN/mm ; τ = Q·q/t (kN/mm²) ×1000 → N/mm²)
    const I = pr.Iy;
    segs.forEach((s, i) => { const v = segQ[i]; let q = v[0]; for (let j = 0; j < m; j++) q += v[1 + j] * qc[j]; s.q = -(q * s.dir) / I; });
    return { segs, props: pr, chords: m, nodes };
  }
  function solve(A, b) { const n = b.length; if (!n) return []; const M = A.map((r, i) => Array.from(r).concat([b[i]]));
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-30; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
    return M.map((r, i) => r[n] / (r[i] || 1e-30)); }
  // bir noktadaki q_v (en yakın parça ortası): (y, z) mm
  function qAt(sf, y, z, plateIdx) {
    let best = null, bd = Infinity;
    for (const s of sf.segs) { if (plateIdx != null && s.plate !== plateIdx) continue; const d = Math.hypot(s.ym - y, s.zm - z); if (d < bd) { bd = d; best = s; } }
    return best ? best.q : 0;                        // en yakın parça (yay/eğik EPP orta noktası parça ortasından uzak olabilir)
  }
  // τ_hg (N/mm²) = Q (kN) · q_v (1/mm) / t (mm) · 10³ ; Q pozitif: kural işareti
  const tau = (Q_kN, qv, t_mm) => Q_kN * qv / t_mm * 1000;
  return { discretize, properties, shearFlow, qAt, tau };
});
