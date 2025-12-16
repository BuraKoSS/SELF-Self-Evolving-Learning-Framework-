const KEY = 'pomodoro_prefs';

export interface PomodoroPrefs {
  pomodoroLength: number;
  completedSessions: number;
  failedSessions: number;
}

export function loadPrefs(): PomodoroPrefs {
  const data = localStorage.getItem(KEY);
  return data
    ? (JSON.parse(data) as PomodoroPrefs)
    : {
        pomodoroLength: 25,
        completedSessions: 0,
        failedSessions: 0,
      };
}

export function savePrefs(prefs: PomodoroPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
