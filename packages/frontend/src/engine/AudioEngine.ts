/**
 * AudioEngine manages the Web Audio API pipeline:
 * getDisplayMedia stream → MediaStreamSource → GainNode (pre-amp)
 *   → BiquadFilterNode chain (10-band EQ) → AnalyserNode → FFT data
 */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type EQBandFrequency = (typeof EQ_BANDS)[number];

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private preAmpGain: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;

  get context(): AudioContext | null {
    return this.audioContext;
  }

  get analyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  get isActive(): boolean {
    return this.audioContext !== null && this.audioContext.state === 'running';
  }

  async captureAudio(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true, // required by some browsers to enable audio capture
    });

    // Stop video tracks — we only need audio
    stream.getVideoTracks().forEach((track) => track.stop());

    this.stream = stream;
    return stream;
  }

  initAudioPipeline(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Pre-amp gain
    this.preAmpGain = this.audioContext.createGain();
    this.preAmpGain.gain.value = 1.0;

    // 10-band EQ using peaking filters
    this.eqFilters = EQ_BANDS.map((freq) => {
      const filter = this.audioContext!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4; // moderate bandwidth
      filter.gain.value = 0; // flat by default
      return filter;
    });

    // Analyser for FFT data
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.5;

    // Chain: source → preAmp → EQ band 0 → ... → EQ band 9 → analyser
    this.sourceNode.connect(this.preAmpGain);

    let previousNode: AudioNode = this.preAmpGain;
    for (const filter of this.eqFilters) {
      previousNode.connect(filter);
      previousNode = filter;
    }
    previousNode.connect(this.analyser);
  }

  setPreAmpGain(value: number): void {
    if (this.preAmpGain) {
      this.preAmpGain.gain.value = value;
    }
  }

  setSmoothingConstant(value: number): void {
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = value;
    }
  }

  setFftSize(size: number): void {
    if (this.analyser) {
      this.analyser.fftSize = size;
    }
  }

  setEQBandGain(index: number, gainDb: number): void {
    if (index >= 0 && index < this.eqFilters.length) {
      this.eqFilters[index].gain.value = gainDb;
    }
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(0);
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getTimeDomainData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(0);
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  destroy(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.sourceNode = null;
    this.preAmpGain = null;
    this.eqFilters = [];
    this.analyser = null;
  }
}
