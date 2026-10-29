import { supabase } from './supabase';
import type { Operador, PecaBuscada, ParsedBox } from './types';

export async function autenticarCracha(crachaQr: string): Promise<Operador | null> {
  const { data, error } = await supabase
    .from('operadores')
    .select('*')
    .eq('cracha_qr', crachaQr)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  return data as Operador | null;
}

export async function buscarPecaPorCodigo(codigo: string): Promise<PecaBuscada | null> {
  const { data, error } = await supabase.rpc('buscar_peca_por_codigo', { p_codigo: codigo });
  if (error) throw error;
  const rows = data as PecaBuscada[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function abrirCiclo(payload: {
  operador_id: string;
  klt_codigo_scaneado: string;
  peca: PecaBuscada;
}): Promise<string> {
  const { data, error } = await supabase
    .from('ciclos_abastecimento')
    .insert({
      operador_id: payload.operador_id,
      klt_codigo_scaneado: payload.klt_codigo_scaneado,
      candidatos_count: payload.peca.variantes_count,
      peca_id_ext: payload.peca.id_ext,
      modelo_snapshot: payload.peca.modelo,
      descricao_snapshot: payload.peca.descricao,
      local_klt_vazia_snapshot: payload.peca.local_klt_vazia,
      endereco_busca_snapshot: payload.peca.endereco_busca,
      qtd_cadastrada: payload.peca.qtd_envio
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function registrarEndereco(cicloId: string, scaneado: string, valido: boolean) {
  const { error } = await supabase
    .from('ciclos_abastecimento')
    .update({ endereco_scaneado: scaneado, endereco_validado: valido })
    .eq('id', cicloId);
  if (error) throw error;
}

export async function registrarCaixa(cicloId: string, parsed: ParsedBox) {
  const { error } = await supabase
    .from('ciclos_abastecimento')
    .update({
      caixa_raw: parsed.raw,
      caixa_formato: parsed.format === 'klt_part' || parsed.format === 'unknown'
        ? 'desconhecido'
        : parsed.format,
      caixa_peca_lida: parsed.partNo ?? null,
      caixa_qty_lida: parsed.qty ?? null,
      caixa_lote: parsed.lot ?? null,
      caixa_fornecedor: parsed.supplier ?? null,
      caixa_json: parsed.extra ?? null
    })
    .eq('id', cicloId);
  if (error) throw error;
}

export async function finalizarCiclo(cicloId: string, payload: {
  qtd_abastecida: number;
  qtd_digitada_manual: boolean;
  status: 'concluido' | 'divergente';
}) {
  const { error } = await supabase
    .from('ciclos_abastecimento')
    .update({
      ...payload,
      timestamp_fechamento: new Date().toISOString()
    })
    .eq('id', cicloId);
  if (error) throw error;
}

export async function registrarScan(payload: {
  ciclo_id: string | null;
  operador_id: string | null;
  tipo: 'cracha' | 'klt_vazia' | 'endereco_pulmao' | 'caixa_origem';
  raw: string;
  parsed?: unknown;
  valido: boolean;
  erro?: string;
}) {
  await supabase.from('scans').insert({
    ciclo_id: payload.ciclo_id,
    operador_id: payload.operador_id,
    tipo: payload.tipo,
    raw: payload.raw,
    parsed: payload.parsed ?? null,
    valido: payload.valido,
    erro: payload.erro ?? null
  });
}

export async function registrarDivergencia(payload: {
  ciclo_id: string;
  tipo: 'peca_errada' | 'endereco_errado' | 'codigo_nao_cadastrado' | 'lote_desconhecido'
      | 'formato_nao_reconhecido' | 'qtd_divergente' | 'operador_sem_autorizacao';
  descricao: string;
  scan_raw?: string;
}) {
  await supabase.from('divergencias').insert({
    ciclo_id: payload.ciclo_id,
    tipo: payload.tipo,
    descricao: payload.descricao,
    scan_raw: payload.scan_raw ?? null
  });
}

// ---------- Painel do líder ----------

export interface MetricasHoje {
  ciclos_concluidos: number;
  divergencias: number;
  em_andamento: number;
  taxa_acerto_pct: number | null;
  tempo_medio_segundos: number | null;
  operadores_ativos: number;
  qtd_digitadas_manual: number;
}

export async function fetchMetricasHoje(): Promise<MetricasHoje | null> {
  const { data, error } = await supabase.from('v_metricas_hoje').select('*').maybeSingle();
  if (error) throw error;
  return data as MetricasHoje | null;
}

export interface CicloResumo {
  id: string;
  timestamp_abertura: string;
  duracao_segundos: number | null;
  status: string;
  operador_nome: string | null;
  klt_codigo_scaneado: string;
  modelo: string | null;
  descricao: string | null;
  endereco_busca: string | null;
  qtd_cadastrada: number | null;
  qtd_abastecida: number | null;
  qtd_digitada_manual: boolean;
}

export async function fetchCiclosRecentes(limit = 30): Promise<CicloResumo[]> {
  const { data, error } = await supabase
    .from('v_ciclos_recentes')
    .select('*')
    .limit(limit);
  if (error) throw error;
  return (data as CicloResumo[]) ?? [];
}

export interface ProdutividadeOp {
  operador_id: string;
  operador_nome: string;
  matricula: string;
  ciclos_concluidos: number;
  divergencias: number;
  taxa_acerto_pct: number | null;
  tempo_medio_segundos: number | null;
}

export async function fetchProdutividade(): Promise<ProdutividadeOp[]> {
  const { data, error } = await supabase.from('v_produtividade_operador').select('*');
  if (error) throw error;
  return (data as ProdutividadeOp[]) ?? [];
}
