import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { TopBar } from './TopBar';
import { RadioTuningPanel, PresetItem } from './RadioTuningPanel';
import { TimelineScrubber, TransmissionInterval } from './TimelineScrubber';
import { PlaybackControls } from './PlaybackControls';
import { CallLogPanel, CallLogItem } from './CallLogPanel';
import { SettingsModal, SettingsTab, StorageSettings } from './SettingsModal';
import { LiveSpectrumVisualizer } from './LiveSpectrumVisualizer';
import { DongleHardwareConfig } from './DongleConfigModal';
import { WebAudioPlayer } from '../audio/WebAudioPlayer';
import { formatDate } from './HistoryDatePicker';
import { NoDeviceModal } from './NoDeviceModal';

export interface DashboardLayoutProps {
  className?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ className = '' }) => {
  const { user, token, logout } = useAuth();

  // Selected date for playback
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(new Date()));
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [serverTimeStr, setServerTimeStr] = useState<string>('');
  const [serverTzStr, setServerTzStr] = useState<string>('');

  // Hardware and Radio state
  const [frequencyHz, setFrequencyHz] = useState<number>(118200000);
  const [modulation, setModulation] = useState<string>('AM');
  const [squelchThreshold, setSquelchThreshold] = useState<number>(-42.0);
  const [rfGain, setRfGain] = useState<number>(38.6);
  const [ppmOffset, setPpmOffset] = useState<number>(0);
  const [hardwareConnected, setHardwareConnected] = useState<boolean>(true);
  const [dismissedNoDeviceModal, setDismissedNoDeviceModal] = useState<boolean>(false);

  useEffect(() => {
    if (hardwareConnected) {
      setDismissedNoDeviceModal(false);
    }
  }, [hardwareConnected]);

  const [presets, setPresets] = useState<PresetItem[]>([]);

  // Live WebSocket Telemetry & Audio Streaming
  const [liveRssi, setLiveRssi] = useState<number>(-75.0);
  const [squelchOpen, setSquelchOpen] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [liveUnsquelched, setLiveUnsquelched] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const volumeRef = useRef<number>(0.8);
  const savedVolumeRef = useRef<number>(0.8);
  const savedAutoSquelchRef = useRef<number>(-42.0);
  const [isAutoSquelch, setIsAutoSquelch] = useState<boolean>(false);

  // Archive & Timeline state
  const [timelineTransmissions, setTimelineTransmissions] = useState<TransmissionInterval[]>([]);
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [dspFilterActive, setDspFilterActive] = useState<boolean>(false);
  const [activeCallTitle, setActiveCallTitle] = useState<string>('');

  // Unified Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('dongle');
  const [storageSettings, setStorageSettings] = useState<StorageSettings>({
    retention_days: 14,
    max_disk_usage_percent: 90,
    audio_format: 'opus',
  });
  const [diskUsedGB, setDiskUsedGB] = useState<number>(0);
  const [diskTotalGB, setDiskTotalGB] = useState<number>(0);

  // Audio player ref
  const audioPlayerRef = useRef<WebAudioPlayer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const selectedIntervalRef = useRef<TransmissionInterval | null>(null);

  // Initialize WebAudioPlayer
  useEffect(() => {
    const player = new WebAudioPlayer();
    audioPlayerRef.current = player;

    player.onStateChange = (playing) => {
      setIsPlaying(playing);
    };

    player.onTimeUpdate = (currentTimeSec) => {
      if (selectedIntervalRef.current) {
        setCurrentTimeMs(selectedIntervalRef.current.start_ms + currentTimeSec * 1000);
      }
    };

    player.onEnded = () => {
      setIsPlaying(false);
    };

    return () => {
      player.stop();
      audioPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(volume);
    }
  }, [volume]);

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setDspFilter(dspFilterActive);
    }
  }, [dspFilterActive]);

  // Auth fetch helper
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(url, { ...options, headers });
    },
    [token]
  );

  // Storage Stats Fetcher
  const fetchStorageStats = useCallback(() => {
    authFetch('/api/system/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.storage) {
          const used = data.storage.used_gb ?? (data.storage.used_bytes ? data.storage.used_bytes / (1024 ** 3) : 0);
          const total = data.storage.total_gb ?? (data.storage.total_bytes ? data.storage.total_bytes / (1024 ** 3) : 0);
          setDiskUsedGB(Math.round(used * 10) / 10);
          setDiskTotalGB(Math.round(total * 10) / 10);
        }
        if (typeof data?.hardware_connected === 'boolean') {
          setHardwareConnected(data.hardware_connected);
        }
      })
      .catch(() => {});
  }, [authFetch]);

  // Resume Web AudioContext on first user interaction to satisfy browser autoplay policy
  useEffect(() => {
    const unlockAudio = () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.resumeContext().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Fetch initial Radio status, presets, active dates & system storage settings
  useEffect(() => {
    authFetch('/api/radio/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.frequency_hz) setFrequencyHz(data.frequency_hz);
          if (data.modulation) setModulation(data.modulation);
          if (data.squelch_threshold !== undefined) {
            setSquelchThreshold(data.squelch_threshold);
            if (data.squelch_threshold > -98) {
              savedAutoSquelchRef.current = data.squelch_threshold;
            }
          }
          if (data.rf_gain !== undefined) setRfGain(data.rf_gain);
          if (data.ppm_offset !== undefined) setPpmOffset(data.ppm_offset);
          if (data.hardware_connected !== undefined) setHardwareConnected(data.hardware_connected);
        }
      })
      .catch(() => {});

    authFetch('/api/radio/presets')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PresetItem[]) => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch(() => {});

    authFetch('/api/recordings/active-dates')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data)) setActiveDates(data);
      })
      .catch(() => {});

    authFetch('/api/system/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStorageSettings(data);
      })
      .catch(() => {});

    authFetch('/api/system/time')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.server_time_formatted) {
            setServerTimeStr(data.server_time_formatted.slice(11, 19));
          }
          if (data.tz_abbreviation) {
            setServerTzStr(data.tz_abbreviation);
          }
          if (data.server_time_iso && data.server_time_iso.length >= 10) {
            setSelectedDate(data.server_time_iso.slice(0, 10));
          }
        }
      })
      .catch(() => {});
  }, [authFetch]);

  // Fetch real-time storage stats on mount and poll periodically (every 30s)
  useEffect(() => {
    fetchStorageStats();
    const interval = setInterval(fetchStorageStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStorageStats]);

  // Clock ticker every second
  useEffect(() => {
    const timer = setInterval(() => {
      setServerTimeStr((prev) => {
        if (!prev || prev.length < 8) return prev;
        const [h, m, s] = prev.split(':').map(Number);
        if (isNaN(h) || isNaN(m) || isNaN(s)) return prev;
        const nextSec = s + 1;
        const carryMin = Math.floor(nextSec / 60);
        const newS = nextSec % 60;
        const nextMin = m + carryMin;
        const carryHour = Math.floor(nextMin / 60);
        const newM = nextMin % 60;
        const newH = (h + carryHour) % 24;
        return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:${String(newS).padStart(2, '0')}`;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch timeline intervals and call log when selectedDate changes
  useEffect(() => {
    authFetch(`/api/recordings/timeline?date=${selectedDate}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TransmissionInterval[]) => {
        if (Array.isArray(data)) {
          setTimelineTransmissions(data);
        }
      })
      .catch(() => {});

    authFetch(`/api/recordings?date=${selectedDate}&limit=200`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CallLogItem[]) => {
        if (Array.isArray(data)) {
          setCalls(data);
        }
      })
      .catch(() => {});
  }, [authFetch, selectedDate]);

  // WebSocket Live Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    let socket: WebSocket;
    let isCancelled = false;

    try {
      socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isCancelled) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      };

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'telemetry') {
              if (msg.rssi_dbfs !== undefined) setLiveRssi(msg.rssi_dbfs);
              if (msg.squelch_open !== undefined) setSquelchOpen(msg.squelch_open);
              if (msg.recording !== undefined) setIsRecording(msg.recording);
              if (msg.frequency_hz !== undefined) setFrequencyHz(msg.frequency_hz);
              if (msg.modulation !== undefined) setModulation(msg.modulation);
              if (msg.hardware_connected !== undefined) setHardwareConnected(msg.hardware_connected);
            }
          } catch {}
        } else if (event.data instanceof ArrayBuffer) {
          if (volumeRef.current > 0 && audioPlayerRef.current) {
            audioPlayerRef.current.playPcmChunk(event.data, 24000);
          }
        }
      };

      socket.onerror = () => {};
    } catch {}

    return () => {
      isCancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  // Handle Radio Tuning
  const handleTune = async (params: {
    frequencyHz?: number;
    modulation?: string;
    squelchThreshold?: number;
    rfGain?: number;
    ppmOffset?: number;
  }) => {
    // Optimistic UI updates
    if (params.frequencyHz) setFrequencyHz(params.frequencyHz);
    if (params.modulation) setModulation(params.modulation);
    if (params.squelchThreshold !== undefined) {
      setSquelchThreshold(params.squelchThreshold);
      if (params.squelchThreshold <= -98) {
        setLiveUnsquelched(true);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'listen', unsquelched: true }));
        }
      } else {
        savedAutoSquelchRef.current = params.squelchThreshold;
        setLiveUnsquelched(false);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'listen', unsquelched: false }));
        }
      }
      // If user manually adjusts squelch or selects a preset, exit Auto Squelch mode
      setIsAutoSquelch(false);
    }
    if (params.rfGain !== undefined) setRfGain(params.rfGain);
    if (params.ppmOffset !== undefined) setPpmOffset(params.ppmOffset);

    try {
      const res = await authFetch('/api/radio/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frequency_hz: params.frequencyHz,
          modulation: params.modulation,
          squelch_threshold: params.squelchThreshold,
          rf_gain: params.rfGain,
          ppm_offset: params.ppmOffset,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.frequency_hz) setFrequencyHz(data.frequency_hz);
        if (data.modulation) setModulation(data.modulation);
        if (data.squelch_threshold !== undefined) setSquelchThreshold(data.squelch_threshold);
        if (data.rf_gain !== undefined) setRfGain(data.rf_gain);
        if (data.ppm_offset !== undefined) setPpmOffset(data.ppm_offset);
      }
    } catch {}
  };

  // Toggle Auto Squelch mode: triggers hardware calibration probe on active frequency
  const handleToggleAutoSquelch = async () => {
    const nextAuto = !isAutoSquelch;
    setIsAutoSquelch(nextAuto);
    if (nextAuto) {
      try {
        const res = await authFetch('/api/radio/auto-squelch', {
          method: 'POST',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.squelch_threshold !== undefined) {
            setSquelchThreshold(data.squelch_threshold);
            savedAutoSquelchRef.current = data.squelch_threshold;
          }
        } else {
          const optimal = Math.min(-15.0, Math.max(-85.0, Math.round((liveRssi + 6.0) * 10) / 10));
          setSquelchThreshold(optimal);
          savedAutoSquelchRef.current = optimal;
        }
      } catch {
        const optimal = Math.min(-15.0, Math.max(-85.0, Math.round((liveRssi + 6.0) * 10) / 10));
        setSquelchThreshold(optimal);
      }
    }
  };

  // Presets Handlers
  const handleCreatePreset = async (preset: Omit<PresetItem, 'id'> | PresetItem) => {
    try {
      const isUpdate = 'id' in preset && preset.id !== undefined && preset.id !== null;
      const url = isUpdate ? `/api/radio/presets/${preset.id}` : '/api/radio/presets';
      const method = isUpdate ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset),
      });
      if (res.ok) {
        const saved = await res.json();
        setPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
      }
    } catch {}
  };

  const handleDeletePreset = async (presetId: number) => {
    try {
      const res = await authFetch(`/api/radio/presets/${presetId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
      }
    } catch {}
  };

  // Timeline & Playback
  const handleTimelineSeek = (timeMs: number) => {
    setCurrentTimeMs(timeMs);
    const matched = timelineTransmissions.find(
      (t) => timeMs >= t.start_ms && timeMs <= t.end_ms
    );
    if (matched) {
      handleSelectTransmission(matched.id);
    }
  };

  const handleSelectTransmission = (id: number) => {
    setSelectedCallId(id);
    const call = calls.find((c) => c.id === id);
    if (call) {
      const freq = ((call.frequency_hz || call.frequencyHz || 0) / 1e6).toFixed(3);
      const time = (call.start_time || call.startTime || '').slice(11, 19);
      setActiveCallTitle(`${freq} MHz · ${time}`);
    }
    const matchedInterval = timelineTransmissions.find((t) => t.id === id);
    selectedIntervalRef.current = matchedInterval || null;
    if (matchedInterval) {
      setCurrentTimeMs(matchedInterval.start_ms);
    }
  };

  const handlePlayCall = async (id: number) => {
    handleSelectTransmission(id);
    const authToken = token || localStorage.getItem('sdr_auth_token') || sessionStorage.getItem('sdr_auth_token') || '';
    const audioUrl = `/api/recordings/${id}/audio${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
    if (audioPlayerRef.current) {
      try {
        await audioPlayerRef.current.playUrl(audioUrl);
      } catch {}
    }
  };

  const handlePlayPause = async () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      if (selectedCallId) {
        const authToken = token || localStorage.getItem('sdr_auth_token') || sessionStorage.getItem('sdr_auth_token') || '';
        const audioUrl = `/api/recordings/${selectedCallId}/audio${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`;
        try {
          await audioPlayerRef.current.playUrl(audioUrl);
        } catch {}
      } else if (calls.length > 0) {
        handlePlayCall(calls[0].id);
      }
    }
  };

  const handlePrevCall = () => {
    if (!calls.length) return;
    const currentIndex = calls.findIndex((c) => c.id === selectedCallId);
    if (currentIndex > 0) {
      handlePlayCall(calls[currentIndex - 1].id);
    } else {
      handlePlayCall(calls[0].id);
    }
  };

  const handleNextCall = () => {
    if (!calls.length) return;
    const currentIndex = calls.findIndex((c) => c.id === selectedCallId);
    if (currentIndex >= 0 && currentIndex < calls.length - 1) {
      handlePlayCall(calls[currentIndex + 1].id);
    } else if (calls.length > 0) {
      handlePlayCall(calls[calls.length - 1].id);
    }
  };

  const handleToggleStar = async (id: number) => {
    try {
      const res = await authFetch(`/api/recordings/${id}/star`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCalls((prev) =>
          prev.map((c) => (c.id === id ? { ...c, is_starred: data.is_starred } : c))
        );
        setTimelineTransmissions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_starred: data.is_starred } : t))
        );
      }
    } catch {}
  };

  const handleExportClip = async (id?: number) => {
    const targetId = id || selectedCallId;
    if (!targetId) return;
    const authToken = token || localStorage.getItem('sdr_auth_token') || sessionStorage.getItem('sdr_auth_token') || '';

    // Find call record to build a clean filename with frequency, time, and true extension
    const call = calls.find((c) => c.id === targetId);
    let filename = `transmission_${targetId}.opus`;
    if (call) {
      const freq = ((call.frequency_hz || call.frequencyHz || 0) / 1e6).toFixed(3);
      const rawTime = (call.start_time || call.startTime || '').replace(/[-:]/g, '').replace('T', '_');
      const timeClean = rawTime.split('.')[0] || `${targetId}`;
      const ext = call.file_path?.endsWith('.wav') ? 'wav' : 'opus';
      filename = `ch_${freq}MHz_${timeClean}.${ext}`;
    }

    try {
      const res = await fetch(`/api/recordings/${targetId}/audio?download=true`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) throw new Error('Download request failed');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      // Fallback with authenticated token query param
      const a = document.createElement('a');
      a.href = `/api/recordings/${targetId}/audio?download=true${authToken ? `&token=${encodeURIComponent(authToken)}` : ''}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Unified Live & Playback Volume Control Handler
  const handleVolumeChange = async (newVol: number) => {
    setVolume(newVol);
    volumeRef.current = newVol;
    if (newVol > 0) {
      savedVolumeRef.current = newVol;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(newVol);
      if (newVol > 0) {
        await audioPlayerRef.current.resumeContext();
      }
    }
  };

  // Live Unsquelch Monitor toggle (synchronized with Squelch slider)
  const handleToggleLiveMonitor = async () => {
    const nextState = !liveUnsquelched;
    setLiveUnsquelched(nextState);
    if (nextState && audioPlayerRef.current) {
      await audioPlayerRef.current.resumeContext();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'listen', unsquelched: nextState }));
    }
    const targetThreshold = nextState ? -100 : (savedAutoSquelchRef.current || -42.0);
    setSquelchThreshold(targetThreshold);
    try {
      await authFetch('/api/radio/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squelch_threshold: targetThreshold }),
      });
    } catch {}
  };

  // Dongle Save Config Handler
  const handleSaveDongleConfig = async (newConfig: DongleHardwareConfig) => {
    try {
      await authFetch('/api/radio/dongle-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (newConfig.rf_gain !== undefined) setRfGain(newConfig.rf_gain);
      if (newConfig.ppm_offset !== undefined) setPpmOffset(newConfig.ppm_offset);
    } catch {}
  };

  // Storage Save Config Handler
  const handleSaveStorageConfig = async (newSettings: StorageSettings) => {
    try {
      const res = await authFetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setStorageSettings(data);
        fetchStorageStats();
      }
    } catch {}
  };

  // Change Password Handler
  const handleChangePassword = async (passwords: { old_password: string; new_password: string }) => {
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwords),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.detail || 'Failed to change password' };
    }
    return { success: true };
  };

  // Re-check SDR Dongle Hardware Connection
  const handleRetryCheckDevice = async () => {
    try {
      const res = await authFetch('/api/radio/status');
      if (res.ok) {
        const data = await res.json();
        if (data.hardware_connected !== undefined) {
          setHardwareConnected(data.hardware_connected);
          if (data.hardware_connected) {
            setDismissedNoDeviceModal(false);
          }
        }
      }
    } catch {}
  };

  return (
    <div className={`h-screen max-h-screen overflow-hidden bg-obsidian text-snow flex flex-col font-circular ${className}`}>
      {/* 1. TopBar Header */}
      <TopBar
        frequencyHz={frequencyHz}
        modulation={modulation}
        hardwareConnected={hardwareConnected}
        diskUsedGB={diskUsedGB}
        diskTotalGB={diskTotalGB}
        username={user?.username || 'admin'}
        serverTime={serverTimeStr}
        serverTimezone={serverTzStr}
        onOpenSettings={(tab) => {
          setSettingsTab(tab);
          setIsSettingsOpen(true);
        }}
        onLogout={logout}
      />

      {/* 2. Responsive 3-Column Dashboard Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Radio Tuning Panel (300px) */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 bg-obsidian/40 overflow-y-auto h-full min-h-0">
          <RadioTuningPanel
            frequencyHz={frequencyHz}
            modulation={modulation}
            squelchThreshold={squelchThreshold}
            rfGain={rfGain}
            ppmOffset={ppmOffset}
            rssi={liveRssi}
            squelchOpen={squelchOpen}
            presets={presets}
            dspFilterActive={dspFilterActive}
            onToggleDspFilter={() => setDspFilterActive(!dspFilterActive)}
            isAutoSquelch={isAutoSquelch}
            onToggleAutoSquelch={handleToggleAutoSquelch}
            liveUnsquelched={liveUnsquelched}
            onToggleLiveMonitor={handleToggleLiveMonitor}
            onTune={handleTune}
            onCreatePreset={handleCreatePreset}
            onUpdatePreset={handleCreatePreset}
            onDeletePreset={handleDeletePreset}
          />
        </div>

        {/* Center Column: Live Monitor, Spectrum, Timeline Scrubber & Playback Controls */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden p-3 md:p-4 gap-3 bg-obsidian h-full">
          {/* Live Audio Monitor & Telemetry Bar */}
          <div className="bg-ash/80 backdrop-blur border border-charcoal rounded-cards px-4 py-2.5 flex items-center justify-between gap-3 select-none shrink-0">
            {/* Live Reception Status */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  !hardwareConnected
                    ? 'bg-red-500'
                    : isRecording
                    ? 'bg-red-500 animate-ping'
                    : squelchOpen
                    ? 'bg-phosphor-green animate-pulse'
                    : 'bg-smoke'
                }`}
              />
              <span className="font-semibold text-snow inline-block">
                {!hardwareConnected
                  ? 'OFFLINE'
                  : isRecording || squelchOpen
                  ? 'RECORDING'
                  : 'MONITORING'}
              </span>
            </div>
          </div>

          {/* Live SDR Spectrum Visualizer (Spectrum only, positioned directly above 24h timeline) */}
          <div className="shrink-0">
            <LiveSpectrumVisualizer
              frequencyHz={frequencyHz}
              modulation={modulation}
              squelchOpen={squelchOpen}
              rssi={liveRssi}
              hardwareConnected={hardwareConnected}
              analyserNode={audioPlayerRef.current?.getAnalyser() ?? null}
            />
          </div>

          {/* 24-Hour Canvas Timeline Scrubber */}
          <div className="flex-1 min-h-[160px] flex flex-col overflow-hidden">
            <TimelineScrubber
              date={selectedDate}
              transmissions={timelineTransmissions}
              currentTimeMs={currentTimeMs}
              onSeek={handleTimelineSeek}
              onSelectTransmission={handleSelectTransmission}
              selectedTransmissionId={selectedCallId}
            />
          </div>

          {/* Playback Controls Transport Bar */}
          <div className="shrink-0">
            <PlaybackControls
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onPrevCall={handlePrevCall}
              onNextCall={handleNextCall}
              playbackRate={playbackRate}
              onPlaybackRateChange={setPlaybackRate}
              dspFilterActive={dspFilterActive}
              onToggleDspFilter={() => setDspFilterActive(!dspFilterActive)}
              volume={volume}
              onVolumeChange={handleVolumeChange}
              onExportClip={handleExportClip}
              hasActiveCall={Boolean(selectedCallId)}
              activeCallTitle={activeCallTitle}
            />
          </div>
        </main>

        {/* Right Column: Call Log History Panel with HistoryDatePicker */}
        <div className="w-full lg:w-80 xl:w-[340px] h-full max-h-full min-h-0 flex-shrink-0 flex flex-col overflow-hidden">
          <CallLogPanel
            calls={calls}
            selectedCallId={selectedCallId}
            playingCallId={isPlaying ? selectedCallId : null}
            currentDate={selectedDate}
            onDateChange={setSelectedDate}
            activeDates={activeDates}
            onPlay={(call) => handlePlayCall(call.id)}
            onToggleStar={handleToggleStar}
            onSelectCall={handleSelectTransmission}
            onDownload={handleExportClip}
          />
        </div>
      </div>

      {/* Unified Multi-Tab Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsTab}
        onClose={() => setIsSettingsOpen(false)}
        onSaveDongle={handleSaveDongleConfig}
        onSaveStorage={handleSaveStorageConfig}
        onChangePassword={handleChangePassword}
        presets={presets}
        onSavePreset={handleCreatePreset}
        onDeletePreset={handleDeletePreset}
        initialDongleConfig={{
          rf_gain: rfGain,
          ppm_offset: ppmOffset,
        }}
        initialStorageSettings={storageSettings}
        diskUsedGB={diskUsedGB}
        diskTotalGB={diskTotalGB}
      />

      {/* Warning Popup when No SDR Dongle is Connected */}
      <NoDeviceModal
        isOpen={!hardwareConnected && !dismissedNoDeviceModal}
        onClose={() => setDismissedNoDeviceModal(true)}
        onRetry={handleRetryCheckDevice}
        onOpenSettings={() => {
          setSettingsTab('dongle');
          setIsSettingsOpen(true);
        }}
      />
    </div>
  );
};
