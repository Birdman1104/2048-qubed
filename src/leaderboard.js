// Global leaderboard stored in Supabase (schema in supabase/schema.sql).
// One row per player holding their best score; `submit_score` upserts it and returns
// { rank, best, name, top: [{ name, score, me }] } in a single request.

import { CONFIG } from './config.js';

const L = CONFIG.leaderboard;

export async function submitScore(player, score) {
  if (!L.supabaseUrl || !L.supabaseAnonKey) {
    if (import.meta.env.DEV) return mockSubmit(player, score);
    throw new Error('Leaderboard is not configured');
  }
  const headers = { 'Content-Type': 'application/json', apikey: L.supabaseAnonKey };
  // legacy anon keys are JWTs and go in Authorization too; new publishable keys (sb_...) must not
  if (!L.supabaseAnonKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + L.supabaseAnonKey;

  const res = await fetch(L.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/submit_score', {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_player_id: player.id, p_name: player.name, p_score: Math.floor(score), p_limit: L.size }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(L.timeoutMs) : undefined,
  });
  if (!res.ok) throw new Error('Leaderboard request failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}

// ---------------------------------------------------------------- dev-only fake leaderboard

let mockRows = null;

function mockSubmit(player, score) {
  if (!mockRows) {
    mockRows = Array.from({ length: 150 }, (_, i) => ({
      id: 'bot' + i,
      name: 'Player_' + (1000 + i),
      score: Math.round(30000 * Math.pow(0.97, i) + Math.random() * 50),
      at: i,
    }));
  }
  let me = mockRows.find((r) => r.id === player.id);
  if (!me) mockRows.push((me = { id: player.id, name: player.name, score, at: performance.now() }));
  if (score > me.score) Object.assign(me, { score, at: performance.now() });
  me.name = player.name;
  mockRows.sort((a, b) => b.score - a.score || a.at - b.at);
  const rank = mockRows.indexOf(me) + 1;
  const top = mockRows.slice(0, L.size).map((r) => ({ name: r.name, score: r.score, me: r === me }));
  return new Promise((resolve) => setTimeout(() => resolve({ rank, best: me.score, name: me.name, top }), 400));
}
