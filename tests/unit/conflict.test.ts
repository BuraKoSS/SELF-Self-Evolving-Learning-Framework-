describe("Conflict Scenario Test", () => {
  test("resolves conflicting updates correctly", () => {
    const localUpdate = { id: 1, version: 1 };
    const remoteUpdate = { id: 1, version: 2 };

    const resolved =
      remoteUpdate.version > localUpdate.version
        ? remoteUpdate
        : localUpdate;

    expect(resolved.version).toBe(2);
  });
});
