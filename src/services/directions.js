'use strict';

const { ENV, FEATURES } = require('../config/env');

/**
 * Fetches turn-by-turn directions between two points from the Google
 * Directions API. Throws an error with a `.code` (HTTP status) so route
 * handlers can map it directly to a response status.
 */
async function callGoogleDirections(origin, destination, mode) {
  if (!FEATURES.maps) {
    throw Object.assign(new Error('Directions API not configured (missing GOOGLE_MAPS_API_KEY).'), { code: 503 });
  }
  const params = new URLSearchParams({
    origin, destination, mode: mode || 'walking', key: ENV.GOOGLE_MAPS_API_KEY,
  });
  const resp = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!resp.ok) throw new Error(`Directions API error ${resp.status}`);
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw Object.assign(new Error(`Directions API status: ${data.status}`), { code: 502 });
  }
  const leg = data.routes?.[0]?.legs?.[0];
  return {
    summary: data.routes?.[0]?.summary || '',
    distance: leg?.distance?.text,
    duration: leg?.duration?.text,
    steps: (leg?.steps || []).map((s) => ({
      instruction: s.html_instructions?.replace(/<[^>]+>/g, ''),
      distance: s.distance?.text,
      duration: s.duration?.text,
    })),
  };
}

module.exports = { callGoogleDirections };
