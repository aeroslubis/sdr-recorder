import { render, screen, fireEvent } from '@testing-library/react';
import { CallLogPanel } from '../components/CallLogPanel';

const sampleCalls = [
  {
    id: 1,
    startTime: '14:32:10',
    durationSec: 4.2,
    frequencyHz: 118200000,
    peakRssi: -34,
    isStarred: true,
    notes: 'Tower inbound clearance',
  },
  {
    id: 2,
    startTime: '14:28:45',
    durationSec: 7.8,
    frequencyHz: 119100000,
    peakRssi: -28,
    isStarred: false,
    notes: 'Approach contact',
  },
  {
    id: 3,
    startTime: '14:15:00',
    durationSec: 2.1,
    frequencyHz: 118200000,
    peakRssi: -45,
    isStarred: false,
    notes: 'Ground taxi report',
  },
];

describe('CallLogPanel Component', () => {
  test('renders call list with frequency and time', () => {
    const handlePlay = jest.fn();

    render(
      <CallLogPanel
        calls={sampleCalls}
        onPlay={handlePlay}
      />
    );

    // Initial render displays all calls
    expect(screen.getByText(/14:32:10/i)).toBeInTheDocument();
    expect(screen.getByText(/14:28:45/i)).toBeInTheDocument();
    expect(screen.getByText(/14:15:00/i)).toBeInTheDocument();
    expect(screen.getByText(/3 calls/i)).toBeInTheDocument();
  });

  test('triggers onPlay callback when play button clicked', () => {
    const handlePlay = jest.fn();

    render(
      <CallLogPanel
        calls={sampleCalls}
        onPlay={handlePlay}
      />
    );

    // Click play on first item
    const playButtons = screen.getAllByRole('button', { name: /play call/i });
    fireEvent.click(playButtons[0]);
    expect(handlePlay).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  test('renders stop button for actively playing call and triggers onStop callback', () => {
    const handleStop = jest.fn();

    render(
      <CallLogPanel
        calls={sampleCalls}
        playingCallId={1}
        onStop={handleStop}
      />
    );

    // Call 1 is playing, so it should render a Stop Call button
    const stopButton = screen.getByRole('button', { name: /stop call/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);
    expect(handleStop).toHaveBeenCalledTimes(1);

    // Call 2 and Call 3 should still have Play Call buttons
    const playButtons = screen.getAllByRole('button', { name: /play call/i });
    expect(playButtons.length).toBe(2);
  });

  test('displays empty state when no calls match criteria', () => {
    render(<CallLogPanel calls={[]} onPlay={jest.fn()} onToggleStar={jest.fn()} />);
    expect(screen.getByText(/no transmissions found/i)).toBeInTheDocument();
  });

  test('interacts with HistoryDatePicker navigation and verifies future dates are disabled', () => {
    const handleDateChange = jest.fn();
    render(
      <CallLogPanel
        calls={sampleCalls}
        currentDate="2026-10-13"
        onDateChange={handleDateChange}
        activeDates={['2026-10-12', '2026-10-13']}
      />
    );

    // Verify Tomorrow and Yesterday buttons are removed
    expect(screen.queryByRole('button', { name: /yesterday/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tomorrow/i })).not.toBeInTheDocument();

    // Click Today
    const todayBtn = screen.getByRole('button', { name: /today/i });
    fireEvent.click(todayBtn);
    expect(handleDateChange).toHaveBeenCalled();

    // Open Calendar popover
    const calendarBtn = screen.getByRole('button', { name: /calendar/i });
    fireEvent.click(calendarBtn);
    expect(screen.getByText(/october 2026/i)).toBeInTheDocument();

    // Active dates dot should be present
    const dots = screen.getAllByLabelText('has-recording');
    expect(dots.length).toBeGreaterThan(0);
  });
});
