'use strict';

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { buildCrowdPayload } = require('./crowd');
const { fetchIncidentsWithBriefing } = require('./incidents');
const { busiestZones } = require('../services/crowd');
const { FEATURES } = require('../config/env');

const router = express.Router();

const SEVERITY_WEIGHT = { Critical: 4, High: 3, Medium: 2, Low: 1 };

/**
 * Merges live crowd density with open incidents into a single ranked list of
 * "things a shift supervisor should look at right now" — congestion hot
 * spots and unresolved incidents, most urgent first. This is the dedicated
 * real-time decision-support surface: crowd guidance and incident triage
 * already give AI recommendations individually, but neither view puts both
 * signal types side-by-side and ranked, which is what a supervisor making a
 * live call actually needs.
 */
function buildPriorityQueue(crowd, incidentsPayload) {
  const items = [];

  busiestZones(crowd.zones, 3).forEach((z) => {
    if (z.level === 'Low') return;
    items.push({
      type: 'crowd',
      zone: z.zone,
      weight: SEVERITY_WEIGHT[z.level === 'Critical' ? 'Critical' : z.level === 'High' ? 'High' : 'Medium'] || 1,
      summary: `${z.zone} is at ${z.density}% density (${z.level}).`,
    });
  });

  (incidentsPayload.incidents || [])
    .filter((i) => i.status !== 'resolved')
    .slice(0, 10)
    .forEach((i) => {
      items.push({
        type: 'incident',
        zone: i.zone,
        weight: SEVERITY_WEIGHT[i.severity] || 2,
        summary: `[${i.severity || 'Unknown'}] ${i.zone}: ${i.description}`,
        recommendedAction: i.recommended_action || null,
      });
    });

  return items.sort((a, b) => b.weight - a.weight);
}

router.get('/dashboard', authMiddleware('staff'), async (req, res, next) => {
  try {
    const crowd = await buildCrowdPayload();
    const incidentsPayload = FEATURES.db
      ? await fetchIncidentsWithBriefing()
      : { incidents: [], briefing: 'Incident log is not configured on this deployment.' };

    res.json({
      generatedAt: new Date().toISOString(),
      crowdGuidance: crowd.guidance,
      shiftBriefing: incidentsPayload.briefing,
      priorityQueue: buildPriorityQueue(crowd, incidentsPayload),
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.buildPriorityQueue = buildPriorityQueue;
