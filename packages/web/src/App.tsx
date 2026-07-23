import { Navigate, Route, Routes } from 'react-router';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SettingsPage from './components/settings/SettingsPage';
import { AdminViewProvider } from './context/AdminViewContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { PlayerProvider } from './context/PlayerContext';
import { SongEditProvider } from './context/SongEditContext';
import { SongMenuProvider } from './context/SongMenuContext';
import { TagsProvider } from './context/TagsContext';
import { ThemeProvider } from './context/ThemeContext';
import { LazyMotion, domAnimation } from './lib/motion';
import AudioPage from './pages/AudioPage';
import LoginPage from './pages/LoginPage';
import PermissionsPage from './pages/PermissionsPage';
import PlaylistDetailPage from './pages/PlaylistDetailPage';
import PlaylistsPage from './pages/PlaylistsPage';
import RequestsPage from './pages/RequestsPage';
import SetupWizard from './pages/SetupWizard';
import SongsPage from './pages/SongsPage';
import TagsPage from './pages/TagsPage';

// Route elements extracted to module scope — they are static configuration
// that never changes, so re-creating them on every render is wasteful.
const loginElement = <LoginPage />;
const setupElement = (
  <ProtectedRoute>
    <SetupWizard />
  </ProtectedRoute>
);
// PlayerProvider lives inside ProtectedRoute so it only polls while a user is authenticated.
const appLayoutElement = (
  <ProtectedRoute>
    <PlayerProvider>
      <Layout />
    </PlayerProvider>
  </ProtectedRoute>
);
const indexRedirect = <Navigate to='/songs' replace />;
const songsElement = <SongsPage />;
const playlistsElement = <PlaylistsPage />;
const playlistDetailElement = <PlaylistDetailPage />;
const settingsElement = <SettingsPage />;
const audioElement = <AudioPage />;
const tagsElement = <TagsPage />;
const permissionsElement = <PermissionsPage />;
const requestsElement = <RequestsPage />;
const catchAllElement = <Navigate to='/' replace />;

export default function App() {
  return (
    <LazyMotion features={domAnimation}>
      <ThemeProvider>
        <TagsProvider>
          <AuthProvider>
            <AdminViewProvider>
              <PermissionsProvider>
                <NotificationProvider>
                  <SongEditProvider>
                    <SongMenuProvider>
                      <Routes>
                        <Route path='/login' element={loginElement} />
                        <Route path='/setup' element={setupElement} />
                        <Route path='/' element={appLayoutElement}>
                          <Route index element={indexRedirect} />
                          <Route path='songs' element={songsElement} />
                          <Route path='playlists' element={playlistsElement} />
                          <Route path='playlists/:id' element={playlistDetailElement} />
                          <Route path='settings' element={settingsElement} />
                          <Route path='audio' element={audioElement} />
                          <Route path='tags' element={tagsElement} />
                          <Route path='permissions' element={permissionsElement} />
                          <Route path='requests' element={requestsElement} />
                        </Route>
                        <Route path='*' element={catchAllElement} />
                      </Routes>
                    </SongMenuProvider>
                  </SongEditProvider>
                </NotificationProvider>
              </PermissionsProvider>
            </AdminViewProvider>
          </AuthProvider>
        </TagsProvider>
      </ThemeProvider>
    </LazyMotion>
  );
}
