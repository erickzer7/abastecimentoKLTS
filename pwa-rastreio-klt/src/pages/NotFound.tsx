import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="phone-screen">
      <div className="screen-pad" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h2 className="step-title">Página não encontrada</h2>
        <p className="step-subtitle">A rota que você tentou acessar não existe.</p>
        <Link to="/" className="btn btn-primary">Voltar ao app</Link>
      </div>
    </div>
  );
}
