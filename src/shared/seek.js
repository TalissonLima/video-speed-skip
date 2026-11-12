(() => {
  const WINDOW_MS = 3000;

  VSS.seek = {
    WINDOW_MS,

    accumulate(total, delta, elapsedMs) {
      return elapsedMs <= WINDOW_MS ? total + delta : delta;
    },

    label(total) {
      const abs = Math.abs(total);
      return `${total > 0 ? "+" : total < 0 ? "−" : ""}${Number.isInteger(abs) ? abs : abs.toFixed(1)}s`;
    }
  };
})();
