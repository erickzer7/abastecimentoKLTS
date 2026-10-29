import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Header() {
  const { operador, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const inPanel = loc.pathname.startsWith('/panel');

  const handleLogout = () => {
    if (confirm('Trocar de operador?')) {
      logout();
      nav('/login', { replace: true });
    }
  };

  return (
    <header className="app-top">
      <div className="brand">
        <div className="logo">K</div>
        <div>
          <h1>Rastreio KLT</h1>
          <div className="subtitle">PD10/PD11</div>
        </div>
      </div>

      <div className="header-actions">
        {operador?.lider && (
          <Link to={inPanel ? '/' : '/panel'} className="header-link">
            {inPanel ? 'App do operador' : 'Painel de gestão'}
          </Link>
        )}
        {operador && (
          <button onClick={handleLogout} className="header-link btn-logout" type="button">
            {operador.nome.split(' ')[0]} · sair
          </button>
        )}
      </div>
    </header>
  );
}
