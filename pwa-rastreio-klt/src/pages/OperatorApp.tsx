import { useState } from 'react';
import { Scanner } from '../components/Scanner';
import { useAuth } from '../hooks/useAuth';
import {
  abrirCiclo, buscarPecaPorCodigo, finalizarCiclo, registrarCaixa,
  registrarDivergencia, registrarEndereco, registrarScan
} from '../lib/db';
import { parseBoxCode } from '../lib/parser';
import type { ParsedBox, PecaBuscada } from '../lib/types';

type Step = 'idle' | 'klt' | 'mission' | 'address' | 'box' | 'confirm' | 'done';

interface CicloState {
  cicloId: string | null;
  peca: PecaBuscada | null;
  boxData: ParsedBox | null;
  validacaoOk: boolean;
  validacaoMsg: string;
  qtdFinal: number | '';
  qtdManual: boolean;
  startedAt: number | null;
}

const initialState: CicloState = {
  cicloId: null,
  peca: null,
  boxData: null,
  validacaoOk: false,
  validacaoMsg: '',
  qtdFinal: '',
  qtdManual: false,
  startedAt: null
};

export function OperatorApp() {
  const { operador } = useAuth();
  const [step, setStep] = useState<Step>('idle');
  const [state, setState] = useState<CicloState>(initialState);
  const [erro, setErro] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [carregando, setCarregando] = useState(false);

  const resetAll = () => {
    setState(initialState);
    setStep('idle');
    setErro(null);
    setShowManual(false);
    setManualInput('');
  };

  // ---------- Step 1: scan da KLT ----------
  const iniciarKlt = () => { setStep('klt'); setErro(null); };

  const processarKlt = async (raw: string) => {
    if (!operador) return;
    setCarregando(true);
    setErro(null);
    try {
      const codigo = raw.trim();
      const peca = await buscarPecaPorCodigo(codigo);
      await registrarScan({
        ciclo_id: null, operador_id: operador.id, tipo: 'klt_vazia',
        raw: codigo, parsed: peca, valido: !!peca,
        erro: peca ? undefined : 'Código não cadastrado'
      });
      if (!peca) {
        setErro(`Código "${codigo}" não cadastrado em pecas. Confira a etiqueta.`);
        setStep('idle');
        return;
      }
      const cicloId = await abrirCiclo({
        operador_id: operador.id,
        klt_codigo_scaneado: codigo,
        peca
      });
      setState({
        ...initialState,
        cicloId,
        peca,
        qtdFinal: peca.qtd_envio ?? '',
        qtdManual: peca.qtd_envio == null,
        startedAt: Date.now()
      });
      setStep('mission');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro de rede';
      setErro(`Falha ao abrir ciclo: ${msg}`);
      setStep('idle');
    } finally {
      setCarregando(false);
      setShowManual(false);
      setManualInput('');
    }
  };

  // ---------- Step 2: scan do endereço ----------
  const iniciarEndereco = () => { setStep('address'); setErro(null); };

  const processarEndereco = async (raw: string) => {
    if (!state.cicloId || !state.peca) return;
    setCarregando(true);
    try {
      const scaneado = raw.trim();
      const esperado = state.peca.endereco_busca;
      const bate = normalize(scaneado) === normalize(esperado);
      await registrarEndereco(state.cicloId, scaneado, bate);
      await registrarScan({
        ciclo_id: state.cicloId, operador_id: operador?.id ?? null,
        tipo: 'endereco_pulmao', raw: scaneado, valido: bate,
        erro: bate ? undefined : `Esperado ${esperado}`
      });
      if (!bate) {
        setErro(`Endereço errado. Esperado: ${esperado}. Scaneado: ${scaneado}.`);
        return;
      }
      setStep('box');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro';
      setErro(msg);
    } finally {
      setCarregando(false);
      setShowManual(false);
      setManualInput('');
    }
  };

  // ---------- Step 3: scan da caixa ----------
  const processarCaixa = async (raw: string) => {
    if (!state.cicloId || !state.peca) return;
    setCarregando(true);
    try {
      const parsed = parseBoxCode(raw);
      await registrarCaixa(state.cicloId, parsed);
      await registrarScan({
        ciclo_id: state.cicloId, operador_id: operador?.id ?? null,
        tipo: 'caixa_origem', raw: parsed.raw, parsed, valido: true
      });

      // Regra de validação
      let ok = false; let msg = '';
      if (parsed.format === 'chery_v1') {
        ok = true;
        msg = `Formato só traz lote. Validado pelo endereço ${state.peca.endereco_busca}.`;
      } else if (parsed.partNo && parsed.partNo === state.peca.codigo) {
        ok = true;
        msg = `Código bate com o esperado (${state.peca.codigo}).`;
      } else {
        ok = false;
        msg = `Esperado ${state.peca.codigo}. Veio ${parsed.partNo ?? '(sem código no QR)'}.`;
        await registrarDivergencia({
          ciclo_id: state.cicloId,
          tipo: 'peca_errada',
          descricao: msg,
          scan_raw: parsed.raw
        });
      }

      setState(s => ({ ...s, boxData: parsed, validacaoOk: ok, validacaoMsg: msg }));
      setStep('confirm');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro';
      setErro(msg);
    } finally {
      setCarregando(false);
      setShowManual(false);
      setManualInput('');
    }
  };

  // ---------- Step 4: confirmar e fechar ----------
  const confirmar = async () => {
    if (!state.cicloId) return;
    const qtd = typeof state.qtdFinal === 'string' ? parseInt(state.qtdFinal, 10) : state.qtdFinal;
    if (!qtd || qtd <= 0) { setErro('Informe a quantidade abastecida.'); return; }
    setCarregando(true);
    try {
      await finalizarCiclo(state.cicloId, {
        qtd_abastecida: qtd,
        qtd_digitada_manual: state.qtdManual,
        status: state.validacaoOk ? 'concluido' : 'divergente'
      });
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro';
      setErro(`Falha ao finalizar: ${msg}`);
    } finally {
      setCarregando(false);
    }
  };

  const cancelar = async () => {
    if (!state.cicloId) { resetAll(); return; }
    setCarregando(true);
    try {
      await finalizarCiclo(state.cicloId, {
        qtd_abastecida: 0, qtd_digitada_manual: false, status: 'divergente'
      });
    } catch { /* não trava o reset */ }
    setCarregando(false);
    resetAll();
  };

  // ---------- UI ----------
  const dots = (
    <div className="step-indicator">
      {[1,2,3,4].map(i => (
        <div
          key={i}
          className={`step-dot ${stepIndex() === i ? 'active' : stepIndex() > i ? 'done' : ''}`}
        />
      ))}
    </div>
  );

  function stepIndex(): number {
    if (step === 'klt') return 1;
    if (step === 'mission' || step === 'address') return 2;
    if (step === 'box') return 3;
    if (step === 'confirm' || step === 'done') return 4;
    return 0;
  }

  return (
    <div className="phone-screen">
      <div className="screen-pad">
        {step !== 'idle' && step !== 'done' && dots}

        {step === 'idle' && (
          <>
            <div className="hero-icon">📦</div>
            <h2 className="step-title">Aguardando KLT vazia</h2>
            <p className="step-subtitle">Escaneie a etiqueta da KLT para abrir uma missão</p>
            <button className="btn btn-primary" type="button" onClick={iniciarKlt}>
              📷 Scanear KLT
            </button>
            <div className="info-box">
              Logado como <strong>{operador?.nome}</strong>
              {operador?.turno && ` · turno ${operador.turno}`}
            </div>
          </>
        )}

        {step === 'klt' && (
          <>
            <h2 className="step-title">Scan da KLT vazia</h2>
            <p className="step-subtitle">Aponte a câmera para o QR ou código de barras</p>
            {!showManual ? (
              <>
                <Scanner onScan={processarKlt} active={!carregando} />
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(true)}>
                  Digitar código manualmente
                </button>
              </>
            ) : (
              <>
                <input
                  className="input"
                  placeholder="Ex: 13163101"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={carregando || !manualInput.trim()}
                  onClick={() => processarKlt(manualInput)}
                >Buscar</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(false)}>
                  Voltar para o scan
                </button>
              </>
            )}
            <button className="btn btn-ghost" type="button" onClick={resetAll}>Cancelar</button>
          </>
        )}

        {step === 'mission' && state.peca && (
          <>
            <div className="section-eyebrow">Missão aberta</div>
            <div className="mission-card">
              <div className="part-photo">📷 Foto da peça (cadastro)</div>
              <Row label="Código" value={state.peca.codigo} mono />
              <Row label="Descrição" value={state.peca.descricao} small />
              <Row label="Modelo" value={state.peca.modelo} />
              <Row label="Marca" value={state.peca.marca.toUpperCase()} />
              <Row label="📍 Endereço" value={state.peca.endereco_busca} highlight />
              <Row
                label="Qtd a abastecer"
                value={state.peca.qtd_envio != null ? `${state.peca.qtd_envio} pç` : '— digitar manual —'}
                highlight
                highlightClass={state.peca.qtd_envio != null ? 'ok' : 'warn'}
              />
              {state.peca.variantes_count > 1 && (
                <Row label="Variantes do código" value={`${state.peca.variantes_count}`} small />
              )}
            </div>
            <button className="btn btn-primary" type="button" onClick={iniciarEndereco}>
              📷 Scanear endereço do pulmão
            </button>
            <button className="btn btn-ghost" type="button" onClick={cancelar}>
              Cancelar missão
            </button>
          </>
        )}

        {step === 'address' && state.peca && (
          <>
            <h2 className="step-title">Confirme o endereço</h2>
            <p className="step-subtitle">
              Esperado: <strong>{state.peca.endereco_busca}</strong>
            </p>
            {!showManual ? (
              <>
                <Scanner onScan={processarEndereco} active={!carregando} />
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(true)}>
                  Digitar endereço manualmente
                </button>
              </>
            ) : (
              <>
                <input
                  className="input"
                  placeholder={state.peca.endereco_busca}
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={carregando || !manualInput.trim()}
                  onClick={() => processarEndereco(manualInput)}
                >Validar</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(false)}>
                  Voltar
                </button>
              </>
            )}
          </>
        )}

        {step === 'box' && state.peca && (
          <>
            <div className="alert alert-ok">
              ✓ Endereço {state.peca.endereco_busca} confirmado
            </div>
            <h2 className="step-title">Scan da caixa de origem</h2>
            {!showManual ? (
              <>
                <Scanner onScan={processarCaixa} active={!carregando} />
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(true)}>
                  Digitar / colar código manualmente
                </button>
              </>
            ) : (
              <>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Cole aqui o conteúdo lido do QR"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={carregando || !manualInput.trim()}
                  onClick={() => processarCaixa(manualInput)}
                >Processar</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowManual(false)}>
                  Voltar
                </button>
              </>
            )}
          </>
        )}

        {step === 'confirm' && state.boxData && state.peca && (
          <>
            <div className="parsed-fields">
              <div className="parsed-badge">{state.boxData.formatLabel}</div>
              {state.boxData.partNo && <Parsed k="Código peça" v={state.boxData.partNo} />}
              {state.boxData.qty != null && <Parsed k="Qtd na caixa" v={state.boxData.qty} />}
              {state.boxData.lot && <Parsed k="Lote" v={state.boxData.lot} />}
              {state.boxData.supplier && <Parsed k="Fornecedor" v={state.boxData.supplier} />}
            </div>
            <div className={`alert ${state.validacaoOk ? 'alert-ok' : 'alert-danger'}`}>
              <strong>{state.validacaoOk ? '✓ Peça validada' : '✗ DIVERGÊNCIA'}</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>{state.validacaoMsg}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="input-label">
                Quantidade abastecida {state.qtdManual && <span style={{ color: 'var(--warning)' }}>(digitar manual)</span>}
              </label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="qtd"
                value={state.qtdFinal}
                onChange={(e) => setState(s => ({ ...s, qtdFinal: e.target.value ? parseInt(e.target.value, 10) : '' }))}
              />
            </div>

            <button
              className={`btn ${state.validacaoOk ? 'btn-success' : 'btn-danger'}`}
              type="button"
              onClick={confirmar}
              disabled={carregando}
            >
              {state.validacaoOk ? '✓ Confirmar abastecimento' : 'Registrar divergência'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={cancelar}>
              Cancelar
            </button>
          </>
        )}

        {step === 'done' && state.peca && (
          <>
            <div className={`hero-icon ${state.validacaoOk ? 'success' : 'danger'}`}>
              {state.validacaoOk ? '✓' : '!'}
            </div>
            <h2 className="step-title">{state.validacaoOk ? 'Ciclo concluído' : 'Divergência registrada'}</h2>
            <p className="step-subtitle">Registro salvo no painel de gestão</p>

            <div className="summary-card">
              <div className="summary-label">Tempo total</div>
              <div className="summary-value">
                {fmtDuracao(state.startedAt ? Date.now() - state.startedAt : 0)}
              </div>
            </div>
            <div className="mission-card">
              <Row label="Peça" value={state.peca.codigo} mono />
              <Row label="Qtd" value={`${state.qtdFinal}${state.qtdManual ? ' (manual)' : ''}`} />
              <Row label="Endereço" value={state.peca.endereco_busca} />
            </div>
            <button className="btn btn-primary" type="button" onClick={resetAll}>
              ▶ Nova missão
            </button>
          </>
        )}

        {erro && <div className="alert alert-danger">{erro}</div>}
      </div>
    </div>
  );
}

// ---------- helpers ----------

function Row(props: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  highlight?: boolean;
  highlightClass?: 'ok' | 'warn';
}) {
  return (
    <div className="mission-row">
      <span className="label">{props.label}</span>
      <span
        className={
          'value '
          + (props.mono ? 'mono ' : '')
          + (props.small ? 'small ' : '')
          + (props.highlight ? `highlight ${props.highlightClass ?? ''}` : '')
        }
      >
        {props.value}
      </span>
    </div>
  );
}

function Parsed({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="parsed-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function normalize(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '_');
}

function fmtDuracao(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
