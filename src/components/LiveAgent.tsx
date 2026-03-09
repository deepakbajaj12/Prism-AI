import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Sparkles, Loader2, Zap } from 'lucide-react';
import { gemini } from '../services/gemini';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LiveAgentProps {
  onVisualRequest?: (type: 'image' | 'video', prompt: string) => void;
  onStoryboardRequest?: (concept: string) => void;
  onBriefRequest?: (concept: string) => void;
  brandVoice?: string;
}

const WAVEFORM_BARS = 28;
const WAVEFORM_DECAY = 0.88;

/**
 * LiveAgent — real-time voice interface powered by Gemini Live API.
 *
 * Upgrades over v1:
 * 1. Tool calling: Gemini calls generate_image / generate_storyboard / generate_brief
 *    directly from voice, triggering actual generation in the parent.
 * 2. Barge-in: listens for serverContent.interrupted and stops queued audio immediately.
 * 3. Waveform visualizer: real-time RMS-driven bar chart replaces the static orb.
 * 4. isSessionConnected ref guards all WebSocket sends against race conditions.
 */
export const LiveAgent: React.FC<LiveAgentProps> = ({
  onVisualRequest,
  onStoryboardRequest,
  onBriefRequest,
  brandVoice = 'Professional & Creative',
}) => {
  const [isActive, setIsActive]       = useState(false);
  const [isMuted, setIsMuted]         = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript]   = useState('');
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [isThinking, setIsThinking]   = useState(false);
  const [toolFlash, setToolFlash]     = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Audio refs
  const audioContextRef     = useRef<AudioContext | null>(null);
  const processorRef        = useRef<ScriptProcessorNode | null>(null);
  const sessionRef          = useRef<any>(null);
  const isSessionConnected  = useRef(false);
  const nextStartTimeRef    = useRef(0);
  const activeSourcesRef    = useRef<AudioBufferSourceNode[]>([]);

  // Timers
  const reconnectTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const speakingTimerRef   = useRef<NodeJS.Timeout | null>(null);

  // Waveform: ring buffer of RMS values
  const waveformRef = useRef<number[]>(new Array(WAVEFORM_BARS).fill(0));
  const [waveform, setWaveform] = useState<number[]>(new Array(WAVEFORM_BARS).fill(0));
  const waveformAnimRef = useRef<number | null>(null);

  // ── Playback helpers ──────────────────────────────────────────────────────

  /** Cancel all scheduled audio immediately (barge-in support). */
  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach(src => { try { src.stop(); } catch {} });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
    if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); }
  }, []);

  /** Schedule a 16-bit PCM chunk for gapless Web Audio playback at 24kHz. */
  const schedulePlayback = useCallback((pcmData: Int16Array) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;

    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7fff;

    const buffer = ctx.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src);
    };

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + 0.04;
    src.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
    activeSourcesRef.current.push(src);

    setIsSpeaking(true);
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    speakingTimerRef.current = setTimeout(() => {
      if (ctx.currentTime >= nextStartTimeRef.current - 0.1) setIsSpeaking(false);
    }, (nextStartTimeRef.current - now) * 1000 + 100);
  }, []);

  // ── Waveform animation loop ───────────────────────────────────────────────

  const startWaveformLoop = useCallback(() => {
    const tick = () => {
      waveformRef.current = waveformRef.current.map(v => v * WAVEFORM_DECAY);
      setWaveform([...waveformRef.current]);
      waveformAnimRef.current = requestAnimationFrame(tick);
    };
    waveformAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWaveformLoop = useCallback(() => {
    if (waveformAnimRef.current) cancelAnimationFrame(waveformAnimRef.current);
    waveformRef.current = new Array(WAVEFORM_BARS).fill(0);
    setWaveform(new Array(WAVEFORM_BARS).fill(0));
  }, []);

  // ── Tool call handler ─────────────────────────────────────────────────────

  const handleToolCall = useCallback((toolCall: any) => {
    for (const fn of toolCall.functionCalls ?? []) {
      const args = fn.args ?? {};

      if (fn.name === 'generate_image') {
        setToolFlash('Generating image…');
        onVisualRequest?.('image', args.prompt ?? '');
      } else if (fn.name === 'generate_storyboard') {
        setToolFlash('Generating storyboard…');
        onStoryboardRequest?.(args.concept ?? '');
      } else if (fn.name === 'generate_brief') {
        setToolFlash('Drafting brief…');
        onBriefRequest?.(args.concept ?? '');
      }

      setTimeout(() => setToolFlash(null), 3000);

      // Send tool response so Gemini can continue
      try {
        sessionRef.current?.sendToolResponse?.({
          functionResponses: [{ id: fn.id, response: { result: 'started' } }],
        });
      } catch {}
    }
  }, [onVisualRequest, onStoryboardRequest, onBriefRequest]);

  // ── Session lifecycle ─────────────────────────────────────────────────────

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    setTranscript('');

    try {
      const session = await gemini.connectLive(
        {
          onopen: () => {
            isSessionConnected.current = true;
            setIsConnecting(false);
            setIsActive(true);
            startWaveformLoop();
            setupAudioCapture().catch(err => {
              console.error('Mic access failed:', err);
              setError('Microphone access denied. Check your browser permissions.');
              stopSession();
            });
          },
          onmessage: async (message: any) => {
            // ── Barge-in: model was interrupted by user speech ──────────────
            if (message.serverContent?.interrupted) {
              stopPlayback();
              setIsThinking(false);
              return;
            }

            setIsThinking(false);

            // ── Incoming audio from Gemini ──────────────────────────────────
            const inlineData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;
            if (inlineData?.data) {
              try {
                const bytes = Uint8Array.from(atob(inlineData.data), c => c.charCodeAt(0));
                schedulePlayback(new Int16Array(bytes.buffer));
              } catch {}
            }

            // ── Text transcription ──────────────────────────────────────────
            const text = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text) setTranscript(prev => prev + ' ' + text);

            // ── Tool calls (voice → generation) ────────────────────────────
            if (message.toolCall) handleToolCall(message.toolCall);
          },
          onerror: (err: any) => {
            console.error('Live API error:', err);
            isSessionConnected.current = false;
            setError('Connection lost — retrying…');
            reconnectTimerRef.current = setTimeout(startSession, 3500);
          },
          onclose: () => {
            isSessionConnected.current = false;
            stopPlayback();
            if (isActive) stopSession();
          },
        },
        brandVoice
      );
      sessionRef.current = session;
    } catch (err) {
      console.error('Failed to connect:', err);
      setIsConnecting(false);
      setError('Connection failed. Check your API key and try again.');
    }
  };

  const stopSession = () => {
    isSessionConnected.current = false;
    setIsActive(false);
    setIsThinking(false);
    setIsSpeaking(false);
    setError(null);

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (silenceTimerRef.current)   clearTimeout(silenceTimerRef.current);
    if (speakingTimerRef.current)  clearTimeout(speakingTimerRef.current);

    stopPlayback();
    stopWaveformLoop();

    try { sessionRef.current?.close(); } catch {}
    sessionRef.current = null;

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    nextStartTimeRef.current = 0;
  };

  // ── Microphone capture ────────────────────────────────────────────────────

  const setupAudioCapture = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    // Separate AudioContext for mic (16kHz) — playback uses 24kHz context
    const micCtx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = micCtx;
    const source = micCtx.createMediaStreamSource(stream);
    processorRef.current = micCtx.createScriptProcessor(2048, 1, 1);

    processorRef.current.onaudioprocess = (e) => {
      if (isMuted || !isSessionConnected.current || !sessionRef.current) return;

      const input = e.inputBuffer.getChannelData(0);

      // ── VAD: RMS energy ──────────────────────────────────────────────────
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);

      // Update waveform ring buffer
      waveformRef.current = [
        ...waveformRef.current.slice(1),
        Math.min(1, rms * 12),
      ];

      if (rms > 0.01) {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        setIsThinking(false);
      } else if (!silenceTimerRef.current && !isSpeaking) {
        silenceTimerRef.current = setTimeout(() => {
          setIsThinking(true);
        }, 1500);
      }

      // ── Stream PCM to API ────────────────────────────────────────────────
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;

      try {
        sessionRef.current.sendRealtimeInput({
          media: { data: btoa(String.fromCharCode(...new Uint8Array(pcm.buffer))), mimeType: 'audio/pcm;rate=16000' },
        });
      } catch {
        isSessionConnected.current = false;
      }
    };

    source.connect(processorRef.current);
    processorRef.current.connect(micCtx.destination);
  };

  useEffect(() => () => stopSession(), []);

  // ── Render ────────────────────────────────────────────────────────────────

  const orbActive   = cn('w-36 h-36 rounded-full flex items-center justify-center relative transition-all duration-500 border-2',
    isActive ? 'border-brand-primary shadow-[0_0_40px_rgba(129,140,248,0.25)] bg-brand-primary/5' : 'border-white/10 hover:border-white/20 bg-white/3');

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto">

      {/* ── Orb with waveform ── */}
      <div className="relative flex items-center justify-center w-56 h-56">

        {/* Outer live-ring pulses */}
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-full border border-brand-primary/20 live-ring" style={{ animationDelay: '0s' }} />
            <div className="absolute inset-[-16px] rounded-full border border-brand-secondary/10 live-ring" style={{ animationDelay: '0.5s' }} />
          </>
        )}

        {/* Waveform bars (ring around orb) */}
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-[3px]">
              {waveform.map((v, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    height: `${8 + v * 48}px`,
                    opacity: 0.4 + v * 0.6,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Core orb */}
        <div className={orbActive}>
          {isConnecting ? (
            <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
          ) : isActive ? (
            <div className="relative flex items-center justify-center">
              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    key="thinking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute inset-0 rounded-full bg-brand-primary/20 blur-md"
                  />
                )}
              </AnimatePresence>
              <motion.div
                animate={isSpeaking ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.4, repeat: Infinity }}
              >
                <Sparkles className={cn('w-10 h-10 text-brand-primary', isSpeaking && 'drop-shadow-[0_0_12px_rgba(129,140,248,0.9)]')} />
              </motion.div>
            </div>
          ) : (
            <Mic className="w-10 h-10 text-text-muted group-hover:text-text-secondary transition-colors" />
          )}

          {/* Live dot */}
          {isActive && (
            <div className="absolute -top-1 -right-1 flex items-center justify-center">
              <div className="w-4 h-4 bg-brand-secondary rounded-full animate-ping opacity-70" />
              <div className="absolute w-2 h-2 bg-brand-secondary rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* ── Status / error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tool call flash badge ── */}
      <AnimatePresence>
        {toolFlash && (
          <motion.div
            key="tool"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary/15 border border-brand-primary/30 rounded-full tool-flash"
          >
            <Zap className="w-3.5 h-3.5 text-brand-primary" />
            <span className="text-xs font-mono text-brand-primary uppercase tracking-widest">{toolFlash}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Controls ── */}
      <div className="flex gap-4">
        {!isActive ? (
          <button
            onClick={startSession}
            disabled={isConnecting}
            className="px-8 py-3 bg-brand-primary hover:bg-brand-primary/85 disabled:opacity-50 text-white font-semibold rounded-full transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/20"
          >
            <Mic className="w-5 h-5" />
            Start Creative Session
          </button>
        ) : (
          <>
            <button
              onClick={() => setIsMuted(m => !m)}
              title={isMuted ? 'Unmute' : 'Mute'}
              className={cn(
                'p-4 rounded-full transition-all',
                isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'
              )}
            >
              <MicOff className="w-5 h-5" />
            </button>
            <button
              onClick={stopSession}
              className="px-8 py-3 bg-white/8 hover:bg-white/15 border border-white/10 text-white font-semibold rounded-full transition-all"
            >
              End Session
            </button>
          </>
        )}
      </div>

      {/* ── Transcript panel ── */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="w-full glass-panel p-6 min-h-[90px]"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-secondary animate-pulse" />
              <span className="text-[9px] uppercase tracking-[0.25em] text-text-muted font-mono">Live Transcript</span>
              {isThinking && (
                <span className="ml-auto text-[9px] uppercase tracking-[0.2em] font-mono text-brand-primary animate-pulse">
                  thinking…
                </span>
              )}
            </div>
            <p className="text-text-secondary text-sm italic leading-relaxed">
              {transcript || 'Listening to your creative vision…'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
