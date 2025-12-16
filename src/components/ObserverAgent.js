export function logEvent(type, details) {
  console.log("[Observer]", {
    type,
    details,
    time: new Date().toISOString()
  });
}
