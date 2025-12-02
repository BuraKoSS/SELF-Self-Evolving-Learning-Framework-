"use client";
import { useState, useEffect } from "react";

export default function PomodoroTimer() {
    const WORK_TIME = 25 * 60;          // 25 dakika
    const BREAK_TIME = 5 * 60;          // 5 dakika

    const [timeLeft, setTimeLeft] = useState(WORK_TIME);
    const [isRunning, setIsRunning] = useState(false);
    const [mode, setMode] = useState("work"); // work | break

    useEffect(() => {
        if (!isRunning) return;

        const interval = setInterval(() => {
            setTimeLeft((t) => {
                if (t === 0) {
                    if (mode === "work") {
                        setMode("break");
                        return BREAK_TIME;
                    } else {
                        setMode("work");
                        return WORK_TIME;
                    }
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning, mode]);

    const format = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    return (
        <div className="pomodoro-container">
            <h1>{mode === "work" ? "Work Session" : "Break Session"}</h1>

            <div className="timer">{format(timeLeft)}</div>

            <button onClick={() => setIsRunning(!isRunning)}>
                {isRunning ? "Pause" : "Start"}
            </button>

            <button onClick={() => {
                setIsRunning(false);
                setMode("work");
                setTimeLeft(WORK_TIME);
            }}>
                Reset
            </button>
        </div>
    );
}
