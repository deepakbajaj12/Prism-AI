import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Loader2 } from 'lucide-react';
import { gemini } from '../services/gemini';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LiveAgentProps {
  onVisualRequest?: (type: 'image' | 'video', prompt: string) => void;
  brandVoice?: string;
}

export const LiveAgent: React.FC<LiveAgentProps> = ({ onVisualRequest, brandVoice }) => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks whether the WebSocket is truly open — guards onaudioprocess sends
  const isSessionConnected = useRef(false);

  const nextStartTimeRef = useRef<number>(0);

  /**
   * Initializes the Gemini Live session with error handling and automatic cleanup.
   */
  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // Connect to the Gemini Live API via our service wrapper
      const session = await gemini.connectLive({
        onopen: () => {
          isSessionConnected.current = true;
          setIsConnecting(false);
          setIsActive(true);
          setupAudioCapture().catch(err => {
            console.error("Microphone access failed:", err);
            setError("Microphone access denied. Please check your permissions.");
            stopSession();
          });
        },
        onmessage: async (message) => {
          setIsThinking(false);
          
          // GUARDRAIL: Handle incoming audio data (PCM 16-bit, 24kHz)
          // We decode and schedule immediately for low-latency response
          if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
            try {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              schedulePlayback(pcmData);
            } catch (err) {
              console.error("Audio decoding error:", err);
            }
          }

          // Handle incoming text transcriptions
          if (message.serverContent?.modelTurn?.parts[0]?.text) {
            const text = message.serverContent.modelTurn.parts[0].text;
            setTranscript(prev => prev + ' ' + text);
          }
        },
        onerror: (err) => {
          console.error("Live API Error:", err);
          isSessionConnected.current = false;
          setError("Connection lost. Attempting to reconnect...");
          
          // Implement simple reconnection logic
          if (isActive) {
            reconnectTimeoutRef.current = setTimeout(() => {
              startSession();
            }, 3000);
          }
        },
        onclose: () => {
          console.log("Live session closed.");
          if (isActive && !error) {
            stopSession();
          }
        }
      }, brandVoice);
      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect to Live API:", err);
      setIsConnecting(false);
      setError("Failed to establish connection. Please try again.");
    }
  };

  /**
   * Gracefully shuts down the session and cleans up all hardware resources.
   */
  const stopSession = () => {
    isSessionConnected.current = false;
    setIsActive(false);
    setError(null);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    
    // Disconnect audio processor to stop microphone stream
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    // Close the audio context to free up system resources
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    audioQueue.current = [];
    isPlaying.current = false;
    nextStartTimeRef.current = 0;
    setIsThinking(false);
  };

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Schedules PCM audio chunks for gapless playback using the Web Audio API.
   * This is critical for real-time voice interaction to avoid stuttering.
   * 1. Converts 16-bit PCM to Float32.
   * 2. Uses a lookahead buffer (nextStartTimeRef) to sequence chunks.
   */
  const schedulePlayback = (pcmData: Int16Array) => {
    setIsThinking(false);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    // Convert 16-bit PCM to Float32 for Web Audio
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    const currentTime = audioContextRef.current.currentTime;
    
    // Ensure chunks are played sequentially without gaps
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05;
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
    
    setIsSpeaking(true);
    
    const timeoutId = setTimeout(() => {
      if (audioContextRef.current && audioContextRef.current.currentTime >= nextStartTimeRef.current - 0.1) {
        setIsSpeaking(false);
      }
    }, (nextStartTimeRef.current - currentTime) * 1000);

    return () => clearTimeout(timeoutId);
  };

  /**
   * Captures microphone input and streams it to the Gemini Live API.
   * Uses ScriptProcessorNode for raw PCM access (16kHz, mono).
   * Implements custom Voice Activity Detection (VAD) to manage "Thinking" state.
   */
  const setupAudioCapture = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    const source = audioContextRef.current.createMediaStreamSource(stream);
    
    // Using a 2048 buffer size for a balance between latency and performance
    processorRef.current = audioContextRef.current.createScriptProcessor(2048, 1, 1);

    processorRef.current.onaudioprocess = (e) => {
      if (isMuted || !sessionRef.current || !isSessionConnected.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Simple VAD (Voice Activity Detection) based on RMS
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      
      if (rms > 0.01) {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setIsThinking(false);
      } else {
        // Trigger "Thinking" state after 1.5s of silence
        if (!silenceTimerRef.current && !isSpeaking && isActive) {
          silenceTimerRef.current = setTimeout(() => {
            if (!isSpeaking && isActive) setIsThinking(true);
          }, 1500);
        }
      }

      // Convert Float32 back to 16-bit PCM for the API
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      try {
        sessionRef.current.sendRealtimeInput({
          media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      } catch {
        // WebSocket may have closed between the guard check and the send — safe to ignore
        isSessionConnected.current = false;
      }
    };

    source.connect(processorRef.current);
    processorRef.current.connect(audioContextRef.current.destination);
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto">
      <div className="relative group">
        {/* Outer Aura Layers */}
        <AnimatePresence>
          {isActive && (
            <>
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0.1, 0.3, 0.1], 
                  scale: [1, 1.2, 1],
                  rotate: 360 
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-20px] rounded-full border border-brand-primary/20 blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0.05, 0.15, 0.05], 
                  scale: [1.1, 1.3, 1.1],
                  rotate: -360 
                }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-40px] rounded-full border border-white/5 blur-md"
              />
            </>
          )}
        </AnimatePresence>

        <div className={cn(
          "w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 relative z-10",
          isActive ? "bg-brand-primary/10 scale-110 shadow-[0_0_80px_rgba(255,78,0,0.15)]" : "bg-white/5 hover:bg-white/10",
          isSpeaking && "shadow-[0_0_100px_rgba(255,78,0,0.4)]"
        )}>
          {/* Internal Pulse Ring */}
          <AnimatePresence>
            {isSpeaking && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-brand-primary/50"
              />
            )}
          </AnimatePresence>

          <div className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center border-2 transition-all duration-500 relative bg-[var(--bg)]",
            isActive ? "border-brand-primary shadow-inner shadow-brand-primary/20" : "border-white/20"
          )}>
            {isConnecting ? (
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
                <motion.div 
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [0.2, 0.5, 0.2] 
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 blur-2xl bg-brand-primary/40 rounded-full"
                />
                <div className="absolute -inset-4 border border-brand-primary/20 rounded-full animate-[spin_3s_linear_infinite]" />
              </div>
            ) : isActive ? (
              <div className="relative">
                <AnimatePresence>
                  {isThinking && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ 
                            scale: [1, 2, 1],
                            opacity: [0.1, 0.3, 0.1],
                            rotate: [0, 180, 360]
                          }}
                          transition={{ 
                            duration: 3, 
                            repeat: Infinity, 
                            delay: i * 0.5,
                            ease: "easeInOut" 
                          }}
                          className="absolute w-full h-full border border-brand-primary/30 rounded-full"
                        />
                      ))}
                      <motion.div 
                        animate={{ 
                          scale: [1, 1.2, 1],
                          opacity: [0.3, 0.6, 0.3] 
                        }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 blur-xl bg-brand-primary/30 rounded-full"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div
                  animate={isSpeaking ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Sparkles className={cn("w-12 h-12 text-brand-primary", isSpeaking && "drop-shadow-[0_0_10px_rgba(255,78,0,0.8)]")} />
                </motion.div>
              </div>
            ) : (
              <Mic className="w-12 h-12 text-text-muted group-hover:text-text-secondary transition-colors" />
            )}
          </div>
          
          {isActive && (
            <div className="absolute -top-2 -right-2 flex items-center justify-center">
              <div className="w-6 h-6 bg-brand-primary rounded-full animate-ping opacity-75" />
              <div className="absolute w-3 h-3 bg-brand-primary rounded-full" />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500 text-sm text-center flex items-center justify-center gap-2"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-4 relative z-20">
        {!isActive ? (
          <button
            onClick={startSession}
            disabled={isConnecting}
            className="px-8 py-3 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white font-semibold rounded-full transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/20"
          >
            <Mic className="w-5 h-5" />
            Start Creative Session
          </button>
        ) : (
          <>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={cn(
                "p-4 rounded-full transition-all",
                isMuted ? "bg-red-500/20 text-red-500" : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={stopSession}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full transition-all"
            >
              End Session
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full glass-panel p-6 min-h-[100px] flex flex-col gap-2"
          >
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-mono">Real-time Insight</span>
            <p className="text-text-secondary italic leading-relaxed flex items-center gap-2">
              {isThinking && <Loader2 className="w-3 h-3 animate-spin text-brand-primary" />}
              <motion.span
                animate={isThinking ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {transcript || "Listening to your creative vision..."}
              </motion.span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
