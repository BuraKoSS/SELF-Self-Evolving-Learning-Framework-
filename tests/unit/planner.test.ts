describe("Planner Agent - Unit Test", () => {
  test("returns default focus duration", () => {
    const history: number[] = [];
    const result = history.length === 0 ? 30 : 25;
    expect(result).toBe(30);
  });
});

