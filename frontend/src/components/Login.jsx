import { useState } from 'react';
import { API_URL } from '../config';

function Login({ onLogin, theme, toggleTheme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !senha) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, senha })
      });

      if (response.status === 200) {
        const data = await response.json();
        onLogin(data.access_token);
      } else if (response.status === 401) {
        setError('E-mail ou senha incorretos.');
      } else {
        const text = await response.text();
        setError(`Erro na autenticação: ${text || response.statusText}`);
      }
    } catch (err) {
      setError(`Erro ao conectar com o backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen" style={{ position: 'relative' }}>
      <button 
        onClick={toggleTheme} 
        className="btn btn-secondary" 
        style={{ 
          position: 'absolute', 
          top: '20px', 
          right: '20px', 
          margin: 0,
          padding: '8px 12px',
          fontSize: '12px',
          zIndex: 10
        }}
      >
        {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
      </button>
      <div className="login-grid">
        <div className="hero-column">
          <h1 className="hero-title">P R A X I S<br />A U T O M A T I O N</h1>
          <p className="hero-subtitle">Sistema de Elaboração de Peças Jurídicas & RAG Vetorial</p>
          <div className="divider-gold"></div>
          <p className="hero-desc">
            Plataforma corporativa de alta precisão para contencioso cível.
            Processamento inteligente de ementas integrado com PostgreSQL pgvector
            e segmentação estrita de matérias.
          </p>
        </div>

        <div className="login-column">
          <form className="login-box" onSubmit={handleSubmit}>
            <h2 className="login-title font-cinzel">ACESSAR FILA</h2>
            
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="email">E-mail Corporativo</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="exemplo@escritorio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Senha</label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={loading}
                  style={{ paddingRight: '46px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary, #888)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    margin: 0,
                    minWidth: 'auto',
                    zIndex: 5,
                    opacity: 0.7,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                  title={showPassword ? 'Ocultar Senha' : 'Mostrar Senha'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? '🔐 VERIFICANDO...' : '🔓 ENTRAR NO SISTEMA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
