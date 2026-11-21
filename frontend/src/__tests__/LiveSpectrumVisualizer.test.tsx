import { render, screen } from '@testing-library/react';
import { LiveSpectrumVisualizer } from '../components/LiveSpectrumVisualizer';

describe('LiveSpectrumVisualizer', () => {
  test('renders live SDR spectrum visualizer canvas with carrier status', () => {
    render(
      <LiveSpectrumVisualizer
        frequencyHz={118200000}
        modulation="AM"
        squelchOpen={true}
        rssi={-32.5}
        analyserNode={null}
      />
    );

    expect(screen.getByText(/LIVE SDR SPECTRUM/i)).toBeInTheDocument();
    expect(screen.getByText(/CARRIER ACTIVE/i)).toBeInTheDocument();
    expect(screen.getByTestId('sdr-spectrum-canvas')).toBeInTheDocument();
  });

  test('displays disconnected status when hardwareConnected is false', () => {
    render(
      <LiveSpectrumVisualizer
        hardwareConnected={false}
      />
    );

    expect(screen.getByText(/LIVE SDR SPECTRUM/i)).toBeInTheDocument();
    expect(screen.getByText(/DISCONNECTED/i)).toBeInTheDocument();
    expect(screen.getByTestId('sdr-spectrum-canvas')).toBeInTheDocument();
  });

  test('adapts canvas background and styling according to theme prop', () => {
    const fillStyles: string[] = [];
    const mockCtx = {
      fillRect: vi.fn().mockImplementation(() => {
        fillStyles.push(mockCtx.fillStyle);
      }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);

    const { rerender } = render(
      <LiveSpectrumVisualizer
        theme="light"
      />
    );

    // First fillRect should paint canvas with light background color #f8fafc
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(fillStyles[0]).toBe('#f8fafc');

    fillStyles.length = 0;
    rerender(
      <LiveSpectrumVisualizer
        theme="dark"
      />
    );
    expect(fillStyles[0]).toBe('#121212');
  });

  test('applies custom color palette and updates carrier text class', () => {
    const { rerender } = render(
      <LiveSpectrumVisualizer
        frequencyHz={118200000}
        modulation="AM"
        squelchOpen={true}
        colorMap="cyan"
      />
    );

    const carrierSpan = screen.getByText(/CARRIER ACTIVE/i);
    expect(carrierSpan).toHaveClass('text-cyan-400');

    rerender(
      <LiveSpectrumVisualizer
        frequencyHz={118200000}
        modulation="AM"
        squelchOpen={true}
        colorMap="amber"
      />
    );
    expect(screen.getByText(/CARRIER ACTIVE/i)).toHaveClass('text-amber-400');
  });

  test('respects showPassband prop to toggle passband overlay', () => {
    const mockCtx = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);

    render(
      <LiveSpectrumVisualizer
        frequencyHz={118200000}
        modulation="AM"
        showPassband={false}
      />
    );

    expect(mockCtx.strokeRect).not.toHaveBeenCalled();
  });
});
