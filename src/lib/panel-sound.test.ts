// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSoundEnabled, playNotificationSound, setSoundEnabled } from "./panel-sound";

describe("panel sound preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to on when nothing has been saved yet", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("remembers off, then on again", () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it("falls back to on when localStorage throws (private browsing)", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isSoundEnabled()).toBe(true);
    spy.mockRestore();
  });
});

describe("playNotificationSound", () => {
  // jsdom has no AudioContext at all; a browser lacking Web Audio (or blocking it under an
  // autoplay policy) must fail silently, never throw into the caller (a poll tick or a push
  // handler), so the baseline "no AudioContext" case already covers the real failure mode.
  it("never throws when AudioContext doesn't exist", () => {
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("creates and starts two oscillators through a stubbed AudioContext", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn().mockReturnThis();
    const oscillator = () => ({ type: "", frequency: { value: 0 }, connect, start, stop });
    const gain = () => ({
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect,
    });
    const resume = vi.fn().mockResolvedValue(undefined);

    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator = oscillator;
      createGain = gain;
      resume = resume;
    }

    vi.stubGlobal("AudioContext", FakeAudioContext);
    try {
      playNotificationSound();
      expect(start).toHaveBeenCalledTimes(2);
      expect(stop).toHaveBeenCalledTimes(2);
      expect(resume).not.toHaveBeenCalled(); // state was already "running"
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
