import { Link } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useSettings } from '../lib/store';
import { GAMES, poolFor } from '../games/registry';
import LevelPicker from '../components/LevelPicker';

export default function Games() {
  const content = useContent();
  const settings = useSettings();
  const levels = settings.gameLevels.filter((l) => content.levels.some((x) => x.level === l));

  return (
    <>
      <header className="topbar"><h1>Games</h1></header>
      <div className="card">
        <LevelPicker levels={content.levels} selected={levels} onChange={(gameLevels) => updateSettings({ gameLevels })} />
      </div>
      <div className="section-title">Pick a game</div>
      <div className="game-grid">
        {GAMES.map((g) => {
          const count = g.comingSoon ? 0 : poolFor(g, content, settings).length;
          const body = (
            <>
              <div className="game-icon">{g.icon}</div>
              <div>
                <h3>{g.title}</h3>
                <p>{g.description}</p>
                {!g.comingSoon && levels.length > 0 && <p className="small" style={{ marginTop: 4 }}>{count} sentences</p>}
              </div>
            </>
          );
          if (g.comingSoon || !levels.length || !count)
            return (
              <div key={g.id} className={`card game-tile${g.comingSoon ? ' soon' : ''}`} style={{ opacity: g.comingSoon ? 0.55 : 0.75 }}>
                {body}
              </div>
            );
          return (
            <Link key={g.id} to={`/games/${g.id}`} className="card game-tile">
              {body}
            </Link>
          );
        })}
      </div>
      {!levels.length && <p className="small muted center" style={{ marginTop: 14 }}>Pick at least one level to play.</p>}
    </>
  );
}
