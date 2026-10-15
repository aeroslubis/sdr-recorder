import { render, screen, fireEvent } from '@testing-library/react';
import { NoDeviceModal } from '../components/NoDeviceModal';

describe('NoDeviceModal', () => {
  test('renders warning popup when isOpen is true with clear warning message', () => {
    const handleRetry = jest.fn();
    const handleOpenSettings = jest.fn();
    const handleClose = jest.fn();

    render(
      <NoDeviceModal
        isOpen={true}
        onRetry={handleRetry}
        onOpenSettings={handleOpenSettings}
        onClose={handleClose}
      />
    );

    expect(screen.getByText(/No SDR Hardware Device Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/RADIO RECORDING STOPPED/i)).toBeInTheDocument();
    expect(screen.getByText(/HALTED \(NO HARDWARE\)/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Retry Device Detection/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    const settingsBtn = screen.getByRole('button', { name: /Dongle Configuration/i });
    fireEvent.click(settingsBtn);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: /Close Alert/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('does not render when isOpen is false', () => {
    render(<NoDeviceModal isOpen={false} />);
    expect(screen.queryByText(/No SDR Hardware Device Connected/i)).not.toBeInTheDocument();
  });
});
