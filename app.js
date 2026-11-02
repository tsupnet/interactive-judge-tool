/* =====================================================================
   INTERACTIVE JUDGE TOOL — HOW IT WORKS (app.js)
   - Builds every slider from config.js (dot counts, labels, ratios)
   - Dragging + snapping to every dot (mouse, finger, or arrow keys)
   - Moves the main needle using the ratios in config.js
   - Locks Effective Aggressiveness / Cage Control per the 2019 criteria
   - Shows "Consider 10-8" / "Always Score 10-8" for each corner
   - Opens the popups for hyperlinked words
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
  var state = { manual: 0, needle: 0, values: {} };
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
  function addDot(track, cell, cells, kind, tick) {
    // kind is one or more words, e.g. "small red" → classes dot-small dot-red
    var dot = el("div", "dot " + kind.split(" ").map(function (w) { return "dot-" + w; }).join(" "));
    dot.style.left = cellLeft(cell, cells);
    track.appendChild(dot);
    if (tick) {
      var t = el("div", "tick tick-" + tick);
      t.style.left = cellLeft(cell, cells);
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
    cap.appendChild(term("strikes", "Effective Strikes", "strong"));
    cap.appendChild(txt(" and "));
    cap.appendChild(term("grappling", "Effective Grappling", "strong"));
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
      if (k === 0) { addDot(track, c, cells, "big " + side, "zone"); continue; }
      var d = dots[k - 1];
      addDot(track, c, cells, (d.segEnd ? "big " : "small ") + side, d.segEnd ? "zone" : null);
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
  function sliderLandable(s, k) {
    if (k === 0 || !CFG.skipLineDots) return true;
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
    // 1. Effective Strikes / Grappling = the judge's needle + Impact, Dominance, Duration
    var strikingGrappling = state.manual + contribution("tenEight");

    // 2. Effective Aggressiveness only counts when Strikes / Grappling are even
    var aggrOpen = roundEven(strikingGrappling) === 0;
    if (!aggrOpen) resetGroup("aggressiveness");

    // 3. Cage Control only counts when Strikes / Grappling AND Aggressiveness are even
    var cageOpen = aggrOpen && groupEven("aggressiveness");
    if (!cageOpen) resetGroup("cage");

    // CHANGED: a slider with "requires" (config.js) is locked for a corner
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

  function openPopup(title, nodes, chartMode) {
    lastFocus = document.activeElement;
    // CHANGED: chart mode = no title, chart fills the screen
    popupBox.classList.toggle("popup-chart", !!chartMode);
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

  buildMain();
  buildGuidelineText();
  buildSliders();
  update();
  fitToScreen();
  // Fonts can load a moment later and change the page height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitToScreen);
})();
