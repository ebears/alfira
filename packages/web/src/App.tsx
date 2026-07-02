import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SettingsPage from './components/settings/SettingsPage';
import { AdminViewProvider } from './context/AdminViewContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { PlayerProvider } from './context/PlayerContext';
import { SongEditProvider } from './context/SongEditContext';
import { TagsProvider } from './context/TagsContext';
import { ThemeProvider } from './context/ThemeContext';
import AudioPage from './pages/AudioPage';
import LoginPage from './pages/LoginPage';
import PlaylistDetailPage from './pages/PlaylistDetailPage';
import PlaylistsPage from './pages/PlaylistsPage';
import SongsPage from './pages/SongsPage';
import TagsPage from './pages/TagsPage';

export default function App() {
  return (
    <ThemeProvider>
      <TagsProvider>
        <AuthProvider>
          <AdminViewProvider>
            <NotificationProvider>
              <SongEditProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        {/* PlayerProvider lives inside ProtectedRoute so it only polls while a user is authenticated. */}
                        <PlayerProvider>
                          <Layout />
                        </PlayerProvider>
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="/songs" replace />} />
                    <Route path="songs" element={<SongsPage />} />
                    <Route path="playlists" element={<PlaylistsPage />} />
                    <Route path="playlists/:id" element={<PlaylistDetailPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="audio" element={<AudioPage />} />
                    <Route path="tags" element={<TagsPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </SongEditProvider>
            </NotificationProvider>
          </AdminViewProvider>
        </AuthProvider>
      </TagsProvider>
    </ThemeProvider>
  );
}
