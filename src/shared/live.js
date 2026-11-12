// Pure decisions about live streams. Kept separate from the content script so they
// can be tested with plain objects (see tests/live-logic.html).
(() => {
  const START_LAG = 4;        // seconds behind the live edge at which we start catching up
  const STOP_LAG = 1.5;       // ...and at which we stop
  const MAX_LAG = 45;         // watching further behind than this is deliberate: leave it alone

  VSS.live = {
    START_LAG, STOP_LAG, MAX_LAG,

    // Live edge of a TimeRanges-like object, or NaN when there is none.
    edge(seekable) {
      return seekable && seekable.length ? seekable.end(seekable.length - 1) : NaN;
    },

    // "start" catching up, "stop" doing it, or "keep" the current state.
    // An unknown lag (NaN) never starts anything and always ends an ongoing catch-up.
    decide(lag, boosting) {
      if (boosting) return lag > STOP_LAG && lag <= MAX_LAG ? "keep" : "stop";
      return lag >= START_LAG && lag <= MAX_LAG ? "start" : "keep";
    }
  };
})();
