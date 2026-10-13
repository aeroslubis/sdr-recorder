/**
 * Web Audio Player with DSP Speech Bandpass Filter (300Hz - 3kHz) and Gain Control.
 */

export class WebAudioPlayer {
  private audioContext: AudioContext | null = null;
  private audio: HTMLAudioElement;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private dspFilterEnabled: boolean = false;
  private volume: number = 1.0;
  private playbackRate: number = 1.0;
  private currentUrl: string | null = null;

  public onEnded?: () => void;
  public onTimeUpdate?: (currentTimeSec: number, durationSec: number) => void;
  public onStateChange?: (isPlaying: boolean) => void;
  public onError?: (error: any) => void;

  constructor() {
    this.audio = typeof Audio !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
    if (this.audio.addEventListener) {
      this.audio.crossOrigin = 'anonymous';
      this.audio.addEventListener('ended', this.handleEnded);
      this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audio.addEventListener('play', this.handlePlay);
      this.audio.addEventListener('pause', this.handlePause);
      this.audio.addEventListener('error', this.handleAudioError);
    }

    this.initAudioContext();
  }

  private initAudioContext(): void {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'bandpass';
      // Center frequency for speech (geometric mean of 300Hz and 3000Hz is ~948Hz, arithmetic ~1650Hz)
      this.filterNode.frequency.setValueAtTime(1650, this.audioContext.currentTime);
      this.filterNode.Q.setValueAtTime(0.7, this.audioContext.currentTime);

      if (this.audio && this.audioContext.createMediaElementSource) {
        this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
      }

      this.updateDspRouting();
    } catch (e) {
      console.warn('WebAudioPlayer: AudioContext initialization failed or not supported:', e);
    }
  }

  private updateDspRouting(): void {
    if (!this.sourceNode || !this.gainNode || !this.audioContext) return;

    try {
      this.sourceNode.disconnect();
      if (this.filterNode) {
        this.filterNode.disconnect();
      }

      if (this.dspFilterEnabled && this.filterNode) {
        this.sourceNode.connect(this.filterNode);
        this.filterNode.connect(this.gainNode);
      } else {
        this.sourceNode.connect(this.gainNode);
      }

      if (this.analyserNode) {
        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);
      } else {
        this.gainNode.connect(this.audioContext.destination);
      }
    } catch (e) {
      // In tests or edge disconnection cases
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }


  private handleEnded = (): void => {
    this.onEnded?.();
    this.onStateChange?.(false);
  };

  private handleTimeUpdate = (): void => {
    if (this.audio) {
      this.onTimeUpdate?.(this.audio.currentTime, this.audio.duration || 0);
    }
  };

  private handlePlay = (): void => {
    this.onStateChange?.(true);
  };

  private handlePause = (): void => {
    this.onStateChange?.(false);
  };

  private handleAudioError = (e: any): void => {
    this.onError?.(e);
  };

  public async playUrl(url: string, startTimeSec: number = 0): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (err) {
        // Autoplay policy fallback
      }
    }

    if (this.currentUrl !== url) {
      this.currentUrl = url;
      this.audio.src = url;
      this.audio.playbackRate = this.playbackRate;
      this.audio.currentTime = startTimeSec;
    } else if (startTimeSec > 0 && Math.abs(this.audio.currentTime - startTimeSec) > 0.5) {
      this.audio.currentTime = startTimeSec;
    }

    try {
      await this.audio.play();
    } catch (err) {
      this.onError?.(err);
      throw err;
    }
  }

  public async play(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (this.audio.play) {
      await this.audio.play();
    }
  }

  public pause(): void {
    if (this.audio.pause) {
      this.audio.pause();
    }
  }

  public stop(): void {
    if (this.audio.pause) {
      this.audio.pause();
    }
    if (this.audio.currentTime !== undefined) {
      this.audio.currentTime = 0;
    }
    this.onStateChange?.(false);
  }

  public seek(seconds: number): void {
    if (this.audio.currentTime !== undefined) {
      this.audio.currentTime = Math.max(0, seconds);
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volume = clamped;
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(clamped, this.audioContext.currentTime);
    }
    if (this.audio) {
      this.audio.volume = clamped;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public setDspFilter(enabled: boolean): void {
    this.dspFilterEnabled = enabled;
    this.updateDspRouting();
  }

  public getDspFilter(): boolean {
    return this.dspFilterEnabled;
  }

  public getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  public getDuration(): number {
    return this.audio?.duration ?? 0;
  }

  public getIsPlaying(): boolean {
    return this.audio ? !this.audio.paused && !this.audio.ended : false;
  }

  public destroy(): void {
    if (this.audio) {
      this.audio.pause?.();
      if (this.audio.removeEventListener) {
        this.audio.removeEventListener('ended', this.handleEnded);
        this.audio.removeEventListener('timeupdate', this.handleTimeUpdate);
        this.audio.removeEventListener('play', this.handlePlay);
        this.audio.removeEventListener('pause', this.handlePause);
        this.audio.removeEventListener('error', this.handleAudioError);
      }
      this.audio.src = '';
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (err) {
        // ignore
      }
    }
    this.audioContext = null;
    this.sourceNode = null;
    this.filterNode = null;
    this.gainNode = null;
  }
}
