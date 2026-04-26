import type { AudioParamLike } from "./audio-context.js";

export function applySlide(
  freqParam: AudioParamLike,
  fromFreq: number,
  toFreq: number,
  startTime: number,
  durationSeconds: number,
): void {
  freqParam.setValueAtTime(fromFreq, startTime);
  freqParam.linearRampToValueAtTime(toFreq, startTime + durationSeconds);
}
