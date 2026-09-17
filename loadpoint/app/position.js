/* LoadPoint - structural position of a calculation point (the "position code" of
   Nauticus Hull). One list for every class and every board; the rules that depend
   on where the element sits read it from here, so a position is never implied
   silently by a compartment kind.

   What a position decides (rule references in the functions below):
     - which external load a sea/deck compartment may carry (DNV Ch 4 Sec 7 Tab 1,
       BV Ch 7 Sec 2 Tab 1): external shell P_S + P_W, exposed deck P_D, superstructure
       side max(P_W, P_SI); an internal position carries no external load at all
     - corrosion rows that name a member (DNV Ch 3 Sec 3 Tab 1: inner bottom of cargo
       oil tanks, lower part of holds, upper surface of decks in voids; BV Ch 4 Sec 3
       Tab 1: hold plating 1.75 vs stiffeners 1.00, container hold transverse bulkheads)
     - minimum plate / web thickness rows (DNV Ch 6 Sec 3 Tab 1-2)
     - plate and stiffener coefficient rows, longitudinal strength member or not
       (DNV Ch 6 Sec 4-5, BV Ch 7 Sec 4-5)
     - plate slenderness coefficient C (DNV Ch 8 Sec 2 Tab 1)
   Pure functions; usable in the browser and in node. */
(function (root) {
  'use strict';

  /* key: value stored in the column; code: short Nauticus-style code; ext: external load kind the
     position may carry ('sea' | 'weather' | 'sside' | null); longit: contributes to hull girder
     longitudinal strength (coefficient tables); deck: horizontal member whose upper surface faces
     the compartment above; hold: hold boundary row of the corrosion tables */
  var POSITIONS = [
    { key: 'keel',            code: 'KEL', label: 'Keel',                                         group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: false },
    { key: 'bottom',          code: 'BOT', label: 'Bottom shell',                                 group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: false },
    { key: 'bilge',           code: 'BLG', label: 'Bilge',                                        group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: false },
    { key: 'side',            code: 'SID', label: 'Side shell',                                   group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: true  },
    { key: 'sternShell',      code: 'STN', label: 'Shell at stern frame / boss / heel',            group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: false },
    { key: 'sside',           code: 'SSD', label: 'Superstructure side',                          group: 'Shell',     ext: 'sside',   longit: true,  deck: false, hold: false },
    { key: 'strengthDeck',    code: 'SDK', label: 'Strength deck',                                group: 'Decks',     ext: 'weather', longit: true,  deck: true,  hold: false },
    { key: 'weatherDeck',     code: 'WDK', label: 'Weather deck (not strength deck)',              group: 'Decks',     ext: 'weather', longit: true,  deck: true,  hold: false },
    { key: 'tankDeck',        code: 'TDK', label: 'Deck bounding tank / bulk hold',                group: 'Decks',     ext: null,      longit: true,  deck: true,  hold: false },
    { key: 'otherDeck',       code: 'ODK', label: 'Other deck (internal)',                         group: 'Decks',     ext: null,      longit: true,  deck: true,  hold: false },
    { key: 'nonStrengthDeck', code: 'NDK', label: 'Deck not contributing to hull girder',          group: 'Decks',     ext: null,      longit: false, deck: true,  hold: false },
    { key: 'innerBottom',     code: 'IBT', label: 'Inner bottom',                                  group: 'Bottom',    ext: null,      longit: true,  deck: true,  hold: true  },
    { key: 'innerBottomHold', code: 'IBH', label: 'Inner bottom (hold loaded through hatches)',    group: 'Bottom',    ext: null,      longit: true,  deck: true,  hold: true  },
    { key: 'longBhd',         code: 'LBH', label: 'Longitudinal bulkhead / inner side',            group: 'Bulkheads', ext: null,      longit: true,  deck: false, hold: true  },
    { key: 'tankBhd',         code: 'TBH', label: 'Transverse tank bulkhead',                      group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: true  },
    { key: 'wtBhd',           code: 'WBH', label: 'Watertight bulkhead',                           group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: true  },
    { key: 'peakBhd',         code: 'PBH', label: 'Peak bulkhead',                                 group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: false },
    { key: 'nonTightTank',    code: 'NTT', label: 'Non-tight bulkhead in tank',                    group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: false },
    { key: 'nonTight',        code: 'NTB', label: 'Other non-tight bulkhead',                      group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: false },
    { key: 'accWall',         code: 'ACW', label: 'Wall in accommodation',                         group: 'Bulkheads', ext: null,      longit: false, deck: false, hold: false },
    /* LR Ships only: Tab 1.5.3 (2) has its own sheerstrake rows */
    { key: 'sheerstrake',     code: 'SHR', label: 'Sheerstrake',                                  group: 'Shell',     ext: 'sea',     longit: true,  deck: false, hold: false, only: 'lr' },
    /* LR SSC only (Pt 5 Ch 2 Sec 7, Pt 6 Ch 3 Tab 3.2.1) - the other classes have no separate rows for these */
    { key: 'ssDeck',          code: 'SSK', label: 'Exposed superstructure / deckhouse deck',      group: 'Decks',     ext: 'weather', longit: false, deck: true,  hold: false, only: 'lrssc' },
    { key: 'coachroof',       code: 'CRF', label: 'Coachroof',                                    group: 'Decks',     ext: 'weather', longit: false, deck: true,  hold: false, only: 'lrssc' },
    { key: 'dhFront1',        code: 'DF1', label: 'Deckhouse / superstructure front, lowest tier', group: 'Shell',     ext: 'sside',   longit: false, deck: false, hold: false, only: 'lrssc' },
    { key: 'dhFrontUp',       code: 'DFU', label: 'Deckhouse front, upper tiers',                 group: 'Shell',     ext: 'sside',   longit: false, deck: false, hold: false, only: 'lrssc' },
    { key: 'dhOther',         code: 'DHO', label: 'Deckhouse aft end / elsewhere',                group: 'Shell',     ext: 'sside',   longit: false, deck: false, hold: false, only: 'lrssc' }
  ];
  var BY_KEY = {};
  POSITIONS.forEach(function (p) { BY_KEY[p.key] = p; });
  function get(key) { return BY_KEY[key] || BY_KEY.side; }
  function options(cls) { return POSITIONS.filter(function (p) { return !p.only || p.only === cls || (cls === 'lr' && p.only === 'lrssc'); }).map(function (p) { return [p.key, p.code + ' · ' + p.label]; }); }
  function name(key) { var p = get(key); return p.code + ' ' + p.label; }

  /* compartment kinds that are external loads (the only kinds a position can forbid) */
  var EXT_KINDS = ['sea', 'weather', 'sside'];
  /* the external kind the position expects, or null when the position is internal */
  function externalKind(key) { return get(key).ext; }
  /* what a compartment kind must become when the position changes; null = leave as is */
  function coerceKind(key, kind) {
    if (EXT_KINDS.indexOf(kind) < 0) return null;
    var ext = externalKind(key);
    return ext && ext !== kind ? ext : null;
  }
  /* problems between a position and the two compartment kinds - shown as errors on the boards */
  function conflicts(key, kind1, kind2) {
    var out = [], ext = externalKind(key), p = get(key);
    [kind1, kind2].forEach(function (k, i) {
      if (EXT_KINDS.indexOf(k) < 0) return;
      if (!ext) out.push('Comp. ' + (i + 1) + ' is an external load but position ' + p.code + ' ' + p.label + ' is internal - no external load applies here');
      else if (k !== ext) out.push('Comp. ' + (i + 1) + ' load kind "' + k + '" does not match position ' + p.code + ' ' + p.label + ' (expects "' + ext + '")');
    });
    return out;
  }

  /* corrosion keys per side, with the rows of the corrosion table that name a member.
     cls: 'dnv' | 'bv'; kinds are the compartment kinds; plateSide: index (0 = comp1, 1 = comp2)
     of the compartment on the plate side. Returns {plate: [k1, k2], stiff: [k1, k2], notes: []}. */
  function corrosionKeys(cls, key, kind1, kind2, TCKEY, plateSide) {
    var p = get(key), notes = [];
    var base = [TCKEY[kind1] || 'none', TCKEY[kind2] || 'none'];
    var plate = base.slice(), stiff = base.slice();
    [kind1, kind2].forEach(function (k, i) {
      if (cls === 'dnv') {
        if (k === 'cargo' && (p.key === 'innerBottom' || p.key === 'innerBottomHold')) { plate[i] = stiff[i] = 'cargoOilIB'; notes.push('Comp. ' + (i + 1) + ': cargo oil tank, inner bottom plates 0.5 (Ch 3 Sec 3 Tab 1)'); }
        if (k === 'dryHold' && (p.key === 'innerBottom' || p.key === 'innerBottomHold')) { plate[i] = stiff[i] = 'dryHoldLower'; notes.push('Comp. ' + (i + 1) + ': hold lower part (inner bottom) 1.0 (Ch 3 Sec 3 Tab 1 note 3)'); }
        if (k === 'void' && p.deck && i === plateSide) { plate[i] = stiff[i] = 'voidDeck'; notes.push('Comp. ' + (i + 1) + ': void above a deck / bottom plate - upper surface 0.5 (Ch 3 Sec 3 Tab 1 note 6)'); }
      } else {
        if ((k === 'dryHold' || k === 'dryHoldLower') && p.hold) { plate[i] = 'dryHoldLower'; stiff[i] = 'dryHoldStiff'; notes.push('Comp. ' + (i + 1) + ': dry bulk hold boundary plating 1.75, stiffeners 1.00 (Ch 4 Sec 3 Tab 1)'); }
        if (k === 'dryHold' && !p.hold) { plate[i] = stiff[i] = 'dryHold'; }
        if (k === 'container' && (p.key === 'tankBhd' || p.key === 'wtBhd')) { plate[i] = stiff[i] = 'containerBhd'; notes.push('Comp. ' + (i + 1) + ': container hold transverse bulkhead 0.5 (Ch 4 Sec 3 Tab 1)'); }
      }
    });
    return { plate: plate, stiff: stiff, notes: notes };
  }

  /* DNV Ch 8 Sec 2 Tab 1 plate slenderness coefficient C by position */
  function slendernessC(key, L) {
    var p = get(key);
    if (p.key === 'sside' || p.key === 'accWall') return { C: 175, row: 'structures in deckhouse / superstructure' };
    if (/^(keel|bottom|bilge|side|sternShell|strengthDeck)$/.test(p.key)) return { C: L < 90 ? 125 : 100, row: 'outer shell incl. strength deck, L ' + (L < 90 ? '< 90 m' : '>= 90 m') };
    return { C: 125, row: 'other structures' };
  }

  var api = { POSITIONS: POSITIONS, get: get, options: options, name: name, EXT_KINDS: EXT_KINDS, externalKind: externalKind, coerceKind: coerceKind, conflicts: conflicts, corrosionKeys: corrosionKeys, slendernessC: slendernessC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPointPos = api;
})(typeof window !== 'undefined' ? window : this);
