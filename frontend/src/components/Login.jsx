import { useState } from 'react';
import { API_URL } from '../config';

function Login({ onLogin, theme, toggleTheme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={loading}
              />
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
