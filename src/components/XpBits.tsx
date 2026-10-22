import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { pushXp, refreshVsResults, useXp } from '../lib/useXp';
import { BADGES, TIER_NAMES, badgeStatus, levelFor, titleFor } from '../lib/xp';
import { t, useT } from '../i18n';

/** "Lv 12" next to a name. */
export function LevelChip({ xp }: { xp: number | null | undefined }) {
  useT();
  if (xp == null) return null;
  const level = levelFor(xp);
  return (
    <span className="level-chip" title={t(titleFor(level))} aria-label={t('Level {n}', { n: level })}>
      {t('Lv {n}', { n: level })}
    </span>
  );
}

/** A ring that fills toward the daily goal. */
export function GoalRing({ value, goal, size = 44, children }: { value: number; goal: number; size?: number; children?: React.ReactNode }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, goal ? value / goal : 0);
  return (
    <span className="goal-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="track" />
        <circle cx={size / 2} cy={size / 2} r={r} className={`fill${frac >= 1 ? ' done' : ''}`} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="goal-ring-label">{children}</span>
    </span>
  );
}

interface Seen {
  level: number;
  badges: string[];
  goalDay: string | null;
}

/**
 * Runs app-wide: keeps your XP on your profile for friends, refreshes vs results, and celebrates
 * level-ups, new badges and reaching the daily goal. Past achievements are recorded silently the
 * first time, so nobody gets a pile of pop-ups.
 */
export function XpWatcher() {
  useT();
  const xp = useXp();
  const me = useStore((s) => s.userId);
  const synced = useStore((s) => s.lastSyncAt !== null);
  const [toasts, setToasts] = useState<{ id: number; icon: string; title: string; body: string }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (!me) return;
    refreshVsResults().catch(() => undefined);
    const onVisible = () => document.visibilityState === 'visible' && refreshVsResults().catch(() => undefined);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [me]);

  useEffect(() => {
    if (!me || !synced) return;
    const timer = setTimeout(() => pushXp(xp.total).catch(() => undefined), 4000);
    return () => clearTimeout(timer);
  }, [me, synced, xp.total]);

  useEffect(() => {
    if (!me || !synced) return;
    const key = `dj:xp-seen:${me}`;
    const badges = BADGES.map((d) => badgeStatus(d, xp)).flatMap((b) => Array.from({ length: b.tier }, (_, i) => `${b.def.id}:${i + 1}`));
    const goalDay = xp.today.met ? xp.today.day : null;
    let seen: Seen | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      /* treat as first run */
    }
    const save = (s: Seen) => {
      try {
        localStorage.setItem(key, JSON.stringify(s));
      } catch {
        /* celebrations may repeat */
      }
    };
    if (!seen) return save({ level: xp.level, badges, goalDay });
    const add: { icon: string; title: string; body: string }[] = [];
    if (goalDay && seen.goalDay !== goalDay) add.push({ icon: '🎯', title: t('Daily goal reached!'), body: xp.streak > 1 ? t('{n} day streak', { n: xp.streak }) : t('Come back tomorrow to start a streak.') });
    if (xp.level > seen.level) add.push({ icon: '⬆️', title: t('Level {n}!', { n: xp.level }), body: t(titleFor(xp.level)) });
    for (const b of badges.filter((x) => !seen!.badges.includes(x))) {
      const [id, tier] = b.split(':');
      const def = BADGES.find((d) => d.id === id)!;
      add.push({ icon: def.icon, title: t('New badge: {name}', { name: t(def.name) }), body: def.tiers.length > 1 ? t(TIER_NAMES[Number(tier) - 1]) : '' });
    }
    save({ level: Math.max(seen.level, xp.level), badges: [...new Set([...seen.badges, ...badges])], goalDay: goalDay ?? seen.goalDay });
    if (add.length) {
      const items = add.slice(0, 3).map((a) => ({ ...a, id: nextId.current++ }));
      setToasts((ts) => [...ts, ...items]);
      for (const it of items) setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== it.id)), 5000);
    }
  }, [me, synced, xp]);

  if (!toasts.length) return null;
  return (
    <div className="xp-toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="xp-toast" onClick={() => setToasts((ts) => ts.filter((y) => y.id !== x.id))}>
          <span className="xp-toast-icon" aria-hidden>{x.icon}</span>
          <span>
            <strong>{x.title}</strong>
            {x.body && <span className="small" style={{ display: 'block' }}>{x.body}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
