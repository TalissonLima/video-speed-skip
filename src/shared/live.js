// Pure decisions about live streams and ad videos. Kept separate from the content script so they
// can be tested with plain objects (see tests/live-logic.html).
(() => {
  const START_LAG = 4;        // seconds behind the live edge at which we start catching up
  const STOP_LAG = 1.5;       // ...and at which we stop
  const MAX_LAG = 45;         // watching further behind than this is deliberate: leave it alone
  const MAX_AD_SECONDS = 900; // an ad is short; anything longer is the real content

  VSS.live = {
    START_LAG, STOP_LAG, MAX_LAG, MAX_AD_SECONDS,

    // Live edge of a TimeRanges-like object, or NaN when there is none.
    edge(seekable) {
      return seekable && seekable.length ? seekable.end(seekable.length - 1) : NaN;
    },

    // "start" catching up, "stop" doing it, or "keep" the current state.
    // An unknown lag (NaN) never starts anything and always ends an ongoing catch-up.
    decide(lag, boosting) {
      if (boosting) return lag > STOP_LAG && lag <= MAX_LAG ? "keep" : "stop";
      return lag >= START_LAG && lag <= MAX_LAG ? "start" : "keep";
    },

    // Which of a player's <video>s is the AD? Short, finite, and preferably the one playing.
    // Returns null when none qualifies (e.g. only the long/live content video is there).
    pickAd(videos) {
      const ads = videos.filter((v) => Number.isFinite(v.duration) && v.duration > 0 && v.duration <= MAX_AD_SECONDS);
      return ads.find((v) => !v.paused && !v.ended) ?? ads[0] ?? null;
    }
  };
})();
