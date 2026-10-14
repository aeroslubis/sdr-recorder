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

    expect(screen.getByText(/Tidak Ada Perangkat SDR Terhubung/i)).toBeInTheDocument();
    expect(screen.getByText(/RECORDING RADIO STOPPED/i)).toBeInTheDocument();
    expect(screen.getByText(/DINONAKTIFKAN/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Cek Ulang Perangkat/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    const settingsBtn = screen.getByRole('button', { name: /Konfigurasi Dongle/i });
    fireEvent.click(settingsBtn);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: /Tutup Peringatan/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('does not render when isOpen is false', () => {
    render(<NoDeviceModal isOpen={false} />);
    expect(screen.queryByText(/Tidak Ada Perangkat SDR Terhubung/i)).not.toBeInTheDocument();
  });
});
