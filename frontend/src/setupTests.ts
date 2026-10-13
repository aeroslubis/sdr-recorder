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
