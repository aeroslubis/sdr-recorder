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
  test('renders call list and filters by starred', () => {
    const handlePlay = jest.fn();
    const handleToggleStar = jest.fn();

    render(
      <CallLogPanel
        calls={sampleCalls}
        onPlay={handlePlay}
        onToggleStar={handleToggleStar}
      />
    );

    // Initial render displays all calls
    expect(screen.getByText(/14:32:10/i)).toBeInTheDocument();
    expect(screen.getByText(/14:28:45/i)).toBeInTheDocument();
    expect(screen.getByText(/14:15:00/i)).toBeInTheDocument();

    // Toggle starred filter
    const starredFilterBtn = screen.getByRole('button', { name: /starred/i });
    fireEvent.click(starredFilterBtn);

    // Only starred call (id: 1) should remain
    expect(screen.getByText(/14:32:10/i)).toBeInTheDocument();
    expect(screen.queryByText(/14:28:45/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/14:15:00/i)).not.toBeInTheDocument();
  });

  test('filters calls by search input query', () => {
    render(<CallLogPanel calls={sampleCalls} onPlay={jest.fn()} onToggleStar={jest.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Approach' } });

    expect(screen.getByText(/14:28:45/i)).toBeInTheDocument();
    expect(screen.queryByText(/14:32:10/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/14:15:00/i)).not.toBeInTheDocument();
  });

  test('triggers onPlay and onToggleStar callbacks', () => {
    const handlePlay = jest.fn();
    const handleToggleStar = jest.fn();

    render(
      <CallLogPanel
        calls={sampleCalls}
        onPlay={handlePlay}
        onToggleStar={handleToggleStar}
      />
    );

    // Click play on first item
    const playButtons = screen.getAllByRole('button', { name: /play call/i });
    fireEvent.click(playButtons[0]);
    expect(handlePlay).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

    // Click star toggle on second item
    const starButtons = screen.getAllByRole('button', { name: /star call/i });
    // Star toggle for call 2
    fireEvent.click(starButtons[1]);
    expect(handleToggleStar).toHaveBeenCalledWith(2, true);
  });

  test('displays empty state when no calls match criteria', () => {
    render(<CallLogPanel calls={[]} onPlay={jest.fn()} onToggleStar={jest.fn()} />);
    expect(screen.getByText(/no transmissions found/i)).toBeInTheDocument();
  });

  test('interacts with HistoryDatePicker navigation', () => {
    const handleDateChange = jest.fn();
    render(
      <CallLogPanel
        calls={sampleCalls}
        currentDate="2026-10-13"
        onDateChange={handleDateChange}
        activeDates={['2026-10-12', '2026-10-13']}
      />
    );

    // Click Yesterday
    const yesterdayBtn = screen.getByRole('button', { name: /yesterday/i });
    fireEvent.click(yesterdayBtn);
    expect(handleDateChange).toHaveBeenCalledWith('2026-10-12');

    // Click Tomorrow
    const tomorrowBtn = screen.getByRole('button', { name: /tomorrow/i });
    fireEvent.click(tomorrowBtn);
    expect(handleDateChange).toHaveBeenCalledWith('2026-10-14');

    // Open Calendar popover
    const calendarBtn = screen.getByRole('button', { name: /calendar/i });
    fireEvent.click(calendarBtn);
    expect(screen.getByText(/october 2026/i)).toBeInTheDocument();

    // Active dates dot should be present
    const dots = screen.getAllByLabelText('has-recording');
    expect(dots.length).toBeGreaterThan(0);
  });
});
