import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  active?: boolean;
  hint?: string;
}

/**
 * Wrapper em volta do html5-qrcode. Mostra uma viewport com a câmera
 * e dispara `onScan` uma única vez por montagem (handledRef evita
 * leituras repetidas em sequência).
 */
export function Scanner({ onScan, active = true, hint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    handledRef.current = false;

    const el = containerRef.current;
    if (!el.id) el.id = 'qr-reader-' + Math.random().toString(36).slice(2);

    let cancelled = false;
    const scanner = new Html5Qrcode(el.id, false);
    scannerRef.current = scanner;

    const start = async () => {
      try {
        await scanner.start(
          {
            facingMode: 'environment',
            // Peça resolução maior para melhorar a leitura em etiquetas pequenas
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraints]
          } as MediaTrackConstraints,
          {
            fps: 20,                              // mais quadros/segundo = detecta mais rápido
            qrbox: { width: 280, height: 280 },   // área maior
            aspectRatio: 1.0,
            disableFlip: false,                   // tenta QR espelhado também
            experimentalFeatures: { useBarCodeDetectorIfSupported: true }
          },
          (text) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScan(text);
          },
          () => { /* leituras por frame falham; ignorar */ }
        );
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'erro ao iniciar câmera';
          setErro(msg);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [active, onScan]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000'
        }}
      />
      {hint && !erro && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>{hint}</p>
      )}
      {erro && (
        <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>
          Erro na câmera: {erro}. Permita o acesso ou use o campo manual abaixo.
        </p>
      )}
    </div>
  );
}
