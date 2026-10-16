import { render, screen, fireEvent } from '@testing-library/react';
import { timeMsToCanvasX, canvasXToTimeMs, formatMsToTime } from '../components/timelineUtils';
import { TimelineScrubber } from '../components/TimelineScrubber';
import { PlaybackControls } from '../components/PlaybackControls';
import { WebAudioPlayer } from '../audio/WebAudioPlayer';

describe('Timeline Scrubber & Math Projection', () => {
  test('projects 24h timestamps to canvas pixels reversibly', () => {
    const canvasWidth = 1200;
    const viewStartMs = 0;
    const viewEndMs = 86400000; // 24 hours in ms
    const testTime = 43200000; // Noon (12:00:00)

    const x = timeMsToCanvasX(testTime, viewStartMs, viewEndMs, canvasWidth);
    expect(x).toBeCloseTo(600, 1);
    const reverted = canvasXToTimeMs(x, viewStartMs, viewEndMs, canvasWidth);
    expect(reverted).toBeCloseTo(testTime, 0);
  });

  test('formats ms to HH:MM:SS format correctly', () => {
    expect(formatMsToTime(0)).toBe('00:00:00');
    expect(formatMsToTime(43200000)).toBe('12:00:00');
    expect(formatMsToTime(86399000)).toBe('23:59:59');
  });

  test('renders TimelineScrubber with zoom presets, playhead, and canvas', () => {
    const handleSeek = jest.fn();
    const handleSelect = jest.fn();

    render(
      <TimelineScrubber
        date="2026-10-13"
        currentTimeMs={3600000}
        transmissions={[
          {
            id: 1,
            start_ms: 3500000,
            end_ms: 3700000,
            peak_rssi: -38.5,
            duration_sec: 200,
          },
        ]}
        onSeek={handleSeek}
        onSelectTransmission={handleSelect}
      />
    );

    // Check zoom preset buttons
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '15m' })).toBeInTheDocument();

    // Check date display
    const dateElements = screen.getAllByText(/2026-10-13/);
    expect(dateElements.length).toBeGreaterThan(0);

    // Check canvas exists
    const canvas = screen.getByTestId('timeline-canvas');
    expect(canvas).toBeInTheDocument();

    // Switching presets
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(screen.getByRole('button', { name: '1h' })).toHaveClass('bg-phosphor-green');

    // Pan buttons
    fireEvent.click(screen.getByRole('button', { name: /Pan Right/i }));
    fireEvent.click(screen.getByRole('button', { name: /Pan Left/i }));

    // Canvas click
    fireEvent.pointerDown(canvas, { clientX: 200, pointerId: 1 });
    expect(handleSeek).toHaveBeenCalled();
  });
});

describe('PlaybackControls Component', () => {
  test('renders playback buttons, speed selector, and volume slider', () => {
    const handlePlayPause = jest.fn();
    const handlePrev = jest.fn();
    const handleNext = jest.fn();
    const handleSpeed = jest.fn();
    const handleVolume = jest.fn();

    render(
      <PlaybackControls
        isPlaying={false}
        onPlayPause={handlePlayPause}
        onPrevCall={handlePrev}
        onNextCall={handleNext}
        playbackRate={1.0}
        onPlaybackRateChange={handleSpeed}
        volume={0.8}
        onVolumeChange={handleVolume}
      />
    );

    // Play button
    const playBtn = screen.getByRole('button', { name: /Play/i });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(handlePlayPause).toHaveBeenCalledTimes(1);

    // Prev / Next buttons
    const prevBtn = screen.getByRole('button', { name: /Prev/i });
    fireEvent.click(prevBtn);
    expect(handlePrev).toHaveBeenCalledTimes(1);

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextBtn);
    expect(handleNext).toHaveBeenCalledTimes(1);

    // Volume change (located right next to playback controls)
    const volumeSlider = screen.getByLabelText(/Volume slider/i);
    expect(volumeSlider).toBeInTheDocument();
    fireEvent.change(volumeSlider, { target: { value: '0.4' } });
    expect(handleVolume).toHaveBeenCalledWith(0.4);

    // Speed selector
    const speed2x = screen.getByRole('button', { name: /2\.0x/i });
    fireEvent.click(speed2x);
    expect(handleSpeed).toHaveBeenCalledWith(2.0);
  });
});

describe('WebAudioPlayer DSP Engine', () => {
  test('initializes AudioContext, gain node, and bandpass biquad filter', () => {
    const player = new WebAudioPlayer();
    expect(player).toBeDefined();
    expect(player.getDspFilter()).toBe(false);

    player.setDspFilter(true);
    expect(player.getDspFilter()).toBe(true);

    player.setVolume(0.5);
    expect(player.getVolume()).toBe(0.5);

    player.setPlaybackRate(1.5);
    expect(player.getPlaybackRate()).toBe(1.5);

    player.seek(10);
    player.pause();
    player.stop();

    player.destroy();
  });
});
