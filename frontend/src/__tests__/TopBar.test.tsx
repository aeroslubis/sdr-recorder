import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '../components/TopBar';

describe('TopBar', () => {
  test('displays professional SDR RECORDER brand and clean hardware status', () => {
    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        isSimulator={false}
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenSettings={jest.fn()}
        onLogout={jest.fn()}
      />
    );

    // Rebranded name
    expect(screen.getByText(/\[●\] SDR RECORDER/i)).toBeInTheDocument();
    // Does not have NVR
    expect(screen.queryByText(/SDR-NVR/i)).not.toBeInTheDocument();

    // Hardware status has text without duplicate bullet icon
    const hwText = screen.getByText('RTL-SDR ONLINE');
    expect(hwText).toBeInTheDocument();
  });

  test('clicking admin menu options triggers onOpenSettings with correct tabs', () => {
    const handleOpenSettings = jest.fn();
    const handleLogout = jest.fn();

    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        isSimulator={false}
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
      />
    );

    const adminButton = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(adminButton);

    // Verify only Settings and Sign Out appear in menu
    expect(screen.getByText(/⚙ Settings/i)).toBeInTheDocument();
    expect(screen.getByText(/🚪 Sign Out/i)).toBeInTheDocument();
    expect(screen.queryByText(/Channel Setup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage & Retention Manager/i)).not.toBeInTheDocument();

    // Click Settings
    fireEvent.click(screen.getByText(/⚙ Settings/i));
    expect(handleOpenSettings).toHaveBeenCalledWith('dongle');

    // Open menu again & click Sign Out
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Sign Out/i));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});
