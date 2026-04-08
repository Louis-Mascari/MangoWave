/**
 * AudioWorklet processor that captures post-EQ stereo PCM audio and
 * forwards it to the main thread via port.postMessage.
 *
 * Audio rendering thread → captures 128 samples/quantum → interleaves L/R →
 * posts Float32Array (transferable) to main thread.
 *
 * At 48kHz: 128 samples × 2 channels = 1KB per message, ~375 msg/sec.
 * Data volume is modest (~350KB/s), so postMessage is sufficient — no need
 * for SharedArrayBuffer (which requires Cross-Origin-Isolation headers that
 * break Spotify OAuth popups and potentially getDisplayMedia).
 */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const left = input[0];
    const right = input.length > 1 ? input[1] : left; // Mono fallback
    const len = left.length;

    // Interleave L/R for projectM's LRLRLR format
    const interleaved = new Float32Array(len * 2);
    for (let i = 0; i < len; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }

    this.port.postMessage(interleaved, [interleaved.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
