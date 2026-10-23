import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useSettings, useStore } from './lib/store';
import { useT, useUiLang } from './i18n';
import Welcome from './pages/Welcome';
import { startBackgroundSync } from './lib/sync';
import { IconCards, IconGames, IconSettings, IconStats } from './components/Icons';
import Login from './pages/Login';
import Study from './pages/Study';
import Review from './pages/Review';
import Games from './pages/Games';
import GameScreen from './pages/GameScreen';
import Stats from './pages/Stats';
import SettingsPage from './pages/Settings';
import Admin from './pages/Admin';
import { NoVoiceBanner } from './components/VoiceCheck';
import ChallengeListener from './components/ChallengeListener';
import UpdatePrompt from './components/UpdatePrompt';
import { IconFriends } from './components/IconsExtra';
import Friends from './pages/Friends';
import VsLobby from './pages/VsLobby';
import VsMatch from './pages/VsMatch';
import ChallengePage from './pages/ChallengePage';
import Voice from './pages/Voice';
import Progress from './pages/Progress';
import { XpWatcher } from './components/XpBits';
import RecordingVote from './components/RecordingVote';
import ChallengeBanner from './components/ChallengeBanner';
import { loadVoices } from './lib/voices';
import { loadMyWords } from './lib/myWords';
import { msg } from './i18n/msg';

/** Theme, text size and the page language (for screen readers) follow the settings. */
function useDocumentSettings() {
  const { theme, textSize } = useSettings();
  const uiLang = useUiLang();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute('data-text-size', textSize ?? 'normal');
  }, [textSize]);
  useEffect(() => {
    document.documentElement.lang = uiLang === 'zh' ? 'zh-CN' : 'en';
  }, [uiLang]);
}

const tabs = [
  { to: '/', label: msg('Study'), icon: <IconCards />, end: true },
  { to: '/games', label: msg('Games'), icon: <IconGames /> },
  { to: '/friends', label: msg('Friends'), icon: <IconFriends /> },
  { to: '/stats', label: msg('Stats'), icon: <IconStats /> },
  { to: '/settings', label: msg('Settings'), icon: <IconSettings /> },
];

export default function App() {
  const auth = useAuth();
  const location = useLocation();
  const t = useT();
  useDocumentSettings();
  const settings = useSettings();
  const hasHistory = useStore((s) => s.logs.length > 0 || Object.keys(s.cards).length > 0);
  // Wait for the first download so an existing account on a new device isn't asked again.
  const synced = useStore((s) => s.lastSyncAt !== null);
  useEffect(() => startBackgroundSync(), []);
  // Native-speaker recordings: fetched when signed in and whenever the app comes back to the front.
  const signedIn = auth.status === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadVoices().catch(() => undefined);
      loadMyWords().catch(() => undefined);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [signedIn]);

  if (auth.status === 'loading') return <div className="center-screen">{t('Loading…')}</div>;
  if (auth.status === 'signed-out') return <Login />;
  // New accounts choose a learning mode first; existing learners are never interrupted.
  if (synced && !settings.onboarded && !hasHistory) return <Welcome />;

  // Full-screen activities hide the tab bar.
  const immersive = location.pathname.startsWith('/review') || /^\/(games|vs|challenge)\/.+/.test(location.pathname);

  return (
    <div className="app">
      <main className="main">
        <Routes>
          <Route path="/" element={<Study />} />
          <Route path="/review" element={<Review />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:id" element={<GameScreen />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:id" element={<Friends />} />
          <Route path="/vs/match/:id" element={<VsMatch />} />
          <Route path="/vs/:game" element={<VsLobby />} />
          <Route path="/challenge/:id" element={<ChallengePage />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<SettingsPage isAdmin={auth.isAdmin} email={auth.session?.user.email ?? ''} />} />
          <Route path="/admin" element={auth.isAdmin ? <Admin /> : <Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <NoVoiceBanner />
      <RecordingVote />
      <ChallengeBanner />
      <XpWatcher />
      <UpdatePrompt />
      {auth.session && auth.session.user.id !== 'demo' && <ChallengeListener userId={auth.session.user.id} />}
      {!immersive && (
        <nav className="tabbar" aria-label={t('Main')}>
          <div className="tabbar-inner">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
                {tab.icon}
                {t(tab.label)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
