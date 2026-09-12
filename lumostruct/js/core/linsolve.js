        // ============== LINEAR SOLVER ==============
        // A grillage stiffness matrix is symmetric, mostly empty, and - once the
        // nodes are numbered sensibly - narrowly banded. Holding it dense and running
        // Gaussian elimination throws all three properties away: a 400-node model
        // cost 44 MB and 49 s that way. Banded LDL^T gives the same answer in ~2 ms.

        // Symmetric sparse store. Both triangles are kept so a row can be dotted with
        // the displacement vector directly - that is how reactions are recovered.
        function SparseSymMatrix(n) {
            this.n = n;
            this.rows = new Array(n);
            for (let i = 0; i < n; i++) this.rows[i] = new Map();
        }
        SparseSymMatrix.prototype.add = function (i, j, v) {
            if (v === 0) return;
            const row = this.rows[i];
            row.set(j, (row.get(j) || 0) + v);
        };
        SparseSymMatrix.prototype.diag = function (i) {
            return this.rows[i].get(i) || 0;
        };
        // dot product of row i with a full-length vector - K[i][:] * x
        SparseSymMatrix.prototype.rowDot = function (i, x) {
            let sum = 0;
            this.rows[i].forEach((v, j) => { sum += v * x[j]; });
            return sum;
        };

        // Reverse Cuthill-McKee: renumbers the unknowns so connected DOFs end up close
        // together, which is what keeps the band - and therefore the whole
        // factorisation - small. Imported models arrive in arbitrary node order, so
        // without this step the band can be as wide as the matrix itself.
        function reverseCuthillMcKee(n, adjacency) {
            const degree = new Int32Array(n);
            for (let i = 0; i < n; i++) degree[i] = adjacency[i].length;

            const visited = new Uint8Array(n);
            const order = [];

            while (order.length < n) {
                // start each component at its least connected node
                let start = -1;
                for (let i = 0; i < n; i++) {
                    if (!visited[i] && (start === -1 || degree[i] < degree[start])) start = i;
                }
                visited[start] = 1;
                const queue = [start];
                for (let head = 0; head < queue.length; head++) {
                    const node = queue[head];
                    order.push(node);
                    const next = [];
                    const nbrs = adjacency[node];
                    for (let k = 0; k < nbrs.length; k++) {
                        const nb = nbrs[k];
                        if (!visited[nb]) { visited[nb] = 1; next.push(nb); }
                    }
                    next.sort((a, b) => degree[a] - degree[b]);
                    for (let k = 0; k < next.length; k++) queue.push(next[k]);
                }
            }
            return order.reverse();
        }

        // Solve K * U = F over the free DOFs only. Returns the full length displacement
        // vector (fixed DOFs stay zero) plus a note of any DOF that turned out to carry
        // no stiffness at all - an unsupported rigid body mode. Those are pinned to zero
        // and reported, rather than silently producing nonsense.
        function solveStiffnessSystem(K, F, freeDofs) {
            const nDof = K.n;
            const n = freeDofs.length;
            const U = new Float64Array(nDof);
            if (n === 0) return { U: U, singularDofs: [], bandwidth: 0 };

            // full DOF -> free index
            const toFree = new Int32Array(nDof).fill(-1);
            for (let i = 0; i < n; i++) toFree[freeDofs[i]] = i;

            // connectivity between free DOFs, for the renumbering
            const adjacency = new Array(n);
            for (let i = 0; i < n; i++) adjacency[i] = [];
            for (let i = 0; i < n; i++) {
                K.rows[freeDofs[i]].forEach((v, j) => {
                    const fj = toFree[j];
                    if (fj >= 0 && fj !== i && v !== 0) adjacency[i].push(fj);
                });
            }

            const perm = reverseCuthillMcKee(n, adjacency);   // perm[new] = old
            const inv = new Int32Array(n);                    // inv[old] = new
            for (let k = 0; k < n; k++) inv[perm[k]] = k;

            // half bandwidth in the new numbering
            let bw = 0;
            for (let i = 0; i < n; i++) {
                const ni = inv[i], nbrs = adjacency[i];
                for (let k = 0; k < nbrs.length; k++) {
                    const d = Math.abs(ni - inv[nbrs[k]]);
                    if (d > bw) bw = d;
                }
            }

            // lower triangle band storage: A(i,j) held for i-bw <= j <= i
            const w = bw + 1;
            const a = new Float64Array(n * w);
            const b = new Float64Array(n);
            let maxDiag = 0;
            for (let oi = 0; oi < n; oi++) {
                const ni = inv[oi];
                b[ni] = F[freeDofs[oi]];
                K.rows[freeDofs[oi]].forEach((v, j) => {
                    // Assembly leaves behind entries that cancelled to exactly zero.
                    // They carry no stiffness, so they were left out of the adjacency
                    // graph above - which means they are not covered by the bandwidth
                    // and must not be written, or they land in a neighbouring row and
                    // overwrite a real coefficient.
                    if (v === 0) return;
                    const oj = toFree[j];
                    if (oj < 0) return;
                    const nj = inv[oj];
                    if (nj > ni) return;
                    if (ni - nj > bw) throw new Error('linsolve: entry outside band (' + ni + ',' + nj + '), bw=' + bw);
                    a[ni * w + (nj - ni + bw)] = v;
                });
                const d = Math.abs(a[ni * w + bw]);
                if (d > maxDiag) maxDiag = d;
            }

            // LDL^T in place. No pivoting is needed: a supported structure gives a
            // positive definite matrix, and the tolerance below catches the cases where
            // it is not - a mechanism, or a DOF that nothing connects to.
            const tol = maxDiag * 1e-12;
            const singularFree = [];
            for (let j = 0; j < n; j++) {
                let d = a[j * w + bw];
                const kStart = Math.max(0, j - bw);
                for (let k = kStart; k < j; k++) {
                    const l = a[j * w + (k - j + bw)];
                    if (l !== 0) d -= l * l * a[k * w + bw];
                }

                if (Math.abs(d) <= tol) {
                    // Nothing holds this DOF. Decouple it: unit pivot, empty column, no
                    // load - it comes out as zero and leaves the rest untouched.
                    a[j * w + bw] = 1;
                    b[j] = 0;
                    for (let i = j + 1; i < Math.min(n, j + w); i++) a[i * w + (j - i + bw)] = 0;
                    singularFree.push(j);
                    continue;
                }

                a[j * w + bw] = d;
                const iEnd = Math.min(n, j + w);
                for (let i = j + 1; i < iEnd; i++) {
                    let s = a[i * w + (j - i + bw)];
                    const kFrom = Math.max(0, i - bw);
                    for (let k = kFrom; k < j; k++) {
                        const lik = a[i * w + (k - i + bw)];
                        if (lik !== 0) s -= lik * a[j * w + (k - j + bw)] * a[k * w + bw];
                    }
                    a[i * w + (j - i + bw)] = s / d;
                }
            }

            // forward, diagonal, back
            const x = new Float64Array(b);
            for (let i = 0; i < n; i++) {
                const kFrom = Math.max(0, i - bw);
                for (let k = kFrom; k < i; k++) x[i] -= a[i * w + (k - i + bw)] * x[k];
            }
            for (let i = 0; i < n; i++) x[i] /= a[i * w + bw];
            for (let i = n - 1; i >= 0; i--) {
                const kEnd = Math.min(n, i + w);
                for (let k = i + 1; k < kEnd; k++) x[i] -= a[k * w + (i - k + bw)] * x[k];
            }

            for (let k = 0; k < n; k++) U[freeDofs[perm[k]]] = x[k];

            return {
                U: U,
                singularDofs: singularFree.map(k => freeDofs[perm[k]]),
                bandwidth: bw
            };
        }
