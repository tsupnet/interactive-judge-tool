/* =====================================================================
   INTERACTIVE JUDGE TOOL — SETTINGS (config.js)
   This is the file you will edit most.

   DOT COUNTS (taken from Judging_Tool_Interactive.pdf)
   - Every section on the chart has 9 small dots + 1 big dot at its
     outer end = 10 snap points per section.
   - "dots" below = how many snap points a section has.

   HOW THE NEEDLE MOVES
   - "ratio" = how many dots the MAIN NEEDLE moves for each dot a
     slider moves. Example: ratio 1 → each slider dot moves the needle
     1 dot. ratio 0.5 → every 2 slider dots move the needle 1 dot.
   - Red sliders push the needle LEFT (toward Red).
     Blue sliders push the needle RIGHT (toward Blue).
   - ALL RATIOS ARE 0 FOR NOW. The sliders move, but they will not
     move the needle until you put in your numbers.

   CAPTIONS
   - Captions may use <u>underline</u>, <i>italic</i>, <b>bold</b>
     and <br> (new line), so they look like the chart.
   ===================================================================== */

window.FSL_CONFIG = {

  /* ---------------- SKIP LINE DOTS -------------------------------------
     true = every arrow jumps over dots that have a vertical line on them
     (main needle: dots 2, 8, 10, 12, 18, 20, 30 on each side;
      side sliders: the big dots at the end of each section).
     The center dot is never skipped.                                   */
  skipLineDots: true,

  /* ---------------- ROUND LENGTH (CHANGED) ------------------------------
     The "5 min / 3 min" choice next to Reset. defaultMinutes = which one
     is selected when the page opens. In 3-minute mode the Duration slider
     only goes to 3:00 and every time window below is scaled by 3 / 5.   */
  roundLength: {
    defaultMinutes: 5,
    fullRoundSeconds: 300      // the times in durationRules below are for a 5-minute round
  },

  /* ---------------- ONE CORNER AT A TIME (CHANGED) ----------------------
     Nothing is grayed out. If you click or drag ANY slider listed here
     for one corner (above zero), ALL the listed sliders of the other
     corner snap back to zero, and the slider you used becomes active.
     Remove "aggressiveness" and "cage" from the list if you do not want
     this on those two sliders.                                         */
  cornerLock: ["impact", "dominance", "duration", "aggressiveness", "cage"],

  /* ---------------- TECHNIQUES POPUPS (NEW) -----------------------------
     Clicking the red "Effective Strikes" or "Effective Grappling" words
     opens a list of techniques. CHANGED: the user picks a technique
     first, then Red or Blue. Clicking the color ADDS the technique's
     dots to that fighter's slider and closes the popup
     (slider: "impact" = Damage / Impact). Line dots are skipped, the
     same way the arrow keys skip them.
     CHANGED: a technique first takes dots away from the OTHER corner's
     slider; only the dots left over are added to the chosen corner.
     (Red at 8 + Blue technique worth 8 = both at 0, needle at Draw.)
     dots = the number used. Tom's chart gives two numbers per technique;
     the LOWER number is used (the higher one is in the note).
     Only the names are shown in the popup — never the dots.
     To add a technique: copy one line, change the name and dots.
     CHANGED: these lists are the DEFAULTS. Techniques can also be added,
     deleted and re-valued with the gear (Settings) next to "3 min"; those
     changes are saved on that device only. "Restore defaults" in Settings
     goes back to the lists below.                                    */
  techniques: {
    strikes: {
      title: "Effective Strikes",
      slider: "impact",
      list: [
        // CHANGED: highest value at the top. The popup shows them in this order.
        { name: "Effective knockdown, fighter is hurt and covers up",                dots: 8 },  // 8 or 9
        { name: "Flash knockdown, fighter gets back up immediately",                 dots: 6 },  // 6 or 7
        { name: "Effective liver kick, fighter struggles to continue",               dots: 5 },  // 5 or 6
        { name: "Head strike buckles opponent’s knees",                              dots: 5 },  // 5 or 6
        { name: "Effective elbow, strike to the head",                               dots: 4 },  // 4 or 5
        { name: "Hard knee to the body, fighter struggles",                          dots: 4 },  // 4 or 5
        { name: "Head strike knocks opponent’s head back and fighter moves backwards", dots: 3 },  // 3 or 4
        { name: "Solid head strike",                                                 dots: 2 },  // 2 or 3
        { name: "Light head strike",                                                 dots: 1 }   // 1 or 2
      ]
    },
    grappling: {
      title: "Effective Grappling",
      slider: "impact",
      list: []   // empty until Tom picks the grappling techniques
    }
  },

  /* ---------------- DURATION RULES (CHANGED) ----------------------------
     The Dominance level of a corner (Low / Med / High) picks a time
     window. Times are seconds in a 5-minute round.
       - Before the window starts: the needle stays at Draw (CHANGED).
       - Inside the window: the needle starts at startDot (dot 1 = 10-9
         Close) where the window starts, and moves evenly to endDot
         (dot 11 = 10-8 Close) where the window ends.
       - After the window ends: the needle keeps moving, at afterRate of
         the speed it had inside the window (1/3 = one third as fast).
     Rounding and skipping of line dots is done the same way as for the
     other sliders. Change any number here to tune the behavior.          */
  durationRules: {
    startDot: 1,
    endDot: 11,
    afterRate: 1 / 3,
    levels: {
      High: { startSec: 0,   endSec: 90  },    // High Dominance: least time needed
      Med:  { startSec: 90,  endSec: 210 },
      Low:  { startSec: 210, endSec: 300 }     // Low Dominance: most time needed
    }
  },

  /* ---------------- PAGE LAYOUT ---------------------------------------
     sideDotSpacing = space between dots on the 10 side sliders, in
     pixels (before the page is scaled to fit the screen). Same spacing
     on every side slider, so Duration is longer than Impact, like the
     chart.                                                             */
  layout: {
    sideDotSpacing: 8.6
  },

  /* ---------------- MAIN NEEDLE (Effective Strikes / Grappling) -------
     Zones on EACH side, listed from the center (Draw) outward.
     parts = the Close / Clearly / Cusp ranges inside a zone.
     upTo  = the last dot (counted inside the zone) that belongs to
             that part.
     ASSUMPTION: a tick mark is the LAST dot of the range on its
     center side. That makes Close = dots 1-2, Clearly = 3-8,
     Cusp = 9-10. Change the upTo numbers if you meant it differently. */
  mainNeedle: {
    zones: [
      {
        score: "10-9", name: "Close Margin", dots: 10,
        parts: [
          { label: "Close",   short: "Cl",  upTo: 2 },
          { label: "Clearly", short: "Clr", upTo: 8 },
          { label: "Cusp",    short: "Csp", upTo: 10 }
        ]
      },
      {
        score: "10-8", name: "Large Margin", dots: 10,
        parts: [
          { label: "Close",   short: "Cl",  upTo: 2 },
          { label: "Clearly", short: "Clr", upTo: 8 },
          { label: "Cusp",    short: "Csp", upTo: 10 }
        ]
      },
      {
        score: "10-7", name: "Overwhelming", dots: 10,
        parts: [
          { label: "Stoppage May Be Warranted", short: "Stop", upTo: 10, underline: true }
        ]
      }
    ]
  },

  /* ---------------- THE 10 SIDE SLIDERS (5 per corner) ----------------
     Listed in the same order as your chart.
     segments   = the sections on each side, from the center outward.
     labelStyle "span" = label sits over its section (like 10-9)
     labelStyle "tick" = label sits on the big dot (like 1-Min)
     boxed: true = drawn inside the black box (Dominance + Duration)
     group = which rule controls it:
       "tenEight"       → the (10-8) Guidelines sliders
       "aggressiveness" → locked unless the needle is at Draw
       "cage"           → locked unless needle at Draw AND
                          Red and Blue aggressiveness are equal       */
  sliders: [
    {
      id: "impact",
      title: "Damage / Impact",
      term: "impact",
      group: "tenEight",
      caption: "Impact includes visible evidence such as swelling and lacerations. Impact shall also be assessed when a fighter’s actions, using striking and/or grappling,<br>lead to a diminishing of their opponent’s energy, confidence, abilities and spirit, even though they may not have dominated the action",
      labelStyle: "span",
      segments: [
        { label: "( 10-9 )", dots: 10 },
        { label: "( 10-8 )", dots: 10 },
        { label: "( 10-7 )", dots: 10 }
      ],
      /* needleMap = which MAIN NEEDLE dot each Damage / Impact dot moves to.
         Left number = Impact dot. Right number = main needle dot.
         Dots 10, 20, 30 are line dots (skipped), so they are not listed.
         Red works the same way, toward the Red side.
         (Tom's rule: 1-2 → Close, 3-7 → Clearly one dot at a time,
          8-9 → Cusp. 10-8 and 10-7 sections work the same way.)
         NOTE: Tom wrote "8 → 8, 9 → 8". Needle dot 8 has a line on it and
         is skipped, so 8 and 9 go to dot 9 (the only Cusp dot). Same in
         the other sections (18, 19 → 19 and 28, 29 → 29).               */
      needleMap: {
        // (10-9) Close Margin
        1: 1,   2: 1,                                  // Close
        3: 3,   4: 4,   5: 5,   6: 6,   7: 7,          // Clearly
        8: 9,   9: 9,                                  // Cusp
        // (10-8) Large Margin
        11: 11, 12: 11,                                // Close
        13: 13, 14: 14, 15: 15, 16: 16, 17: 17,        // Clearly
        18: 19, 19: 19,                                // Cusp
        // (10-7) Overwhelming
        21: 21, 22: 21,
        23: 23, 24: 24, 25: 25, 26: 26, 27: 27,
        28: 29, 29: 29
      },
      ratio: 0   // not used while needleMap is set
    },
    {
      id: "dominance",
      title: "Dominance",
      term: "dominance",
      group: "tenEight",
      boxed: true,
      caption: "<i><u>Dominant Striking</u></i> <b>-</b> When the losing fighter is forced to continually defend, with no counters or reaction taken when openings present themselves<br><i><u>Dominant Grappling</u></i> <b>-</b> Utilizing dominant positions to attempt fight ending submissions or attacks. Merely holding a dominant position is not a primary factor",
      labelStyle: "span",
      // QUESTION FOR TOM: on your chart, Blue has Low Impact nearest the
      // center, but Red has HIGH Impact nearest the center. This file
      // uses Low nearest the center on BOTH sides (mirrored, like
      // Damage / Impact and Duration). Confirm which is correct.
      segments: [
        { label: "Low Impact",    short: "Low",  dots: 10 },
        { label: "Medium Impact", short: "Med",  dots: 10 },
        { label: "High Impact",   short: "High", dots: 10 }
      ],
      chartLinks: true,   // Low / Medium / High Impact open the Duration vs. Dominance chart
      // CHANGED: Dominance is now ONE dot per level, like the new chart.
      // Only these dots can be used (the middle dot of each section):
      // dot 5 = Low, dot 15 = Medium, dot 25 = High. The other dots are drawn as dashes.
      landableDots: [5, 15, 25],
      ratio: 0
    },
    {
      id: "duration",
      title: "Duration",
      term: "duration",
      group: "tenEight",
      boxed: true,
      requires: "dominance",   // locked for a corner until that corner has some Dominance
      caption: "<u>Amount of time</u> spent by one fighter effectively attacking, controlling, and <i>Impacting</i> their opponent; while the opponent offers little to no offensive<br>Judges assess <i>Duration</i> by recognizing the relative time in a round when one fighter maintains full control of the effective offense whether standing <u>or</u> on the ground",
      labelStyle: "tick",
      // 10 dots per minute = each dot is 6 seconds
      segments: [
        { label: "(1-Min)", short: "1", dots: 10 },
        { label: "(2-Min)", short: "2", dots: 10 },
        { label: "(3-Min)", short: "3", dots: 10 },
        { label: "(4-Min)", short: "4", dots: 10 },
        { label: "(5-Min)", short: "5", dots: 10 }
      ],
      valueFormat: "time",
      secondsPerDot: 6,
      ratio: 0
    },
    {
      id: "aggressiveness",
      title: "Effective Aggressiveness",
      term: "aggressiveness",
      group: "aggressiveness",
      caption: "<u>Aggressively making attempts to finish the fight <b>-</b> Only used when striking and grappling are even</u>",
      lockedText: "Locked — only used when Effective Strikes / Grappling are even (needle at Draw).",
      labelStyle: "span",
      segments: [{ label: "", dots: 10 }],
      ratio: 0
    },
    {
      id: "cage",
      title: "Cage Control",
      term: "cage",
      group: "cage",
      caption: "<u>Dictating the pace, place and position of the fight <b>-</b> Only used when striking, grappling and aggression are even</u>",
      lockedText: "Locked — only used when striking, grappling AND aggression are even.",
      labelStyle: "span",
      segments: [{ label: "", dots: 10 }],
      ratio: 0
    }
  ],

  /* ---------------- (10-8) GUIDELINE RULES -----------------------------
     Numbers are dot positions counted out from the center.
     ASSUMPTION: any dot counts as "present". Impact counts as
     "Significant" from dot 11 (the first dot of the 10-8 section).
     Change these when you give me your rules.                         */
  tenEightRules: {
    impactCountsAt: 1,
    significantImpactAt: 11,
    dominanceCountsAt: 1,
    durationCountsAt: 1
  }
};
