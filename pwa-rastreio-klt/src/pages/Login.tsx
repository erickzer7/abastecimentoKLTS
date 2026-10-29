import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scanner } from '../components/Scanner';
import { useAuth } from '../hooks/useAuth';
import { autenticarCracha, registrarScan } from '../lib/db';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const processar = async (raw: string) => {
    setErro(null);
    setCarregando(true);
    try {
      const op = await autenticarCracha(raw.trim());
      await registrarScan({
        ciclo_id: null,
        operador_id: op?.id ?? null,
        tipo: 'cracha',
        raw,
        valido: !!op,
        erro: op ? undefined : 'Crachá não cadastrado'
      });
      if (!op) {
        setErro('Crachá não cadastrado ou inativo. Procure o líder.');
        return;
      }
      login(op);
      nav('/', { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro de rede';
      setErro(`Falha: ${msg}`);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="phone-screen">
      <div className="screen-pad">
        <div className="hero-icon">👤</div>
        <h2 className="step-title">Scan do crachá</h2>
        <p className="step-subtitle">
          Aproxime o celular do seu crachá para iniciar o turno
        </p>

        {!showManual ? (
          <>
            <Scanner onScan={processar} hint="Aponte a câmera para o QR do crachá" />
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowManual(true)}
              disabled={carregando}
            >
              Digitar matrícula do crachá
            </button>
          </>
        ) : (
          <>
            <input
              className="input"
              placeholder="Ex: CR-ERK001"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => processar(manualInput)}
              disabled={carregando || !manualInput.trim()}
            >
              {carregando ? 'Autenticando…' : 'Entrar'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowManual(false)}
              disabled={carregando}
            >
              Voltar para o scan
            </button>
          </>
        )}

        {erro && <div className="alert alert-danger">{erro}</div>}

        <div className="info-box">
          <strong>Rastreio:</strong> cada ciclo fica vinculado ao operador logado. Troque de usuário no botão do canto superior quando terminar o turno.
        </div>
      </div>
    </div>
  );
}
