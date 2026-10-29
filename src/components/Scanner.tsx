import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  active?: boolean;
  hint?: string;
}

type PermState = 'checking' | 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * Wrapper do html5-qrcode com:
 * - Verificação do estado da permissão (não pede toda vez)
 * - Mensagem clara + instruções quando a permissão foi negada
 * - Tap-to-focus (toque na imagem força refoco)
 * - Autofoco contínuo via MediaStreamTrack.applyConstraints
 * - Resolução 1280x720 pedida, qrbox 280x280, fps 20
 */
export function Scanner({ onScan, active = true, hint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const [permState, setPermState] = useState<PermState>('checking');
  const [focusDot, setFocusDot] = useState<{ x: number; y: number; key: number } | null>(null);

  // 1. Verifica estado da permissão
  useEffect(() => {
    let active = true;
    const check = async () => {
      const nav = navigator as Navigator & {
        permissions?: { query: (p: { name: string }) => Promise<PermissionStatus> };
      };
      if (!nav.permissions || typeof nav.permissions.query !== 'function') {
        if (active) setPermState('unavailable');
        return;
      }
      try {
        const status = await nav.permissions.query({ name: 'camera' as PermissionName });
        if (!active) return;
        setPermState(status.state as PermState);
        status.onchange = () => {
          if (active) setPermState(status.state as PermState);
        };
      } catch {
        if (active) setPermState('unavailable');
      }
    };
    check();
    return () => { active = false; };
  }, []);

  // 2. Inicia o scanner apenas quando a permissão permite (granted ou prompt/unavailable)
  useEffect(() => {
    if (!active || !containerRef.current) return;
    if (permState === 'checking' || permState === 'denied') return;

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

        // Após iniciar, pede autofoco contínuo
        setTimeout(() => applyContinuousFocus(el), 500);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'erro ao iniciar câmera';
          // Se o erro foi de permissão, atualiza o estado para 'denied'
          if (/permission|denied|notallowed/i.test(msg)) {
            setPermState('denied');
          } else {
            setErro(msg);
          }
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [active, onScan, permState]);

  const handleTap = async (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusDot({ x, y, key: Date.now() });
    setTimeout(() => setFocusDot(null), 900);
    await triggerRefocus(container, x / rect.width, y / rect.height);
  };

  // ---- UI ----

  if (permState === 'denied') {
    const b = detectBrowser();
    return (
      <div className="scanner-denied">
        <div className="scanner-denied-icon">🚫📷</div>
        <h3 className="scanner-denied-title">Acesso à câmera bloqueado</h3>
        <p className="scanner-denied-text">
          Para scanear códigos, o site precisa de permissão para usar a câmera.
          Siga os passos abaixo e depois toque em <strong>Tentar de novo</strong>.
        </p>
        <div className="scanner-denied-steps">
          {b === 'chrome-android' && (
            <ol>
              <li>Toque no ícone de <strong>cadeado 🔒</strong> à esquerda da barra de endereço</li>
              <li>Toque em <strong>Permissões</strong> → <strong>Câmera</strong></li>
              <li>Mude para <strong>Permitir</strong></li>
              <li>Recarregue a página</li>
            </ol>
          )}
          {b === 'ios-safari' && (
            <ol>
              <li>Toque em <strong>"AA"</strong> no canto esquerdo da barra de endereço</li>
              <li>Toque em <strong>Configurações do site</strong></li>
              <li>Em <strong>Câmera</strong>, selecione <strong>Permitir</strong></li>
              <li>Recarregue a página</li>
            </ol>
          )}
          {b === 'desktop' && (
            <ol>
              <li>Clique no ícone de <strong>cadeado 🔒</strong> à esquerda da URL</li>
              <li>Em <strong>Câmera</strong>, mude para <strong>Permitir</strong></li>
              <li>Recarregue a página</li>
            </ol>
          )}
          {b === 'other' && (
            <ol>
              <li>Abra as configurações do navegador para este site</li>
              <li>Encontre a opção <strong>Câmera</strong> e marque como <strong>Permitir</strong></li>
              <li>Recarregue a página</li>
            </ol>
          )}
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => { setPermState('checking'); setTimeout(() => setPermState('prompt'), 50); }}
        >
          🔄 Tentar de novo
        </button>
      </div>
    );
  }

  if (permState === 'checking') {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-2)', fontSize: 13 }}>
        Verificando permissão da câmera…
      </div>
    );
  }

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
            style={{ left: focusDot.x - 28, top: focusDot.y - 28 }}
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

// ------------- helpers -------------

async function applyContinuousFocus(container: HTMLDivElement) {
  const track = getVideoTrack(container);
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
    });
  } catch { /* algumas câmeras não aceitam */ }
}

async function triggerRefocus(container: HTMLDivElement, px: number, py: number) {
  const track = getVideoTrack(container);
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{
        focusMode: 'single-shot',
        pointsOfInterest: [{ x: px, y: py }]
      } as unknown as MediaTrackConstraintSet]
    });
  } catch {
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet]
      });
    } catch { /* desiste */ }
  }
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

function detectBrowser(): 'chrome-android' | 'ios-safari' | 'desktop' | 'other' {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return 'desktop';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios-safari';
  if (/Android/i.test(ua) && /Chrome/i.test(ua)) return 'chrome-android';
  return 'other';
}
