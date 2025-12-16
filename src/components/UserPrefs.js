const KEY = "pomodoro_prefs";

export function loadPrefs() {
  const data = localStorage.getItem(KEY);
  return data
    ? JSON.parse(data)
    : {
        pomodoroLength: 25,
        completedSessions: 0,
        failedSessions: 0
      };
}

export function savePrefs(prefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
