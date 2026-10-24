function pollDelay(state, saver = false, failures = 0) {
  const p = state?.profile, active = state?.rides?.some(r => ["searching", "accepted", "in_progress"].includes(r.status) && (r.passenger_id === p?.id || r.driver_id === p?.id));
  const working = ["admin", "dispatcher"].includes(p?.role) || state?.drivers?.some(d => d.id === p?.id && d.online);
  const base = active ? (saver ? 8000 : 3000) : working ? (saver ? 10000 : 5000) : (saver ? 60000 : 30000);
  return Math.min(120000, base * 2 ** Math.min(failures, 4));
}
// Schedule after completion: never overlap, even with slow networks. Background
// suspends future requests; a request already in flight may finish.
function createPoller({ refresh, delay, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let enabled = false, running = false, timer = null, failures = 0;
  function clear() { if (timer !== null) clearTimer(timer); timer = null; }
  async function run() {
    clear(); if (!enabled || running) return;
    running = true;
    try { failures = (await refresh()) === false ? failures + 1 : 0; }
    catch { failures++; }
    finally { running = false; if (enabled) timer = setTimer(run, delay(failures)); }
  }
  return {
    start() { enabled = true; failures = 0; run(); },
    stop() { enabled = false; clear(); },
    reschedule() { clear(); if (enabled && !running) timer = setTimer(run, delay(failures)); }
  };
}
module.exports = { pollDelay, createPoller };
