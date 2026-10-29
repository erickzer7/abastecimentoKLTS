export type Marca = 'chery' | 'changan';
export type PadraoQrCaixa = 'chery_v1' | 'chery_v2' | 'changan_json' | 'desconhecido';
export type StatusCiclo = 'aberto' | 'concluido' | 'divergente' | 'cancelado';
export type Turno = 'manha' | 'tarde' | 'noite' | 'administrativo';

export interface Operador {
  id: string;
  matricula: string;
  nome: string;
  cracha_qr: string;
  turno: Turno;
  lider: boolean;
  ativo: boolean;
}

export interface PecaBuscada {
  id_ext: number;
  codigo: string;
  modelo: string;
  marca: Marca;
  descricao: string;
  classif: string;
  local_klt_vazia: string;
  endereco_busca: string;
  qtd_envio: number | null;
  padrao_qr_caixa: PadraoQrCaixa;
  pendente_atualizacao: boolean;
  variantes_count: number;
  foto_url: string | null;
}

export interface Ciclo {
  id: string;
  operador_id: string;
  klt_codigo_scaneado: string;
  peca_id_ext: number;
  modelo_snapshot: string;
  descricao_snapshot: string;
  local_klt_vazia_snapshot: string;
  endereco_busca_snapshot: string;
  qtd_cadastrada: number | null;
  endereco_scaneado: string | null;
  endereco_validado: boolean | null;
  qtd_abastecida: number | null;
  qtd_digitada_manual: boolean;
  status: StatusCiclo;
  timestamp_abertura: string;
  timestamp_fechamento: string | null;
  duracao_segundos: number | null;
}

export interface ParsedBox {
  format: PadraoQrCaixa | 'klt_part' | 'unknown';
  formatLabel: string;
  partNo?: string | null;
  qty?: number | null;
  lot?: string | null;
  supplier?: string | null;
  extra?: Record<string, unknown>;
  raw: string;
  error?: string;
}
