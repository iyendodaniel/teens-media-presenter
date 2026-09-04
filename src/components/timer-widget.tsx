import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Monitor, Pause, Play, RotateCcw, Timer as TimerIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTimerState,
  resetTimer,
  setTimerDuration,
  setTimerMinutes,
  silenceAlarm,
  subscribeTimer,
  toggleShowOnOutput,
  toggleTimer,
} from "@/lib/timer-store";

const TIMER_PRESETS = [5, 10, 15, 20, 30];

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useTimer() {
  return useSyncExternalStore(subscribeTimer, getTimerState, getTimerState);
}

/** Three small H / M / S fields shared by the full widget and the badge popover. */
function DurationFields({ totalSeconds }: { totalSeconds: number }) {
  const [h, setH] = useState(() => String(Math.floor(totalSeconds / 3600)));
  const [m, setM] = useState(() => String(Math.floor((totalSeconds % 3600) / 60)));
  const [s, setS] = useState(() => String(totalSeconds % 60));

  useEffect(() => {
    setH(String(Math.floor(totalSeconds / 3600)));
    setM(String(Math.floor((totalSeconds % 3600) / 60)));
    setS(String(totalSeconds % 60));
  }, [totalSeconds]);

  const apply = useCallback(() => {
    setTimerDuration(
      Number.parseInt(h, 10) || 0,
      Number.parseInt(m, 10) || 0,
      Number.parseInt(s, 10) || 0,
    );
  }, [h, m, s]);

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    max: number,
  ) => (
    <label className="flex flex-1 flex-col items-center gap-0.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
        }}
        onBlur={apply}
        inputMode="numeric"
        aria-label={label}
        placeholder="0"
        className="w-full min-w-0 rounded-md border border-input bg-background px-1 py-1 text-center text-xs tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </label>
  );

  return (
    <div className="flex items-end gap-1.5">
      {field("Hrs", h, setH, 11)}
      {field("Min", m, setM, 59)}
      {field("Sec", s, setS, 59)}
      <button
        onClick={apply}
        className="mb-[15px] shrink-0 rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-foreground transition-colors hover:bg-panel-raised"
      >
        Set
      </button>
    </div>
  );
}

/** Operator-only countdown clock for pacing the service - not sent to Output. */
export function TimerWidget() {
  const { totalSeconds, remaining, running, alarming, showOnOutput } = useTimer();
  const isLow = !alarming && remaining > 0 && remaining <= 30;
  const pct = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-md border border-border bg-panel p-3 transition-colors",
        alarming && "border-destructive/70 bg-destructive/10",
      )}
    >
      <button
        onClick={() => alarming && silenceAlarm()}
        className={cn(
          "flex items-center justify-center rounded-md border py-3 font-mono text-2xl tabular-nums transition-colors",
          alarming
            ? "timer-flash cursor-pointer border-destructive bg-destructive/10 text-destructive"
            : isLow
              ? "border-destructive/60 text-destructive"
              : "border-border text-foreground",
        )}
      >
        {alarming ? "TIME'S UP - tap to silence" : formatClock(remaining)}
      </button>

      <div className="h-1 w-full overflow-hidden rounded-full bg-panel-raised">
        <div
          className={cn(
            "h-full transition-[width] duration-1000",
            alarming ? "bg-destructive" : "bg-accent",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {TIMER_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setTimerMinutes(preset)}
            className="rounded px-1.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-panel-raised hover:text-foreground"
          >
            {preset}m
          </button>
        ))}
      </div>

      <DurationFields totalSeconds={totalSeconds} />

      <button
        onClick={() => toggleShowOnOutput()}
        aria-pressed={showOnOutput}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11px] font-semibold transition-colors",
          showOnOutput
            ? "border-accent bg-accent/15 text-accent"
            : "border-border bg-panel text-muted-foreground hover:bg-panel-raised hover:text-foreground",
        )}
      >
        <Monitor className="h-3 w-3" />
        {showOnOutput ? "Showing on Output" : "Show on Output"}
      </button>

      <div className="flex gap-1.5">
        <button
          onClick={() => toggleTimer()}
          disabled={remaining <= 0}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent py-1.5 text-xs font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={() => resetTimer()}
          aria-label="Reset timer"
          className="flex items-center justify-center gap-1 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-panel-raised"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/**
 * Compact floating pill, visible on every operator screen (Scripture and
 * Media both) so the countdown is never out of sight just because you
 * switched sections. Tap to expand quick controls without leaving the page
 * you're on. Never rendered on the audience-facing Output window.
 */
export function TimerBadge() {
  const { totalSeconds, remaining, running, alarming, showOnOutput } = useTimer();
  const [open, setOpen] = useState(false);
  const isLow = !alarming && remaining > 0 && remaining <= 30;
  const isIdle = !running && !alarming && remaining === totalSeconds;

  // Auto-expand once when the alarm fires, so it's impossible to miss even
  // if the operator wasn't looking at the badge.
  useEffect(() => {
    if (alarming) setOpen(true);
  }, [alarming]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="w-64 rounded-lg border border-border bg-panel p-3 shadow-stage">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timer
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Collapse timer"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <TimerWidget />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-sm tabular-nums shadow-stage transition-colors",
            alarming
              ? "timer-flash border-destructive bg-destructive/10 text-destructive"
              : isLow
                ? "border-destructive/60 bg-panel text-destructive"
                : isIdle
                  ? "border-border bg-panel text-muted-foreground"
                  : "border-accent/60 bg-panel text-foreground",
          )}
          aria-label="Open timer controls"
        >
          <TimerIcon className="h-3.5 w-3.5" />
          {alarming ? "TIME'S UP" : formatClock(remaining)}
          {showOnOutput ? <Monitor className="h-3 w-3 opacity-70" /> : null}
        </button>
      )}
    </div>
  );
}
