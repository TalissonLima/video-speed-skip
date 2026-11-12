(() => {
  const START_LAG = 4;
  const STOP_LAG = 1.5;
  const MAX_LAG = 45;

  VSS.live = {
    START_LAG, STOP_LAG, MAX_LAG,

    edge(seekable) {
      return seekable && seekable.length ? seekable.end(seekable.length - 1) : NaN;
    },

    decide(lag, boosting) {
      if (boosting) return lag > STOP_LAG && lag <= MAX_LAG ? "keep" : "stop";
      return lag >= START_LAG && lag <= MAX_LAG ? "start" : "keep";
    }
  };
})();
