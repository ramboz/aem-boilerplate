export function trackLcp() {
  new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const entry = entries[entries.length - 1];
    const lcp = entry.renderTime || entry.loadTime;
    console.log('LCP:', lcp, entry.element);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

export function trackFcp() {
  new PerformanceObserver((entryList) => {
    const entries = entryList.getEntriesByName('first-contentful-paint');
    entries.forEach((entry) => {
      console.log('FCP:', entry.startTime, entry);
    });
  }).observe({ type: 'paint', buffered: true });
}

export function trackFid() {
  new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    entries.forEach((entry) => {
      const delay = entry.processingStart - entry.startTime;
      console.log('FID:', delay, entry);
    });
  }).observe({ type: 'first-input', buffered: true });
}

export function trackCls() {
  let clsValue = 0;
  let clsEntries = [];

  let sessionValue = 0;
  let sessionEntries = [];

  new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    entries.forEach((entry) => {
      // Only count layout shifts without recent user input.
      if (entry.hadRecentInput) {
        return;
      }
      const firstSessionEntry = sessionEntries[0];
      const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

      // If the entry occurred less than 1 second after the previous entry and
      // less than 5 seconds after the first entry in the session, include the
      // entry in the current session. Otherwise, start a new session.
      if (sessionValue
          && entry.startTime - lastSessionEntry.startTime < 1000
          && entry.startTime - firstSessionEntry.startTime < 5000) {
        sessionValue += entry.value;
        sessionEntries.push(entry);
      } else {
        sessionValue = entry.value;
        sessionEntries = [entry];
      }

      // If the current session value is larger than the current CLS value,
      // update CLS and the entries contributing to it.
      if (sessionValue > clsValue) {
        clsValue = sessionValue;
        clsEntries = sessionEntries;

        // Log the updated value (and its entries) to the console.
        console.log('CLS:', clsValue, clsEntries);
      }
    });
  }).observe({ type: 'layout-shift', buffered: true });
}

export function trackTtfb() {
  new PerformanceObserver((entryList) => {
    const [pageNav] = entryList.getEntriesByType('navigation');
    console.log('TTFB:', pageNav.responseStart, window.location.href);
  }).observe({ type: 'navigation', buffered: true });

  new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    entries.forEach((entry) => {
      if (entry.responseStart > 0) {
        console.log('TTFB:', entry.responseStart, entry.name);
      }
    });
  }).observe({ type: 'resource', buffered: true });
}

export function trackAll() {
  trackCls();
  trackFcp();
  trackFid();
  trackLcp();
  trackTtfb();
}
