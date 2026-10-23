import { useNavigate, useSearchParams } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useSettings } from '../lib/store';
import { ROUNDS } from '../lib/match';
import { GAMES, gameName, isVocabGame, MIN_VOCAB, poolFor, vocabPoolFor } from '../games/registry';
import { langParams, useT } from '../i18n';
import LevelPicker from '../components/LevelPicker';
import GameStatsButton, { GameStatsOverview } from '../components/GameStats';

export default function Games() {
  const t = useT();
  const content = useContent();
  const settings = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const challengeFriend = params.get('challenge');
  const levels = settings.gameLevels.filter((l) => content.levels.some((x) => x.level === l));
  const names = langParams(settings.learning);

  return (
    <>
      <header className="topbar">
        <h1>{t('Games')}</h1>
        <span className="small muted">{t('Learning {target}', names)}</span>
      </header>
      {challengeFriend && <div className="banner">{t("Pick a game to challenge your friend. You'll both get the same {n} sentences.", { n: ROUNDS })}</div>}
      <div className="card">
        <LevelPicker levels={content.levels} selected={levels} onChange={(gameLevels) => updateSettings({ gameLevels })} />
      </div>
      <div className="section-title">{t('Pick a game')}</div>
      <div className="game-grid">
        {GAMES.map((g) => {
          const vocab = isVocabGame(g);
          const count = g.comingSoon ? 0 : vocab ? vocabPoolFor(content, settings, settings.learning).length : poolFor(g, content, settings, settings.learning).length;
          const playable = !g.comingSoon && levels.length > 0 && count >= (vocab ? MIN_VOCAB : 1);
          return (
            <div key={g.id} className={`card game-tile${g.comingSoon ? ' soon' : ''}`} style={{ cursor: 'default', opacity: g.comingSoon ? 0.55 : playable ? 1 : 0.75 }}>
              <div className="game-icon" aria-hidden>{g.icon}</div>
              <div className="grow">
                <h3>{gameName(g, settings.learning)}</h3>
                <p>{t(g.description, names)}</p>
                {!g.comingSoon && levels.length > 0 && <p className="small" style={{ marginTop: 4 }}>{vocab ? t('{n} words', { n: count }) : t('{n} sentences', { n: count })}</p>}
                {!g.comingSoon && (
                  <div className="row" style={{ marginTop: 10 }}>
                    {!challengeFriend && (
                      <button className="btn sm" disabled={!playable} onClick={() => navigate(`/games/${g.id}`)}>{t('Practice')}</button>
                    )}
                    <button
                      className="btn primary sm"
                      disabled={!playable || (!vocab && count < ROUNDS)}
                      onClick={() => navigate(challengeFriend ? `/vs/${g.id}?friend=${challengeFriend}` : `/vs/${g.id}`)}
                    >
                      {challengeFriend ? t('Challenge') : t('Vs')}
                    </button>
                    <span className="grow" />
                    <GameStatsButton gameId={g.id} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!levels.length && <p className="small muted center" style={{ marginTop: 14 }}>{t('Pick at least one level to play.')}</p>}
      {!challengeFriend && <GameStatsOverview />}
    </>
  );
}
