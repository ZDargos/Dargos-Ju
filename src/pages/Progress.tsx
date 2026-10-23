import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { getState, updateSettings, useStore } from '../lib/store';
import { useXp } from '../lib/useXp';
import { levelProgress } from '../lib/stats';
import { BADGES, GOALS, TIER_NAMES, XP_RULES, badgeStatus, dayKey, goalChange, goalFor, titleFor, type Challenge } from '../lib/xp';
import { gameById, gameName } from '../games/registry';
import { langParams, levelName, t, useT } from '../i18n';
import { msg } from '../i18n/msg';
import { IconBack } from '../components/Icons';
import { GoalRing } from '../components/XpBits';

const GOAL_NAMES: Record<number, string> = { 50: msg('Casual'), 100: msg('Regular'), 200: msg('Serious'), 300: msg('Intense') };

function challengeText(c: Challenge): string {
  switch (c.kind) {
    case 'cards':
      return t('Review {n} flashcards', { n: c.target });
    case 'new':
      return t('Learn {n} new cards', { n: c.target });
    case 'extra':
      return t('Do {n} extra-practice cards', { n: c.target });
    case 'gameRight':
      return t('Get {n} game answers right', { n: c.target });
    case 'games':
      return t('Play {n} different games', { n: c.target });
    case 'run':
      return t('Get {n} right in a row in one game', { n: c.target });
    case 'game':
      return t('Get {n} right in {game}', { n: c.target, game: gameName(gameById(c.game!), getState().settings.learning) });
  }
}

/** Level, XP, daily goal and streak, challenges, badges and level mastery. */
export default function Progress() {
  useT();
  const navigate = useNavigate();
  const xp = useXp();
  const content = useContent();
  const settings = useStore((s) => s.settings);
  const cards = useStore((s) => s.cards);
  const goal = goalFor(dayKey(Date.now()), settings.goalHistory);
  const inLevel = xp.total - xp.levelStart;
  const levelSize = xp.nextLevelAt - xp.levelStart;
  const bonusPct = Math.round((xp.today.multiplier - 1) * 100);
  const mastery = levelProgress(content, cards, settings.learning);
  // The last 35 days, including days before any activity.
  const byDay = new Map(xp.days.map((d) => [d.day, d]));
  const calendar = Array.from({ length: 35 }, (_, i) => {
    const day = dayKey(Date.now() - (34 - i) * 86400000);
    return byDay.get(day) ?? { day, xp: 0, goal: goalFor(day, settings.goalHistory), met: false, multiplier: 1, challengesDone: 0 };
  });
  const badges = BADGES.map((d) => badgeStatus(d, xp));

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('Back')}><IconBack /></button>
          <h1>{t('Your progress')}</h1>
        </div>
      </header>

      <div className="card level-card">
        <div className="level-badge" aria-hidden>{xp.level}</div>
        <div className="grow">
          <div className="small muted">{t('Level {n}', { n: xp.level })}</div>
          <div className="level-title">{t(titleFor(xp.level))}</div>
          <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-label={t('XP to the next level')} aria-valuemin={0} aria-valuemax={levelSize} aria-valuenow={inLevel}>
            <div style={{ width: `${(inLevel / levelSize) * 100}%` }} />
          </div>
          <div className="spread small muted" style={{ marginTop: 4 }}>
            <span>{t('{n} XP total', { n: xp.total.toLocaleString() })}</span>
            <span>{t('{n} XP to level {level}', { n: (xp.nextLevelAt - xp.total).toLocaleString(), level: xp.level + 1 })}</span>
          </div>
        </div>
      </div>

      <div className="section-title">{t('Today')}</div>
      <div className="card">
        <div className="row" style={{ gap: 16 }}>
          <GoalRing value={xp.today.xp} goal={xp.today.goal} size={84}>
            <strong>{xp.today.xp}</strong>
            <span className="small muted">/ {xp.today.goal}</span>
          </GoalRing>
          <div className="grow">
            <div className="streak-line">🔥 <strong>{t('{n} day streak', { n: xp.streak })}</strong></div>
            <div className="small muted" style={{ marginTop: 2 }}>
              {bonusPct > 0 ? t('Streak bonus today: +{p}% XP', { p: bonusPct }) : t('Reach your goal on more days in a row to earn bonus XP.')}
            </div>
            <div className="small" style={{ marginTop: 6, fontWeight: 600, color: xp.today.met ? 'var(--right)' : undefined }}>
              {xp.today.met ? t('Goal reached! Your streak is safe today.') : t('Earn {n} more XP today to keep your streak.', { n: xp.today.goal - xp.today.xp })}
            </div>
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 14, marginBottom: 6, fontWeight: 600 }}>{t('Daily goal')}</div>
        <div className="segmented" role="group" aria-label={t('Daily goal')}>
          {GOALS.map((g) => (
            <button key={g} className={goal === g ? 'on' : ''} aria-pressed={goal === g} onClick={() => updateSettings(goalChange(g, settings.goalHistory))}>
              <span style={{ display: 'block' }}>{t(GOAL_NAMES[g])}</span>
              <span className="small" style={{ fontWeight: 500 }}>{g} XP</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">{t('Daily challenges')}</div>
      <div className="card">
        <ul className="list challenge-list">
          {xp.today.challenges.map(({ challenge, progress, done }, i) => (
            <li key={i} className={done ? 'done' : ''}>
              <div className="spread">
                <span>{done ? '✅' : '◻️'} {challengeText(challenge)}</span>
                <span className="small muted">+{XP_RULES.challenge} XP</span>
              </div>
              <div className="progress" style={{ marginTop: 6 }} aria-hidden>
                <div style={{ width: `${Math.min(100, (progress / challenge.target) * 100)}%` }} />
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>{Math.min(progress, challenge.target)} / {challenge.target}</div>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {xp.today.challengesDone === 3 ? t('All three done! +{n} XP sweep bonus.', { n: XP_RULES.sweep }) : t('Clear all three for a +{n} XP bonus. New challenges every day.', { n: XP_RULES.sweep })}
        </p>
      </div>

      <div className="section-title">{t('Last 5 weeks')}</div>
      <div className="card">
        <div className="streak-calendar" role="list" aria-label={t('Last 5 weeks')}>
          {calendar.map((d) => (
            <span
              key={d.day}
              role="listitem"
              className={`cal-day${d.met ? ' met' : d.xp > 0 ? ' some' : ''}${d.day === xp.today.day ? ' today' : ''}`}
              title={`${d.day}: ${d.xp} / ${d.goal} XP`}
              aria-label={`${d.day}: ${d.met ? t('goal reached') : t('{n} XP', { n: d.xp })}`}
            />
          ))}
        </div>
        <div className="row small muted" style={{ gap: 14, marginTop: 10 }}>
          <span><span className="cal-day met legend" /> {t('Goal reached')}</span>
          <span><span className="cal-day some legend" /> {t('Some practice')}</span>
          <span>{t('Best streak: {n} days', { n: xp.bestStreak })}</span>
        </div>
      </div>

      <div className="section-title">{t('Badges')}</div>
      <div className="badge-grid">
        {badges.map((b) => (
          <div key={b.def.id} className={`badge-tile tier-${b.tier}${b.tier === b.def.tiers.length ? ' maxed' : ''}`}>
            <div className="badge-icon" aria-hidden>{b.def.icon}</div>
            <div className="badge-name">{t(b.def.name)}</div>
            <div className="small badge-tier">{b.tier ? (b.def.tiers.length > 1 ? t(TIER_NAMES[b.tier - 1]) : t('Earned')) : t('Locked')}</div>
            {b.next !== null && (
              <>
                <div className="progress" style={{ marginTop: 6 }} aria-hidden>
                  <div style={{ width: `${Math.min(100, (b.value / b.next) * 100)}%` }} />
                </div>
                <div className="small muted badge-desc">{t(b.def.desc)} · {b.value.toLocaleString()}/{b.next.toLocaleString()}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="section-title">{t('Level mastery · {lang}', { lang: langParams(settings.learning).target })}</div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>{t('A level is mastered when you know every sentence well in both directions (reviews 3+ weeks apart).')}</p>
        <div className="mastery-grid">
          {mastery.map((m) => {
            const known = m.counts.r.mature + m.counts.p.mature;
            const started = 2 * m.total - m.counts.r.new - m.counts.p.new;
            const pct = m.total ? Math.floor((known / (2 * m.total)) * 100) : 0;
            return (
              <div key={m.level} className={`mastery-tile${pct === 100 ? ' mastered' : ''}`}>
                <GoalRing value={known} goal={2 * m.total} size={58}>
                  <strong className="small">{pct === 100 ? '🏆' : `${pct}%`}</strong>
                </GoalRing>
                <div className="small" style={{ fontWeight: 600, marginTop: 4 }}>{levelName(m.level)}</div>
                <div className="small muted">{pct === 100 ? t('Mastered') : t('{p}% started', { p: m.total ? Math.round((started / (2 * m.total)) * 100) : 0 })}</div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="card how-xp">
        <summary><strong>{t('How XP works')}</strong></summary>
        <ul className="small">
          <li>{t('Flashcard: {n} XP, whatever grade you give. Grade honestly; it only helps your schedule.', { n: XP_RULES.card })}</li>
          <li>{t('Extra practice card: {n} XP. Correct game answer: {m} XP.', { n: XP_RULES.extraCard, m: XP_RULES.gameRight })}</li>
          <li>{t('Speed rounds: {n} XP per point of your net score for the day (wrong answers count against it).', { n: XP_RULES.speedPoint })}</li>
          <li>{t('Vs match: {n} XP, plus {m} for a win.', { n: XP_RULES.vsMatch, m: XP_RULES.vsWin })}</li>
          <li>{t('Voice line: {n} XP while it stays live. If it gets voted down, the XP goes with it.', { n: XP_RULES.voice })}</li>
          <li>{t('Streak bonus: +10% XP for each day in a row you reach your goal, up to +60% on day 7. Missing a day resets it.')}</li>
          <li>{t('Daily challenges: +{n} XP each, +{m} for clearing all three.', { n: XP_RULES.challenge, m: XP_RULES.sweep })}</li>
          <li>{t("Answers tapped through too quickly to read don't earn XP.")}</li>
        </ul>
      </details>
    </>
  );
}
