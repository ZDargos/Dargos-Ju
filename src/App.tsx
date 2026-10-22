import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useSettings } from './lib/store';
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

function useTheme() {
  const { theme } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

const tabs = [
  { to: '/', label: 'Study', icon: <IconCards />, end: true },
  { to: '/games', label: 'Games', icon: <IconGames /> },
  { to: '/stats', label: 'Stats', icon: <IconStats /> },
  { to: '/settings', label: 'Settings', icon: <IconSettings /> },
];

export default function App() {
  const auth = useAuth();
  const location = useLocation();
  useTheme();
  useEffect(() => startBackgroundSync(), []);

  if (auth.status === 'loading') return <div className="center-screen">Loading…</div>;
  if (auth.status === 'signed-out') return <Login />;

  // Full-screen activities hide the tab bar.
  const immersive = location.pathname.startsWith('/review') || /^\/games\/.+/.test(location.pathname);

  return (
    <div className="app">
      <main className="main">
        <Routes>
          <Route path="/" element={<Study />} />
          <Route path="/review" element={<Review />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:id" element={<GameScreen />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage isAdmin={auth.isAdmin} email={auth.session?.user.email ?? ''} />} />
          <Route path="/admin" element={auth.isAdmin ? <Admin /> : <Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <NoVoiceBanner />
      {!immersive && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
                {t.icon}
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
