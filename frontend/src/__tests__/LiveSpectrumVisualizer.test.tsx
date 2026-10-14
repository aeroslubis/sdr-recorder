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
});
