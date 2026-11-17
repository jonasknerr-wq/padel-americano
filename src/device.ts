/** Ton, Vibration und Wake Lock – alles optional, je nach Browser-Unterstützung. */
import { useEffect } from 'react';
import type { TimerEvent } from './logic/timer';

let audio: AudioContext | null = null;

/** Muss aus einem Tipp heraus aufgerufen werden (Browser-Autoplay-Regeln). */
export function unlockAudio() {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* kein Audio verfügbar */
  }
}

function tones(freq: number, count: number, len: number, gap: number) {
  if (!audio) return;
  const t0 = audio.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const s = t0 + i * (len + gap);
    gain.gain.setValueAtTime(0.0001, s);
    gain.gain.exponentialRampToValueAtTime(0.4, s + 0.01);
    gain.gain.setValueAtTime(0.4, s + len - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + len);
    osc.connect(gain).connect(audio.destination);
    osc.start(s);
    osc.stop(s + len + 0.02);
  }
}

function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignorieren */
  }
}

export function signal(events: TimerEvent[]) {
  if (events.includes('roundEnd')) {
    tones(1046, 3, 0.45, 0.2);
    vibrate([600, 200, 600, 200, 600]);
  } else if (events.includes('phaseEnd')) {
    tones(880, 2, 0.3, 0.15);
    vibrate([400, 150, 400]);
  } else if (events.includes('warn')) {
    tones(660, 1, 0.25, 0);
    vibrate([200]);
  }
}

/** Hält das Display an, solange `enabled` true ist. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (active) lock = l;
        else void l.release();
      } catch {
        /* z. B. Akku-Sparmodus */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}
