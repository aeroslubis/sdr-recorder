import { render, screen, fireEvent, act } from '@testing-library/react';
import { RadioTuningPanel } from '../components/RadioTuningPanel';
import { SMeterBar } from '../components/SMeterBar';
import { DongleConfigModal } from '../components/DongleConfigModal';
import { TopBar } from '../components/TopBar';

describe('RadioTuningPanel & SMeterBar & DongleConfigModal & TopBar', () => {
  test('displays clean read-only frequency without badge, hides add/trash buttons, and renders 3-dots menu with Edit/Activate/Delete', () => {
    const handleTune = jest.fn();
    const handleDeletePreset = jest.fn();
    render(
      <RadioTuningPanel
        frequencyHz={118200000}
        modulation="AM"
        squelchThreshold={-42.0}
        rssi={-65.0}
        squelchOpen={false}
        onTune={handleTune}
        onDeletePreset={handleDeletePreset}
        presets={[
          { id: 1, name: 'Haneda Tower', frequency_hz: 118200000, modulation: 'AM', category: 'Airband' },
          { id: 2, name: 'Tokyo Approach', frequency_hz: 119100000, modulation: 'AM', category: 'Airband' },
        ]}
      />
    );

    // Formatted frequency is displayed cleanly
    expect(screen.getByText(/118\.200\.000/i)).toBeInTheDocument();

    // No step increment/decrement buttons
    expect(screen.queryByRole('button', { name: /-1M/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+1M/i })).not.toBeInTheDocument();

    // No badge indicator on frequency display
    expect(screen.queryByText(/RECORDING LOCKED/i)).not.toBeInTheDocument();

    // No Add Preset button and no direct trash icons
    expect(screen.queryByText(/Add Preset/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Delete preset/i)).not.toBeInTheDocument();

    // Active preset has RECORDING label
    expect(screen.getByText(/● RECORDING/i)).toBeInTheDocument();

    // 3-dots menu button exists
    const moreBtns = screen.getAllByRole('button', { name: /Channel options/i });
    expect(moreBtns.length).toBe(2);
    fireEvent.click(moreBtns[1]); // click 3-dots on Tokyo Approach

    // Popup options appear: Edit, Activate/Aktif, Delete
    expect(screen.getByText(/Edit/i)).toBeInTheDocument();
    expect(screen.getByText(/Activate|Aktif/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();

    // Clicking Activate calls onTune
    fireEvent.click(screen.getByText(/Activate|Aktif/i));
    expect(handleTune).toHaveBeenCalledWith(expect.objectContaining({ frequencyHz: 119100000 }));
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
