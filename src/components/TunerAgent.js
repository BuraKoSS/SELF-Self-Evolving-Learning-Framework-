import { loadPrefs, savePrefs } from "./UserPrefs";
import { logEvent } from "./ObserverAgent";

export function tunePomodoroSettings() {
  const prefs = loadPrefs();

  let newLength = prefs.pomodoroLength;

  if (prefs.failedSessions >= 3) {
    newLength = 20;
  } else if (prefs.completedSessions >= 5) {
    newLength = 30;
  }

  if (newLength !== prefs.pomodoroLength) {
    logEvent("TUNER_UPDATED", {
      old: prefs.pomodoroLength,
      new: newLength
    });
  }

  prefs.pomodoroLength = newLength;
  savePrefs(prefs);

  return prefs;
}
