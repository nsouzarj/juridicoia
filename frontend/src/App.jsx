import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { API_URL } from './config';

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogin = (authToken) => {
    sessionStorage.setItem('token', authToken);
    setToken(authToken);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  // Sync user details if token exists
  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then((res) => {
        if (res.status === 401) {
          // Token expired - trigger clean redirect
          handleLogout();
        } else if (res.ok) {
          return res.json();
        } else {
          throw new Error('Failed to get profile');
        }
      })
      .then((data) => {
        if (data) {
          setUser(data);
        }
      })
      .catch((err) => {
        console.error(err);
        handleLogout();
      });
  }, [token]);

  if (!token) {
    return <Login onLogin={handleLogin} theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <Dashboard
      token={token}
      user={user}
      onLogout={handleLogout}
      theme={theme}
      toggleTheme={toggleTheme}
    />
  );
}

export default App;
