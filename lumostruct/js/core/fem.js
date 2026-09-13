        // ============== FEM ENGINE ==============
        // Eleman geometrisi, yuk dagitimi, rijitlik montaji ve sonuc kurtarma.
        // Tarayici arayuzune bagli degildir; tek DOM okumasi celik kalitesi ve yuk
        // kombinasyonu secicileridir. Dogrusal cozucu js/core/linsolve.js icinde.

        // Bu dosya uzun sure js/ui/measurement.js icinde, olcme seridi araciyla yan
        // yana duruyordu - dosya adi ile icerik uyusmuyordu.

        // Element local axes, shared by the stiffness assembly and the load application so
        // the two can never disagree. x' runs along the member, y' is horizontal across it,
        // z' is the remaining (roughly upward) axis.
        //
        // rollDeg turns the section about its own axis - what the orientation control in the
        // model means. The stiffness needs it (the profile really is lying on its side); the
        // load direction does not (sideways is still sideways), so loads pass 0.
        function elementFrame(n1, n2, rollDeg) {
            const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = (n2.z || 0) - (n1.z || 0);
            const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (L < 1e-12) return null;
            const cx = dx / L, cy = dy / L, cz = dz / L;
            let yx, yy, yz, zx, zy, zz;
            if (Math.abs(cz) > 0.9999) {
                yx = 0; yy = 1; yz = 0;              // vertical member: global Y as reference
                zx = -cz; zy = 0; zz = 0;
            } else {
                const yl = Math.sqrt(cx * cx + cy * cy);
                yx = -cy / yl; yy = cx / yl; yz = 0;
                zx = cy * yz - cz * yy;
                zy = cz * yx - cx * yz;
                zz = cx * yy - cy * yx;
            }
            let yv = [yx, yy, yz], zv = [zx, zy, zz];

            const roll = (rollDeg || 0) * Math.PI / 180;
            if (Math.abs(roll) > 1e-12) {
                const cr = Math.cos(roll), sr = Math.sin(roll);
                const y2 = [yv[0] * cr + zv[0] * sr, yv[1] * cr + zv[1] * sr, yv[2] * cr + zv[2] * sr];
                const z2 = [-yv[0] * sr + zv[0] * cr, -yv[1] * sr + zv[1] * cr, -yv[2] * sr + zv[2] * cr];
                yv = y2; zv = z2;
            }

            return { L: L, cx: cx, cy: cy, cz: cz, x: [cx, cy, cz], y: yv, z: zv };
        }

        // Consistent nodal loads for a uniform load of unit intensity running from a to b
        // along a member of length L. Multiply by the signed intensity to get the force and
        // moment to apply at each end.
        //
        // Obtained by integrating the point-load fixed-end formulas over [a, b], so a
        // partial load lands where it actually sits. Over the full span these reduce to the
        // familiar L/2 and L^2/12.
        // Bir hat yukunun yonu. TEK kaynak: hem cozucu hem cizim buradan okur.
        //
        // Konvansiyon: q bir BUYUKLUK, yonu `angle` verir - 90 derece asagi (global -Z),
        // 0 derece kirise dik yatay. Tekil yuklerdeki Fz ise bir BILESEN'dir, yani
        // asagi icin negatiftir. Ikisi celismez; farkli buyuklukler.
        //
        // Cizim bunu bilmiyordu ve "q < 0 ise asagi" varsayiyordu, bu yuzden her normal
        // asagi yuk yukari-kaldirma renginde ve yonunde ciziliyordu.
        function lineLoadDirection(load) {
            const q = load.value ?? load.q ?? 0;
            const angleRad = ((load.angle !== undefined) ? load.angle : 90) * Math.PI / 180;
            const vertical = -q * Math.sin(angleRad);     // global Z bileseni
            const lateral = q * Math.cos(angleRad);       // kirise dik yatay bilesen
            return {
                q: q,
                vertical: vertical,
                lateral: lateral,
                isDownward: vertical < 0,
                magnitude: Math.abs(q)
            };
        }

        // Steel density and gravity, for self weight.
        const STEEL_DENSITY = 7850;      // kg/m3
        const GRAVITY = 9.81;            // m/s2

        // Factors for the selected load combination, by load category. Loads carry a `case`
        // of 'D' (dead) or 'L' (live); self weight is always dead.
        function currentLoadFactors() {
            const lc = (typeof document !== 'undefined' &&
                        document.getElementById('loadCombSelect')?.value) || 'LC1';
            switch (lc) {
                case 'LC2': return { D: 1.2, L: 1.5 };   // factored
                case 'LC3': return { D: 1.0, L: 0.0 };   // dead only
                default:    return { D: 1.0, L: 1.0 };   // LC1, service
            }
        }

        // Put a uniform load of global intensity wVec (N/m) on the stretch of a member
        // between a and b. Used by line loads and by self weight, so both are placed the
        // same consistent way.
        function addDistributedLoad(F, dofs1, dofs2, frame, wVec, a, b) {
            const L = frame.L;
            if (b - a < 1e-12) return;
            const sh = partialUdlFactors(L, a, b);

            // Split into the part along the member and the part across it: they are carried
            // in completely different ways.
            const wAxial = wVec[0] * frame.x[0] + wVec[1] * frame.x[1] + wVec[2] * frame.x[2];
            const wPerp = [wVec[0] - wAxial * frame.x[0],
                           wVec[1] - wAxial * frame.x[1],
                           wVec[2] - wAxial * frame.x[2]];
            const wp = Math.sqrt(wPerp[0] * wPerp[0] + wPerp[1] * wPerp[1] + wPerp[2] * wPerp[2]);

            // Across the member: bending. A load along d bends about x' x d, so the moment
            // vector is -(x' x d) - which reduces to "beam along X bends about Y" as before.
            if (wp > 1e-12) {
                const u = [wPerp[0] / wp, wPerp[1] / wp, wPerp[2] / wp];
                const axis = [frame.x[1] * u[2] - frame.x[2] * u[1],
                              frame.x[2] * u[0] - frame.x[0] * u[2],
                              frame.x[0] * u[1] - frame.x[1] * u[0]];
                for (let i = 0; i < 3; i++) {
                    F[dofs1[i]] += wp * sh.V1 * u[i];
                    F[dofs2[i]] += wp * sh.V2 * u[i];
                    F[dofs1[3 + i]] += -wp * sh.M1 * axis[i];
                    F[dofs2[3 + i]] += -wp * sh.M2 * axis[i];
                }
            }

            // Along the member: pure axial, shared by the bar shape functions.
            if (Math.abs(wAxial) > 1e-12) {
                const span = b - a;
                const mid = (b * b - a * a) / (2 * L);
                const A1 = wAxial * (span - mid), A2 = wAxial * mid;
                for (let i = 0; i < 3; i++) {
                    F[dofs1[i]] += A1 * frame.x[i];
                    F[dofs2[i]] += A2 * frame.x[i];
                }
            }
        }

        // Burulma sabiti TEK yerde. Rijitlik montaji ile ic kuvvet geri
        // kazanimi ayni degeri kullanmak ZORUNDA: iki ayri kopya zamanla
        // birbirinden ayrilir ve burulma moment cikti ile rijitlik farkli
        // kesitten hesaplanmis olur.
        function torsiyonSabiti(sec, Iy, Iz, kesitAdi) {
            let J = sec.J;
            if (J > 0) return J;
            // Ince cidarli acik kesit yaklasimi: (1/3) h tw^3. O da yoksa
            // cozumu bozmayacak kadar kucuk ama sifir olmayan bir deger.
            J = (sec.h > 0 && sec.tw > 0)
                ? sec.h * Math.pow(sec.tw, 3) / 3
                : Math.min(Iy, Iz) * 1e-3;
            debugWarn('Section ' + kesitAdi + ' has no torsion constant J; ' +
                      'estimated ' + J.toExponential(3) + ' m4');
            return J;
        }

        // Kayma alani EGILME DUZLEMINE gore degisir: guclu eksen egilmesinde
        // (yerel z yonunde sehim) kesme GOVDEDEN gecer, zayif eksende
        // FLANSLARDAN. Ikisinde de govde alanini kullanmak zayif eksende kirisi
        // gereginden rijit yapiyordu.
        //
        // Olculdu (Steel 4.4.7 "gantry crane cradle", kapali kutu kesit): duzlem
        // disi buyuklukler %0.05 tutarken yanal tepki %2, duzlem ici mesnet
        // momenti %5.2, yatay sehim %4.6 sapiyordu. Kayma alanini flanslara
        // cevirince yanal sapmalar %1-2'ye iniyor ama bu sefer dusey bozuluyor -
        // yani tek alan kullanmak dogru degil, duzleme gore SECMEK gerekiyor.
        //
        // Flans alani bilinmiyorsa eski davranis (govde alani) korunur; boylece
        // Aflange tasimayan eski kesitlerde sonuc degismez.
        function kaymaKappalari(sec) {
            const z = (sec.Aweb && sec.Aweb > 0 && sec.A > 0)
                ? sec.Aweb / sec.A
                : (sec.h && sec.A ? 5 / 6 : 0.85);
            const y = (sec.Aflange && sec.Aflange > 0 && sec.A > 0)
                ? sec.Aflange / sec.A
                : z;
            return { z: z, y: y };
        }

        // ---- KESIT DISBUKEYLIGI ----
        // Plakali bir takviyede dugumler PLAKA duzleminde durur, kesitin
        // agirlik merkezi ise ondan `centroidY` kadar otededir. Eleman ekseni
        // merkezden gecer; dugumle arasindaki bu rijit kol, EGILME ile EKSENEL
        // davranisi birbirine baglar. Mesnetler eksenel olarak da tutuluysa
        // yapiya kemerlenme rijitligi ekler.
        //
        // Olculdu: DNV 3D Beam vakasinda (L/h = 7.7) omurga momentini %1.3,
        // Steel 4.4.6 vakasinda (L/h ortanca 1.16) sehimleri %20-36
        // degistiriyor. Ikisi de bu kolu modelliyor.
        //
        // KAPALI GELIR. Acmak modelin ne demek oldugunu degistirir: dugumler
        // plaka hizasinda mi, agirlik merkezi hizasinda mi cizildi? Ikincisiyse
        // acmak YANLIS olur. model.eccentricSections = true ile acilir.
        function kesitOtelemesi(sec) {
            if (typeof model === 'undefined' || !model || !model.eccentricSections) return 0;
            if (!sec || !sec.isComposite) return 0;         // plakasiz profilde referans yok
            const e = sec.axisOffset;
            return (typeof e === 'number' && isFinite(e) && e > 0) ? e : 0;
        }

        // Rijit kolun 12x12 donusumu, elemanin YEREL ekseninde.
        //
        // YALNIZCA EKSENEL <-> EGILME bagLanir, yanal <-> burulma DEGIL. Sebebi
        // fizik: egilme AGIRLIK MERKEZI etrafinda olur, burulma ise KAYMA
        // MERKEZI etrafinda. Plakaya baglanmis acik bir kesitte (T, bulb,
        // kosebent + plaka) kayma merkezi plakanin kendisindedir - yani
        // dugum cizgisinde. Kiris kendi ekseni etrafinda burulurken plaka
        // hizasindaki nokta yerinde kalir.
        //
        // Bu ayrim ANLAMIN TAMAMI. Ilk yazdigimda iki bagLasima da ayni kolu
        // vermistim; o zaman duz bir izgarada kollar birbirini tam olarak
        // goturuyor ve etki SIFIR cikiyordu - DNV 3D Beam vakasinda hicbir sey
        // degismemisti. Burulma kolu kaldirilinca ayni vaka yerine oturdu:
        // omurga momenti hatasi %1.31 -> %0.11, eksenel kuvvet 0 -> 1967 N
        // (DNV 1917 N).
        //
        // Kol dugumden agirlik merkezine: r = (0, 0, -e), plaka yerel +z
        // tarafinda. Fiziksel bagLanti u_eleman = u_dugum + theta x r.
        // Yerel vektordeki donme bilesenleri IC kuralda (fiziksel donmenin
        // tersi); isaret ona gore, dogrulamasi _verify-b.js kinematik sinamasi.
        function otelemeDonusumu(e) {
            const T = [];
            for (let i = 0; i < 12; i++) { T[i] = new Array(12).fill(0); T[i][i] = 1; }
            for (const b of [0, 6]) {
                T[b + 0][b + 4] = e;      // ux_eleman = ux_dugum + e * thetaY
            }
            return T;
        }

        function partialUdlFactors(L, a, b) {
            const L2 = L * L, L3 = L2 * L;
            const I1 = x => L2 * x * x / 2 - 2 * L * x * x * x / 3 + x * x * x * x / 4;
            const I2 = x => L * x * x * x / 3 - x * x * x * x / 4;
            const J1 = x => L3 * x - L * x * x * x + x * x * x * x / 2;
            const J2 = x => L * x * x * x - x * x * x * x / 2;
            return {
                V1: (J1(b) - J1(a)) / L3,        // end 1 share of the force
                V2: (J2(b) - J2(a)) / L3,        // end 2 share
                M1: (I1(b) - I1(a)) / L2,        // end 1 moment
                M2: -(I2(b) - I2(a)) / L2        // end 2 moment
            };
        }

        function solve() {
            const nNodes = Object.keys(model.nodes).length;
            const nDof = nNodes * 6;
            const grade = document.getElementById('steelGrade').value;
            const mat = MATERIALS[grade];
            
            // Initialize K and F. K is symmetric and nearly empty, so it is held sparse
            // - see js/core/linsolve.js. Dense storage cost 44 MB and 49 s at 400 nodes.
            const K = new SparseSymMatrix(nDof);
            const F = new Float64Array(nDof);
            
            // Node DOF mapping
            const nodeDofs = {};
            let dofIdx = 0;
            Object.keys(model.nodes).forEach(nodeId => {
                nodeDofs[nodeId] = [];
                for (let i = 0; i < 6; i++) {
                    nodeDofs[nodeId].push(dofIdx++);
                }
            });
            
            // Factors for the selected load combination - applied to every load below.
            const loadFactors = currentLoadFactors();

            // Assemble stiffness
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                
                // Skip if nodes don't exist
                if (!n1 || !n2) {
                    debugWarn(`Skipping element with missing nodes: n1=${elem.n1}, n2=${elem.n2}`);
                    return;
                }
                
                // Ensure section exists in library
                let sec = SECTIONS[elem.section];
                if (!sec) {
                    // Try to parse and register the section
                    layerToSection(elem.section);
                    sec = SECTIONS[elem.section];
                }
                if (!sec) {
                    debugError('Section not found:', elem.section);
                    sec = SECTIONS['HP200x10']; // Fallback
                }
                
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dz = (n2.z || 0) - (n1.z || 0);
                const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                // Skip zero-length elements
                if (L < 1e-10) {
                    debugWarn(`Skipping zero-length element ${elem.id} in stiffness assembly`);
                    return; // Skip this element in forEach
                }
                
                const cx = dx / L, cy = dy / L, cz = dz / L;
                const c = cx, s = cy;  // legacy (in-plane load assembly)
                
                const E = mat.E;
                const G = mat.G;
                const A = sec.A;
                const Iy = sec.Iy;  // Strong axis (for vertical bending)
                const Iz = sec.Iz;  // Weak axis (for horizontal bending)

                // A missing or zero property here poisons the whole stiffness matrix with
                // NaN, and the NaN guard further down then reports it as a displacement of
                // exactly zero. Catch it at the source and say so instead.
                const J = torsiyonSabiti(sec, Iy, Iz, elem.section);
                if (!(A > 0) || !(Iy > 0) || !(Iz > 0)) {
                    debugError('Section ' + elem.section + ' has invalid A/Iy/Iz - element skipped');
                    return;
                }
                
                // Timoshenko beam: include shear deformation.
                // Shear travels through the web, so the effective shear area is Aweb, not the
                // gross area - the same Aweb the stress recovery already uses. Falling back to
                // 5/6 (the rectangular value) only when no web area is known.
                const kappa = kaymaKappalari(sec);
                
                // Shear deformation parameter: Φ = 12EI / (κAGL²)
                // Iy guclu eksen (yerel z sehimi) -> govde alani;
                // Iz zayif eksen (yerel y sehimi) -> flans alani.
                const phi_y = 12 * E * Iy / (kappa.z * A * G * L * L);
                const phi_z = 12 * E * Iz / (kappa.y * A * G * L * L);
                
                // Local stiffness with Timoshenko correction
                const EA_L = E * A / L;
                const GJ_L = G * J / L;
                
                // 6 DOF per node: Ux, Uy, Uz, Rx, Ry, Rz
                // For 2D grillage in XY plane:
                // - Uz (vertical), Rx (rotation about X), Ry (rotation about Y) are active
                
                const k = [];
                for (let i = 0; i < 12; i++) k[i] = new Array(12).fill(0);
                
                // Axial (in local x) - unchanged
                k[0][0] = EA_L; k[0][6] = -EA_L;
                k[6][0] = -EA_L; k[6][6] = EA_L;
                
                // Torsion - unchanged
                k[3][3] = GJ_L; k[3][9] = -GJ_L;
                k[9][3] = -GJ_L; k[9][9] = GJ_L;
                
                // Bending about local y (vertical displacement Uz, rotation Ry)
                // Timoshenko beam stiffness coefficients
                const EI_y = E * Iy;
                const L2 = L * L;
                const L3 = L2 * L;
                const denom_y = 1 + phi_y;
                
                const k11_y = 12 * EI_y / (L3 * denom_y);
                const k12_y = 6 * EI_y / (L2 * denom_y);
                const k22_y = (4 + phi_y) * EI_y / (L * denom_y);
                const k24_y = (2 - phi_y) * EI_y / (L * denom_y);
                
                k[2][2] = k11_y;
                k[2][4] = k12_y;
                k[2][8] = -k11_y;
                k[2][10] = k12_y;
                
                k[4][2] = k12_y;
                k[4][4] = k22_y;
                k[4][8] = -k12_y;
                k[4][10] = k24_y;
                
                k[8][2] = -k11_y;
                k[8][4] = -k12_y;
                k[8][8] = k11_y;
                k[8][10] = -k12_y;
                
                k[10][2] = k12_y;
                k[10][4] = k24_y;
                k[10][8] = -k12_y;
                k[10][10] = k22_y;
                
                // Bending about local z (in-plane, Uy and Rz)
                const EI_z = E * Iz;
                const denom_z = 1 + phi_z;
                
                const k11_z = 12 * EI_z / (L3 * denom_z);
                const k12_z = 6 * EI_z / (L2 * denom_z);
                const k22_z = (4 + phi_z) * EI_z / (L * denom_z);
                const k24_z = (2 - phi_z) * EI_z / (L * denom_z);
                
                k[1][1] = k11_z;
                k[1][5] = -k12_z;
                k[1][7] = -k11_z;
                k[1][11] = -k12_z;
                
                k[5][1] = -k12_z;
                k[5][5] = k22_z;
                k[5][7] = k12_z;
                k[5][11] = k24_z;
                
                k[7][1] = -k11_z;
                k[7][5] = k12_z;
                k[7][7] = k11_z;
                k[7][11] = k12_z;
                
                k[11][1] = -k12_z;
                k[11][5] = k24_z;
                k[11][7] = k12_z;
                k[11][11] = k22_z;
                
                // Transformation matrix
                const T = [];
                for (let i = 0; i < 12; i++) T[i] = new Array(12).fill(0);
                
                // 3D direction cosine matrix (rows = local axes in global coords), including
                // the section's roll angle - a profile turned on its side really does resist
                // bending differently, so orientation has to reach the stiffness, not just
                // the 3D view.
                const frame = elementFrame(n1, n2, elem.orientation || 0);
                // Kesit disbukeyligi: eleman rijitligi once rijit kolla
                // dugum serbestliklerine tasinir, sonra global donusum.
                //
                // Yayili yuk yolu DEGISMEZ ve bu bir eksiklik degil: plakali
                // takviyede yuk plakadan gelir, yani DUGUM hizasinda etkir.
                // Elemanin sekil fonksiyonlari rijit koldan etkilenmedigi icin
                // esdeger dugum kuvvetleri oldugu gibi dogrudur.
                const eOtele = kesitOtelemesi(sec);
                let kSon = k;
                if (eOtele) {
                    const To = otelemeDonusumu(eOtele);
                    kSon = matMult(transpose(To), matMult(k, To));
                }

                const R = [frame.x, frame.y, frame.z];
                
                for (let block = 0; block < 4; block++) {
                    for (let i = 0; i < 3; i++) {
                        for (let j = 0; j < 3; j++) {
                            T[block*3 + i][block*3 + j] = R[i][j];
                        }
                    }
                }
                
                // K_global = T' * k * T
                const kTemp = matMult(kSon, T);
                const kGlobal = matMult(transpose(T), kTemp);
                
                // Assemble
                const dofs1 = nodeDofs[elem.n1];
                const dofs2 = nodeDofs[elem.n2];
                
                // Safety check
                if (!dofs1 || !dofs2) {
                    debugWarn(`Element skipped: Node DOFs not found for n1=${elem.n1}, n2=${elem.n2}`);
                    return;
                }
                
                const dofs = [...dofs1, ...dofs2];
                
                for (let i = 0; i < 12; i++) {
                    for (let j = 0; j < 12; j++) {
                        K.add(dofs[i], dofs[j], kGlobal[i][j]);
                    }
                }
            });
            
            // Apply pressure loads (legacy support)
            model.pressure.forEach(pr => {
                const area = (pr.x2 - pr.x1) * (pr.y2 - pr.y1);
                const prF = loadFactors[pr.case] !== undefined ? loadFactors[pr.case] : loadFactors.L;
                const totalForce = pr.value * area * 1000 * prF; // kN to N
                
                const inArea = Object.entries(model.nodes).filter(([id, n]) =>
                    n.x >= pr.x1 - 0.01 && n.x <= pr.x2 + 0.01 &&
                    n.y >= pr.y1 - 0.01 && n.y <= pr.y2 + 0.01
                );
                if (inArea.length === 0) return;

                // Share the patch by tributary area, not by head count: a corner node carries
                // a quarter of what a node in the middle does. Splitting equally pushes load
                // outwards onto the supports and softens the middle of the panel.
                const xs = [...new Set(inArea.map(([, n]) => n.x))].sort((a, b) => a - b);
                const ys = [...new Set(inArea.map(([, n]) => n.y))].sort((a, b) => a - b);
                const span = (vals, v, lo, hi) => {
                    if (vals.length === 1) return hi - lo;
                    const i = vals.indexOf(v);
                    const left = (i === 0) ? lo : (vals[i - 1] + v) / 2;
                    const right = (i === vals.length - 1) ? hi : (v + vals[i + 1]) / 2;
                    return right - left;
                };

                const weights = inArea.map(([, n]) =>
                    span(xs, n.x, pr.x1, pr.x2) * span(ys, n.y, pr.y1, pr.y2));
                const wSum = weights.reduce((s, v) => s + v, 0) || 1;

                inArea.forEach(([nodeId], k) => {
                    F[nodeDofs[nodeId][2]] -= totalForce * weights[k] / wSum; // Uz, down
                });
            });
            
            // Apply line loads on elements
            Object.values(model.elements).forEach(elem => {
                if (!elem.lineLoads || elem.lineLoads.length === 0) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                const frame = elementFrame(n1, n2);

                // Skip zero-length elements
                if (!frame) return;
                const L = frame.L;   // true 3D length - a sloped member carries its own length

                elem.lineLoads.forEach(load => {
                    // Load value in kN/m - support both 'value' and 'q' properties
                    const qValue = load.value ?? load.q ?? 0;
                    const w = qValue * 1000;  // kN/m to N/m
                    
                    // Handle direction/angle - 'z' means global Z (perpendicular to plate)
                    let angleRad = Math.PI / 2; // Default: vertical (Z direction)
                    if (load.angle !== undefined) {
                        angleRad = load.angle * Math.PI / 180;
                    } else if (load.direction === 'local') {
                        angleRad = Math.PI / 2; // Local still acts perpendicular to beam
                    }
                    
                    // Load length - support both percentage and decimal formats
                    const startPct = (load.startPct !== undefined) ? load.startPct : (load.start !== undefined ? load.start * 100 : 0);
                    const endPct = (load.endPct !== undefined) ? load.endPct : (load.end !== undefined ? load.end * 100 : 100);
                    
                    const loadStart = L * startPct / 100;
                    const loadEnd = L * endPct / 100;
                    if (loadEnd - loadStart < 1e-12) return;

                    const dofs1 = nodeDofs[elem.n1];
                    const dofs2 = nodeDofs[elem.n2];

                    // Safety check - skip if nodes not found
                    if (!dofs1 || !dofs2) {
                        debugWarn(`Line load skipped: Node DOFs not found for element ${Object.keys(model.elements).find(k => model.elements[k] === elem)}`);
                        return;
                    }

                    // 90 degrees is straight down (global -Z, so gravity stays gravity on a
                    // sloped member); 0 degrees is sideways across the member. Both parts are
                    // applied - dropping the sideways one silently loses load. Intensity is
                    // per unit length of the member itself.
                    const wf = w * (loadFactors[load.case] !== undefined ? loadFactors[load.case] : loadFactors.L);
                    const sinA = Math.sin(angleRad), cosA = Math.cos(angleRad);
                    const wVec = [wf * cosA * frame.y[0],
                                  wf * cosA * frame.y[1],
                                  wf * cosA * frame.y[2] - wf * sinA];

                    addDistributedLoad(F, dofs1, dofs2, frame, wVec, loadStart, loadEnd);
                });
            });

            // Self weight, if asked for. Always a dead load, always straight down, spread
            // over the member's own length.
            const selfWeightOn = document.getElementById('includeSelfWeight')?.checked;
            if (selfWeightOn) {
                Object.values(model.elements).forEach(elem => {
                    const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    const sec = SECTIONS[elem.section];
                    if (!sec || !(sec.A > 0)) return;
                    const frame = elementFrame(n1, n2);
                    if (!frame) return;
                    const dofs1 = nodeDofs[elem.n1], dofs2 = nodeDofs[elem.n2];
                    if (!dofs1 || !dofs2) return;

                    const w = sec.A * STEEL_DENSITY * GRAVITY * loadFactors.D;   // N/m
                    addDistributedLoad(F, dofs1, dofs2, frame, [0, 0, -w], 0, frame.L);
                });
            }
            
            // Apply nodal loads
            model.loads.forEach(load => {
                const dofs = nodeDofs[load.nodeId];
                if (!dofs) return;
                const lf = loadFactors[load.case] !== undefined ? loadFactors[load.case] : loadFactors.L;
                if (load.Fx) F[dofs[0]] += load.Fx * 1000 * lf;
                if (load.Fy) F[dofs[1]] += load.Fy * 1000 * lf;
                if (load.Fz) F[dofs[2]] += load.Fz * 1000 * lf;
                // Dugum momentleri. Eleman rijitligi zaten donme serbestliklerini
                // (GJ ve egilme) iceriyordu ama yuk vektorunun bu yarisi hic
                // okunmuyordu: veri modeli Mx/My/Mz tasiyor, cozucu gormuyordu.
                // Arayuzde giris alani olmadigi icin elle fark edilmiyordu; ICE
                // AKTARILAN bir modelde tanimli moment sessizce dusuyordu.
                if (load.Mx) F[dofs[3]] -= load.Mx * 1000 * lf;
                // ISARET: global donme serbestliklerinin UCU DE (3,4,5) fiziksel
                // donmenin TERSINI tutuyor. Bu, kirisin ic
                // tutarliliginda sorun degil - sehim, kuvvet ve gerilme dogru
                // cikiyor - ama disaridan gelen FIZIKSEL bir moment o kurala
                // cevrilmeden konursa ters yone etki eder.
                //
                // Olculdu: kuvvetlerden yapilmis gercek bir moment cifti ile
                // ayni buyuklukteki My/Mz, basit kirisin mesnet tepkilerini
                // TERS isaretle veriyordu. Burulma (Mx) etkilenmiyor; o
                // serbestlik fizikseldir ve TL/GJ ile birebir uyusuyor.
                if (load.My) F[dofs[4]] -= load.My * 1000 * lf;
                if (load.Mz) F[dofs[5]] -= load.Mz * 1000 * lf;
            });
            
            // Apply constraints
            //
            // ZORLANMIS YER DEGISTIRME. Tutulu bir serbestligin degeri sifir
            // olmak zorunda degil: bir enine cerceveye govde kirisinin dayattigi
            // yanal oteleme, oturan bir mesnet, kaldirma sirasinda verilen bir
            // yukseklik farki - hepsi "bu dugum SU KADAR gitsin" demek.
            // model.constraints[id].prescribed = { Uy: 0.08 } seklinde verilir;
            // birim metre ve radyan, YALNIZCA tutulu tutulan serbestlikte
            // anlamli (serbest birakilmis bir yone deger vermek celiskidir).
            //
            // Donmelerde isaret: global donme serbestlikleri fiziksel donmenin
            // TERSINI tutuyor (bkz. yukaridaki isaret notu), bu yuzden
            // kullanicinin verdigi fiziksel deger negatifleniyor.
            const fixedDofs = [];
            const zorlanan = [];            // { dof, deger }  - ic isaret kuralinda
            const ZORLANAN_ANAHTAR = ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'];
            Object.entries(model.constraints).forEach(([nodeId, bc]) => {
                const dofs = nodeDofs[nodeId];
                if (!dofs) return;
                if (bc && typeof bc === 'object' && bc.prescribed) {
                    ZORLANAN_ANAHTAR.forEach((ad, k) => {
                        const v = bc.prescribed[ad];
                        if (typeof v !== 'number' || !isFinite(v) || v === 0) return;
                        if (!bc[ad]) {
                            debugWarn('Node ' + nodeId + ': prescribed ' + ad +
                                      ' ignored - that DOF is not restrained');
                            return;
                        }
                        zorlanan.push({ dof: dofs[k], deger: k < 3 ? v : -v });
                    });
                }
                
                // Handle both string format (legacy) and object format
                if (typeof bc === 'string') {
                    if (bc === 'fixed') {
                        fixedDofs.push(...dofs);
                    } else if (bc === 'simply_supported') {
                        fixedDofs.push(dofs[2]); // Only Uz
                    } else if (bc === 'pinned') {
                        fixedDofs.push(dofs[0], dofs[1], dofs[2]); // Ux, Uy, Uz
                    }
                } else if (typeof bc === 'object') {
                    // Object format: { Ux: true, Uy: true, ... }
                    if (bc.Ux) fixedDofs.push(dofs[0]);
                    if (bc.Uy) fixedDofs.push(dofs[1]);
                    if (bc.Uz) fixedDofs.push(dofs[2]);
                    if (bc.Rx) fixedDofs.push(dofs[3]);
                    if (bc.Ry) fixedDofs.push(dofs[4]);
                    if (bc.Rz) fixedDofs.push(dofs[5]);
                }
            });
            
            const isFixedDof = new Uint8Array(nDof);
            for (let i = 0; i < fixedDofs.length; i++) isFixedDof[fixedDofs[i]] = 1;
            const freeDofs = [];
            for (let i = 0; i < nDof; i++) {
                if (!isFixedDof[i]) freeDofs.push(i);
            }

            // Zorlanmis yer degistirmeler sag tarafa tasinir:
            //     K_ss u_s = F_s - K_sz u_z
            // K simetrik oldugu icin z sutunu = z satiri; ayri bir sutun
            // gezintisi gerekmiyor. F'nin KENDISI degistirilmez - tepkiler
            // R = K u - F ile geri kazaniliyor ve orada asil yuk vektoru lazim.
            let Fcoz = F;
            if (zorlanan.length) {
                Fcoz = Float64Array.from(F);
                zorlanan.forEach(z => {
                    K.rows[z.dof].forEach((v, j) => {
                        if (!isFixedDof[j]) Fcoz[j] -= v * z.deger;
                    });
                });
            }

            // Solve K * U = F over the free DOFs. The solver reduces, renumbers and
            // factorises on its own - no second copy of the matrix is needed.
            const solution = solveStiffnessSystem(K, Fcoz, freeDofs);
            const U = solution.U;

            // Cozucu tutulu serbestlikleri sifir birakir; zorlanan degerler
            // buraya yazilir ki hem sehimler hem de tepki hesabi (K u - F)
            // dogru olsun.
            zorlanan.forEach(z => { U[z.dof] = z.deger; });

            if (solution.singularDofs.length > 0) {
                // DOFs nothing supports - a floating in-plane direction, say. They are
                // pinned to zero, which is what the old solver did silently.
                debugWarn(`${solution.singularDofs.length} unsupported DOF(s) pinned to zero: ` +
                          solution.singularDofs.slice(0, 12).join(', ') +
                          (solution.singularDofs.length > 12 ? '...' : ''));
            }
            
            // Extract results
            const displacements = {};
            let maxDeflection = 0;
            
            Object.entries(model.nodes).forEach(([nodeId, node]) => {
                const dofs = nodeDofs[nodeId];
                displacements[nodeId] = {
                    Ux: U[dofs[0]],
                    Uy: U[dofs[1]],
                    Uz: U[dofs[2]],
                    Rx: -U[dofs[3]],
                    // Disariya FIZIKSEL donme verilir (bkz. yukaridaki isaret
                    // notu). Elemanin kendi hesabi ic kurali kullanir; asagida
                    // geri cevriliyor.
                    Ry: -U[dofs[4]],
                    Rz: -U[dofs[5]]
                };
                
                if (Math.abs(U[dofs[2]]) > Math.abs(maxDeflection)) {
                    maxDeflection = U[dofs[2]];
                }
            });
            
            // Calculate element forces and stresses
            const elementResults = {};
            let maxSigma = 0, maxTau = 0, maxVonMises = 0;
            
            Object.entries(model.elements).forEach(([elemKey, elem]) => {
                const elemId = parseInt(elemKey);
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                const sec = SECTIONS[elem.section];
                
                // Check if nodes exist
                if (!n1 || !n2) {
                    debugWarn(`Element nodes not found: n1=${elem.n1}, n2=${elem.n2}`);
                    elementResults[elemId] = { sigma: 0, tau: 0, vonMises: 0, M1: 0, M2: 0, Mmid: 0, Mmax: 0, V1: 0, V2: 0, V: 0 };
                    return;
                }
                
                // Check if section exists
                if (!sec) {
                    debugWarn(`Section not found for element ${elemId}: ${elem.section}`);
                    elementResults[elemId] = { sigma: 0, tau: 0, vonMises: 0, M1: 0, M2: 0, Mmid: 0, Mmax: 0, V1: 0, V2: 0, V: 0 };
                    return;
                }
                
                if (!sec.Wy || sec.Wy <= 0) {
                    debugWarn(`Section ${elem.section} has invalid Wy:`, sec.Wy);
                }
                
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dz = (n2.z || 0) - (n1.z || 0);
                const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                // Skip zero-length elements
                if (L < 1e-10) {
                    elementResults[elemId] = { sigma: 0, tau: 0, vonMises: 0, M1: 0, M2: 0, Mmid: 0, Mmax: 0, V1: 0, V2: 0, V: 0 };
                    return;
                }
                
                const cx = dx / L, cy = dy / L, cz = dz / L;
                const c = cx, s = cy;  // legacy
                
                const d1 = displacements[elem.n1];
                const d2 = displacements[elem.n2];
                
                // Safety check - skip if displacements not found
                if (!d1 || !d2) {
                    debugWarn(`Element stress skipped: Displacements not found for n1=${elem.n1}, n2=${elem.n2}`);
                    elementResults[elemId] = { sigma: 0, tau: 0, vonMises: 0, M1: 0, M2: 0, Mmid: 0, Mmax: 0, V1: 0, V2: 0, V: 0 };
                    return;
                }
                
                // Global displacement vector for this element
                const uGlobal = [
                    // Ry/Rz disariya fiziksel isaretle veriliyor; eleman
                    // matrisi ic kurali bekledigi icin burada geri cevrilir.
                    d1.Ux, d1.Uy, d1.Uz, -d1.Rx, -d1.Ry, -d1.Rz,
                    d2.Ux, d2.Uy, d2.Uz, -d2.Rx, -d2.Ry, -d2.Rz
                ];
                
                // 3D direction cosine matrix (same convention as assembly)
                let yx, yy, yz, zx, zy, zz;
                if (Math.abs(cz) > 0.9999) {
                    yx = 0; yy = 1; yz = 0;
                    zx = -cz; zy = 0; zz = 0;
                } else {
                    const yl = Math.sqrt(cx*cx + cy*cy);
                    yx = -cy / yl; yy = cx / yl; yz = 0;
                    zx = cy*yz - cz*yy;
                    zy = cz*yx - cx*yz;
                    zz = cx*yy - cy*yx;
                }
                const R = [
                    [cx, cy, cz],
                    [yx, yy, yz],
                    [zx, zy, zz]
                ];
                
                // Transform global displacements to local
                const uLocal = [];
                for (let i = 0; i < 4; i++) {
                    const start = i * 3;
                    for (let j = 0; j < 3; j++) {
                        uLocal[start + j] = 
                            R[j][0] * uGlobal[start] + 
                            R[j][1] * uGlobal[start + 1] + 
                            R[j][2] * uGlobal[start + 2];
                    }
                }
                
                // Kesit disbukeyligi: ic kuvvetler ELEMANIN kendi ekseninde
                // hesaplanir, dugum hizasinda degil. Rijit kol burada da
                // uygulanmazsa eksenel kuvvet (kemerlenme) hic gorunmez.
                const eGeri = kesitOtelemesi(sec);
                if (eGeri) {
                    const To = otelemeDonusumu(eGeri);
                    const uD = uLocal.slice();
                    for (let i = 0; i < 12; i++) {
                        let toplam = 0;
                        for (let j = 0; j < 12; j++) toplam += To[i][j] * uD[j];
                        uLocal[i] = toplam;
                    }
                }

                // Local displacements: [ux1,uy1,uz1,θx1,θy1,θz1, ux2,uy2,uz2,θx2,θy2,θz2]
                const ux1 = uLocal[0], uy1 = uLocal[1], w1 = uLocal[2];
                const θy1 = uLocal[4], θz1 = uLocal[5];
                const ux2 = uLocal[6], uy2 = uLocal[7], w2 = uLocal[8];
                const θy2 = uLocal[10], θz2 = uLocal[11];

                // Montajdaki Timoshenko katsayilarinin AYNISI. Euler-Bernoulli bagintisini
                // kayma deformasyonu iceren bir yer degistirme alanina uygulamak, kaymayi
                // egilme sanip statik olarak belirli bir kiriste bile momenti sasirtiyordu
                // (ankastre + UDL: 180 yerine 181.3 kNm).
                const kappaR = kaymaKappalari(sec);
                const timoshenko = (EI, kap) => {
                    const phi = 12 * EI / (kap * sec.A * mat.G * L * L);
                    const d = 1 + phi;
                    return {
                        k11: 12 * EI / (L * L * L * d),
                        k12: 6 * EI / (L * L * d),
                        k22: (4 + phi) * EI / (L * d),
                        k24: (2 - phi) * EI / (L * d)
                    };
                };

                // --- Güçlü eksen eğilme (düşey: Uz, Ry): k·u kısmı (FEF hariç) ---
                const EIy = mat.E * sec.Iy;
                const kY = timoshenko(EIy, kappaR.z);
                const dwY = w1 - w2;
                const Vi_keu = kY.k11 * dwY + kY.k12 * (θy1 + θy2);
                const Mi_keu = kY.k12 * dwY + kY.k22 * θy1 + kY.k24 * θy2;

                // --- Distributed loads on this element (local a..b, vertical intensity wv N/m) ---
                const spanLoads = [];
                let fefV_i = 0, fefM_i = 0;  // fixed-end forces (montajla tutarlı)
                if (elem.lineLoads && elem.lineLoads.length > 0) {
                    elem.lineLoads.forEach(load => {
                        const q = (load.value ?? load.q ?? 0) * 1000; // N/m
                        const sPct = (load.startPct !== undefined) ? load.startPct : (load.start !== undefined ? load.start * 100 : 0);
                        const ePct = (load.endPct !== undefined) ? load.endPct : (load.end !== undefined ? load.end * 100 : 100);
                        const a = L * sPct / 100, b = L * ePct / 100;
                        const ll = b - a;
                        const angR = ((load.angle !== undefined) ? load.angle : 90) * Math.PI / 180;
                        // Component that bends the member in its vertical plane. On a
                        // horizontal beam this is just q*sin; on a sloped one only the
                        // part along z' does the bending, matching the assembly.
                        const frameR = elementFrame(n1, n2);
                        const wv = q * Math.sin(angR) * (frameR ? frameR.z[2] : 1);
                        if (ll > 1e-9 && Math.abs(wv) > 1e-12) {
                            spanLoads.push({ a, b, w: wv });
                            // Same factors the assembly uses, so the diagram and the
                            // displacements always describe the same beam.
                            const sh = partialUdlFactors(L, a, b);
                            fefV_i += wv * sh.V1;
                            fefM_i += wv * sh.M1;
                        }
                    });
                }

                // --- Gerçek eleman uç kuvvetleri: p = k·u + FEF ---
                const V1 = Vi_keu + fefV_i;       // sol uç düşey kuvvet
                const Mi_full = Mi_keu + fefM_i;  // sol uç eleman düğüm momenti
                const M1 = -Mi_full;              // iç moment konvansiyonu (sol uç)

                // --- Eleman boyunca kesme & moment (serbest cisim) ---
                const Vfun = (x) => {
                    let V = V1;
                    spanLoads.forEach(l => {
                        if (x >= l.b) V -= l.w * (l.b - l.a);
                        else if (x > l.a) V -= l.w * (x - l.a);
                    });
                    return V;
                };
                const Mfun = (x) => {
                    let M = M1 + V1 * x;
                    spanLoads.forEach(l => {
                        if (x >= l.b) M -= l.w * (l.b - l.a) * (x - (l.a + l.b) / 2);
                        else if (x > l.a) M -= l.w * (x - l.a) * (x - l.a) / 2;
                    });
                    return M;
                };

                // --- Gerçek Mmax: V=0 noktaları + uçlar + yük sınırları taranır ---
                let Mmax = 0;
                const samplePts = [0, L];
                spanLoads.forEach(l => {
                    samplePts.push(l.a, l.b);
                    const Va = Vfun(l.a);
                    if (Math.abs(l.w) > 1e-12) {
                        const xz = l.a + Va / l.w;   // segment içi V=0 noktası
                        if (xz > l.a && xz < l.b) samplePts.push(xz);
                    }
                });
                for (let kk = 0; kk <= 20; kk++) samplePts.push(L * kk / 20);
                samplePts.forEach(x => {
                    if (x < -1e-9 || x > L + 1e-9) return;
                    const M = Mfun(x);
                    if (Math.abs(M) > Math.abs(Mmax)) Mmax = M;
                });
                const M2 = Mfun(L);          // sağ uç iç moment
                const Mmid = Mfun(L / 2);    // orta açıklık (bilgi)

                // Ornek diyagram. Cizimler eskiden M1/Mmid/M2 uzerinden parabol
                // uyduruyordu: mutlak deger alindigi icin isaret degistiren moment sifiri
                // hic gecmiyor, kismi yukun kirigi temsil edilemiyordu. Artik hesaplanan
                // egrinin kendisi saklanir ve cizimler onu okur.
                const DIAGRAM_SAMPLES = 21;
                const diagram = { x: [], M: [], V: [] };
                for (let ds = 0; ds < DIAGRAM_SAMPLES; ds++) {
                    const xs = L * ds / (DIAGRAM_SAMPLES - 1);
                    diagram.x.push(xs);
                    diagram.M.push(-Mfun(xs) / 1e3);   // kN·m, ic moment konvansiyonu
                    diagram.V.push(Vfun(xs) / 1e3);    // kN
                }

                // --- Sehim egrisi: EI v'' = M(x) ---
                // Kiris detay penceresi sehimi `maxDef * 4t(1-t)` diye UYDURUYORDU:
                // her zaman iki ucta sifir, ortada tepe. Konsolda tepe UCTADIR, yani
                // o formul konsolun uc sehimini SIFIR gosteriyordu.
                //
                // M(x) zaten dogru (analitik hallere karsi test edildi). Egrilik iki
                // kez integre edilir; M, sehimi yalnizca DOGRUSAL bir terime kadar
                // belirler, o terim de elemanin gercek uc yer degistirmeleriyle
                // (w1, w2) sabitlenir. Boylece egri mesnet kosulundan bagimsiz olarak
                // FEM cozumuyle tutarli cikar - konsol da, surekli kiris de.
                //
                // Kayma payi (Timoshenko) ayrica eklenir: eleman rijitligi de kaymayi
                // iceriyor, egri ile yer degistirmeler ayni kirisi anlatmali.
                const NFINE = 200;
                const hf = L / NFINE;
                const GAs = kappaR.z * sec.A * mat.G;   // dusey sehim egrisi: govde kaymasi
                let thPrev = 0, vbPrev = 0, vsPrev = 0;
                const vRaw = new Float64Array(NFINE + 1);
                for (let i = 1; i <= NFINE; i++) {
                    const x0 = (i - 1) * hf, x1 = i * hf;
                    const c0 = EIy > 0 ? Mfun(x0) / EIy : 0;
                    const c1 = EIy > 0 ? Mfun(x1) / EIy : 0;
                    const thNext = thPrev + (c0 + c1) * hf / 2;
                    vbPrev += (thPrev + thNext) * hf / 2;
                    thPrev = thNext;
                    // Kayma egimi: bu dosyada M pozitif iken egrilik yukari, yani
                    // vRaw isaret olarak dugum yer degistirmelerinin TERSI. Kayma payi
                    // da ayni konvansiyonda olsun diye eksi. Isaret, iki elemanli basit
                    // kiriste egrinin FEM dugum sehimine esitlenmesiyle sabitlendi.
                    const g0 = GAs > 0 ? -Vfun(x0) / GAs : 0;
                    const g1 = GAs > 0 ? -Vfun(x1) / GAs : 0;
                    vsPrev += (g0 + g1) * hf / 2;
                    vRaw[i] = vbPrev + vsPrev;
                }
                const vEnd = vRaw[NFINE];
                diagram.d = [];
                for (let ds = 0; ds < DIAGRAM_SAMPLES; ds++) {
                    const t = ds / (DIAGRAM_SAMPLES - 1);
                    const v = vRaw[Math.round(t * NFINE)] + w1 + (w2 - w1 - vEnd) * t;
                    diagram.d.push(v * 1000);            // mm
                }
                const Vmax = Math.max(Math.abs(Vfun(0)), Math.abs(Vfun(L)));

                // --- Eksenel kuvvet (local x) ---
                const N = mat.E * sec.A / L * (ux2 - ux1);

                // --- Zayıf eksen eğilme (local y: Uy, Rz) ---
                // Aynı güçlü eksen gibi ele alınır: k·u + eşdeğer uç kuvvetler, sonra
                // açıklık taraması. Önceden yalnızca k·u alınıyordu ve işaret de tersti,
                // bu yüzden yanal yüklü elemanda moment 2.8 katına çıkıyordu.
                const EIz = mat.E * (sec.Iz || sec.Iy);
                const kZ = timoshenko(EIz, kappaR.y);

                // x-y düzleminde eğilme, x-z düzleminin işaretçe aynasıdır (montajda da
                // k[1][5] = -k12_z şeklinde). Bu yüzden dönme farkı ters yönde alınır;
                // aksi halde kesme kuvveti ters çıkar ve açıklık taraması momenti ikiye
                // katlar.
                const dwZ = uy2 - uy1;
                const Vz_keu = kZ.k11 * dwZ + kZ.k12 * (θz1 + θz2);
                const Mz_keu = kZ.k12 * dwZ + kZ.k22 * θz1 + kZ.k24 * θz2;

                // Bu elemandaki yanal dağılı yükler (local y bileşeni)
                const spanLoadsZ = [];
                let fefVz = 0, fefMz = 0;
                if (elem.lineLoads && elem.lineLoads.length > 0) {
                    const frameZ = elementFrame(n1, n2);
                    elem.lineLoads.forEach(load => {
                        const q = (load.value ?? load.q ?? 0) * 1000; // N/m
                        const sPct = (load.startPct !== undefined) ? load.startPct : (load.start !== undefined ? load.start * 100 : 0);
                        const ePct = (load.endPct !== undefined) ? load.endPct : (load.end !== undefined ? load.end * 100 : 100);
                        const a = L * sPct / 100, b = L * ePct / 100;
                        const angR = ((load.angle !== undefined) ? load.angle : 90) * Math.PI / 180;
                        // montajla aynı: yanal bileşen local y ekseni boyunca
                        const wl = q * Math.cos(angR);
                        if (b - a > 1e-9 && Math.abs(wl) > 1e-12 && frameZ) {
                            spanLoadsZ.push({ a: a, b: b, w: wl });
                            const sh = partialUdlFactors(L, a, b);
                            fefVz += wl * sh.V1;
                            fefMz += wl * sh.M1;
                        }
                    });
                }

                const Vz1 = Vz_keu + fefVz;
                const Mz1 = -(Mz_keu + fefMz);          // iç moment konvansiyonu (sol uç)

                const VzFun = (x) => {
                    let V = Vz1;
                    spanLoadsZ.forEach(l => {
                        if (x >= l.b) V -= l.w * (l.b - l.a);
                        else if (x > l.a) V -= l.w * (x - l.a);
                    });
                    return V;
                };
                const MzFun = (x) => {
                    let M = Mz1 + Vz1 * x;
                    spanLoadsZ.forEach(l => {
                        if (x >= l.b) M -= l.w * (l.b - l.a) * (x - (l.a + l.b) / 2);
                        else if (x > l.a) M -= l.w * (x - l.a) * (x - l.a) / 2;
                    });
                    return M;
                };

                let Mz_max = 0;
                const zPts = [0, L];
                spanLoadsZ.forEach(l => {
                    zPts.push(l.a, l.b);
                    if (Math.abs(l.w) > 1e-12) {
                        const xz = l.a + VzFun(l.a) / l.w;
                        if (xz > l.a && xz < l.b) zPts.push(xz);
                    }
                });
                for (let kk = 0; kk <= 20; kk++) zPts.push(L * kk / 20);
                zPts.forEach(x => {
                    if (x < -1e-9 || x > L + 1e-9) return;
                    const M = MzFun(x);
                    if (Math.abs(M) > Math.abs(Mz_max)) Mz_max = M;
                });
                Mz_max = Math.abs(Mz_max);

                // --- Burulma ---
                // Eskiden HIC hesaplanmiyordu: tablo ve rapor kirisin burulma
                // momentini gosteremiyordu, oysa bir izgarada ana kirisin
                // egilmesi enine kirise BURULMA olarak giriyor - grillage
                // davranisinin yarisi budur. Sabit kesitli, acikligi boyunca
                // burulma yuku olmayan elemanda T sabittir.
                const thx1 = uLocal[3], thx2 = uLocal[9];
                const Jtor = torsiyonSabiti(sec, sec.Iy, sec.Iz || sec.Iy, elem.section);
                const T = mat.G * Jtor * (thx2 - thx1) / L;      // N·m

                // --- Gerilmeler ---
                // Iki uc lif ayri ayri hesaplanir. Simetrik kesitte ikisi birbirinin
                // aynasi ve sonuc eskisiyle ayni; plaka+profil gibi asimetrik kesitlerde
                // ust ve alt lif belirgin sekilde farklidir ve tabloda "sigma_min =
                // -sigma_max" diye uydurmak yerine gercek deger gosterilebilir.
                const Wy = (sec.Wy && sec.Wy > 0) ? sec.Wy : null;
                const Wz = (sec.Wz && sec.Wz > 0) ? sec.Wz : null;
                const WyT = (sec.WyTop && sec.WyTop > 0) ? sec.WyTop : Wy;
                const WyB = (sec.WyBot && sec.WyBot > 0) ? sec.WyBot : Wy;

                const sigmaAxialSigned = (sec.A > 0) ? N / sec.A : 0;
                const sigmaBendZ = Wz ? Math.abs(Mz_max) / Wz : 0;

                // Iki eksenli egilme: yanal katki lifi SIFIRDAN UZAKLASTIRACAK
                // yonde eklenir. Eskiden ust liften hep cikariliyor, alt life
                // hep ekleniyordu; My ile Mz'nin isaretleri ters dustugunde
                // terimler birbirini GOTURUYOR ve kose gerilmesi oldugundan
                // kucuk cikiyordu. Olculdu (Steel 4.4.7, ana kiris uc kesiti):
                // gercek kose gerilmesi 66 MPa iken eski kural 39 MPa
                // veriyordu - guvenli tarafta degil.
                const uzaklastir = (v, ek) => v + (v < 0 ? -ek : ek);
                const sigmaTop = uzaklastir(sigmaAxialSigned - (WyT ? Mmax / WyT : 0), sigmaBendZ) / 1e6;
                const sigmaBot = uzaklastir(sigmaAxialSigned + (WyB ? Mmax / WyB : 0), sigmaBendZ) / 1e6;
                const sigma = Math.max(Math.abs(sigmaTop), Math.abs(sigmaBot));   // MPa
                const Aweb = (sec.Aweb && sec.Aweb > 0) ? sec.Aweb
                           : (sec.h && sec.tw && sec.h < 5 && sec.tw < 1) ? sec.h * sec.tw
                           : sec.A * 0.6;
                const tauV = (Aweb > 0) ? Math.abs(Vmax) / Aweb / 1e6 : 0; // MPa

                // BURULMA KAYMA GERILMESI. Eskiden hic yoktu: tau yalnizca
                // kesme kuvvetindendi. Izgarada enine kiris ana kirisin
                // egilmesini BURULMA olarak alir; o eleman icin burulma
                // kaymasi kesme kaymasindan buyuk olabilir. Karsilastirmada
                // olculdu (Steel 4.4.7, kapali kutu kesit): ana kiriste
                // tau_Mx = 25 MPa, tau_Fz = 1 MPa. Bunu atlamak GUVENLI
                // TARAFTA DEGIL.
                //
                // Wt burulma kesit modulu: acik kesitte J/t_max, kapali
                // kesitte 2*Am*t (Bredt). Kesit onu tasimiyorsa burulma
                // gerilmesi eklenmez - eski davranis korunur, ama sessizce
                // sifir saymak yerine kesit uretimine Wt eklendi.
                const Wt = (sec.Wt && sec.Wt > 0) ? sec.Wt : null;
                const tauT = Wt ? Math.abs(T) / Wt / 1e6 : 0;      // MPa

                // Ikisi kesitin ayni noktasinda tepe yapmaz; toplamak
                // KORUMACI bir yaklasimdir ve kural kontrollerinde yaygindir.
                const tau = tauV + tauT;
                const vonMises = Math.sqrt(sigma * sigma + 3 * tau * tau);

                // --- Gerilme egrisi: egilme gerilmesi M(x)'i izler ---
                // Eskiden `sigma * |sin(pi t)|` idi: isaret degistiren momenti temsil
                // edemez ve tepesi mesnet kosulu ne olursa olsun hep ortada cikardi.
                diagram.s = [];
                for (let ds = 0; ds < DIAGRAM_SAMPLES; ds++) {
                    const Mx = Mfun(diagram.x[ds]);
                    const sT = (sigmaAxialSigned - (WyT ? Mx / WyT : 0)) / 1e6;
                    const sB = (sigmaAxialSigned + (WyB ? Mx / WyB : 0)) / 1e6;
                    diagram.s.push(Math.abs(sT) >= Math.abs(sB) ? sT : sB);
                }

                elementResults[elemId] = {
                    diagram: diagram,
                    sigma: Math.abs(sigma),
                    sigmaTop: sigmaTop,          // MPa, ust lif (isaretli)
                    sigmaBot: sigmaBot,          // MPa, alt lif (isaretli)
                    tau: Math.abs(tau),
                    tauV: tauV,          // MPa, kesme kuvvetinden
                    tauT: tauT,          // MPa, burulmadan
                    vonMises,
                    N: N / 1e3,          // kN
                    M1: M1 / 1e3,        // kN·m
                    M2: M2 / 1e3,
                    Mmid: Mmid / 1e3,
                    Mmax: Mmax / 1e3,
                    Mz: Mz_max / 1e3,
                    // Zayif eksen momenti UC ISTASYONDA. Yalnizca maksimum
                    // veriliyordu; gerilme tablosu istasyon istasyon yazilinca
                    // yanal egilme katkisi hicbir satirda gorunmuyor, ama
                    // ozetteki sigma'ya giriyordu - tablo ile kullanim orani
                    // birbirini tutmuyordu.
                    Mz1: MzFun(0) / 1e3,
                    Mzmid: MzFun(L / 2) / 1e3,
                    Mz2: MzFun(L) / 1e3,
                    V1: V1 / 1e3,        // kN
                    V2: Vfun(L) / 1e3,
                    V: Vmax / 1e3,
                    // Zayif eksen kesmesi (yerel y) ve burulma. Ikisi de
                    // zaten hesaplaniyordu ama disari verilmiyordu; DNV 3D
                    // Beam ciktisinda Qy ve Mx sutunlari var, LumoStruct
                    // tablosunda yoktu.
                    Vz1: Vz1 / 1e3,      // kN
                    Vz2: VzFun(L) / 1e3,
                    Vz: Math.max(Math.abs(Vz1), Math.abs(VzFun(L))) / 1e3,
                    T: T / 1e3,          // kN·m  (burulma, aciklik boyunca sabit)
                    // Aciklik boyunca en buyuk sehim (mm) - dugum sehimleri
                    // uclari verir, aradaki maksimumu vermez.
                    dmax: diagram.d ? diagram.d.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0) : 0
                };
                
                if (Math.abs(sigma) > maxSigma) maxSigma = Math.abs(sigma);
                if (Math.abs(tau) > maxTau) maxTau = Math.abs(tau);
                if (vonMises > maxVonMises) maxVonMises = vonMises;
            });
            
            // Calculate max moment and shear
            let maxMoment = 0, maxShear = 0;
            Object.values(elementResults).forEach(res => {
                if (Math.abs(res.Mmax) > Math.abs(maxMoment)) maxMoment = res.Mmax;
                if (Math.abs(res.V1) > Math.abs(maxShear)) maxShear = res.V1;
            });
            
            // Calculate reaction forces at supports
            // R = K * U (for fixed DOFs)
            const reactions = {};
            Object.entries(model.constraints).forEach(([nodeId, bc]) => {
                const dofs = nodeDofs[nodeId];
                if (!dofs) return;
                
                // Calculate reaction = sum of (K_row * U) for this DOF
                const Rx = {}, Ry = {}, Rz = {}, Mx = {}, My = {}, Mz = {};
                let Fx = 0, Fy = 0, Fz = 0, RMx = 0, RMy = 0;
                
                // For each constrained DOF, calculate reaction
                const isFixed = (dofIndex) => {
                    if (typeof bc === 'string') {
                        if (bc === 'fixed') return true;
                        if (bc === 'simply_supported' && dofIndex === 2) return true;
                        if (bc === 'pinned' && dofIndex <= 2) return true;
                    } else if (typeof bc === 'object') {
                        const dofNames = ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'];
                        return bc[dofNames[dofIndex]];
                    }
                    return false;
                };
                
                // Horizontal reactions - needed as soon as a load has any sideways part,
                // and required for a meaningful equilibrium check.
                if (isFixed(0)) {
                    Fx = (K.rowDot(dofs[0], U) - F[dofs[0]]) / 1000; // N to kN
                }
                if (isFixed(1)) {
                    Fy = (K.rowDot(dofs[1], U) - F[dofs[1]]) / 1000; // N to kN
                }

                // Calculate Fz reaction (vertical)
                if (isFixed(2)) {
                    // R = K*U - F: the applied term matters wherever a distributed
                    // load puts equivalent nodal forces onto the support itself.
                    Fz = (K.rowDot(dofs[2], U) - F[dofs[2]]) / 1000; // N to kN
                }
                
                // Calculate Mx reaction (moment about X)
                let RMz = 0;
                if (isFixed(3)) {
                    // Model SI: kuvvetler N, momentler N*m. Kuvvet tepkileri 1000'e
                    // bolunuyor; moment de 1000'e bolunmeli. Burada 1e6 yaziyordu
                    // ("Nmm to kNm" varsayimi), yani bildirilen TUM mesnet momentleri
                    // 1000 kat kucuktu - tepki tablosunda 0.000 gorunmelerinin sebebi.
                    RMx = -(K.rowDot(dofs[3], U) - F[dofs[3]]) / 1000; // N*m -> kN*m
                }
                
                // Calculate My reaction (moment about Y)
                if (isFixed(4)) {
                    // Eksi: serbestlik 4 fiziksel donmenin tersi oldugu icin
                    // eslenik tepki momenti de terstir.
                    RMy = -(K.rowDot(dofs[4], U) - F[dofs[4]]) / 1000; // N*m -> kN*m
                }
                
                // Mz hic hesaplanmiyordu: duzlem ici yanal yuklu bir grillajda
                // Rz mesnetlenmisse o tepki raporda eksik kaliyordu.
                if (isFixed(5)) {
                    RMz = -(K.rowDot(dofs[5], U) - F[dofs[5]]) / 1000; // N*m -> kN*m
                }

                reactions[nodeId] = {
                    Fx: Fx,
                    Fy: Fy,
                    Fz: Fz,
                    Mx: RMx,
                    My: RMy,
                    Mz: RMz
                };
            });
            
            // Validate results - check for NaN/Infinity
            const validateNumber = (n) => !isNaN(n) && isFinite(n);
            
            if (!validateNumber(maxDeflection) || !validateNumber(maxSigma) || !validateNumber(maxVonMises)) {
                debugWarn('Solver produced invalid results, using fallback values');
                maxDeflection = validateNumber(maxDeflection) ? maxDeflection : 0;
                maxMoment = validateNumber(maxMoment) ? maxMoment : 0;
                maxShear = validateNumber(maxShear) ? maxShear : 0;
                maxSigma = validateNumber(maxSigma) ? maxSigma : 0;
                maxTau = validateNumber(maxTau) ? maxTau : 0;
                maxVonMises = validateNumber(maxVonMises) ? maxVonMises : 0;
            }
            
            // Equilibrium: everything pushed in must come back out through the supports.
            // Cheap to compute, and it is the one number that catches a whole class of load
            // application bugs the moment they appear.
            let appliedFz = 0;
            Object.keys(model.nodes).forEach(nodeId => {
                const d = nodeDofs[nodeId];
                if (d) appliedFz += F[d[2]];
            });
            const reactionFz = Object.values(reactions)
                .reduce((s, r) => s + (r.Fz || 0), 0) * 1000;          // kN -> N
            const scale = Math.max(Math.abs(appliedFz), Math.abs(reactionFz), 1);
            const equilibrium = {
                appliedFz: -appliedFz / 1000,      // kN, down positive
                reactionFz: reactionFz / 1000,     // kN, up positive
                error: (appliedFz + reactionFz) / scale,
                ok: Math.abs(appliedFz + reactionFz) / scale < 1e-6
            };
            if (!equilibrium.ok) {
                debugWarn('Equilibrium off by ' + (equilibrium.error * 100).toFixed(3) + '%');
            }

            return {
                displacements,
                elementResults,
                reactions,
                equilibrium,
                maxDeflection,
                maxMoment,
                maxShear,
                maxSigma,
                maxTau,
                maxVonMises
            };
        }
        
        // Matrix helpers
        function matMult(A, B) {
            const n = A.length;
            const m = B[0].length;
            const p = B.length;
            const C = [];
            for (let i = 0; i < n; i++) {
                C[i] = [];
                for (let j = 0; j < m; j++) {
                    C[i][j] = 0;
                    for (let k = 0; k < p; k++) {
                        C[i][j] += A[i][k] * B[k][j];
                    }
                }
            }
            return C;
        }
        
        function transpose(A) {
            const n = A.length;
            const m = A[0].length;
            const T = [];
            for (let i = 0; i < m; i++) {
                T[i] = [];
                for (let j = 0; j < n; j++) {
                    T[i][j] = A[j][i];
                }
            }
            return T;
        }
