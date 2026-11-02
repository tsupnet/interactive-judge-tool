/* =====================================================================
   FSL JUDGING TOOL — POPUP TEXT (definitions.js)
   The text that appears when a hyperlinked word is tapped.
   Each paragraph is one line in quotes, separated by commas.
   Source: your 2019 MMA Judging Criteria and 10-8 Guidelines documents.
   ===================================================================== */

window.FSL_DEFINITIONS = {

  strikes: {
    title: "Effective Strikes",
    body: [
      "Legal blows that have immediate or cumulative impact with the potential to contribute towards the end of the match, with the IMMEDIATE weighing more heavily than the cumulative impact.",
      "Examples: head knocked back, forced to move backwards, causing a change of strategy — such as forcing the opponent to go for a takedown.",
      "Greater effect: buckled the knees, losing balance due to neurological damage — \"short-circuited.\"",
      "Immediate impact: devastating head strikes, visible damage, knockdown.",
      "Focus on the result of the action, and not the action itself. Damage is King."
    ]
  },

  grappling: {
    title: "Effective Grappling",
    body: [
      "Successful execution of takedowns, submission attempts, reversals and the achievement of advantageous positions that produce immediate or cumulative impact with the potential to contribute to the end of the match, with the IMMEDIATE weighing more heavily than the cumulative impact.",
      "A successful takedown is not merely a changing of position, but the establishment of an attack from the use of the takedown.",
      "Top and bottom position fighters are assessed more on the impactful/effective result of their actions than on their position.",
      "Effective grappling: posturing up to strike, improving position, submission attempts. Transitioning to dominant positions. Tight, threatening submission attempts that cause damage — defensive reactions, giving up position, etc.",
      "Straight wrestling control — not posturing up to strike, not improving position, no submission attempts, not taking any risk of losing position — is not dominant grappling. Straight wrestling for 5 minutes doesn't necessarily warrant a 10-8 if there isn't enough damage or impact."
    ]
  },

  consider108: {
    title: "Consider 10-8",
    body: [
      "Judges must CONSIDER a 10-8 when one fighter has:",
      "• Dominance and Duration, without Impact — or —",
      "• Significant Impact, without Dominance.",
      "A score of 10-8 does not require a fighter to dominate their opponent for 5 minutes of a round.",
      "If a fighter has little to no offensive output during a 5-minute round, it should be normal for the judge to consider awarding the losing fighter 8 points instead of 9.",
      "If a judge sees that a fighter has been significantly damaged in the round, the judge should CONSIDER the score of 10-8."
    ]
  },

  always108: {
    title: "Always Score 10-8",
    body: [
      "Judges shall ALWAYS give a score of 10-8 when one fighter has:",
      "1. Dominated the action of the round,",
      "2. Had Duration of that domination, and",
      "3. Impacted their opponent with effective strikes or effective grappling that diminished the opponent's abilities.",
      "Impact, Dominance and Duration are an extension of effective strikes and effective grappling as they relate to a 10-8 score."
    ]
  },

  impact: {
    title: "Damage / Impact",
    body: [
      "A judge shall assess if a fighter impacts their opponent significantly in the round, even though they may not have dominated the action.",
      "Impact includes visible evidence such as swelling and lacerations.",
      "Impact shall also be assessed when a fighter's actions, using striking and/or grappling, lead to a diminishing of their opponent's energy, confidence, abilities and spirit.",
      "When a fighter is impacted with strikes, by lack of control and/or ability, this can create defining moments in the round and shall be assessed with great value."
    ]
  },

  dominance: {
    title: "Dominance",
    body: [
      "Dominant Striking: the losing fighter is forced to continually defend, with no counters or reaction taken when openings present themselves.",
      "Dominant Grappling: taking dominant positions and utilizing them to attempt fight-ending submissions or attacks.",
      "Merely holding a dominant position shall not be a primary factor. What the fighter does with the position is what must be assessed.",
      "Decoded: to be dominant in the grappling phase, a fighter needs one or more of: submission attempts, strikes, or an overwhelming pace of aggressive positional changes that keeps the opponent consistently defending or reacting.",
      "One strike? Not necessarily adequate unless it's impactful enough to dominate.",
      "Straight wrestling? Viable if it's aggressive, positionally dynamic and overwhelming, keeping the opponent on the defensive."
    ]
  },

  duration: {
    title: "Duration",
    body: [
      "Duration is the time spent by one fighter effectively attacking, controlling and impacting their opponent, while the opponent offers little to no offensive output.",
      "A judge assesses duration by recognizing the relative time in a round when one fighter takes and maintains full control of the effective offense — standing or grounded.",
      "Duration is relative and subjective. The more effective the action, the less duration it may take to justify a 10-8."
    ]
  },

  aggressiveness: {
    title: "Effective Aggressiveness",
    body: [
      "Aggressively making attempts to finish the fight. The key term is \"effective.\"",
      "Chasing after an opponent with no effective result or impact should not render in the judges' assessments.",
      "Plan B: only assessed if Effective Striking/Grappling is 100% equal for both competitors."
    ]
  },

  cage: {
    title: "Cage Control (Fighting Area Control)",
    body: [
      "Determined by who is dictating the pace, place and position of the match.",
      "Plan C: only assessed if Effective Striking/Grappling AND Effective Aggressiveness are 100% equal for both competitors.",
      "This will be assessed very rarely."
    ]
  },

  /* Popup for Low / Medium / High Impact.
     Put your chart picture in the images folder with this exact name. */
  chart: {
    title: "Duration vs. Dominance",
    image: "images/duration-dominance-chart.png",
    /* Yellow box drawn over each group when its word is clicked.
       Numbers are percent of the picture's width (left, width) and
       height (top, height). Measured on the updated chart picture.
       If the picture is replaced with a different layout, these
       numbers must be measured again.                                */
    groups: {
      "High Impact":   { left: 13.4, width: 72.3, top: 20.0, height: 17.6 },
      "Medium Impact": { left: 13.4, width: 72.3, top: 41.2, height: 24.0 },
      "Low Impact":    { left: 13.4, width: 72.3, top: 69.8, height: 14.3 }
    },
    body: []   // CHANGED: no text under the chart (the chart has its own text)
  }
};
