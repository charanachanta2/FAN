'use strict';

// Simulated stadium zone telemetry — swap simulateCrowdSnapshot() for a real
// IoT/camera-feed data source when available; everything downstream (AI
// guidance, caching, UI, dashboard) already expects this shape of data.
const ZONES = ['North Gate', 'South Gate', 'East Concourse', 'West Concourse', 'Fan Zone Plaza', 'Metro Transit Hub'];

/** Density → human-readable congestion level. */
function densityToLevel(density) {
  if (density > 85) return 'Critical';
  if (density > 65) return 'High';
  if (density > 40) return 'Moderate';
  return 'Low';
}

/** Generates a fresh simulated snapshot of crowd density per zone. */
function simulateCrowdSnapshot() {
  return ZONES.map((zone) => {
    const density = Math.round(20 + Math.random() * 78); // 20-98%
    return { zone, density, level: densityToLevel(density) };
  });
}

/** Returns the `n` busiest zones from a snapshot, highest density first. */
function busiestZones(zones, n = 2) {
  return [...zones].sort((a, b) => b.density - a.density).slice(0, n);
}

module.exports = { ZONES, simulateCrowdSnapshot, busiestZones, densityToLevel };
