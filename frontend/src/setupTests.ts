import '@testing-library/jest-dom';
import { vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var jest: {
    fn: typeof vi.fn;
    spyOn: typeof vi.spyOn;
    clearAllMocks: typeof vi.clearAllMocks;
    resetAllMocks: typeof vi.resetAllMocks;
  };
}

if (typeof (globalThis as any).jest === 'undefined') {
  (globalThis as any).jest = {
    fn: vi.fn,
    spyOn: vi.spyOn,
    clearAllMocks: vi.clearAllMocks,
    resetAllMocks: vi.resetAllMocks,
  };
}

// Canvas 2D context mock for jsdom
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
  if (contextId === '2d') {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 40 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      canvas: { width: 1200, height: 100 },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
    };
  }
  return null;
}) as any;

// Web Audio API mock for jsdom
class MockAudioNode {
  connect = vi.fn((dest) => dest);
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = {
    value: 1.0,
    setValueAtTime: vi.fn((val: number) => {
      this.gain.value = val;
    }),
    linearRampToValueAtTime: vi.fn(),
  };
}

class MockBiquadFilterNode extends MockAudioNode {
  type = 'bandpass';
  frequency = {
    value: 1650,
    setValueAtTime: vi.fn((val: number) => {
      this.frequency.value = val;
    }),
  };
  Q = {
    value: 0.7,
    setValueAtTime: vi.fn((val: number) => {
      this.Q.value = val;
    }),
  };
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
  };
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = new MockAudioNode();
  createGain = vi.fn(() => new MockGainNode());
  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  createMediaElementSource = vi.fn(() => new MockAudioNode());
  resume = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

if (typeof (globalThis as any).AudioContext === 'undefined') {
  (globalThis as any).AudioContext = MockAudioContext;
  (globalThis as any).webkitAudioContext = MockAudioContext;
}

// Pointer capture mocks for jsdom
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}

// Media element play/pause mocks for jsdom
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.load = vi.fn();

// Mock localStorage & sessionStorage for jsdom
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, val: string) => {
      store[key] = String(val);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

Object.defineProperty(window, 'localStorage', {
  value: createStorageMock(),
  writable: true,
});
Object.defineProperty(window, 'sessionStorage', {
  value: createStorageMock(),
  writable: true,
});


