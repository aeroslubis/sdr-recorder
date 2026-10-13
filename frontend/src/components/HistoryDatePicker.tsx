import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

export interface HistoryDatePickerProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  activeDates?: string[]; // Array of YYYY-MM-DD strings
  className?: string;
}

/** Format a Date object to YYYY-MM-DD string in local time */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD safely into Date */
export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  return new Date();
}

export const HistoryDatePicker: React.FC<HistoryDatePickerProps> = ({
  selectedDate,
  onSelectDate,
  activeDates: externalActiveDates,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsedSelected = parseDate(selectedDate);
  const [viewYear, setViewYear] = useState<number>(parsedSelected.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedSelected.getMonth()); // 0-indexed

  // Internal active dates cache if not provided from props
  const [internalActiveDates, setInternalActiveDates] = useState<string[]>([]);

  // Update view when selectedDate changes externally
  useEffect(() => {
    const d = parseDate(selectedDate);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [selectedDate]);

  // Fetch active dates for view month if not externally provided
  useEffect(() => {
    if (externalActiveDates && externalActiveDates.length > 0) return;

    let isMounted = true;
    const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

    const token = localStorage.getItem('sdr_auth_token') || sessionStorage.getItem('sdr_auth_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(`/api/recordings/active-dates?month=${monthStr}`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (isMounted && Array.isArray(data)) {
          setInternalActiveDates(data);
        }
      })
      .catch(() => {
        // Fallback gracefully on network error/mocking
      });

    return () => {
      isMounted = false;
    };
  }, [viewYear, viewMonth, externalActiveDates]);

  // Click outside listener to close calendar popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeDatesSet = new Set(externalActiveDates ?? internalActiveDates);

  // Quick navigation helpers
  const handleShiftDay = (deltaDays: number) => {
    const cur = parseDate(selectedDate);
    cur.setDate(cur.getDate() + deltaDays);
    onSelectDate(formatDate(cur));
  };

  const handleGoToday = () => {
    onSelectDate(formatDate(new Date()));
  };

  const handleLast7Days = () => {
    const cur = new Date();
    cur.setDate(cur.getDate() - 7);
    onSelectDate(formatDate(cur));
  };

  // Calendar rendering calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const todayStr = formatDate(new Date());

  return (
    <div className={`relative flex flex-col gap-2 ${className}`} ref={popoverRef}>
      {/* Date Navigation & Shortcuts Bar */}
      <div className="flex items-center justify-between gap-1.5 p-1 bg-ash border border-charcoal rounded-cards text-xs font-mono">
        <button
          type="button"
          onClick={() => handleShiftDay(-1)}
          aria-label="Yesterday"
          title="Go to Yesterday"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-pill bg-obsidian border border-charcoal hover:border-slate text-silver-mist hover:text-snow transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Yesterday</span>
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Calendar"
          title="Open Calendar Date Picker"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill border transition-colors cursor-pointer ${
            isOpen
              ? 'bg-phosphor-green/10 border-phosphor-green text-phosphor-green'
              : 'bg-obsidian border-charcoal hover:border-slate text-snow'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-phosphor-green" />
          <span className="font-semibold text-silver-mist hover:text-snow">{selectedDate}</span>
          {activeDatesSet.has(selectedDate) && (
            <span
              className="w-2 h-2 rounded-full bg-phosphor-green shadow-[0_0_6px_#3ecf8e]"
              title="Contains Transmissions"
            />
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoToday}
            aria-label="Today"
            title="Jump to Today"
            className={`px-2.5 py-1.5 rounded-pill border text-xs font-mono transition-colors cursor-pointer ${
              selectedDate === todayStr
                ? 'bg-phosphor-green/20 border-phosphor-green text-phosphor-green font-medium'
                : 'bg-obsidian border-charcoal hover:border-slate text-silver-mist hover:text-snow'
            }`}
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => handleShiftDay(1)}
            aria-label="Tomorrow"
            title="Go to Tomorrow"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-pill bg-obsidian border border-charcoal hover:border-slate text-silver-mist hover:text-snow transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">Tomorrow</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick shortcut tags */}
      <div className="flex items-center gap-2 px-1 text-[11px] font-mono text-smoke">
        <button
          type="button"
          onClick={handleLast7Days}
          aria-label="Last 7 Days"
          className="hover:text-phosphor-green transition-colors cursor-pointer flex items-center gap-1"
        >
          <Clock className="w-3 h-3 text-smoke" />
          <span>Last 7 Days</span>
        </button>
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-ash border border-charcoal rounded-cards shadow-2xl p-3.5 z-50 select-none animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header: Month/Year navigation */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-charcoal">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous Month"
              className="p-1.5 rounded-pill hover:bg-obsidian text-silver-mist hover:text-snow border border-transparent hover:border-charcoal transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium font-mono text-snow">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next Month"
              className="p-1.5 rounded-pill hover:bg-obsidian text-silver-mist hover:text-snow border border-transparent hover:border-charcoal transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-smoke mb-1.5">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="h-8" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(
                day
              ).padStart(2, '0')}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const hasRecordings = activeDatesSet.has(dateStr);

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    onSelectDate(dateStr);
                    setIsOpen(false);
                  }}
                  className={`h-8 rounded-inputs relative flex flex-col items-center justify-center text-xs font-mono transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-forest-depth border border-phosphor-green text-snow font-bold'
                      : isToday
                      ? 'bg-obsidian border border-slate text-phosphor-green font-semibold hover:border-phosphor-green'
                      : 'hover:bg-obsidian text-silver-mist hover:text-snow'
                  }`}
                >
                  <span>{day}</span>
                  {/* Distinct Phosphor Green Dot for days with recordings */}
                  {hasRecordings && (
                    <span
                      aria-label="has-recording"
                      className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-phosphor-green shadow-[0_0_4px_#3ecf8e]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer legend */}
          <div className="mt-3 pt-2 border-t border-charcoal flex items-center justify-between text-[10px] font-mono text-smoke">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor-green inline-block" />
              <span>Recorded Calls</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectDate(todayStr);
                setIsOpen(false);
              }}
              className="text-phosphor-green hover:underline cursor-pointer"
            >
              Jump to Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
