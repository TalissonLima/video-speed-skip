// Pure helpers for the seek badge, so they can be tested with plain numbers (see tests/live-logic.html).
(() => {
  const WINDOW_MS = 3000; // seeks closer together than this add up on the badge

  VSS.seek = {
    WINDOW_MS,

    // Running (signed) total of the seeks made within WINDOW_MS of each other.
    // After a longer pause the total starts over from this seek alone.
    accumulate(total, delta, elapsedMs) {
      return elapsedMs <= WINDOW_MS ? total + delta : delta;
    },

    // "+30s", "−20s", "+2.5s", "0s"
    label(total) {
      const abs = Math.abs(total);
      return `${total > 0 ? "+" : total < 0 ? "−" : ""}${Number.isInteger(abs) ? abs : abs.toFixed(1)}s`;
    }
  };
})();
