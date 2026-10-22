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
          <Route path="/settings" element={<SettingsPage isAdmin={auth.isAdmin} email={auth.session?.user.email ?? ''} />} />
          <Route path="/admin" element={auth.isAdmin ? <Admin /> : <Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <NoVoiceBanner />
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
