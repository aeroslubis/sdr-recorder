import React, { useState, useRef, useEffect } from 'react';
import {
  Radio,
  HardDrive,
  ChevronDown,
  Settings,
  Database,
  KeyRound,
  LogOut,
} from 'lucide-react';

export interface TopBarProps {
  frequencyHz?: number;
  modulation?: string;
  isSimulator?: boolean;
  diskUsedGB?: number;
  diskTotalGB?: number;
  username?: string;
  onOpenDongleConfig?: () => void;
  onOpenStorageManager?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  frequencyHz = 118200000,
  modulation = 'AM',
  isSimulator = false,
  diskUsedGB = 14.8,
  diskTotalGB = 100,
  username = 'admin',
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

  const diskPercent = Math.min(100, Math.round((diskUsedGB / (diskTotalGB || 1)) * 100));
  const freqMHz = (frequencyHz / 1e6).toFixed(3);

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
            [●] SDR-NVR
          </span>
        </div>

        {/* Active Frequency & Mode Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-ash border border-charcoal rounded-pill font-mono text-xs">
          <span className="text-phosphor-green font-medium">
            {freqMHz} MHz · {modulation}
          </span>
        </div>
      </div>

      {/* Center / Right System Metrics */}
      <div className="flex items-center gap-5">
        {/* Hardware Status Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-ash border border-charcoal rounded-pill text-xs font-mono">
          <div
            className={`w-2 h-2 rounded-full ${
              isSimulator ? 'bg-amber-400' : 'bg-phosphor-green animate-pulse'
            }`}
          />
          <span className={isSimulator ? 'text-amber-400' : 'text-silver-mist'}>
            {isSimulator ? '● SIMULATOR MODE' : '● RTL-SDR ONLINE'}
          </span>
        </div>

        {/* Storage Quota Indicator */}
        <div className="hidden md:flex flex-col gap-1 w-44">
          <div className="flex items-center justify-between text-[11px] font-mono text-smoke">
            <div className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-silver-mist" />
              <span>
                DISK: {diskUsedGB.toFixed(1)} GB / {diskTotalGB} GB ({diskPercent}%)
              </span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-ash rounded-full overflow-hidden border border-charcoal">
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
            <div className="absolute right-0 mt-2 w-56 bg-ash border border-charcoal rounded-cards shadow-sm py-1.5 z-50 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenDongleConfig?.();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-silver-mist hover:text-snow hover:bg-charcoal text-left transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-smoke" />
                <span>⚙ SDR Dongle Configuration</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenStorageManager?.();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-silver-mist hover:text-snow hover:bg-charcoal text-left transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4 text-smoke" />
                <span>🗄 Storage & Retention Manager</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onChangePassword?.();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-silver-mist hover:text-snow hover:bg-charcoal text-left transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-smoke" />
                <span>🔑 Change Password</span>
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
                <span>🚪 Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
