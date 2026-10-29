import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  active?: boolean;
  hint?: string;
}

/**
 * Wrapper do html5-qrcode com:
 * - Autofoco contínuo (quando o browser suporta)
 * - Tap-to-focus: toque em qualquer ponto da imagem força refoco
 *   nessa região e mostra um indicador visual
 * - Resolução pedida 1280x720 (melhora etiquetas pequenas)
 * - fps 20 e qrbox 280x280 para leitura mais ágil
 */
export function Scanner({ onScan, active = true, hint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const [focusDot, setFocusDot] = useState<{ x: number; y: number; key: number } | null>(null);

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
        const videoConstraints = {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } as unknown as MediaTrackConstraints;

        const scanConfig = {
          fps: 20,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
          disableFlip: false
        };

        await scanner.start(
          videoConstraints,
          scanConfig,
          (text) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScan(text);
          },
          () => { /* leituras por frame falham; ignorar */ }
        );

        // Após iniciar, pede autofoco contínuo (silencioso se não suportar)
        setTimeout(() => applyContinuousFocus(el), 500);
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

  const handleTap = async (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Marca o ponto de foco visualmente
    setFocusDot({ x, y, key: Date.now() });
    setTimeout(() => setFocusDot(null), 900);

    // Tenta refocar via MediaStream API
    const px = x / rect.width;
    const py = y / rect.height;
    await triggerRefocus(container, px, py);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        ref={containerRef}
        onPointerDown={handleTap}
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
          position: 'relative',
          cursor: 'crosshair',
          touchAction: 'manipulation'
        }}
      >
        {focusDot && (
          <div
            key={focusDot.key}
            className="focus-indicator"
            style={{
              left: focusDot.x - 28,
              top: focusDot.y - 28
            }}
          />
        )}
      </div>
      {hint && !erro && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>{hint}</p>
      )}
      {!erro && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
          Toque na imagem para focar
        </p>
      )}
      {erro && (
        <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>
          Erro na câmera: {erro}. Permita o acesso ou use o campo manual.
        </p>
      )}
    </div>
  );
}

/** Pede autofoco contínuo via MediaStreamTrack.applyConstraints (silencioso se não suportar). */
async function applyContinuousFocus(container: HTMLDivElement) {
  const track = getVideoTrack(container);
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
    });
  } catch { /* algumas câmeras não aceitam — tudo bem */ }
}

/**
 * Dispara um refoco pontual na posição tocada.
 * Tenta pointsOfInterest + single-shot primeiro; cai pra só single-shot.
 */
async function triggerRefocus(container: HTMLDivElement, px: number, py: number) {
  const track = getVideoTrack(container);
  if (!track) return;

  // Tentativa 1: pointsOfInterest (foco direcionado)
  try {
    await track.applyConstraints({
      advanced: [{
        focusMode: 'single-shot',
        pointsOfInterest: [{ x: px, y: py }]
      } as unknown as MediaTrackConstraintSet]
    });
  } catch {
    // Tentativa 2: só força single-shot
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet]
      });
    } catch { /* desiste silenciosamente */ }
  }

  // Depois de 600ms volta para autofoco contínuo
  setTimeout(() => {
    track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
    }).catch(() => {});
  }, 600);
}

function getVideoTrack(container: HTMLDivElement): MediaStreamTrack | null {
  const video = container.querySelector('video');
  if (!video) return null;
  const stream = video.srcObject as MediaStream | null;
  if (!stream) return null;
  return stream.getVideoTracks()[0] ?? null;
}
