import { render, screen, fireEvent, act } from '@testing-library/react';
import { RadioTuningPanel } from '../components/RadioTuningPanel';
import { SMeterBar } from '../components/SMeterBar';
import { DongleConfigModal } from '../components/DongleConfigModal';
import { TopBar } from '../components/TopBar';

describe('RadioTuningPanel & SMeterBar & DongleConfigModal & TopBar', () => {
  test('displays frequency controls, modulation buttons, and squelch slider', () => {
    const handleTune = jest.fn();
    render(
      <RadioTuningPanel
        frequencyHz={118200000}
        modulation="AM"
        squelchThreshold={-42.0}
        rssi={-65.0}
        squelchOpen={false}
        onTune={handleTune}
      />
    );

    // Formatted frequency
    expect(screen.getByText(/118\.200\.000/i)).toBeInTheDocument();
    // Modulation buttons
    expect(screen.getByText(/AM \(Airband\)/i)).toBeInTheDocument();
    expect(screen.getByText(/NFM \(VHF\/UHF\)/i)).toBeInTheDocument();

    // Quick step buttons
    expect(screen.getByRole('button', { name: /-1M/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+1M/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /-25k/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+25k/i })).toBeInTheDocument();
  });

  test('calls onTune when step buttons or modulation are clicked', () => {
    const handleTune = jest.fn();
    render(
      <RadioTuningPanel
        frequencyHz={118200000}
        modulation="AM"
        squelchThreshold={-42.0}
        rssi={-50.0}
        squelchOpen={true}
        onTune={handleTune}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /\+1M/i }));
    expect(handleTune).toHaveBeenCalledWith(expect.objectContaining({ frequencyHz: 119200000 }));

    fireEvent.click(screen.getByText(/NFM \(VHF\/UHF\)/i));
    expect(handleTune).toHaveBeenCalledWith(expect.objectContaining({ modulation: 'NFM' }));
  });

  test('SMeterBar renders RSSI value, squelch needle, and open/closed state', () => {
    const handleSquelchChange = jest.fn();
    const { rerender } = render(
      <SMeterBar
        rssi={-35.0}
        squelchThreshold={-42.0}
        squelchOpen={true}
        onSquelchChange={handleSquelchChange}
      />
    );

    expect(screen.getByText(/-35\.0 dBFS/i)).toBeInTheDocument();
    expect(screen.getByText(/OPEN/i)).toBeInTheDocument();

    rerender(
      <SMeterBar
        rssi={-70.0}
        squelchThreshold={-42.0}
        squelchOpen={false}
        onSquelchChange={handleSquelchChange}
      />
    );
    expect(screen.getByText(/-70\.0 dBFS/i)).toBeInTheDocument();
    expect(screen.getByText(/CLOSED/i)).toBeInTheDocument();
  });

  test('DongleConfigModal renders BrowSDR settings and handles save/restart', async () => {
    const handleSave = jest.fn();
    const handleRestart = jest.fn();
    const handleClose = jest.fn();

    render(
      <DongleConfigModal
        isOpen={true}
        onClose={handleClose}
        onSave={handleSave}
        onRestart={handleRestart}
        initialConfig={{
          device_index: 0,
          ppm_offset: 2,
          rf_gain: 38.6,
          gain_mode: 'manual',
          bias_tee: 0,
          direct_sampling: 0,
          sample_rate: 2048000,
          pre_roll_ms: 500,
          hang_time_ms: 800,
        }}
      />
    );

    expect(screen.getByText(/SDR Dongle Configuration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/PPM Correction/i)).toBeInTheDocument();
    expect(screen.getByText(/Save & Apply/i)).toBeInTheDocument();
    expect(screen.getByText(/Restart Tuner/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText(/Save & Apply/i));
    });
    expect(handleSave).toHaveBeenCalled();
  });

  test('TopBar displays brand, hardware status, storage quota, and admin dropdown', () => {
    const handleOpenDongleConfig = jest.fn();
    const handleLogout = jest.fn();

    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        isSimulator={false}
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenDongleConfig={handleOpenDongleConfig}
        onLogout={handleLogout}
      />
    );

    expect(screen.getByText(/\[●\] SDR-NVR/i)).toBeInTheDocument();
    expect(screen.getByText(/118\.200 MHz · AM/i)).toBeInTheDocument();
    expect(screen.getByText(/RTL-SDR ONLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/DISK: 14\.8 GB \/ 100 GB \(15%\)/i)).toBeInTheDocument();

    // Admin dropdown
    const adminButton = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(adminButton);

    expect(screen.getByText(/SDR Dongle Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Storage & Retention/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign Out/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/SDR Dongle Configuration/i));
    expect(handleOpenDongleConfig).toHaveBeenCalledTimes(1);

    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Sign Out/i));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});
