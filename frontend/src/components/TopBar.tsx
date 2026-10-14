import React, { useState, useRef, useEffect } from 'react';
import {
  Radio,
  HardDrive,
  ChevronDown,
  LogOut,
  Sliders,
  Clock,
} from 'lucide-react';
import { SettingsTab } from './SettingsModal';

export interface TopBarProps {
  frequencyHz?: number;
  modulation?: string;
  isSimulator?: boolean;
  hardwareConnected?: boolean;
  diskUsedGB?: number;
  diskTotalGB?: number;
  username?: string;
  serverTime?: string;
  serverTimezone?: string;
  onOpenSettings?: (tab: SettingsTab) => void;
  onOpenDongleConfig?: () => void;
  onOpenStorageManager?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  frequencyHz: _frequencyHz = 118200000,
  modulation: _modulation = 'AM',
  isSimulator: _isSimulator = false,
  hardwareConnected = true,
  diskUsedGB = 14.8,
  diskTotalGB = 100,
  username = 'admin',
  serverTime,
  serverTimezone,
  onOpenSettings,
  onOpenDongleConfig,
  onOpenStorageManager,
  onChangePassword,
  onLogout,
  className = '',
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenTab = (tab: SettingsTab) => {
    setMenuOpen(false);
    if (onOpenSettings) {
      onOpenSettings(tab);
    } else {
      if (tab === 'dongle') onOpenDongleConfig?.();
      if (tab === 'storage') onOpenStorageManager?.();
      if (tab === 'password') onChangePassword?.();
    }
  };

  const diskPercent = Math.min(100, Math.round((diskUsedGB / (diskTotalGB || 1)) * 100));

  return (
    <header
      className={`h-16 bg-obsidian border-b border-charcoal px-6 flex items-center justify-between select-none ${className}`}
      aria-label="Application Header"
    >
      {/* Brand & Active Frequency Badge */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-ash border border-charcoal flex items-center justify-center">
            <Radio className="w-4 h-4 text-phosphor-green animate-pulse" />
          </div>
          <span className="font-medium text-snow text-lg tracking-tight">
            [●] SDR RECORDER
          </span>
        </div>
      </div>

      {/* Center / Right System Metrics */}
      <div className="flex items-center gap-5">
        {/* Hardware Status Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-ash border border-charcoal rounded-pill text-xs font-mono">
          <div
            className={`w-2 h-2 rounded-full ${
              hardwareConnected ? 'bg-phosphor-green animate-pulse' : 'bg-red-400'
            }`}
          />
          <span className={hardwareConnected ? 'text-silver-mist' : 'text-red-400'}>
            {hardwareConnected ? 'RTL-SDR ONLINE' : 'NO SDR DEVICE'}
          </span>
        </div>

        {/* Server Clock Pill */}
        {serverTime && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-ash border border-charcoal rounded-pill text-xs font-mono text-silver-mist"
            title={`Server Clock (${serverTimezone || 'Server Timezone'})`}
          >
            <Clock className="w-3.5 h-3.5 text-phosphor-green" />
            <span className="text-snow">{serverTime}</span>
            {serverTimezone && <span className="text-smoke text-[10px]">{serverTimezone}</span>}
          </div>
        )}

        {/* Single-line Storage Quota Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-ash border border-charcoal rounded-pill text-xs font-mono text-silver-mist whitespace-nowrap">
          <HardDrive className="w-3.5 h-3.5 text-silver-mist shrink-0" />
          <span>
            DISK: {diskUsedGB.toFixed(1)} GB / {diskTotalGB} GB ({diskPercent}%)
          </span>
          <div className="w-14 h-1.5 bg-obsidian rounded-full overflow-hidden border border-charcoal/80 shrink-0">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                diskPercent > 90
                  ? 'bg-red-400'
                  : diskPercent > 75
                  ? 'bg-amber-400'
                  : 'bg-phosphor-green'
              }`}
              style={{ width: `${diskPercent}%` }}
            />
          </div>
        </div>

        {/* Admin Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow text-xs font-mono transition-colors cursor-pointer"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span>{username}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-smoke transition-transform ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-ash border border-charcoal rounded-cards shadow-sm py-1.5 z-50 text-xs">
              <button
                type="button"
                onClick={() => handleOpenTab('dongle')}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-silver-mist hover:text-snow hover:bg-charcoal text-left transition-colors cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-phosphor-green" />
                <span>Settings</span>
              </button>

              <div className="my-1 border-t border-charcoal" />

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout?.();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-silver-mist hover:text-red-400 hover:bg-charcoal text-left transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-smoke" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
