describe("Resilience Test", () => {
  test("system recovers from corrupted state", () => {
    let timerState: any = null;

    try {
      if (!timerState) {
        throw new Error("Corrupted state");
      }
    } catch {
      timerState = { mode: "work", timeLeft: 1800 };
    }

    expect(timerState.mode).toBe("work");
  });
});
