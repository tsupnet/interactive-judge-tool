/* =====================================================================
   INTERACTIVE JUDGE TOOL — HOW IT WORKS (app.js)
   - Builds every slider from config.js (dot counts, labels, ratios)
   - Dragging + snapping to every dot (mouse, finger, or arrow keys)
   - Moves the main needle using the ratios in config.js
   - Locks Effective Aggressiveness / Cage Control per the 2019 criteria
   - CHANGED: Duration moves the needle using Dominance windows (config.js),
     one corner at a time (the other corner's sliders lock), and a
     5 min / 3 min round choice
   - Shows "Consider 10-8" / "Always Score 10-8" for each corner
   - Opens the popups for hyperlinked words
   - NEW: red "Effective Strikes" / "Effective Grappling" open the techniques
     popups (list in config.js → techniques); a technique adds dots to the
     chosen fighter's Impact / Damage slider
   - CHANGED: gear button beside "3 min" asks for a password, then opens
     Technique Effectiveness, where techniques can be added, deleted, renamed
     (Edit) and re-valued. Save writes them to techniques.json on GitHub,
     which every device reads when the tool opens.
   - Shrinks/grows the one-page chart to fit the screen
   You should not need to edit this file to change ratios, dots or text.
   ===================================================================== */

(function () {
  "use strict";

  var CFG = window.FSL_CONFIG;
  var DEFS = window.FSL_DEFINITIONS;
  var SIDES = ["red", "blue"];
  var PAGE_WIDTH = 1200;   // design width of the chart, in pixels (must match .page in styles.css)
  var DOT_PX = (CFG.layout && CFG.layout.sideDotSpacing) || 8.6;

  // ------------------------------------------------------------------
  // Turn config.js into a list of every dot (one side, center outward)
  // ------------------------------------------------------------------
  function mainDotList(zones) {
    var out = [];
    zones.forEach(function (z) {
      for (var d = 1; d <= z.dots; d++) {
        var part = null;
        for (var i = 0; i < z.parts.length; i++) {
          if (d <= z.parts[i].upTo) { part = z.parts[i]; break; }
        }
        if (!part) part = z.parts[z.parts.length - 1];
        out.push({ zone: z, part: part, zoneEnd: d === z.dots, partEnd: d === part.upTo });
      }
    });
    return out;
  }
  function sliderDotList(s) {
    var out = [];
    s.segments.forEach(function (seg) {
      for (var d = 1; d <= seg.dots; d++) out.push({ seg: seg, dotInSeg: d, segEnd: d === seg.dots });
    });
    return out;
  }

  var MAIN_DOTS = mainDotList(CFG.mainNeedle.zones);
  var MAIN_STEPS = MAIN_DOTS.length;              // dots on each side of Draw (30)
  var MAIN_CELLS = MAIN_STEPS * 2 + 1;            // both sides + Draw (61)
  CFG.sliders.forEach(function (s) { s._dots = sliderDotList(s); });

  // Everything the tool remembers
  var state = { manual: 0, needle: 0, values: {}, roundMin: CFG.roundLength.defaultMinutes };  // CHANGED: roundMin
  CFG.sliders.forEach(function (s) { state.values[s.id] = { red: 0, blue: 0 }; });

  var ui = { halves: {}, rows: {} };
  var lastFocus = null;

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function txt(t) { return document.createTextNode(t); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // Rounds the same way on the Red and Blue sides
  function roundEven(v) { return v < 0 ? -Math.round(-v) : Math.round(v); }
  // Center of a dot, as a percent across its slider
  function cellLeft(cell, cells) { return ((cell + 0.5) / cells * 100) + "%"; }
  // Places a label so it covers dots a..b
  function placeSpan(node, a, b, cells) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    node.style.left = (lo / cells * 100) + "%";
    node.style.width = ((hi - lo + 1) / cells * 100) + "%";
  }
  // Places a label between the centers of two dots (two lines on the chart)
  function placeBetween(node, a, b, cells) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    node.style.left = ((lo + 0.5) / cells * 100) + "%";
    node.style.width = ((hi - lo) / cells * 100) + "%";
  }
  function twoDigits(n) { return n < 10 ? "0" + n : "" + n; }

  // A hyperlinked word that opens a definition popup.
  // style: "strong" = red bold underlined, "em" = italic underlined,
  //        "title" = slider title (large, underlined)
  function term(key, text, style) {
    var b = el("button", "term" + (style ? " term-" + style : ""), text);
    b.type = "button";
    b.addEventListener("click", function () { openDefinition(key); });
    return b;
  }

  // Arrow drawings
  // Main needle = filled up arrow joined to a left-right arrow (like the chart)
  // (filled triangle on a thin stem, on a left-right line with large filled heads)
  var NEEDLE_SVG =
    '<svg viewBox="0 0 120 70" aria-hidden="true">' +
    '<path d="M60 1 L71 34 H49 Z"/>' +
    '<path d="M58.5 33 H61.5 V56.5 H58.5 Z"/>' +
    '<path d="M30 53.5 H90 V56.5 H30 Z"/>' +
    '<path d="M0 55 L35 43 V67 Z"/>' +
    '<path d="M120 55 L85 43 V67 Z"/>' +
    "</svg>";
  // Side slider arrow = thin open arrow pointing up (like the chart)
  var ARROW_SVG =
    '<svg viewBox="0 0 16 28" aria-hidden="true">' +
    '<path d="M8 1.5 V27 M2 10 L8 1.5 L14 10"/>' +
    "</svg>";
  // The "Draw" arrow above the center dot
  var DRAW_SVG =
    '<svg viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M10 2 V100 M2 14 L10 2 L18 14"/>' +
    "</svg>";

  // ------------------------------------------------------------------
  // Dragging + snapping (mouse, finger, pencil)
  // getBoundingClientRect already includes the page scaling,
  // so the finger always lands on the right dot.
  // ------------------------------------------------------------------
  // CHANGED: the arrows can only be grabbed BELOW the dots (where the
  // arrows are). Above the dots, the mouse/finger does nothing to the slider.
  // CHANGED: isLandable(cell) says which dots the arrow may stop on.
  // Dots with a vertical line on them are skipped.
  function makeDraggable(track, cells, onCell, isLandable) {
    var dragging = false;

    // The grab area: a strip from the dots down to the bottom of the arrows
    var hit = el("div", "hit");
    track.appendChild(hit);

    // The landable dot nearest the mouse / finger
    function cellFrom(e) {
      var r = track.getBoundingClientRect();
      var pos = (e.clientX - r.left) / r.width * cells - 0.5;   // in dot units
      var best = 0, bestDist = Infinity;
      for (var c = 0; c < cells; c++) {
        if (!isLandable(c)) continue;
        var d = Math.abs(c - pos);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      return best;
    }

    hit.addEventListener("pointerdown", function (e) {
      if (track.classList.contains("locked")) return;
      dragging = true;
      try { hit.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      e.preventDefault();
      onCell(cellFrom(e));
    });
    hit.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      e.preventDefault();
      onCell(cellFrom(e));
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) {
      hit.addEventListener(t, function () { dragging = false; });
    });

    // iPad / iPhone: while a finger is on the grab area, the page does not pan or zoom
    hit.addEventListener("touchstart", function (e) {
      if (!track.classList.contains("locked")) e.preventDefault();
    }, { passive: false });
  }

  // Arrow keys on a computer keyboard
  // CHANGED: arrow keys jump over dots with a vertical line
  function makeKeyboard(handle, getCell, cells, onCell, isLocked, isLandable) {
    handle.addEventListener("keydown", function (e) {
      if (isLocked()) return;
      var dir;
      if (e.key === "ArrowLeft") dir = -1;
      else if (e.key === "ArrowRight") dir = 1;
      else return;
      e.preventDefault();
      var c = getCell() + dir;
      while (c >= 0 && c < cells && !isLandable(c)) c += dir;
      if (c >= 0 && c < cells) onCell(c);
    });
  }

  // Dot + tick mark for one position on a track
  function addDot(track, cell, cells, kind, tick, step) {   // CHANGED: step = slider dot number (side sliders only)
    // kind is one or more words, e.g. "small red" → classes dot-small dot-red
    var dot = el("div", "dot " + kind.split(" ").map(function (w) { return "dot-" + w; }).join(" "));
    dot.style.left = cellLeft(cell, cells);
    if (step != null) dot.dataset.step = step;
    track.appendChild(dot);
    if (tick) {
      var t = el("div", "tick tick-" + tick);
      t.style.left = cellLeft(cell, cells);
      if (step != null) t.dataset.step = step;
      track.appendChild(t);
    }
  }

  // ------------------------------------------------------------------
  // Build: main needle
  // ------------------------------------------------------------------
  function mainCell(side, step) { return side === "red" ? MAIN_STEPS - step : MAIN_STEPS + step; }

  function buildMain() {
    var sec = document.getElementById("main-section");

    // Everything for the needle lives on one track (headers included),
    // so the zone lines can run from the header down to the dots.
    var track = el("div", "track main-track");
    track.appendChild(el("div", "rail"));

    // "Draw" label + arrow above the center dot
    var drawLabel = el("div", "draw-label", "Draw");
    drawLabel.style.left = cellLeft(MAIN_STEPS, MAIN_CELLS);
    track.appendChild(drawLabel);
    var drawArrow = el("div", "draw-arrow");
    drawArrow.innerHTML = DRAW_SVG;
    drawArrow.style.left = cellLeft(MAIN_STEPS, MAIN_CELLS);
    track.appendChild(drawArrow);

    // Zone headers: name, then ←— (score) —→
    var start = 0;
    CFG.mainNeedle.zones.forEach(function (z) {
      SIDES.forEach(function (side) {
        var band = el("div", "band band-" + side);
        placeBetween(band, mainCell(side, start), mainCell(side, start + z.dots), MAIN_CELLS);
        band.appendChild(el("div", "band-name", z.name));
        var row = el("div", "band-arrows");
        row.appendChild(el("span", "arr arr-left"));
        row.appendChild(el("span", "band-score", "(" + z.score + ")"));
        row.appendChild(el("span", "arr arr-right"));
        band.appendChild(row);
        track.appendChild(band);
      });
      start += z.dots;
    });

    // Close / Clearly / Cusp / Stoppage labels
    start = 0;
    CFG.mainNeedle.zones.forEach(function (z) {
      var from = 1;
      z.parts.forEach(function (part) {
        SIDES.forEach(function (side) {
          // Label sits centered between its two lines, like the chart
          var lab = el("div", "part-label part-" + side + (part.underline ? " underline" : ""));
          lab.appendChild(el("span", null, part.label));
          placeBetween(lab, mainCell(side, start + from - 1), mainCell(side, start + part.upTo), MAIN_CELLS);
          track.appendChild(lab);
        });
        from = part.upTo + 1;
      });
      start += z.dots;
    });

    // Dots and tick marks
    for (var c = 0; c < MAIN_CELLS; c++) {
      var p = c - MAIN_STEPS;
      if (p === 0) { addDot(track, c, MAIN_CELLS, "center", null); continue; }
      var info = MAIN_DOTS[Math.abs(p) - 1];
      var side = p < 0 ? "red" : "blue";
      addDot(track, c, MAIN_CELLS,
        info.zoneEnd ? "black" : "small " + side,
        info.zoneEnd ? "zone" : info.partEnd ? "part" : null);
    }

    var handle = el("div", "handle needle");
    handle.innerHTML = NEEDLE_SVG;
    // CHANGED: the main needle can't be moved with the cursor or keyboard.
    // Only the other sliders move it (later: Effective Strikes / Grappling techniques).
    handle.setAttribute("role", "img");
    handle.setAttribute("aria-label", "Main needle — Effective Strikes / Grappling");
    track.appendChild(handle);
    sec.appendChild(track);

    sec.appendChild(el("p", "center-line")).appendChild(el("span", "tag", "( Top Priority )"));
    var cap = el("p", "main-caption");
    cap.appendChild(txt("Judges determine their scores, by assessing and evaluating the "));
    cap.appendChild(el("i", "u", "Impact"));
    cap.appendChild(txt(" of "));
    // NEW: the red words open the techniques popups (not the definition text).
    // The italic words in the (10-8) Guidelines line still open the definitions.
    cap.appendChild(techniqueTerm("strikes", "Effective Strikes"));
    cap.appendChild(txt(" and "));
    cap.appendChild(techniqueTerm("grappling", "Effective Grappling"));
    cap.appendChild(txt("  -  Focus on the result of the action, and not the action itself"));
    sec.appendChild(cap);

    ui.main = { track: track, handle: handle };
  }

  // ------------------------------------------------------------------
  // Build: the 10 side sliders (one Red + one Blue per row)
  // ------------------------------------------------------------------
  function buildSliders() {
    var backup = document.getElementById("backup-section");
    var tenEight = document.getElementById("teneight-sliders");
    var box = null;   // the black box around Dominance + Duration
    CFG.sliders.forEach(function (s) {
      var parent = s.group === "tenEight" ? tenEight : backup;
      var row = buildRow(s);
      if (s.boxed) {
        if (!box) { box = el("div", "black-box"); parent.appendChild(box); }
        box.appendChild(row);
      } else {
        box = null;
        parent.appendChild(row);
      }
    });
  }

  function buildRow(s) {
    var row = el("div", "slider-row row-" + s.id);
    if (s.lockedText) row.title = s.lockedText;

    // Title in the middle, like your chart
    var center = el("div", "row-center");
    center.appendChild(term(s.term, s.title, "title"));

    row.appendChild(buildHalf(s, "red"));
    row.appendChild(center);
    row.appendChild(buildHalf(s, "blue"));

    if (s.caption) {
      var cap = el("p", "row-caption");
      cap.innerHTML = s.caption;   // caption text comes from config.js (your own file)
      row.appendChild(cap);
    }

    ui.rows[s.id] = { row: row, group: s.group };
    return row;
  }

  function buildHalf(s, side) {
    var dots = s._dots;
    var n = dots.length;
    var cells = n + 1;   // dot 0 (center) + every dot outward
    var wrap = el("div", "half half-" + side);
    wrap.style.width = Math.round(cells * DOT_PX) + "px";   // same dot spacing on every slider

    var track = el("div", "track half-track");
    track.appendChild(el("div", "rail"));

    // Red counts outward to the LEFT, Blue counts outward to the RIGHT
    function toCell(k) { return side === "red" ? n - k : k; }
    function toStep(c) { return side === "red" ? n - c : c; }

    // Section labels
    var start = 0;
    s.segments.forEach(function (seg) {
      if (seg.label) {
        var lab;
        if (s.chartLinks) {
          // Low / Medium / High Impact above the dots → Duration vs. Dominance chart
          lab = el("button", "seg-label seg-link", seg.label);
          lab.type = "button";
          lab.addEventListener("click", function () { openChart(seg.label); });
          // A tap on the word must not move the slider arrow
          lab.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
          lab.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
        } else {
          lab = el("div", "seg-label", seg.label);
        }
        if (s.labelStyle === "tick") {
          lab.classList.add("at-tick");
          lab.style.left = cellLeft(toCell(start + seg.dots), cells);
          lab.dataset.step = start + seg.dots;   // CHANGED: hidden when past the end of a 3-minute round
        } else {
          // CHANGED: centered between the two vertical lines of its section
          placeBetween(lab, toCell(start), toCell(start + seg.dots), cells);
        }
        track.appendChild(lab);
      }
      start += seg.dots;
    });

    // Dots and tick marks
    for (var c = 0; c < cells; c++) {
      var k = toStep(c);
      if (k === 0) { addDot(track, c, cells, "big " + side, "zone", 0); continue; }
      var d = dots[k - 1];
      // CHANGED: when a slider has landableDots (Dominance), the usable dot is drawn
      // as a "mid" dot and the unused dots are drawn as dashes, like the chart
      var kind = d.segEnd ? "big" : !s.landableDots ? "small" : s.landableDots.indexOf(k) !== -1 ? "mid" : "dash";
      addDot(track, c, cells, kind + " " + side, d.segEnd ? "zone" : null, k);
    }

    var handle = el("div", "handle arrow");
    handle.innerHTML = ARROW_SVG;
    handle.tabIndex = 0;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", s.title + " — " + (side === "red" ? "Red" : "Blue"));
    track.appendChild(handle);
    wrap.appendChild(track);


    function onCell(c) {
      var step = toStep(c);
      if (state.values[s.id][side] === step) return;
      state.values[s.id][side] = step;
      // CHANGED: one corner at a time. Using a slider for one corner (moving it
      // above zero) snaps every listed slider of the OTHER corner back to zero.
      // The other corner is NOT grayed out: you can click it at any time.
      if (step > 0 && (CFG.cornerLock || []).indexOf(s.id) !== -1) {
        var other = side === "red" ? "blue" : "red";
        CFG.cornerLock.forEach(function (id) { state.values[id][other] = 0; });
      }
      update();
    }
    function landable(c) { return sliderLandable(s, toStep(c)); }
    makeDraggable(track, cells, onCell, landable);
    makeKeyboard(handle, function () { return toCell(state.values[s.id][side]); }, cells, onCell,
      function () { return track.classList.contains("locked"); }, landable);

    ui.halves[s.id + "-" + side] = {
      track: track, handle: handle,
      toCell: toCell, cells: cells, s: s, side: side
    };
    return wrap;
  }

  // What a side slider reads, in words
  function sliderValueText(s, k) {
    if (k === 0) return "";
    if (s.valueFormat === "time") {
      var sec = k * (s.secondsPerDot || 6);
      return Math.floor(sec / 60) + ":" + twoDigits(sec % 60);
    }
    var d = s._dots[k - 1];
    // CHANGED: Dominance reads "Low Impact" etc.; Aggressiveness / Cage (no labels) read "Dot 1 of 2"
    if (s.landableDots) return d.seg.label || ("Dot " + (s.landableDots.indexOf(k) + 1) + " of " + s.landableDots.length);
    if (!d.seg.label) return k + " of " + s._dots.length;
    return d.seg.label + " · " + d.dotInSeg + " of " + d.seg.dots;
  }

  // ------------------------------------------------------------------
  // The rules: how sliders move the needle and lock each other
  // ------------------------------------------------------------------

  // Total push from one group of sliders. Red = negative (left), Blue = positive (right).
  // CHANGED: a slider with a "needleMap" (config.js) uses that table.
  // Red and Blue cancel out: the difference between them is looked up.
  // Sliders without a table still use "ratio".
  function contribution(group) {
    var sum = 0;
    CFG.sliders.forEach(function (s) {
      if (s.group !== group) return;
      var v = state.values[s.id];
      // CHANGED: Duration (time slider) moves the needle by the Dominance window of its own corner
      if (s.valueFormat === "time") {
        SIDES.forEach(function (side) {
          if (!v[side]) return;
          var n = durationNeedle(v[side] * (s.secondsPerDot || 6), dominanceLevel(s, side));
          sum += side === "blue" ? n : -n;
        });
        return;
      }
      var net = v.blue - v.red;
      if (s.needleMap) {
        var steps = lookupNeedle(s.needleMap, Math.abs(net));
        sum += net < 0 ? -steps : steps;
      } else {
        sum += net * (Number(s.ratio) || 0);
      }
    });
    return sum;
  }

  // CHANGED: which Dominance level (Low / Med / High) a corner is in. null = no Dominance.
  function dominanceLevel(durSlider, side) {
    var domId = durSlider.requires || "dominance";
    var k = (state.values[domId] || {})[side] || 0;
    if (!k) return null;
    var dom = CFG.sliders.filter(function (x) { return x.id === domId; })[0];
    return dom._dots[k - 1].seg.short;
  }

  // CHANGED: main needle dot (can be a fraction; rounded later) for a Duration time in seconds.
  // See durationRules in config.js for the meaning of the numbers.
  function durationNeedle(sec, levelName) {
    var R = CFG.durationRules;
    // CHANGED: a 3-minute round has its own windows (levels3); a 5-minute round uses levels
    var three = state.roundMin === 3 && R.levels3 && R.levels3[levelName];
    var L = levelName && (three ? R.levels3[levelName] : R.levels[levelName]);
    if (!L) return 0;
    var scale = three ? 1 : state.roundMin * 60 / CFG.roundLength.fullRoundSeconds;
    var s = L.startSec * scale, e = L.endSec * scale;
    var perSec = (R.endDot - R.startDot) / (e - s);                       // needle dots per second inside the window
    if (sec < s) return 0;   // CHANGED: before the window starts, the needle stays at Draw
    if (sec <= e) return R.startDot + (sec - s) * perSec;
    return R.endDot + (sec - e) * perSec * R.afterRate;
  }

  // Needle dot for a slider dot. A dot missing from the table
  // (a line dot) uses the nearest dot below it that is in the table.
  function lookupNeedle(map, dot) {
    for (var d = dot; d > 0; d--) {
      if (map[d] != null) return Number(map[d]);
    }
    return 0;
  }

  // Which dots an arrow may stop on (dots with a vertical line are skipped)
  function mainLandable(p) {
    if (p === 0 || !CFG.skipLineDots) return true;
    var info = MAIN_DOTS[Math.abs(p) - 1];
    return !(info.zoneEnd || info.partEnd);
  }
  // CHANGED: last dot a slider may use. Duration stops at the end of the chosen round (5 or 3 min).
  function sliderMax(s) {
    if (s.valueFormat === "time") return Math.round(state.roundMin * 60 / (s.secondsPerDot || 6));
    return s._dots.length;
  }
  function sliderLandable(s, k) {
    if (k === 0) return true;
    if (k > sliderMax(s)) return false;
    if (s.landableDots) return s.landableDots.indexOf(k) !== -1;   // CHANGED: Dominance = one dot per level
    if (!CFG.skipLineDots) return true;
    return !s._dots[k - 1].segEnd;
  }
  // If the needle math lands on a line dot, step one dot toward Draw
  function snapNeedle(p) {
    var step = p < 0 ? 1 : -1;
    while (p !== 0 && !mainLandable(p)) p += step;
    return p;
  }
  function groupEven(group) {
    return CFG.sliders.every(function (s) {
      return s.group !== group || state.values[s.id].red === state.values[s.id].blue;
    });
  }
  function resetGroup(group) {
    CFG.sliders.forEach(function (s) {
      if (s.group === group) { state.values[s.id].red = 0; state.values[s.id].blue = 0; }
    });
  }

  function update() {
    // CHANGED: this block moved to the top (it used to run after the needle was
    // computed). A slider with "requires" (config.js) is locked for a corner
    // until that corner's required slider is above zero. Example: Red
    // Duration is locked until Red Dominance has at least one dot.
    var halfLocked = {};
    CFG.sliders.forEach(function (s) {
      if (!s.requires || !state.values[s.requires]) return;
      SIDES.forEach(function (side) {
        if (state.values[s.requires][side] === 0) {
          state.values[s.id][side] = 0;
          halfLocked[s.id + "-" + side] = true;
        }
      });
    });

    // 1. Effective Strikes / Grappling = the judge's needle + Impact, Dominance, Duration
    var strikingGrappling = state.manual + contribution("tenEight");

    // 2. Effective Aggressiveness only counts when Strikes / Grappling are even
    var aggrOpen = roundEven(strikingGrappling) === 0;
    if (!aggrOpen) resetGroup("aggressiveness");

    // 3. Cage Control only counts when Strikes / Grappling AND Aggressiveness are even
    var cageOpen = aggrOpen && groupEven("aggressiveness");
    if (!cageOpen) resetGroup("cage");

    // 4. Final needle position, snapped to a dot
    var total = strikingGrappling + contribution("aggressiveness") + contribution("cage");
    state.needle = snapNeedle(clamp(roundEven(total), -MAIN_STEPS, MAIN_STEPS));

    render({ aggressiveness: !aggrOpen, cage: !cageOpen }, halfLocked);
  }

  // ------------------------------------------------------------------
  // Drawing the current state on screen
  // ------------------------------------------------------------------
  function render(locked, halfLocked) {
    halfLocked = halfLocked || {};
    var p = state.needle;
    ui.main.handle.style.left = cellLeft(p + MAIN_STEPS, MAIN_CELLS);
    ui.main.handle.className = "handle needle " + (p < 0 ? "is-red" : p > 0 ? "is-blue" : "is-draw");
    renderReadout();

    Object.keys(ui.halves).forEach(function (key) {
      var h = ui.halves[key];
      var k = state.values[h.s.id][h.side];
      h.handle.style.left = cellLeft(h.toCell(k), h.cells);
      h.handle.classList.toggle("is-zero", k === 0);
      h.track.classList.toggle("locked", !!locked[h.s.group] || !!halfLocked[key]);
      var name = sliderValueText(h.s, k);
      h.handle.setAttribute("aria-valuetext", name || "none");
    });
    Object.keys(ui.rows).forEach(function (id) {
      var r = ui.rows[id];
      r.row.classList.toggle("locked", !!locked[r.group]);
    });

    renderGuidelines();
  }

  // CHANGED: no words are shown under the needle any more.
  // The position is only described for screen readers.
  function renderReadout() {
    var p = state.needle;
    if (p === 0) { ui.main.handle.setAttribute("aria-label", "Main needle: Draw"); return; }
    var info = MAIN_DOTS[Math.abs(p) - 1];
    ui.main.handle.setAttribute("aria-label", "Main needle: " + (p < 0 ? "Red" : "Blue") + " " +
      info.zone.score + " " + info.part.label);
  }

  // Plain word styled like the chart (italic, underlined), NOT a link
  function plain(text) { return el("i", "u", text); }

  // ------------------------------------------------------------------
  // (10-8) Guidelines: Consider / Always for each corner
  // ------------------------------------------------------------------
  var ruleTerms = {};

  function buildGuidelineText() {
    var intro = document.getElementById("teneight-intro");
    intro.appendChild(plain("Impact"));
    intro.appendChild(txt(", "));
    intro.appendChild(plain("Dominance"));
    intro.appendChild(txt(" and "));
    intro.appendChild(plain("Duration"));
    intro.appendChild(txt(", are an extension of "));
    intro.appendChild(term("strikes", "Effective Strikes", "em"));
    intro.appendChild(txt(" and "));
    intro.appendChild(term("grappling", "Effective Grappling", "em"));
    intro.appendChild(txt(" as they relate to a (10-8) score"));

    var box = document.getElementById("teneight-rule");
    ruleTerms.consider = term("consider108", "Consider 10-8", "strong");
    ruleTerms.always = term("always108", "Always Score 10-8", "strong");
    box.appendChild(el("b", null, "( "));
    box.appendChild(ruleTerms.consider);
    box.appendChild(el("b", null, " )"));
    box.appendChild(txt(" If you have "));
    box.appendChild(plain("Dominance"));
    box.appendChild(txt(" and "));
    box.appendChild(plain("Duration"));
    box.appendChild(txt(" without "));
    box.appendChild(plain("Impact"));
    box.appendChild(el("b", null, "  - or -  "));
    box.appendChild(txt("Significant "));
    box.appendChild(plain("Impact"));
    box.appendChild(txt(" without "));
    box.appendChild(plain("Dominance"));
    box.appendChild(el("b", null, "  -  ( "));
    box.appendChild(ruleTerms.always);
    box.appendChild(el("b", null, " )"));
    box.appendChild(txt(" if "));
    box.appendChild(el("i", "u", "all three"));
    box.appendChild(txt(" are met"));
  }

  function valueOf(id, side) { return (state.values[id] || {})[side] || 0; }

  function tenEightStatus(side) {
    var R = CFG.tenEightRules;
    var imp = valueOf("impact", side);
    var dom = valueOf("dominance", side);
    var dur = valueOf("duration", side);
    var hasImpact = imp >= R.impactCountsAt;
    var significant = imp >= R.significantImpactAt;
    var hasDom = dom >= R.dominanceCountsAt;
    var hasDur = dur >= R.durationCountsAt;
    if (hasImpact && hasDom && hasDur) return "always";
    if ((hasDom && hasDur && !hasImpact) || (significant && !hasDom)) return "consider";
    return "none";
  }

  function renderGuidelines() {
    var any = { consider: false, always: false };
    SIDES.forEach(function (side) {
      // CHANGED: the Red/Blue status boxes are removed. When a corner meets
      // a rule, "Consider 10-8" or "Always Score 10-8" in the rule line
      // lights up yellow instead.
      var st = tenEightStatus(side);
      if (st !== "none") any[st] = true;
    });
    ruleTerms.consider.classList.toggle("active", any.consider);
    ruleTerms.always.classList.toggle("active", any.always);
  }

  // ------------------------------------------------------------------
  // Popups
  // ------------------------------------------------------------------
  var overlay = document.getElementById("popup");
  var popupTitle = document.getElementById("popup-title");
  var popupBody = document.getElementById("popup-body");
  var popupClose = document.getElementById("popup-close");

  var popupBox = overlay.querySelector(".popup");

  function openPopup(title, nodes, chartMode, techMode) {
    lastFocus = document.activeElement;
    // CHANGED: chart mode = no title, chart fills the screen
    popupBox.classList.toggle("popup-chart", !!chartMode);
    // NEW: techniques mode = centered title, narrower box
    popupBox.classList.toggle("popup-techniques", !!techMode);
    popupBox.classList.remove("popup-settings");   // CHANGED: only the Settings window is extra wide (added back by openSettings)
    popupBox.classList.remove("popup-lock");       // CHANGED: password screens (added back when shown)
    popupBox.classList.remove("popup-about");      // NEW: About window (added back when shown)
    popupTitle.textContent = title;
    popupBody.innerHTML = "";
    nodes.forEach(function (n) { popupBody.appendChild(n); });
    overlay.hidden = false;
    popupClose.focus();
  }
  function closePopup() {
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  popupClose.addEventListener("click", closePopup);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closePopup(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closePopup();
  });

  function openDefinition(key) {
    var d = DEFS && DEFS[key];
    if (!d) {
      openPopup("Missing text", [el("p", null, "No text found for \"" + key + "\" in definitions.js.")]);
      return;
    }
    openPopup(d.title, d.body.map(function (t) { return el("p", null, t); }));
  }

  // ------------------------------------------------------------------
  // NEW: Techniques popups (Effective Strikes / Effective Grappling)
  // List from config.js → techniques. Order in the popup:
  // title, technique names, then the Red and Blue boxes.
  // CHANGED: the user picks a technique FIRST (it highlights yellow).
  // The Red and Blue boxes stay grayed out until a technique is picked.
  // Clicking Red or Blue adds the technique's dots to that fighter's slider and closes the popup.
  // ------------------------------------------------------------------
  function techniqueTerm(key, text) {
    var b = el("button", "term term-strong", text);
    b.type = "button";
    b.addEventListener("click", function () { openTechniques(key); });
    return b;
  }

  function openTechniques(key) {
    var T = CFG.techniques && CFG.techniques[key];
    if (!T) {
      openPopup("Missing list", [el("p", null, "No techniques found for \"" + key + "\" in config.js.")]);
      return;
    }
    var chosen = null;   // CHANGED: the picked technique — must be picked every time the popup opens
    var techButtons = [];
    var cornerButtons = {};

    var list = el("div", "tech-list");
    sortedTechniques(T).forEach(function (t) {   // CHANGED: highest value at the top, even after values are changed in Settings
      var b = el("button", "tech-btn", t.name);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        chosen = t;
        techButtons.forEach(function (x) {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        SIDES.forEach(function (s2) { cornerButtons[s2].disabled = false; });
        hint.textContent = "Now click Red or Blue.";
      });
      list.appendChild(b);
      techButtons.push(b);
    });
    if (!techButtons.length) list.appendChild(el("p", "tech-empty", "Techniques will be added later."));

    var corners = el("div", "tech-corners");
    SIDES.forEach(function (side) {
      var c = el("button", "tech-corner tech-" + side, side === "red" ? "Red" : "Blue");
      c.type = "button";
      c.disabled = true;   // grayed out until a technique is picked
      c.addEventListener("click", function () {
        if (!chosen) return;
        addToSlider(T.slider || "impact", side, Number(chosen.dots) || 0);
        closePopup();
      });
      cornerButtons[side] = c;
      corners.appendChild(c);
    });

    var hint = el("p", "tech-hint",
      techButtons.length ? "Pick a technique, then click Red or Blue." : "");

    openPopup(T.title, [list, corners, hint], false, true);
  }

  // CHANGED: techniques from highest value to lowest. Equal values keep the config.js order.
  function sortedTechniques(T) {
    return (T.list || [])
      .map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) { return (Number(b.t.dots) - Number(a.t.dots)) || (a.i - b.i); })
      .map(function (x) { return x.t; });
  }

  // ------------------------------------------------------------------
  // CHANGED: Technique Effectiveness window (gear beside "3 min", password) —
  // change values, ADD, DELETE and EDIT (rename) techniques, then click Save.
  // Save writes the shared list (techniques.json) on GitHub for every device —
  // see "SHARED LIST ON GITHUB + PASSWORD" below. config.js holds a backup list.
  // ------------------------------------------------------------------
  var SETTINGS_KEY = "ijt-techniques-v2";          // CHANGED: now saves whole lists
  var OLD_SETTINGS_KEY = "ijt-technique-values-v1"; // earlier version saved values only
  var NAME_MAX = 100;                               // longest technique name allowed
  var defaultLists = {};                            // copy of the config.js lists

  function copyList(list) {
    return (list || []).map(function (t) { return { name: String(t.name), dots: Number(t.dots) || 1 }; });
  }

  // Remember the config.js lists, then use any lists saved in Settings
  function loadTechniqueValues() {
    var saved = null, old = null;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (err) { saved = null; }
    if (!saved) {
      try { old = JSON.parse(localStorage.getItem(OLD_SETTINGS_KEY) || "null"); } catch (err) { old = null; }
    }
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      var T = CFG.techniques[key];
      var max = techniqueMax(T);
      defaultLists[key] = copyList(T.list);
      T.list = copyList(T.list);
      if (saved && Array.isArray(saved[key])) {
        // Use the saved list, skipping anything broken
        T.list = saved[key].filter(function (t) {
          return t && typeof t.name === "string" && t.name.trim() &&
            typeof t.dots === "number" && t.dots >= 1 && t.dots <= max;
        }).map(function (t) { return { name: t.name.trim().slice(0, NAME_MAX), dots: Math.round(t.dots) }; });
      } else if (old && old[key]) {
        // Values saved by the earlier version of Settings
        T.list.forEach(function (t) {
          var v = old[key][t.name];
          if (typeof v === "number" && v >= 1 && v <= max) t.dots = v;
        });
      }
    });
    if (old) saveTechniqueValues();   // move the old values to the new format
  }

  // Saves only the lists that are different from config.js
  function saveTechniqueValues() {
    var out = {};
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      if (JSON.stringify(copyList(CFG.techniques[key].list)) !== JSON.stringify(defaultLists[key])) {
        out[key] = copyList(CFG.techniques[key].list);
      }
    });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(out));
      localStorage.removeItem(OLD_SETTINGS_KEY);
    } catch (err) { /* private mode: works until the page is closed */ }
  }

  // Highest value allowed = number of usable dots on the slider the technique moves (27 on Impact / Damage)
  function techniqueMax(T) {
    var s = CFG.sliders.filter(function (x) { return x.id === (T.slider || "impact"); })[0];
    if (!s) return 1;
    var n = 0;
    for (var k = 1; k <= sliderMax(s); k++) if (sliderLandable(s, k)) n++;
    return n;
  }

  // A − value + control. get/set read and change the number.
  function stepper(label, get, set, max) {
    var wrap = el("span", "set-stepper");
    var minus = el("button", "set-step", "−");
    var val = el("span", "set-val");
    var plus = el("button", "set-step", "+");
    minus.type = plus.type = "button";
    minus.setAttribute("aria-label", "Lower value: " + label);
    plus.setAttribute("aria-label", "Raise value: " + label);
    function show() {
      val.textContent = get();
      minus.disabled = get() <= 1;
      plus.disabled = get() >= max;
    }
    minus.addEventListener("click", function () { if (get() > 1) { set(get() - 1); show(); } });
    plus.addEventListener("click", function () { if (get() < max) { set(get() + 1); show(); } });
    show();
    wrap.appendChild(minus);
    wrap.appendChild(val);
    wrap.appendChild(plus);
    return { node: wrap, val: val, show: show };
  }

  // CHANGED: changes in the Technique Effectiveness window are NOT kept until
  // "Save" is clicked. Closing the window (× / Esc / clicking outside) without
  // Save throws the changes away. "Edit" turns the technique names into boxes
  // so the words can be changed. ("Restore defaults" was removed.)
  var draft = null;        // working copy while the window is open
  var editMode = false;    // true = names can be typed over
  var draftDirty = false;  // true = something changed since the window opened

  function makeDraft() {
    draft = {};
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      draft[key] = sortedTechniques(CFG.techniques[key]).map(function (t) {
        return { name: t.name, dots: t.dots, orig: { name: t.name, dots: t.dots } };
      });
    });
    editMode = false;
    draftDirty = false;
  }
  // CHANGED: the window sorts highest value first ONLY when it opens and when
  // Save is clicked (makeDraft sorts). Nothing moves while − / + / Add are used;
  // a new technique sits at the bottom of its list until Save.
  // After Save, every technique that was changed or added flashes yellow once,
  // so it is easy to see where it landed.
  var flashNames = null;   // { strikes: { "name": true }, ... } = rows to flash on the next redraw

  function markDirty() {
    draftDirty = true;
    var m = popupBody.querySelector(".set-footmsg.ok");   // a new change hides "Saved."
    if (m) { m.textContent = ""; m.classList.remove("ok"); }
    var save = popupBody.querySelector(".set-save");
    if (save) save.classList.add("dirty");
  }

  function settingsNodes() {
    // NEW: the Duration tab
    if (gearTab === "duration") return [gearTabs()].concat(durationNodes());
    // Effective Strikes and Effective Grappling side by side (one column each)
    var cols = el("div", "set-cols");
    var nodes = [gearTabs(), cols];   // CHANGED: tabs on top
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      var T = CFG.techniques[key];
      var list = draft[key];   // already sorted when the window opened / after Save
      var max = techniqueMax(T);
      var col = el("div", "set-col");
      cols.appendChild(col);
      col.appendChild(el("div", "set-head", T.title));
      if (!list.length) col.appendChild(el("p", "tech-empty", "No techniques yet."));

      list.forEach(function (t) {
        var flash = flashNames && flashNames[key] && flashNames[key][t.name];
        var row = el("div", "set-row" + (flash ? " moved" : ""));   // "moved" = flashes yellow (after Save)

        // Name: plain words, or a typing box in Edit mode
        var name;
        function nameChanged() { return !t.orig || t.name !== t.orig.name; }
        if (editMode) {
          // A box that wraps onto more lines, so long names are fully visible
          name = el("textarea", "set-input set-rename");
          name.rows = 1;
          name.maxLength = NAME_MAX;
          name.value = t.name;
          name.setAttribute("aria-label", "Technique name");
          name.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });   // names are one line
          name.addEventListener("input", function () {
            if (/[\r\n]/.test(name.value)) name.value = name.value.replace(/[\r\n]+/g, " ");
            fitHeight(name);
            t.name = name.value;
            name.classList.toggle("changed", nameChanged());
            footMsg().textContent = "";
            markDirty();
          });
        } else {
          name = el("span", "set-name", t.name);
        }
        name.classList.toggle("changed", nameChanged());   // yellow = not saved yet
        row.appendChild(name);

        var st = stepper(t.name, function () { return t.dots; }, function (v) {
          t.dots = v;
          st.val.classList.toggle("changed", !t.orig || t.dots !== t.orig.dots);
          markDirty();   // the row stays where it is until Save
        }, max);
        st.val.classList.toggle("changed", !t.orig || t.dots !== t.orig.dots);
        row.appendChild(st.node);

        // Delete: first tap asks "Delete?", second tap removes it (kept only after Save)
        var del = el("button", "set-del", "Delete");
        del.type = "button";
        del.setAttribute("aria-label", "Delete technique: " + t.name);
        del.addEventListener("click", function () {
          if (!del.classList.contains("confirm")) {
            del.classList.add("confirm");
            del.textContent = "Delete?";
            return;
          }
          draft[key] = draft[key].filter(function (x) { return x !== t; });
          draftDirty = true;
          redrawSettings();
        });
        del.addEventListener("blur", function () {   // tapping somewhere else cancels
          del.classList.remove("confirm");
          del.textContent = "Delete";
        });
        row.appendChild(del);
        col.appendChild(row);
      });

      // Add a new technique: name, value, Add button
      var addRow = el("div", "set-row set-add");
      var input = el("input", "set-input set-newname");
      input.type = "text";
      input.maxLength = NAME_MAX;
      input.placeholder = "New technique name";
      input.setAttribute("aria-label", "New " + T.title + " technique name");
      var newDots = 1;
      var st2 = stepper("new technique", function () { return newDots; }, function (v) { newDots = v; }, max);
      var add = el("button", "set-addbtn", "Add");
      add.type = "button";
      var msg = el("p", "set-msg");
      // Returns true if added (or nothing typed). Shows a message if not.
      function tryAdd(silentIfEmpty) {
        var nm = input.value.trim();
        if (!nm) {
          if (!silentIfEmpty) { msg.textContent = "Type a name first."; input.focus(); }
          return !!silentIfEmpty;
        }
        if (nameTaken(key, nm, null)) { msg.textContent = "That technique is already in the list."; input.focus(); return false; }
        draft[key].push({ name: nm, dots: newDots, orig: null });   // bottom of the list until Save
        draftDirty = true;
        input.value = "";
        return true;
      }
      add.addEventListener("click", function () { if (tryAdd(false)) redrawSettings(key); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); if (tryAdd(false)) redrawSettings(key); }
      });
      input.addEventListener("input", function () { msg.textContent = ""; });
      addRow.appendChild(input);
      addRow.appendChild(st2.node);
      addRow.appendChild(add);
      addRow.dataset.key = key;
      addRow._tryAdd = tryAdd;   // Save also adds a name that was typed but not added yet
      col.appendChild(addRow);
      col.appendChild(msg);
    });

    // Bottom line: note on the left, Edit + Save on the right
    var foot = el("div", "set-foot");
    foot.appendChild(el("span", "set-note",
      "Value = dots added to Impact / Damage. Yellow = not saved yet. Save sends the list to GitHub for all your devices."));
    var btns = el("span", "set-footbtns");
    // CHANGED: Change password (this device)
    var chpw = el("button", "set-edit set-chpw", "Change password");
    chpw.type = "button";
    chpw.addEventListener("click", showChangePassword);
    btns.appendChild(chpw);
    // CHANGED: Edit only turns editing ON (no "Done editing"). Save saves and turns it off.
    var edit = el("button", "set-edit" + (editMode ? " on" : ""), "Edit");
    edit.type = "button";
    edit.setAttribute("aria-pressed", editMode ? "true" : "false");
    edit.addEventListener("click", function () {
      if (editMode) return;   // already editing: click Save when finished
      editMode = true;
      redrawSettings(null, true);
    });
    var save = el("button", "set-save" + (draftDirty ? " dirty" : ""), "Save");
    save.type = "button";
    save.addEventListener("click", saveDraft);
    btns.appendChild(edit);
    btns.appendChild(save);
    foot.appendChild(btns);
    nodes.push(foot);
    nodes.push(el("p", "set-msg set-footmsg"));
    return nodes;
  }
  function footMsg() { return popupBody.querySelector(".set-footmsg") || el("p"); }
  // Grow a name box to show every line of its text
  function fitHeight(box) {
    box.style.height = "auto";
    box.style.height = (box.scrollHeight + 2) + "px";
  }

  // Is this name already used by ANOTHER technique in the same list? (capital letters don't matter)
  function nameTaken(key, nm, except) {
    var low = nm.trim().toLowerCase();
    return draft[key].some(function (x) { return x !== except && x.name.trim().toLowerCase() === low; });
  }

  // ==================================================================
  // CHANGED: SHARED LIST ON GITHUB + PASSWORD
  // - The technique lists live in techniques.json in the GitHub project.
  //   Every device reads it when the tool opens (see fetchSharedFromSite).
  // - The gear asks for a password. The password unlocks this device's
  //   GitHub key, which is stored on the device SCRAMBLED with the password
  //   (it cannot be read without the password).
  // - Save writes techniques.json through GitHub. Other devices get the new
  //   list the next time the tool is opened or reloaded (usually 1–2 minutes).
  // - Once unlocked, the gear stays unlocked until the page is closed or reloaded.
  // ==================================================================
  var SYNC = CFG.sync || {};
  var CACHE_KEY = "ijt-shared-cache-v1";   // last shared list seen on this device (opens fast, works offline)
  var KEY_STORE = "ijt-key-v1";            // this device's GitHub key, scrambled with the password
  var sessionToken = null;                 // the unlocked key, kept in memory only (gone on reload)
  var remoteSha = null;                    // which version of techniques.json the window was opened with
  var MIN_PASSWORD = 6;

  // ---------- reading / using a shared list ----------
  // Puts a shared list into the tool. Anything broken in the file is skipped.
  function applyShared(data) {
    if (!data || typeof data !== "object" || !data.techniques) return false;
    var used = false;
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      var list = data.techniques[key];
      if (!Array.isArray(list)) return;
      var max = techniqueMax(CFG.techniques[key]);
      CFG.techniques[key].list = list.filter(function (t) {
        return t && typeof t.name === "string" && t.name.trim() &&
          typeof t.dots === "number" && t.dots >= 1 && t.dots <= max;
      }).map(function (t) { return { name: t.name.trim().slice(0, NAME_MAX), dots: Math.round(t.dots) }; });
      used = true;
    });
    return used;
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (err) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (err) { /* private mode */ }
  }
  function currentShared() {
    var out = { savedAt: new Date().toISOString(), techniques: {} };
    Object.keys(CFG.techniques || {}).forEach(function (key) { out.techniques[key] = copyList(CFG.techniques[key].list); });
    return out;
  }
  function settingsOpen() { return !overlay.hidden && popupBox.classList.contains("popup-settings"); }

  // When the page opens: get techniques.json from the website (fresh copy).
  // If this device saved something newer a moment ago, keep that instead.
  function fetchSharedFromSite() {
    if (!window.fetch || !SYNC.file) return;
    fetch(SYNC.file + "?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.techniques) return;
        var c = readCache();
        if (c && c.savedAt && data.savedAt && c.savedAt > data.savedAt) return;   // ours is newer
        if (settingsOpen()) return;   // never change the list under the user's hands
        if (applyShared(data)) writeCache(data);
      })
      .catch(function () { /* no internet, or opened as a local file: keep what we have */ });
  }

  // ---------- scrambling the GitHub key with the password ----------
  var cryptoOK = !!(window.crypto && window.crypto.subtle && window.TextEncoder);
  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function textToB64(s) { return bytesToB64(new TextEncoder().encode(s)); }   // for GitHub (handles ’ and other characters)
  function b64ToText(b64) { return new TextDecoder().decode(b64ToBytes(b64.replace(/\s/g, ""))); }

  function passwordKey(password, salt) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 250000, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      });
  }
  // Store the GitHub key on this device, scrambled with the password
  function lockToken(token, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return passwordKey(password, salt).then(function (k) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, new TextEncoder().encode(token));
    }).then(function (data) {
      localStorage.setItem(KEY_STORE, JSON.stringify({
        salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data))
      }));
    });
  }
  // Unscramble the key. Fails (rejects) if the password is wrong.
  function unlockToken(password) {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY_STORE) || "null"); } catch (err) { s = null; }
    if (!s) return Promise.reject(new Error("nokey"));
    return passwordKey(password, b64ToBytes(s.salt)).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(s.iv) }, k, b64ToBytes(s.data));
    }).then(function (plain) { return new TextDecoder().decode(plain); });
  }
  function hasStoredKey() {
    try { return !!localStorage.getItem(KEY_STORE); } catch (err) { return false; }
  }

  // ---------- talking to GitHub ----------
  function gh(token, method, path, body) {
    return fetch("https://api.github.com/repos/" + SYNC.owner + "/" + SYNC.repo + path, {
      method: method,
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function ghError(status) { var e = new Error("github " + status); e.status = status; return e; }
  // Read techniques.json straight from GitHub (newest version, no waiting)
  function ghReadFile(token, file) {   // CHANGED: file is optional (default techniques.json)
    file = file || SYNC.file;
    return gh(token, "GET", "/contents/" + file + "?ref=" + encodeURIComponent(SYNC.branch)).then(function (r) {
      if (r.status === 404) return null;   // file not there yet
      if (!r.ok) throw ghError(r.status);
      return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(b64ToText(j.content || "")) }; });
    });
  }
  // Write techniques.json. sha = the version we started from (GitHub refuses if someone saved in between).
  function ghWriteFile(token, data, sha) {
    var body = {
      message: "Update techniques (Technique Effectiveness window)",
      content: textToB64(JSON.stringify(data, null, 2) + "\n"),
      branch: SYNC.branch
    };
    if (sha) body.sha = sha;
    return gh(token, "PUT", "/contents/" + SYNC.file, body).then(function (r) {
      if (!r.ok) throw ghError(r.status);
      return r.json().then(function (j) { return j.content && j.content.sha; });
    });
  }
  // Setup check: does this key reach the project, and may it change it?
  function ghCheckKey(token) {
    return gh(token, "GET", "").then(function (r) {
      if (!r.ok) throw ghError(r.status);
      return r.json().then(function (j) {
        if (j.permissions && j.permissions.push === false) throw ghError("readonly");
        return true;
      });
    });
  }
  // Plain-English message for a GitHub problem
  function ghMessage(err, doing) {
    var s = err && err.status;
    if (s === 401) return "GitHub did not accept this key. It may be mistyped, expired or deleted.";
    if (s === 403 || s === "readonly") return "This key is not allowed to change the project. When creating the key, \"Contents\" must be set to \"Read and write\".";
    if (s === 404) return "This key cannot reach the " + SYNC.repo + " project. When creating the key, choose \"Only select repositories\" and pick " + SYNC.repo + ".";
    if (s === 409 || s === 422) return "The list was changed on another device after you opened this window. Close this window and open it again to get the newest list, then make your changes again.";
    return "Could not reach GitHub" + (doing ? " to " + doing : "") + ". Check the internet connection and try again.";
  }

  // ---------- small form helpers for the password screens ----------
  function field(labelText, type, auto) {
    var wrap = el("label", "lock-field");
    wrap.appendChild(el("span", "lock-label", labelText));
    var input = el("input", "set-input lock-input");
    input.type = type;
    input.autocomplete = auto || "off";
    input.spellcheck = false;
    wrap.appendChild(input);
    return { node: wrap, input: input };
  }
  function lockButton(text, cls) {
    var b = el("button", cls || "lock-btn", text);
    b.type = "button";
    return b;
  }
  function onEnter(inputs, fn) {
    inputs.forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); fn(); } }); });
  }
  // CHANGED: the password screens are shared by the gear and the About window.
  // lockTarget = what to open after the password (title shown, what it is for, what to open).
  var lockTarget = { title: "Technique Effectiveness", what: "change the techniques", next: function () { openEditor(); } };
  function showPanel(nodes, focusInput) {
    openPopup(lockTarget.title, nodes, false, true);
    popupBox.classList.add("popup-lock");
    if (focusInput) focusInput.focus();
  }
  // Ask for the password (or first-time setup) only if needed, then open "next"
  function withUnlock(title, what, next) {
    lockTarget = { title: title, what: what, next: next };
    if (!cryptoOK) {
      openPopup(title, [el("p", null,
        "This browser can't keep the password safe. Please use a current version of Safari or Chrome.")], false, true);
      return;
    }
    if (sessionToken) { next(); return; }   // already unlocked since the page opened
    if (hasStoredKey()) showUnlock(); else showSetup();
  }

  // ---------- the gear ----------
  function openSettings() {
    withUnlock("Technique Effectiveness", "change the techniques", function () { openEditor(); });
  }

  // Password screen
  function showUnlock() {
    var form = el("div", "lock-form");
    form.appendChild(el("p", "lock-intro", "Enter your password to " + lockTarget.what + "."));
    var pw = field("Password", "password", "current-password");
    form.appendChild(pw.node);
    var msg = el("p", "set-msg");
    var go = lockButton("Unlock", "lock-btn lock-main");
    function tryUnlock() {
      if (!pw.input.value) { msg.textContent = "Type your password."; return; }
      go.disabled = true; msg.textContent = "";
      unlockToken(pw.input.value).then(function (token) {
        sessionToken = token;
        lockTarget.next();   // CHANGED: techniques window or About editor
      }).catch(function () {
        go.disabled = false;
        msg.textContent = "Wrong password.";
        pw.input.select();
      });
    }
    go.addEventListener("click", tryUnlock);
    onEnter([pw.input], tryUnlock);
    form.appendChild(go);
    form.appendChild(msg);
    var forgot = lockButton("Forgot password? Set up this device again", "lock-link");
    forgot.addEventListener("click", function () { showSetup(true); });
    form.appendChild(forgot);
    showPanel([form], pw.input);
  }

  // One-time setup on each device: GitHub key + choose a password
  function showSetup(again) {
    var form = el("div", "lock-form");
    form.appendChild(el("p", "lock-intro", again
      ? "Paste your GitHub key and choose a new password. (The old password stops working on this device.)"
      : "One-time setup for this device. Paste your GitHub key and choose a password."));
    var key = field("GitHub key", "password", "off");
    key.input.placeholder = "github_pat_…";
    var pw1 = field("Choose a password (at least " + MIN_PASSWORD + " characters)", "password", "new-password");
    var pw2 = field("Type the password again", "password", "new-password");
    form.appendChild(key.node);
    form.appendChild(pw1.node);
    form.appendChild(pw2.node);
    var msg = el("p", "set-msg");
    var go = lockButton("Set up", "lock-btn lock-main");
    function trySetup() {
      var token = key.input.value.trim();
      if (!token) { msg.textContent = "Paste your GitHub key."; return; }
      if (pw1.input.value.length < MIN_PASSWORD) { msg.textContent = "The password needs at least " + MIN_PASSWORD + " characters."; return; }
      if (pw1.input.value !== pw2.input.value) { msg.textContent = "The two passwords are not the same."; return; }
      go.disabled = true;
      msg.classList.remove("ok");
      msg.textContent = "Checking the key with GitHub…";
      ghCheckKey(token).then(function () {
        return lockToken(token, pw1.input.value);
      }).then(function () {
        sessionToken = token;
        lockTarget.next();   // CHANGED: techniques window or About editor
      }).catch(function (err) {
        go.disabled = false;
        msg.textContent = ghMessage(err, "check the key");
      });
    }
    go.addEventListener("click", trySetup);
    onEnter([key.input, pw1.input, pw2.input], trySetup);
    form.appendChild(go);
    form.appendChild(msg);
    if (again && hasStoredKey()) {
      var back = lockButton("Back to password", "lock-link");
      back.addEventListener("click", showUnlock);
      form.appendChild(back);
    }
    showPanel([form], key.input);
  }

  // Change password (from the Technique Effectiveness window). Applies to THIS device.
  function showChangePassword() {
    var form = el("div", "lock-form");
    form.appendChild(el("p", "lock-intro",
      "Change the password on this device. Each Mac, iPhone and iPad has its own password — change it on each one you use."));
    var cur = field("Current password", "password", "current-password");
    var pw1 = field("New password (at least " + MIN_PASSWORD + " characters)", "password", "new-password");
    var pw2 = field("Type the new password again", "password", "new-password");
    form.appendChild(cur.node);
    form.appendChild(pw1.node);
    form.appendChild(pw2.node);
    var msg = el("p", "set-msg");
    var row = el("div", "lock-row");
    var back = lockButton("Back to techniques");
    var go = lockButton("Save new password", "lock-btn lock-main");
    function tryChange() {
      msg.classList.remove("ok");
      if (pw1.input.value.length < MIN_PASSWORD) { msg.textContent = "The new password needs at least " + MIN_PASSWORD + " characters."; return; }
      if (pw1.input.value !== pw2.input.value) { msg.textContent = "The two new passwords are not the same."; return; }
      go.disabled = true; msg.textContent = "";
      unlockToken(cur.input.value).then(function (token) {
        return lockToken(token, pw1.input.value);
      }).then(function () {
        go.disabled = false;
        cur.input.value = pw1.input.value = pw2.input.value = "";
        msg.classList.add("ok");
        msg.textContent = "Password changed on this device.";
      }).catch(function () {
        go.disabled = false;
        msg.textContent = "The current password is wrong.";
        cur.input.select();
      });
    }
    go.addEventListener("click", tryChange);
    onEnter([cur.input, pw1.input, pw2.input], tryChange);
    back.addEventListener("click", function () {
      popupBox.classList.remove("popup-lock");
      redrawSettings();   // the techniques window, with any unsaved changes still there
    });
    row.appendChild(back);
    row.appendChild(go);
    form.appendChild(row);
    form.appendChild(msg);
    popupBody.innerHTML = "";
    popupBody.appendChild(form);
    popupBox.classList.add("popup-lock");
    cur.input.focus();
  }

  // ==================================================================
  // NEW: DURATION SETTINGS (second tab of the gear window)
  // Tom can change the Duration time windows, where the needle starts and
  // ends inside a window, what happens after the window, and the round
  // length the tool opens with. Saved to GitHub as settings.json, so every
  // device uses the same numbers. config.js keeps the defaults.
  // ==================================================================
  var SETTINGS_FILE = SYNC.settingsFile || "settings.json";
  var SETTINGS_CACHE = "ijt-settings-cache-v1";
  var LEVEL_KEYS = ["High", "Med", "Low"];
  var LEVEL_NAMES = { High: "High Dominance", Med: "Medium Dominance", Low: "Low Dominance" };
  var AFTER_CHOICES = [
    { v: 0, label: "Stop (stay where it is)" },
    { v: 0.25, label: "Keep moving at ¼ speed" },
    { v: 1 / 3, label: "Keep moving at ⅓ speed" },
    { v: 0.5, label: "Keep moving at ½ speed" },
    { v: 1, label: "Keep moving at the same speed" }
  ];
  var SEC_STEP = 6;   // one Duration dot
  function copyDuration(d) { return JSON.parse(JSON.stringify(d)); }
  function currentDuration() {
    var R = CFG.durationRules;
    return copyDuration({ levels: R.levels, levels3: R.levels3 || scaledLevels(R.levels),
      startDot: R.startDot, endDot: R.endDot, afterRate: R.afterRate });
  }
  // 5-minute windows × 3/5, to the nearest 6 seconds (used when no 3-minute windows were saved yet)
  function scaledLevels(levels) {
    var out = {};
    LEVEL_KEYS.forEach(function (k) {
      var a = Math.round(levels[k].startSec * 0.6 / SEC_STEP) * SEC_STEP;
      var b = Math.min(180, Math.round(levels[k].endSec * 0.6 / SEC_STEP) * SEC_STEP);
      if (b <= a) b = Math.min(180, a + SEC_STEP);
      if (b <= a) a = b - SEC_STEP;
      out[k] = { startSec: a, endSec: b };
    });
    return out;
  }
  var durRound = 5;            // which round's windows the Duration tab is showing (5 or 3)
  var gearTab = "tech";        // which tab of the gear window is showing: "tech" or "duration"
  var durDraft = null, durOrig = null, settingsSha = null, roundTouched = false;

  // Check numbers from settings.json; anything broken → null (the tool keeps what it has)
  function cleanDuration(d) {
    if (!d || typeof d !== "object" || !d.levels) return null;
    function cleanLevels(src, full) {
      var o = {};
      for (var i = 0; i < LEVEL_KEYS.length; i++) {
        var L = src[LEVEL_KEYS[i]];
        if (!L || typeof L.startSec !== "number" || typeof L.endSec !== "number") return null;
        if (L.startSec < 0 || L.endSec > full || L.endSec <= L.startSec) return null;
        o[LEVEL_KEYS[i]] = { startSec: Math.round(L.startSec), endSec: Math.round(L.endSec) };
      }
      return o;
    }
    var out = { levels: cleanLevels(d.levels, CFG.roundLength.fullRoundSeconds) };
    if (!out.levels) return null;
    // CHANGED: 3-minute windows (each time 3:00 or less). Older saves have none → 5-minute × 3/5.
    out.levels3 = d.levels3 ? cleanLevels(d.levels3, 180) : scaledLevels(out.levels);
    if (!out.levels3) return null;
    if (!(d.startDot >= 1 && d.endDot <= MAIN_STEPS && d.endDot > d.startDot)) return null;
    if (!mainLandable(d.startDot) || !mainLandable(d.endDot)) return null;
    if (!(typeof d.afterRate === "number" && d.afterRate >= 0 && d.afterRate <= 1)) return null;
    out.startDot = Math.round(d.startDot);
    out.endDot = Math.round(d.endDot);
    out.afterRate = d.afterRate;
    return out;
  }
  function applySettings(data) {
    var d = cleanDuration(data && data.duration);
    if (!d) return false;
    var R = CFG.durationRules;
    R.levels = d.levels; R.levels3 = d.levels3; R.startDot = d.startDot; R.endDot = d.endDot; R.afterRate = d.afterRate;
    // CHANGED (2026-11-05): a saved "defaultMinutes" is ignored; the tool opens on config.js's round length (5 min)
    return true;
  }
  function readSettingsCache() { try { return JSON.parse(localStorage.getItem(SETTINGS_CACHE) || "null"); } catch (err) { return null; } }
  function writeSettingsCache(d) { try { localStorage.setItem(SETTINGS_CACHE, JSON.stringify(d)); } catch (err) { /* private mode */ } }
  // When the page opens: newest settings.json from the website (unless this device saved newer)
  function fetchSettingsFromSite() {
    if (!window.fetch) return;
    fetch(SETTINGS_FILE + "?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.duration) return;
        var c = readSettingsCache();
        if (c && c.savedAt && data.savedAt && c.savedAt > data.savedAt) return;   // ours is newer
        if (applySettings(data)) {
          writeSettingsCache(data);
          update();
        }
      })
      .catch(function () { /* no internet, or opened as a local file */ });
  }

  // Name of a main-needle dot, e.g. 1 → "10-9 Close", 11 → "10-8 Close"
  function needleDotName(p) {
    var zones = CFG.mainNeedle.zones, z = Math.min(zones.length - 1, Math.floor((p - 1) / 10));
    var inZone = p - z * 10, zone = zones[z], part = zone.parts[zone.parts.length - 1];
    for (var i = 0; i < zone.parts.length; i++) { if (inZone <= zone.parts[i].upTo) { part = zone.parts[i]; break; } }
    return zone.score + " " + (part.label.length > 12 ? "" : part.label);
  }
  function mmss(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }

  // CHANGED: a − [box] + control. The number can be changed with − / + OR typed in the box.
  // o.text(v) = the words in the box · o.read(words) = the number typed (null = not understood)
  // o.fit(v) = the nearest allowed value (null = none) · o.next / o.prev = the − / + steps
  // o.note(v) = words shown after the box (optional) · o.hint = what to type, for the message
  function valueStepper(label, get, set, o) {
    var wrap = el("span", "set-stepper dur-stepper");
    var minus = el("button", "set-step", "−"), plus = el("button", "set-step", "+");
    var box = el("input", "set-val dur-val");
    box.type = "text";
    box.setAttribute("inputmode", o.numeric ? "numeric" : "text");
    box.setAttribute("aria-label", label);
    box.autocomplete = "off";
    box.spellcheck = false;
    var note = o.note ? el("span", "dur-note") : null;
    minus.type = plus.type = "button";
    minus.setAttribute("aria-label", "Lower: " + label);
    plus.setAttribute("aria-label", "Raise: " + label);
    function show() {
      if (document.activeElement !== box) box.value = o.text(get());
      if (note) note.textContent = o.note(get());
      minus.disabled = o.prev(get()) === null;
      plus.disabled = o.next(get()) === null;
    }
    function commit() {
      var typed = box.value.trim();
      if (typed === o.text(get())) return;
      var v = o.read(typed), m = popupBody.querySelector(".dur-msg");
      if (m) { m.classList.remove("ok"); m.textContent = ""; }
      if (v === null || isNaN(v)) {
        if (m) m.textContent = "\u201C" + typed + "\u201D was not understood. " + o.hint;
        box.value = o.text(get());
        return;
      }
      var f = o.fit(v);
      if (f === null) { box.value = o.text(get()); return; }
      if (f !== v && m) m.textContent = "Set to " + o.text(f) + " \u2014 the nearest allowed value.";
      set(f);
      box.value = o.text(f);
      refreshDuration();
    }
    box.addEventListener("change", commit);
    box.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); box.select(); } });
    box.addEventListener("focus", function () { box.select(); });
    minus.addEventListener("click", function () { var v = o.prev(get()); if (v !== null) { set(v); refreshDuration(); } });
    plus.addEventListener("click", function () { var v = o.next(get()); if (v !== null) { set(v); refreshDuration(); } });
    wrap.appendChild(minus); wrap.appendChild(box); wrap.appendChild(plus);
    if (note) wrap.appendChild(note);
    show();
    wrap._show = show;
    wrap._val = box;
    return wrap;
  }
  // Typed time → seconds: "1:30" → 90, "2" → 120 (minutes), "0:45" → 45
  function readTime(t) {
    var m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(String(t).replace(/\s/g, ""));
    if (!m) return null;
    var sec = m[2] === undefined ? 0 : Number(m[2]);
    if (m[2] !== undefined && m[2].length === 1) sec *= 10;   // "1:3" = 1:30
    if (sec >= 60) return null;
    return Number(m[1]) * 60 + sec;
  }
  // Nearest allowed time: between lo and hi, on a 6-second step
  function fitTime(v, lo, hi) {
    if (hi < lo) return null;
    var f = Math.round(v / SEC_STEP) * SEC_STEP;
    return Math.max(lo, Math.min(hi, f));
  }
  // Nearest usable main-needle dot between lo and hi (a line dot moves one toward Draw, or up if it must)
  function fitDot(v, lo, hi) {
    var p = Math.max(lo, Math.min(hi, Math.round(v)));
    if (mainLandable(p)) return p;
    var d = prevLandable(p, lo);
    if (d !== null) return d;
    return nextLandable(p, hi);
  }
  function nextLandable(p, limit) { var n = p + 1; while (n <= limit && !mainLandable(n)) n++; return n <= limit ? n : null; }
  function prevLandable(p, limit) { var n = p - 1; while (n >= limit && !mainLandable(n)) n--; return n >= limit ? n : null; }

  // Tabs at the top of the gear window
  function gearTabs() {
    var bar = el("div", "gear-tabs");
    [["tech", "Techniques"], ["duration", "Duration scale"]].forEach(function (t) {
      var b = el("button", "gear-tab" + (gearTab === t[0] ? " on" : ""), t[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", gearTab === t[0] ? "true" : "false");
      b.addEventListener("click", function () {
        if (gearTab === t[0]) return;
        gearTab = t[0];
        redrawSettings();   // each tab keeps its own unsaved changes
      });
      bar.appendChild(b);
    });
    return bar;
  }

  var durSteppers = [];
  function refreshDuration() {   // redraw numbers + yellow marks without rebuilding the tab
    durSteppers.forEach(function (s) { s._show(); s._val.classList.toggle("changed", s._changed()); });
    var sv = popupBody.querySelector(".dur-save");
    var dirty = JSON.stringify(durDraft) !== JSON.stringify(durOrig);
    if (sv) sv.classList.toggle("dirty", dirty);
    var m = popupBody.querySelector(".dur-msg");
    if (m && dirty && m.classList.contains("ok")) { m.textContent = ""; m.classList.remove("ok"); }
  }

  function durationNodes() {
    durSteppers = [];
    var nodes = [];
    // CHANGED (2026-11-05): intro text removed (Tom)

    // 1. Time windows — CHANGED: one set for 5-minute rounds and one for 3-minute rounds
    nodes.push(el("div", "set-head", "Time windows"));
    var pickRow = el("div", "dur-which-row");
    pickRow.appendChild(el("span", "dur-which-label", "Editing the windows for:"));
    var pick = el("div", "dur-round dur-which");
    [5, 3].forEach(function (m) {
      var b = el("button", "about-tab dur-which-btn" + (durRound === m ? " on" : ""), m + "-minute round");
      b.type = "button";
      b.setAttribute("aria-pressed", durRound === m ? "true" : "false");
      b.addEventListener("click", function () { if (durRound !== m) { durRound = m; redrawSettings(); } });
      pick.appendChild(b);
    });
    pickRow.appendChild(pick);
    nodes.push(pickRow);
    var LV = durRound === 3 ? "levels3" : "levels";
    var full = durRound === 3 ? 180 : CFG.roundLength.fullRoundSeconds;   // 3-minute times stop at 3:00
    // CHANGED (2026-11-05): blue limit line removed (Tom); the 3:00 / 5:00 limit still applies
    var timeHint = "Type a time like 1:30 (up to " + mmss(full) + ").";
    var grid = el("div", "dur-grid");
    ["", "Window starts", "Window ends"].forEach(function (h) { grid.appendChild(el("span", "dur-colhead", h)); });
    LEVEL_KEYS.forEach(function (k) {
      grid.appendChild(el("span", "dur-name", LEVEL_NAMES[k]));
      var L = durDraft[LV][k];
      var s1 = valueStepper(LEVEL_NAMES[k] + " window start (" + durRound + "-minute round)",
        function () { return L.startSec; }, function (v) { L.startSec = v; }, {
          text: mmss, read: readTime, hint: timeHint,
          fit: function (v) { return fitTime(v, 0, L.endSec - SEC_STEP); },
          next: function (v) { return v + SEC_STEP <= L.endSec - SEC_STEP ? v + SEC_STEP : null; },
          prev: function (v) { return v - SEC_STEP >= 0 ? v - SEC_STEP : null; } });
      s1._changed = function () { return L.startSec !== durOrig[LV][k].startSec; };
      var s2 = valueStepper(LEVEL_NAMES[k] + " window end (" + durRound + "-minute round)",
        function () { return L.endSec; }, function (v) { L.endSec = v; }, {
          text: mmss, read: readTime, hint: timeHint,
          fit: function (v) { return fitTime(v, L.startSec + SEC_STEP, full); },
          next: function (v) { return v + SEC_STEP <= full ? v + SEC_STEP : null; },
          prev: function (v) { return v - SEC_STEP >= L.startSec + SEC_STEP ? v - SEC_STEP : null; } });
      s2._changed = function () { return L.endSec !== durOrig[LV][k].endSec; };
      durSteppers.push(s1, s2);
      grid.appendChild(s1); grid.appendChild(s2);
    });
    nodes.push(grid);

    // 2. Where the needle is at the start and end of a window
    nodes.push(el("div", "set-head", "Main needle inside a window"));
    var g2 = el("div", "dur-grid dur-grid2");
    var dotHint = "Type a dot number from 1 to " + MAIN_STEPS + ".";
    var readDot = function (t) { var m = /\d+/.exec(t); return m ? Number(m[0]) : null; };
    g2.appendChild(el("span", "dur-name", "When a window starts"));
    var d1 = valueStepper("Main needle dot when a window starts",
      function () { return durDraft.startDot; }, function (v) { durDraft.startDot = v; }, {
        numeric: true, text: String, read: readDot, hint: dotHint, note: needleDotName,
        fit: function (v) { var e = prevLandable(durDraft.endDot, 1); return e === null ? null : fitDot(v, 1, e); },
        next: function (v) { var n = nextLandable(v, MAIN_STEPS); return n !== null && n < durDraft.endDot ? n : null; },
        prev: function (v) { return prevLandable(v, 1); } });
    d1._changed = function () { return durDraft.startDot !== durOrig.startDot; };
    g2.appendChild(d1);
    g2.appendChild(el("span", "dur-name", "When a window ends"));
    var d2 = valueStepper("Main needle dot when a window ends",
      function () { return durDraft.endDot; }, function (v) { durDraft.endDot = v; }, {
        numeric: true, text: String, read: readDot, hint: dotHint, note: needleDotName,
        fit: function (v) { var b = nextLandable(durDraft.startDot, MAIN_STEPS); return b === null ? null : fitDot(v, b, MAIN_STEPS); },
        next: function (v) { return nextLandable(v, MAIN_STEPS); },
        prev: function (v) { var n = prevLandable(v, 1); return n !== null && n > durDraft.startDot ? n : null; } });
    d2._changed = function () { return durDraft.endDot !== durOrig.endDot; };
    g2.appendChild(d2);
    durSteppers.push(d1, d2);
    nodes.push(g2);
    nodes.push(el("p", "about-hint", "The needle moves evenly from the start dot to the end dot while the window runs. Dots with a line are skipped."));

    // 3. After the window
    nodes.push(el("div", "set-head", "After the window ends"));
    var sel = el("select", "dur-select");
    sel.setAttribute("aria-label", "After the window ends");
    AFTER_CHOICES.forEach(function (c, i) {
      var o = el("option", null, c.label);
      o.value = String(i);
      if (Math.abs(c.v - durDraft.afterRate) < 1e-9) o.selected = true;
      sel.appendChild(o);
    });
    function markSel() { sel.classList.toggle("changed", Math.abs(durDraft.afterRate - durOrig.afterRate) > 1e-9); }
    sel.addEventListener("change", function () { durDraft.afterRate = AFTER_CHOICES[Number(sel.value)].v; markSel(); refreshDuration(); });
    markSel();
    nodes.push(sel);

    // CHANGED (2026-11-05): the "round length when the tool opens" control was removed —
    // it was easy to mix up with the 5-minute / 3-minute window switch. The tool opens on 5 min.

    // Bottom: note, Restore defaults, Save
    var foot = el("div", "set-foot");
    foot.appendChild(el("span", "set-note", "Yellow = not saved yet. Save sends these settings to GitHub for all your devices."));
    var btns = el("span", "set-footbtns");
    // CHANGED: "Restore defaults" removed (Tom, 2026-11-04)
    var save = el("button", "set-save dur-save" + (JSON.stringify(durDraft) !== JSON.stringify(durOrig) ? " dirty" : ""), "Save");
    save.type = "button";
    save.addEventListener("click", saveDuration);
    btns.appendChild(save);
    foot.appendChild(btns);
    nodes.push(foot);
    nodes.push(el("p", "set-msg set-footmsg dur-msg"));
    setTimeout(refreshDuration, 0);
    return nodes;
  }

  function saveDuration() {
    var msg = popupBody.querySelector(".dur-msg"), save = popupBody.querySelector(".dur-save");
    var clean = cleanDuration(durDraft);
    msg.classList.remove("ok");
    if (!clean) { msg.textContent = "Some numbers don't fit together. Check that every window ends after it starts."; return; }
    var data = { savedAt: new Date().toISOString(), duration: clean };
    save.disabled = true;
    msg.classList.add("busy");
    msg.textContent = "Saving to GitHub…";
    ghWriteRaw(SETTINGS_FILE, textToB64(JSON.stringify(data, null, 2) + "\n"), settingsSha, "Update Duration settings").then(function (j) {
      settingsSha = (j && j.content && j.content.sha) || settingsSha;
      applySettings(data);
      writeSettingsCache(data);
      update();   // the needle uses the new numbers right away
      durOrig = copyDuration(clean);
      durDraft = copyDuration(clean);
      redrawSettings();
      var done = popupBody.querySelector(".dur-msg");
      done.classList.add("ok");
      done.textContent = "Saved to GitHub. Your other devices use it the next time the tool is opened or reloaded (usually 1–2 minutes).";
    }).catch(function (err) {
      save.disabled = false;
      msg.classList.remove("busy");
      msg.textContent = ghMessage(err, "save") + " Nothing was saved yet — your changes are still here.";
    });
  }

  // The Technique Effectiveness window: first get the newest list from GitHub
  function openEditor() {
    openPopup("Technique Effectiveness", [el("p", "lock-intro", "Getting the newest list from GitHub…")], false, true);
    popupBox.classList.add("popup-settings");
    // CHANGED: read the techniques AND the Duration settings, newest from GitHub
    Promise.all([ghReadFile(sessionToken), ghReadFile(sessionToken, SETTINGS_FILE)]).then(function (res) {
      var file = res[0], sfile = res[1];
      if (file && applyShared(file.data)) writeCache(file.data);
      remoteSha = file ? file.sha : null;
      if (sfile && applySettings(sfile.data)) { writeSettingsCache(sfile.data); update(); }
      settingsSha = sfile ? sfile.sha : null;
      durOrig = currentDuration();
      durDraft = copyDuration(durOrig);
      gearTab = "tech";
      durRound = state.roundMin === 3 ? 3 : 5;   // NEW: Duration tab starts on the round now selected
      flashNames = null;
      makeDraft();
      redrawSettings();
    }).catch(function (err) {
      var form = el("div", "lock-form");
      form.appendChild(el("p", "set-msg", ghMessage(err, "get the list")));
      var row = el("div", "lock-row");
      var retry = lockButton("Try again", "lock-btn lock-main");
      retry.addEventListener("click", openEditor);
      row.appendChild(retry);
      if (err && (err.status === 401 || err.status === 403 || err.status === 404)) {
        var again = lockButton("Set up this device again");
        again.addEventListener("click", function () { sessionToken = null; showSetup(true); });
        row.appendChild(again);
      }
      form.appendChild(row);
      popupBody.innerHTML = "";
      popupBody.appendChild(form);
      popupBox.classList.remove("popup-settings");
      popupBox.classList.add("popup-lock");
    });
  }

  // Save: check the names, then write the list to GitHub (the window stays open)
  function saveDraft() {
    var msg = footMsg();
    msg.classList.remove("ok");   // problem messages are red, not green
    // A name typed in an "add" box but not added yet is added now
    var adds = popupBody.querySelectorAll(".set-add");
    for (var i = 0; i < adds.length; i++) {
      if (adds[i]._tryAdd && !adds[i]._tryAdd(true)) { msg.textContent = "Fix the new technique name above, then Save."; return; }
    }
    // Every name must have words and be different from the others in its list
    var problem = null;
    Object.keys(draft).forEach(function (key) {
      draft[key].forEach(function (t) {
        if (problem) return;
        if (!t.name.trim()) problem = "A technique name is empty. Type a name or delete it, then Save.";
        else if (nameTaken(key, t.name, t)) problem = "\"" + t.name.trim() + "\" is in the list twice. Change one, then Save.";
      });
    });
    if (problem) {
      msg.textContent = problem;
      if (!editMode) { editMode = true; redrawSettings(); footMsg().textContent = problem; }
      return;
    }
    // The list to send, sorted highest value first
    var data = { savedAt: new Date().toISOString(), techniques: {} };
    Object.keys(draft).forEach(function (key) {
      data.techniques[key] = draft[key]
        .map(function (t, i) { return { t: t, i: i }; })
        .sort(function (a, b) { return (b.t.dots - a.t.dots) || (a.i - b.i); })
        .map(function (x) { return { name: x.t.name.trim().slice(0, NAME_MAX), dots: x.t.dots }; });
    });
    // Which techniques were changed or added (they flash yellow after Save)
    var flashing = {};
    Object.keys(draft).forEach(function (key) {
      flashing[key] = {};
      draft[key].forEach(function (t) {
        if (!t.orig || t.dots !== t.orig.dots || t.name.trim() !== t.orig.name) flashing[key][t.name.trim()] = true;
      });
    });
    var save = popupBody.querySelector(".set-save");
    if (save) save.disabled = true;
    msg.textContent = "Saving to GitHub…";
    msg.classList.add("busy");
    ghWriteFile(sessionToken, data, remoteSha).then(function (newSha) {
      remoteSha = newSha || remoteSha;
      applyShared(data);
      writeCache(data);
      // The window stays open: start fresh from what was just saved (sorted)
      makeDraft();   // sorts, and sets editMode = false
      flashNames = flashing;
      redrawSettings();
      var done = footMsg();
      done.classList.add("ok");
      done.textContent = "Saved to GitHub. Your other devices get it the next time the tool is opened or reloaded (usually 1–2 minutes).";
    }).catch(function (err) {
      if (save) save.disabled = false;
      msg.classList.remove("busy");
      msg.textContent = ghMessage(err, "save") + " Nothing was saved yet — your changes are still here.";
    });
  }
  // Redraw the window in place (after Add / Delete / Edit).
  // focusKey = put the cursor back in that section's "new technique" box (after Add).
  // focusFirstName = put the cursor in the first name box (after Edit).
  function redrawSettings(focusKey, focusFirstName) {
    popupTitle.textContent = gearTab === "duration" ? "Duration Settings" : "Technique Effectiveness";   // NEW
    popupBox.classList.remove("popup-lock");
    popupBox.classList.add("popup-settings");
    var scroll = popupBox.scrollTop;
    popupBody.innerHTML = "";
    settingsNodes().forEach(function (n) { popupBody.appendChild(n); });
    var boxes = popupBody.querySelectorAll(".set-rename");   // size the name boxes now that they are on screen
    for (var i = 0; i < boxes.length; i++) fitHeight(boxes[i]);
    popupBox.scrollTop = scroll;
    var target = null;
    if (focusKey) target = popupBody.querySelector('.set-add[data-key="' + focusKey + '"] .set-input');
    else if (focusFirstName) target = popupBody.querySelector(".set-rename");
    (target || popupClose).focus({ preventScroll: true });
    // After Add, keep the new technique (bottom of the list) in view
    if (focusKey) {
      var addRow = popupBody.querySelector('.set-add[data-key="' + focusKey + '"]');
      if (addRow && addRow.scrollIntoView) addRow.scrollIntoView({ block: "nearest" });
    }
    flashNames = null;
  }
  document.getElementById("settings").addEventListener("click", openSettings);

  // ==================================================================
  // NEW: ABOUT WINDOW (button next to the gear)
  // - Everyone can read it.
  // - Tom edits it (password): type or paste text — headings, bold, italic,
  //   lists, centered lines and links are kept.
  // - Save sends it to GitHub (about.json), so every device shows the same page.
  //   (CHANGED: the PDF option was removed — text only.)
  // ==================================================================
  var ABOUT_FILE = SYNC.aboutFile || "about.json";
  var ABOUT_CACHE = "ijt-about-cache-v1";

  // ---------- cleaning text (only simple, safe formatting is kept) ----------
  // Keeps: headings, paragraphs, bold, italic, underline, bullet / numbered lists,
  // centered lines, links. Everything else (Word's hidden extras, colors, fonts,
  // pictures, scripts) is removed.
  function cleanHtml(html) {
    var doc = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
    var out = document.createElement("div");
    function isCentered(n) {
      var st = (n.getAttribute("style") || "").toLowerCase().replace(/\s/g, "");
      return /text-align:center/.test(st) || (n.getAttribute("align") || "").toLowerCase() === "center" ||
        /(^|\s)center(\s|$)/.test(n.getAttribute("class") || "");
    }
    function walk(src, dst) {
      for (var i = 0; i < src.childNodes.length; i++) {
        var n = src.childNodes[i];
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;   // comments etc.
        var tag = n.nodeName.toUpperCase().replace(/^.*:/, "");   // Word's o:p, w:... become p, ...
        if (/^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|XML|IFRAME|OBJECT|EMBED|SVG|IMG|VIDEO|AUDIO|CANVAS|FORM|INPUT|BUTTON|TEXTAREA|SELECT)$/.test(tag)) continue;
        var map = { H1: "h2", H2: "h2", H3: "h3", H4: "h3", H5: "h3", H6: "h3", P: "p", DIV: "p", CENTER: "p",
          B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u", UL: "ul", OL: "ol", LI: "li", BR: "br", A: "a" };
        var t = map[tag];
        if (!t && tag === "SPAN") {   // Word marks bold / italic with styles on <span>
          var st = (n.getAttribute("style") || "").toLowerCase().replace(/\s/g, "");
          if (/mso-list:ignore/.test(st)) continue;   // Word's typed bullet "·" / "1." — a real list is made below
          if (/font-weight:(bold|[6-9]00)/.test(st)) t = "strong";
          else if (/font-style:italic/.test(st)) t = "em";
        }
        if (!t) { walk(n, dst); continue; }   // unknown: keep the words, drop the tag
        // A <div> that only wraps other blocks (or a block inside a paragraph) adds nothing: keep its insides
        if (t === "p" && (dst.nodeName === "P" || dst.nodeName === "H2" || dst.nodeName === "H3" || dst.nodeName === "LI" ||
            (tag === "DIV" && n.querySelector("p, div, h1, h2, h3, h4, h5, h6, ul, ol")))) {
          if (tag === "DIV" && isCentered(n) && dst === out) {   // a centered wrapper: center what is inside
            var holder = document.createElement("div");
            walk(n, holder);
            Array.prototype.slice.call(holder.childNodes).forEach(function (c) {
              if (c.nodeType === 1 && /^(P|H2|H3)$/.test(c.nodeName)) c.className = "center";
              dst.appendChild(c);
            });
          } else {
            walk(n, dst);
          }
          continue;
        }
        var e = document.createElement(t);
        if ((t === "p" || t === "h2" || t === "h3") && (tag === "CENTER" || isCentered(n))) e.className = "center";
        // Word list lines arrive as paragraphs marked "MsoListParagraph…": remember them
        if (t === "p" && /^MsoListParagraph/i.test(n.getAttribute("class") || "")) e.setAttribute("data-li", "1");
        if (t === "a") {
          var href = n.getAttribute("href") || "";
          if (!/^(https?:|mailto:)/i.test(href)) { walk(n, dst); continue; }
          e.setAttribute("href", href);
          e.setAttribute("target", "_blank");
          e.setAttribute("rel", "noopener");
        }
        if (t !== "br") walk(n, e);
        dst.appendChild(e);
      }
    }
    walk(doc.body.firstChild || doc.body, out);
    // Word list lines next to each other → one bullet list
    var kids = Array.prototype.slice.call(out.childNodes), list = null;
    kids.forEach(function (k) {
      if (k.nodeType === 1 && k.getAttribute && k.getAttribute("data-li")) {
        if (!list) { list = document.createElement("ul"); out.insertBefore(list, k); }
        var li = document.createElement("li");
        while (k.firstChild) li.appendChild(k.firstChild);
        list.appendChild(li);
        out.removeChild(k);
      } else if (!(k.nodeType === 3 && !k.nodeValue.trim())) {
        list = null;
      }
    });
    // Loose words directly in the page → wrap them in a paragraph
    Array.prototype.slice.call(out.childNodes).forEach(function (k) {
      if ((k.nodeType === 3 && k.nodeValue.trim()) || (k.nodeType === 1 && /^(STRONG|EM|U|A|BR)$/.test(k.nodeName))) {
        var prev = k.previousSibling;
        if (prev && prev.nodeType === 1 && prev.nodeName === "P" && prev.getAttribute("data-loose")) { prev.appendChild(k); return; }
        var p = document.createElement("p");
        p.setAttribute("data-loose", "1");
        out.insertBefore(p, k);
        p.appendChild(k);
      } else if (k.nodeType === 3) {
        out.removeChild(k);   // spaces / line breaks between blocks
      }
    });
    var marked = out.querySelectorAll("[data-li], [data-loose]");
    for (var q = 0; q < marked.length; q++) { marked[q].removeAttribute("data-li"); marked[q].removeAttribute("data-loose"); }
    // remove empty bold / italic, and trailing empty paragraphs (empty lines in the middle are kept as spacing)
    var empties = out.querySelectorAll("strong, em, u");
    for (var k = empties.length - 1; k >= 0; k--) {
      if (!empties[k].textContent.trim() && !empties[k].querySelector("br")) empties[k].parentNode.removeChild(empties[k]);
    }
    while (out.lastChild && out.lastChild.nodeType === 1 && /^(P|H2|H3)$/.test(out.lastChild.nodeName) &&
           !out.lastChild.textContent.replace(/ /g, " ").trim()) out.removeChild(out.lastChild);
    while (out.firstChild && out.firstChild.nodeType === 1 && /^(P|H2|H3)$/.test(out.firstChild.nodeName) &&
           !out.firstChild.textContent.replace(/ /g, " ").trim()) out.removeChild(out.firstChild);
    // an empty line in the middle keeps its space (an empty paragraph would shrink to nothing)
    var blanks = out.querySelectorAll("p, h2, h3, li");
    for (var z = 0; z < blanks.length; z++) {
      if (!blanks[z].textContent.replace(/ /g, " ").trim() && !blanks[z].querySelector("br")) {
        blanks[z].innerHTML = "";
        blanks[z].appendChild(document.createElement("br"));
      }
    }
    return out.innerHTML.trim();
  }
  function textToHtml(text) {   // plain text → paragraphs
    return String(text || "").split(/\n{2,}/).map(function (p) {
      var d = document.createElement("p");
      d.textContent = p.trim();
      return d.outerHTML.replace(/\n/g, "<br>");
    }).join("");
  }

  // ---------- reading the About page ----------
  function readAboutCache() { try { return JSON.parse(localStorage.getItem(ABOUT_CACHE) || "null"); } catch (err) { return null; } }
  function writeAboutCache(d) { try { localStorage.setItem(ABOUT_CACHE, JSON.stringify(d)); } catch (err) { /* private mode */ } }
  // Newest About text: website copy, unless this device saved something newer
  function loadAbout() {
    var cache = readAboutCache();
    return fetch(ABOUT_FILE + "?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (site) {
        if (cache && (!site || (cache.savedAt || "") > (site.savedAt || ""))) return cache;
        if (site) writeAboutCache(site);
        return site;
      });
  }

  // ---------- the About window (everyone) ----------
  function openAbout(note) {
    openPopup("About", [el("p", "lock-intro", "Loading…")], false, true);
    popupBox.classList.add("popup-about");
    loadAbout().then(function (about) {
      if (popupTitle.textContent !== "About") return;   // window was closed / changed meanwhile
      popupBody.innerHTML = "";
      var content = el("div", "about-content");
      popupBody.appendChild(content);
      var html = about && about.html ? cleanHtml(about.html) : "";   // cleaned again before showing, to be safe
      if (html) {
        var txt = el("div", "about-text");
        txt.innerHTML = html;
        content.appendChild(txt);
      } else {
        content.appendChild(el("p", "tech-empty", "Nothing here yet."));
      }
      // Edit (password) at the bottom
      var foot = el("div", "about-foot");
      if (note) foot.appendChild(el("p", "set-msg ok", note));
      var edit = el("button", "about-editbtn", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () {
        withUnlock("About", "edit the About page", openAboutEditor);
      });
      foot.appendChild(edit);
      popupBody.appendChild(foot);
    });
  }

  // ---------- the About editor (password) ----------
  function openAboutEditor() {
    openPopup("About", [el("p", "lock-intro", "Getting the newest About page from GitHub…")], false, true);
    popupBox.classList.add("popup-about");
    ghReadFile(sessionToken, ABOUT_FILE).then(function (file) {
      showAboutEditor(file ? file.data : null);
    }).catch(function (err) {
      popupBody.innerHTML = "";
      var form = el("div", "lock-form");
      form.appendChild(el("p", "set-msg", ghMessage(err, "get the About page")));
      var retry = lockButton("Try again", "lock-btn lock-main");
      retry.addEventListener("click", openAboutEditor);
      form.appendChild(retry);
      popupBody.appendChild(form);
    });
  }

  function showAboutEditor(current) {
    popupBody.innerHTML = "";
    var bar = el("div", "about-toolbar");
    var area = el("div", "about-editor about-text");
    area.contentEditable = "true";
    area.setAttribute("role", "textbox");
    area.setAttribute("aria-multiline", "true");
    area.setAttribute("aria-label", "About text");
    area.innerHTML = (current && current.html ? cleanHtml(current.html) : "") || "<p><br></p>";
    function tool(label, title, fn) {
      var b = el("button", "about-tool", label);
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep the text selected
      b.addEventListener("click", function () { area.focus(); fn(); });
      bar.appendChild(b);
    }
    function block(tag) {
      var now = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
      document.execCommand("formatBlock", false, now === tag ? "<p>" : "<" + tag + ">");
    }
    tool("Heading", "Heading", function () { block("h2"); });
    tool("Subheading", "Subheading", function () { block("h3"); });
    tool("B", "Bold", function () { document.execCommand("bold"); });
    tool("I", "Italic", function () { document.execCommand("italic"); });
    tool("• List", "Bullet list", function () { document.execCommand("insertUnorderedList"); });
    tool("1. List", "Numbered list", function () { document.execCommand("insertOrderedList"); });
    tool("Center", "Center the line (click again for left)", function () {
      document.execCommand(document.queryCommandState("justifyCenter") ? "justifyLeft" : "justifyCenter");
    });
    tool("Plain", "Remove formatting from the selected text", function () {
      document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "<p>");
    });
    // Pasting from Word / Pages / a web page keeps only the simple formatting
    area.addEventListener("paste", function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      e.preventDefault();
      var html = cd.getData("text/html");
      var clean = html ? cleanHtml(html) : textToHtml(cd.getData("text/plain"));
      pasteBlocks(area, clean);
    });
    popupBody.appendChild(bar);
    popupBody.appendChild(area);
    popupBody.appendChild(el("p", "about-hint",
      "Tip: you can copy text from Word or Pages and paste it here — headings, bold, lists and centered lines are kept."));

    // --- Bottom: Cancel / Save ---
    var foot = el("div", "about-foot");
    var msg = el("p", "set-msg");
    var cancel = el("button", "set-edit", "Cancel");
    var save = el("button", "set-save", "Save");
    cancel.type = save.type = "button";
    cancel.addEventListener("click", function () { openAbout(); });
    save.addEventListener("click", function () {
      msg.classList.remove("ok");
      var data = { savedAt: new Date().toISOString(), html: cleanHtml(area.innerHTML) };
      save.disabled = cancel.disabled = true;
      msg.classList.add("busy");
      msg.textContent = "Saving to GitHub…";
      ghShaOf(ABOUT_FILE).then(function (sha) {
        return ghWriteRaw(ABOUT_FILE, textToB64(JSON.stringify(data, null, 2) + "\n"), sha, "Update About page");
      }).then(function () {
        writeAboutCache(data);
        openAbout("Saved. Your other devices show it the next time the tool is opened or reloaded (usually 1–2 minutes).");
      }).catch(function (err) {
        save.disabled = cancel.disabled = false;
        msg.classList.remove("busy");
        msg.textContent = ghMessage(err, "save") + " Nothing was lost — your text is still here.";
      });
    });
    foot.appendChild(msg);
    foot.appendChild(cancel);
    foot.appendChild(save);
    popupBody.appendChild(foot);
    area.focus();
  }

  // Put pasted paragraphs / headings / lists where the cursor is, as separate lines.
  // (The browser's own paste would squeeze them all into the line the cursor is in,
  // e.g. turn every pasted paragraph into one big heading.)
  function pasteBlocks(area, clean) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) { area.insertAdjacentHTML("beforeend", clean); return; }
    var range = sel.getRangeAt(0);
    if (!area.contains(range.commonAncestorContainer)) { area.insertAdjacentHTML("beforeend", clean); return; }
    range.deleteContents();
    var holder = document.createElement("div");
    holder.innerHTML = clean;
    var nodes = Array.prototype.slice.call(holder.childNodes);
    if (!nodes.length) return;
    var blockTags = /^(P|H2|H3|UL|OL)$/;
    // Only one plain paragraph: put its words right at the cursor
    if (nodes.length === 1 && nodes[0].nodeName === "P" && !nodes[0].className) {
      var frag = document.createDocumentFragment(), lastIn = null;
      while (nodes[0].firstChild) { lastIn = nodes[0].firstChild; frag.appendChild(lastIn); }
      range.insertNode(frag);
      if (lastIn) { range.setStartAfter(lastIn); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
      return;
    }
    // Find the line (block) the cursor is in
    var b = range.startContainer;
    while (b && b !== area && !(b.nodeType === 1 && /^(P|H2|H3|LI|DIV)$/.test(b.nodeName))) b = b.parentNode;
    if (!b || b === area) {   // cursor is directly in the box: just insert
      var f2 = document.createDocumentFragment();
      nodes.forEach(function (n) { f2.appendChild(n); });
      range.insertNode(f2);
    } else {
      if (b.nodeName === "LI") b = b.parentNode;   // inside a list: put the paste after the whole list
      // Split the line at the cursor: the part after the cursor moves below the pasted lines
      var tailRange = document.createRange();
      tailRange.setStart(range.startContainer, range.startOffset);
      tailRange.setEnd(b, b.childNodes.length);
      var tail = b.nodeName === "UL" || b.nodeName === "OL" ? null : b.cloneNode(false);
      if (tail) tail.appendChild(tailRange.extractContents());
      var after = b;
      nodes.forEach(function (n) {
        if (!(n.nodeType === 1 && blockTags.test(n.nodeName))) { var p = document.createElement("p"); p.appendChild(n); n = p; }
        after.parentNode.insertBefore(n, after.nextSibling);
        after = n;
      });
      if (tail && tail.textContent.trim()) after.parentNode.insertBefore(tail, after.nextSibling);
      if (!b.textContent.replace(/ /g, " ").trim() && b.nodeName !== "UL" && b.nodeName !== "OL") b.parentNode.removeChild(b);
    }
    // Cursor at the end of the pasted text
    var last = nodes[nodes.length - 1];
    var end = document.createRange();
    end.selectNodeContents(last.parentNode ? last : area);
    end.collapse(false);
    sel.removeAllRanges();
    sel.addRange(end);
  }

  // Current version id of a file on GitHub (null if it isn't there yet)
  function ghShaOf(path) {
    return gh(sessionToken, "GET", "/contents/" + path + "?ref=" + encodeURIComponent(SYNC.branch)).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw ghError(r.status);
      return r.json().then(function (j) { return j.sha || null; });
    });
  }
  function ghWriteRaw(path, b64, sha, message) {
    var body = { message: message, content: b64, branch: SYNC.branch };
    if (sha) body.sha = sha;
    return gh(sessionToken, "PUT", "/contents/" + path, body).then(function (r) {
      if (!r.ok) throw ghError(r.status);
      return r.json();
    });
  }
  document.getElementById("about").addEventListener("click", function () { openAbout(); });


  // CHANGED: a technique first TAKES dots away from the OTHER corner's slider.
  // Only the dots left over are added to the chosen corner's slider.
  // Example: Red Impact / Damage at 8, Blue technique worth 8 → Red back to 0, Blue stays 0.
  //          Red at 3, Blue technique worth 5 → Red to 0, Blue to 2.
  // Moves one usable dot at a time, skipping line dots (same as the arrow keys).
  // Stops at the last usable dot. Only this slider changes (Dominance / Duration are not touched).
  function addToSlider(id, side, dots) {
    var s = CFG.sliders.filter(function (x) { return x.id === id; })[0];
    if (!s || !dots) return;
    var other = side === "red" ? "blue" : "red";
    var k = state.values[id][side];
    var ko = state.values[id][other];
    var max = sliderMax(s);
    for (var i = 0; i < dots; i++) {
      if (ko > 0) {
        // Step the other corner one usable dot back toward zero
        var m = ko - 1;
        while (m > 0 && !sliderLandable(s, m)) m--;
        ko = m;
        continue;
      }
      // Other corner is at zero: step the chosen corner one usable dot outward
      var n = k + 1;
      while (n <= max && !sliderLandable(s, n)) n++;
      if (n > max) break;
      k = n;
    }
    state.values[id][side] = k;
    state.values[id][other] = ko;
    update();
  }

  function openChart(levelName) {
    var d = DEFS.chart;
    // CHANGED: no "You selected" banner; the bright yellow box shows the choice
    var nodes = [];

    // CHANGED: the chart sits in a frame so a yellow box can be drawn
    // over the group that was clicked (positions are in definitions.js).
    var frame = el("div", "chart-frame");
    var img = el("img");
    img.alt = "Duration vs. Dominance chart";
    img.onerror = function () {
      var note = el("div", "missing-image",
        "Chart picture not found. Save it as \"" + d.image + "\" inside the tool's folder.");
      if (frame.parentNode) frame.parentNode.replaceChild(note, frame);
    };
    // "?v=..." makes the browser load the newest picture instead of an old saved copy
    // Once loaded, use the picture's real shape so it fills the screen exactly
    img.addEventListener("load", function () {
      if (img.naturalWidth && img.naturalHeight) {
        popupBox.style.setProperty("--chart-ratio", img.naturalWidth / img.naturalHeight);
      }
    });
    img.src = d.image + "?v=" + Date.now();
    frame.appendChild(img);

    var g = d.groups && d.groups[levelName];
    if (g) {
      var box = el("div", "chart-highlight");
      box.setAttribute("aria-label", "Selected: " + levelName + " Dominance");
      box.style.left = g.left + "%";
      box.style.top = g.top + "%";
      box.style.width = g.width + "%";
      box.style.height = g.height + "%";
      frame.appendChild(box);
      // Scroll the yellow box into view once the picture has loaded
      img.addEventListener("load", function () {
        if (box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
      });
    }
    nodes.push(frame);
    d.body.forEach(function (t) { nodes.push(el("p", null, t)); });
    openPopup(d.title, nodes, true);
  }

  // ------------------------------------------------------------------
  // One page: shrink or grow the chart to fit the screen.
  // Uses the screen size WITHOUT pinch-zoom (clientWidth/clientHeight),
  // so zooming in on an iPad does not resize or shift the chart.
  // ------------------------------------------------------------------
  var page = document.getElementById("page");
  var viewport = document.getElementById("viewport");

  function fitToScreen() {
    var margin = 12;
    var availW = document.documentElement.clientWidth - margin * 2;
    var availH = document.documentElement.clientHeight - margin * 2;
    var pageH = page.offsetHeight;
    var scale = Math.min(availW / PAGE_WIDTH, availH / pageH);
    page.style.transform = "scale(" + scale + ")";
    viewport.style.width = (PAGE_WIDTH * scale) + "px";
    viewport.style.height = (pageH * scale) + "px";
  }
  window.addEventListener("resize", fitToScreen);
  window.addEventListener("orientationchange", fitToScreen);

  // ------------------------------------------------------------------
  // Reset + start
  // ------------------------------------------------------------------
  document.getElementById("reset").addEventListener("click", function () {
    CFG.sliders.forEach(function (s) { state.values[s.id] = { red: 0, blue: 0 }; });
    update();
  });

  // CHANGED: 5 min / 3 min choice. Choosing the OTHER length clears Duration
  // (so no old value sits past the new end) and hides the Duration dots past 3:00.
  function applyRoundLength() {
    Object.keys(ui.halves).forEach(function (key) {
      var h = ui.halves[key];
      if (h.s.valueFormat !== "time") return;
      var max = sliderMax(h.s);
      var nodes = h.track.querySelectorAll("[data-step]");
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle("beyond", Number(nodes[i].dataset.step) > max);
      }
    });
    var btns = document.querySelectorAll("#roundlen .rl-btn");
    for (var j = 0; j < btns.length; j++) {
      var on = Number(btns[j].getAttribute("data-min")) === state.roundMin;
      btns[j].classList.toggle("on", on);
      btns[j].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  var roundBtns = document.querySelectorAll("#roundlen .rl-btn");
  for (var rb = 0; rb < roundBtns.length; rb++) {
    roundBtns[rb].addEventListener("click", function () {
      var m = Number(this.getAttribute("data-min"));
      if (m === state.roundMin) return;
      roundTouched = true;   // NEW: the saved round length no longer changes it
      state.roundMin = m;
      CFG.sliders.forEach(function (s) {
        if (s.valueFormat === "time") state.values[s.id] = { red: 0, blue: 0 };
      });
      applyRoundLength();
      update();
    });
  }

  loadTechniqueValues();   // config.js backup list (and any old device-only list)
  // CHANGED: the last shared list this device saw (opens instantly, works offline) ...
  var cachedShared = readCache();
  if (cachedShared) applyShared(cachedShared);
  // NEW: the last Duration settings this device saw, and the round length to open with
  var cachedSettings = readSettingsCache();
  if (cachedSettings) applySettings(cachedSettings);
  state.roundMin = CFG.roundLength.defaultMinutes;
  buildMain();
  buildGuidelineText();
  buildSliders();
  applyRoundLength();
  update();
  fitToScreen();
  // Fonts can load a moment later and change the page height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitToScreen);
  // CHANGED: ... then get the newest shared list (techniques.json) from the website
  fetchSharedFromSite();
  fetchSettingsFromSite();   // NEW: newest Duration settings
})();
