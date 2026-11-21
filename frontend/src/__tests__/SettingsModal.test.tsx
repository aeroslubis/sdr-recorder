import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsModal } from '../components/SettingsModal';

describe('SettingsModal', () => {
  const mockDongleConfig = {
    device_index: 0,
    ppm_offset: 0,
    rf_gain: 38.6,
    gain_mode: 'manual',
    bias_tee: 0,
    direct_sampling: 0,
    sample_rate: 2048000,
    pre_roll_ms: 500,
    hang_time_ms: 800,
  };

  test('renders unified settings modal with 5 tabs and switches between them', () => {
    render(
      <SettingsModal
        isOpen={true}
        initialTab="dongle"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[
          { id: 1, name: 'Haneda Tower', frequency_hz: 118200000, modulation: 'AM', category: 'Airband' },
        ]}
        onSavePreset={jest.fn()}
        onDeletePreset={jest.fn()}
        initialDongleConfig={mockDongleConfig}
      />
    );

    expect(screen.getByRole('tab', { name: /dongle/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /channel setup/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /recording setup/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /interface/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /password/i })).toBeInTheDocument();

    // Check default dongle tab content
    expect(screen.getByText(/Detected SDR Device/i)).toBeInTheDocument();

    // Switch to Channel Setup tab
    fireEvent.click(screen.getByRole('tab', { name: /channel setup/i }));
    expect(screen.getByText(/Haneda Tower/i)).toBeInTheDocument();
    expect(screen.getByText(/Add New Channel/i)).toBeInTheDocument();

    // Switch to Recording Setup tab
    fireEvent.click(screen.getByRole('tab', { name: /recording setup/i }));
    expect(screen.getByText(/Minimum Speech Duration/i)).toBeInTheDocument();
    expect(screen.getByText(/Server Timezone/i)).toBeInTheDocument();
    expect(screen.getByText(/Enable Squelch Tail & Pop Suppression/i)).toBeInTheDocument();

    // Switch to Interface tab
    fireEvent.click(screen.getByRole('tab', { name: /interface/i }));
    expect(screen.getByText(/Live SDR Spectrum Display/i)).toBeInTheDocument();
    expect(screen.getByText(/General Interface & Audio/i)).toBeInTheDocument();

    // Switch to Storage tab
    fireEvent.click(screen.getByRole('tab', { name: /storage/i }));
    expect(screen.getByText(/Retention Period/i)).toBeInTheDocument();
    expect(screen.getByText(/Maximum Disk Quota/i)).toBeInTheDocument();

    // Switch to Password tab
    fireEvent.click(screen.getByRole('tab', { name: /password/i }));
    expect(screen.getByLabelText(/Current Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm New Password/i)).toBeInTheDocument();
  });

  test('calls onSaveDongle when applying dongle settings', async () => {
    const handleSaveDongle = jest.fn();
    render(
      <SettingsModal
        isOpen={true}
        initialTab="dongle"
        onClose={jest.fn()}
        onSaveDongle={handleSaveDongle}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[]}
        initialDongleConfig={mockDongleConfig}
      />
    );

    const applyButton = screen.getByRole('button', { name: /Apply & Reconfigure Dongle/i });
    await act(async () => {
      fireEvent.click(applyButton);
    });

    expect(handleSaveDongle).toHaveBeenCalledWith(expect.objectContaining({
      rf_gain: 38.6,
      gain_mode: 'manual',
    }));
  });

  test('calls onRestartDongle when clicking Restart Device button and displays feedback', async () => {
    const handleRestartDongle = jest.fn().mockResolvedValue({ success: true });
    render(
      <SettingsModal
        isOpen={true}
        initialTab="dongle"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onRestartDongle={handleRestartDongle}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[]}
        initialDongleConfig={mockDongleConfig}
      />
    );

    const restartBtn = screen.getByRole('button', { name: /Restart Device/i });
    expect(restartBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(restartBtn);
    });

    expect(handleRestartDongle).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Device restarted successfully/i)).toBeInTheDocument();
  });

  test('validates frequency ranges correctly and displays error alert in UI when frequency exceeds Ham/Airband range', () => {
    const handleSavePreset = jest.fn();
    render(
      <SettingsModal
        isOpen={true}
        initialTab="channels"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[]}
        onSavePreset={handleSavePreset}
      />
    );

    // Click Add New Channel
    fireEvent.click(screen.getByText(/Add New Channel/i));

    const nameInput = screen.getByPlaceholderText(/e\.g\. Tower 1/i);
    const freqInput = screen.getByDisplayValue('118.200');
    const saveButton = screen.getByRole('button', { name: /Save Channel/i });

    // Enter channel name
    fireEvent.change(nameInput, { target: { value: 'High Band Test' } });

    // Enter frequency above Ham/Airband range (e.g. 500 MHz)
    fireEvent.change(freqInput, { target: { value: '500.000' } });

    // Error alert should be displayed
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Frequency exceeds allowed Ham\/Airband range/i)).toBeInTheDocument();

    // Trying to save should fail and not call onSavePreset
    fireEvent.click(saveButton);
    expect(handleSavePreset).not.toHaveBeenCalled();

    // Test Airband out-of-range (e.g. 150 MHz while Category is Airband)
    fireEvent.change(freqInput, { target: { value: '150.000' } });
    expect(screen.getByText(/Airband frequency must be between 108.000 MHz and 137.000 MHz/i)).toBeInTheDocument();
    fireEvent.click(saveButton);
    expect(handleSavePreset).not.toHaveBeenCalled();

    // Valid Airband frequency (e.g. 121.500)
    fireEvent.change(freqInput, { target: { value: '121.500' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(handleSavePreset).toHaveBeenCalledWith({
      name: 'High Band Test',
      frequency_hz: 121500000,
      modulation: 'AM',
      category: 'Airband',
      squelch_threshold: -42.0,
    });
  });

  test('allows editing an existing channel preset in Channel Setup tab', () => {
    const handleSavePreset = jest.fn();
    render(
      <SettingsModal
        isOpen={true}
        initialTab="channels"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[
          { id: 1, name: 'Haneda Tower', frequency_hz: 118200000, modulation: 'AM', category: 'Airband' },
        ]}
        onSavePreset={handleSavePreset}
      />
    );

    // Edit button exists
    const editBtn = screen.getByRole('button', { name: /Edit Haneda Tower/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // Edit form appears
    expect(screen.getByText(/Edit Channel Preset: Haneda Tower/i)).toBeInTheDocument();
    const updateBtn = screen.getByRole('button', { name: /Update Channel/i });
    expect(updateBtn).toBeInTheDocument();

    fireEvent.click(updateBtn);
    expect(handleSavePreset).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      name: 'Haneda Tower',
      frequency_hz: 118200000,
    }));
  });

  test('renders Interface tab and does not render any Logs tab', () => {
    render(
      <SettingsModal
        isOpen={true}
        initialTab="interface"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[]}
      />
    );

    // Interface tab must exist and be selected
    const interfaceTab = screen.getByRole('tab', { name: /interface/i });
    expect(interfaceTab).toBeInTheDocument();
    expect(screen.getByText(/Live SDR Spectrum Display/i)).toBeInTheDocument();

    // Logs tab must NOT exist
    expect(screen.queryByRole('tab', { name: /logs/i })).toBeNull();
    expect(screen.queryByText(/Backend System Logs/i)).toBeNull();
  });

  test('renders Interface tab fully in English and without scanner hopping options', () => {
    render(
      <SettingsModal
        isOpen={true}
        initialTab="interface"
        onClose={jest.fn()}
        onSaveDongle={jest.fn()}
        onSaveStorage={jest.fn()}
        onChangePassword={jest.fn()}
        presets={[]}
      />
    );

    // English labels
    expect(screen.getByText(/Live SDR Spectrum Display/i)).toBeInTheDocument();
    expect(screen.getByText(/Color Palette/i)).toBeInTheDocument();
    expect(screen.getByText(/Refresh Rate \(FPS \/ CPU Efficiency\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Show Filter Passband Overlay/i)).toBeInTheDocument();
    expect(screen.getByText(/General Interface & Audio Preferences/i)).toBeInTheDocument();
    expect(screen.getByText(/Time Display Format/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Timeline Scrubber Density/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Show Seconds in Header Clock/i)).toBeInTheDocument();
    expect(screen.getByText(/Continuous Call Playback \(Auto-play Next\)/i)).toBeInTheDocument();

    // No scanner / hopping residuals
    expect(screen.queryByText(/Multichannel Hopping/i)).toBeNull();
    expect(screen.queryByText(/scanning cepat/i)).toBeNull();
    expect(screen.queryByText(/Skema Warna/i)).toBeNull();
  });
});
