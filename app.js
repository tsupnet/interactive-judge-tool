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
     chosen fighter's Damage / Impact slider
   - CHANGED: gear button beside "3 min" opens Technique Effectiveness, where
     techniques can be added, deleted, renamed (Edit) and re-valued, then
     kept with Save (saved in this browser only)
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
    if (s.landableDots) return d.seg.label;   // CHANGED: Dominance reads "Low Impact" etc.
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
    var L = levelName && R.levels[levelName];
    if (!L) return 0;
    var scale = state.roundMin * 60 / CFG.roundLength.fullRoundSeconds;   // 3-minute round = 0.6
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
  // CHANGED: Technique Effectiveness window (gear beside "3 min") — change values,
  // ADD, DELETE and EDIT (rename) techniques, then click Save.
  // The lists in config.js are used until something is saved. Saved changes
  // stay in this browser on this device only (another computer or iPad keeps its own).
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

  // Highest value allowed = number of usable dots on the slider the technique moves (27 on Damage / Impact)
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
  function markDirty() {
    draftDirty = true;
    var m = popupBody.querySelector(".set-footmsg.ok");   // a new change hides "Saved."
    if (m) { m.textContent = ""; m.classList.remove("ok"); }
    var save = popupBody.querySelector(".set-save");
    if (save) save.classList.add("dirty");
  }

  function settingsNodes() {
    // Effective Strikes and Effective Grappling side by side (one column each)
    var cols = el("div", "set-cols");
    var nodes = [cols];
    Object.keys(CFG.techniques || {}).forEach(function (key) {
      var T = CFG.techniques[key];
      var list = draft[key];
      var max = techniqueMax(T);
      var col = el("div", "set-col");
      cols.appendChild(col);
      col.appendChild(el("div", "set-head", T.title));
      if (!list.length) col.appendChild(el("p", "tech-empty", "No techniques yet."));

      list.forEach(function (t) {
        var row = el("div", "set-row");

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
          markDirty();
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
        draft[key].push({ name: nm, dots: newDots, orig: null });
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
      "Value = dots added to Damage / Impact. Yellow = not saved yet. Saved on this device only."));
    var btns = el("span", "set-footbtns");
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

  // Save: check the names, keep the changes on this device (the window stays open)
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
    Object.keys(draft).forEach(function (key) {
      CFG.techniques[key].list = draft[key].map(function (t) {
        return { name: t.name.trim().slice(0, NAME_MAX), dots: t.dots };
      });
    });
    saveTechniqueValues();
    // CHANGED: the window stays open after Save. Start fresh from what was just
    // saved (yellow marks clear, Save turns white, editing turns off) and show "Saved."
    makeDraft();   // also sets editMode = false
    redrawSettings();
    var done = footMsg();
    done.classList.add("ok");
    done.textContent = "Saved.";
  }

  function openSettings() {
    makeDraft();
    openPopup("Technique Effectiveness", settingsNodes(), false, true);   // title is blue (styles.css)
    popupBox.classList.add("popup-settings");   // wider, two columns
  }
  // Redraw the window in place (after Add / Delete / Edit).
  // focusKey = put the cursor back in that section's "new technique" box (after Add).
  // focusFirstName = put the cursor in the first name box (after Edit).
  function redrawSettings(focusKey, focusFirstName) {
    var scroll = popupBox.scrollTop;
    popupBody.innerHTML = "";
    settingsNodes().forEach(function (n) { popupBody.appendChild(n); });
    var boxes = popupBody.querySelectorAll(".set-rename");   // size the name boxes now that they are on screen
    for (var i = 0; i < boxes.length; i++) fitHeight(boxes[i]);
    popupBox.scrollTop = scroll;
    var target = null;
    if (focusKey) target = popupBody.querySelector('.set-add[data-key="' + focusKey + '"] .set-input');
    else if (focusFirstName) target = popupBody.querySelector(".set-rename");
    (target || popupClose).focus();
  }
  document.getElementById("settings").addEventListener("click", openSettings);

  // CHANGED: a technique first TAKES dots away from the OTHER corner's slider.
  // Only the dots left over are added to the chosen corner's slider.
  // Example: Red Damage / Impact at 8, Blue technique worth 8 → Red back to 0, Blue stays 0.
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
      state.roundMin = m;
      CFG.sliders.forEach(function (s) {
        if (s.valueFormat === "time") state.values[s.id] = { red: 0, blue: 0 };
      });
      applyRoundLength();
      update();
    });
  }

  loadTechniqueValues();   // CHANGED: apply values saved in Settings
  buildMain();
  buildGuidelineText();
  buildSliders();
  applyRoundLength();
  update();
  fitToScreen();
  // Fonts can load a moment later and change the page height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitToScreen);
})();
