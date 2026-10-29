import { useEffect, useState } from 'react';
import {
  fetchMetricasHoje, fetchCiclosRecentes, fetchProdutividade,
  MetricasHoje, CicloResumo, ProdutividadeOp
} from '../lib/db';

export function Panel() {
  const [metricas, setMetricas] = useState<MetricasHoje | null>(null);
  const [ciclos, setCiclos] = useState<CicloResumo[]>([]);
  const [produtividade, setProdutividade] = useState<ProdutividadeOp[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setErro(null);
      const [m, c, p] = await Promise.all([
        fetchMetricasHoje(),
        fetchCiclosRecentes(50),
        fetchProdutividade()
      ]);
      setMetricas(m);
      setCiclos(c);
      setProdutividade(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro';
      setErro(msg);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 30_000); // refresh a cada 30s
    return () => clearInterval(id);
  }, []);

  if (carregando) return <div className="panel-container"><div className="loading">Carregando…</div></div>;

  return (
    <div className="panel-container">
      {erro && <div className="alert alert-danger">{erro}</div>}

      <div className="filters">
        <div className="filter">📅 Hoje</div>
        <div className="filter">🏭 PD10/PD11</div>
        <button className="filter action" type="button" onClick={carregar}>↻ Atualizar</button>
      </div>

      <div className="panel-grid">
        <Kpi label="Ciclos no turno" value={metricas?.ciclos_concluidos ?? 0} />
        <Kpi
          label="Taxa de acerto"
          value={metricas?.taxa_acerto_pct != null ? `${metricas.taxa_acerto_pct}%` : '—'}
          color="var(--success)"
          delta={`${metricas?.divergencias ?? 0} divergências`}
        />
        <Kpi
          label="Tempo médio"
          value={fmtDuracao(metricas?.tempo_medio_segundos ?? 0)}
        />
        <Kpi
          label="Operadores ativos"
          value={metricas?.operadores_ativos ?? 0}
          delta={`${metricas?.em_andamento ?? 0} em rota`}
        />
      </div>

      <div className="panel-split">
        <div className="panel-section">
          <h2>Produtividade por operador <span className="meta">hoje</span></h2>
          {produtividade.length === 0 && <div className="meta">Sem dados ainda hoje.</div>}
          {produtividade.map((p, i) => (
            <div className="leaderboard-row" key={p.operador_id}>
              <div className="rank">{i + 1}</div>
              <div className="name">{p.operador_nome}</div>
              <div className="count">{p.ciclos_concluidos ?? 0} ciclos</div>
              <div className={`rate ${rateClass(p.taxa_acerto_pct)}`}>
                {p.taxa_acerto_pct != null ? `${p.taxa_acerto_pct.toFixed(1)}%` : '—'}
              </div>
            </div>
          ))}
        </div>

        <div className="panel-section">
          <h2>Últimos ciclos <span className="meta">{ciclos.length} · divergentes → em rota → concluídos</span></h2>
          <div className="table-wrap">
            <table className="ciclos-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Operador</th>
                  <th>Peça</th>
                  <th>Endereço</th>
                  <th>Qtd</th>
                  <th>Lote</th>
                  <th>Duração</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map(c => (
                  <tr key={c.id} className={`row-${c.status}`}>
                    <td className="muted" style={{whiteSpace:'nowrap'}}>
                      <div>{fmtHora(c.timestamp_abertura)}</div>
                      <div style={{fontSize:10, color:'var(--text-3)'}}>{fmtData(c.timestamp_abertura)}</div>
                    </td>
                    <td>{c.operador_nome ?? '—'}</td>
                    <td>
                      <div className="mono" style={{fontWeight:600, color:'var(--text)'}}>
                        {c.klt_codigo_scaneado}
                      </div>
                      {c.descricao && (
                        <div style={{fontSize:11, color:'var(--text-2)', lineHeight:1.3, marginTop:2}}>
                          {c.descricao}
                        </div>
                      )}
                      {c.status === 'divergente' && c.caixa_peca_lida && (
                        <div style={{fontSize:11, color:'var(--danger)', marginTop:4, fontFamily:'SF Mono,monospace'}}>
                          ✗ Scaneada: {c.caixa_peca_lida}
                        </div>
                      )}
                    </td>
                    <td className="muted">{c.endereco_busca ?? '—'}</td>
                    <td>
                      {c.qtd_abastecida ?? '—'}
                      {c.qtd_digitada_manual && (
                        <span title="Qtd digitada manualmente" style={{color:'var(--warning)',marginLeft:4}}>✎</span>
                      )}
                    </td>
                    <td className="muted" style={{fontFamily:'SF Mono,monospace', fontSize:11}}>
                      {c.caixa_lote ?? '—'}
                    </td>
                    <td className="muted">{c.duracao_segundos ? fmtDuracao(c.duracao_segundos) : '—'}</td>
                    <td><StatusPill s={c.status} /></td>
                  </tr>
                ))}
                {ciclos.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{textAlign:'center',padding:24}}>
                    Nenhum ciclo registrado ainda.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value: string | number; delta?: string; color?: string }) {
  return (
    <div className="kpi-tile">
      <div className="label">{props.label}</div>
      <div className="value" style={{ color: props.color }}>{props.value}</div>
      {props.delta && <div className="delta">{props.delta}</div>}
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const cls = s === 'concluido' ? 'ok' : s === 'divergente' ? 'ko' : 'pending';
  const label = s === 'concluido' ? 'Concluído'
             : s === 'divergente' ? 'Divergência'
             : s === 'aberto' ? 'Em rota' : s;
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

function rateClass(r: number | null) {
  if (r == null) return '';
  if (r >= 95) return 'high';
  if (r >= 90) return 'mid';
  return 'low';
}

function fmtDuracao(seg: number): string {
  if (!seg) return '—';
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

function fmtHora(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('pt-BR').slice(0, 5); }
  catch { return iso; }
}

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    const hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return 'hoje';
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return 'ontem';
    return d.toLocaleDateString('pt-BR').slice(0, 5);  // dd/mm
  }
  catch { return ''; }
}
