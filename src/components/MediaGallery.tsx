import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Image as ImageIcon, Video as VideoIcon, Download, Trash2, FileText, Loader2, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  timestamp: number;
}

interface MediaGalleryProps {
  items: MediaItem[];
  onDelete: (id: string) => void;
  onGenerateBrief: (prompt: string) => void;
}

/**
 * MediaGallery Component
 * Displays generated images and videos in a responsive grid.
 * Includes a high-fidelity skeleton state for real-time generation feedback.
 */
export const MediaGallery: React.FC<MediaGalleryProps & { isGenerating?: boolean, isGeneratingBrief?: boolean }> = ({ items, onDelete, onGenerateBrief, isGenerating, isGeneratingBrief }) => {
  const quotes = [
    "Design is intelligence made visible.",
    "Creativity is intelligence having fun.",
    "Every great design begins with a story.",
    "Simplicity is the ultimate sophistication."
  ];
  const [quote] = React.useState(() => quotes[Math.floor(Math.random() * quotes.length)]);
  const [loadingStep, setLoadingStep] = React.useState(0);
  const steps = [
    "Analyzing prompt", 
    "Exploring palettes", 
    "Drafting textures", 
    "Refining composition", 
    "Synthesizing lighting", 
    "Finalizing render"
  ];

  // Cycle through loading steps during generation to provide dynamic feedback
  React.useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % steps.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      <AnimatePresence mode="popLayout">
        {isGenerating && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative glass-panel overflow-hidden aspect-video flex flex-col items-center justify-center bg-[var(--bg)] border-brand-primary/30"
          >
            {/* Creative Synthesis Animation */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {/* Shimmer Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-primary/5 to-transparent -skew-x-12 animate-shimmer" />

              {/* Scanning Line */}
              <div className="absolute inset-x-0 h-[2px] bg-brand-primary/30 blur-[2px] animate-scan z-10" />
              
              {/* Creative Sketching Lines */}
              <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
                <motion.path
                  d="M 20 20 L 80 80 M 100 20 L 40 90"
                  stroke="var(--brand-primary)"
                  strokeWidth="0.5"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: [0, 1, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="40"
                  stroke="var(--brand-primary)"
                  strokeWidth="0.5"
                  fill="none"
                  initial={{ pathLength: 0, rotate: 0 }}
                  animate={{ pathLength: [0, 1, 0], rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                />
              </svg>

              <motion.div 
                animate={{ y: ["-100%", "200%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-transparent via-brand-primary/10 to-transparent z-10"
              />
              
              {/* Grid Pattern */}
              <div className="absolute inset-0 opacity-10" 
                style={{ 
                  backgroundImage: 'radial-gradient(circle, var(--brand-primary) 1px, transparent 1px)', 
                  backgroundSize: '24px 24px' 
                }} 
              />

              {/* Data Streams */}
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={`stream-${i}`}
                  initial={{ x: i * 25 + "%", y: "-100%", opacity: 0 }}
                  animate={{ 
                    y: ["-100%", "200%"],
                    opacity: [0, 0.2, 0]
                  }}
                  transition={{ 
                    duration: 3 + Math.random() * 2, 
                    repeat: Infinity,
                    delay: i * 0.5,
                    ease: "linear"
                  }}
                  className="absolute top-0 w-[1px] h-32 bg-gradient-to-b from-transparent via-brand-primary to-transparent"
                />
              ))}

              {/* Floating Particles */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ 
                    x: Math.random() * 100 + "%", 
                    y: Math.random() * 100 + "%",
                    opacity: 0 
                  }}
                  animate={{ 
                    y: [null, "-=20%"],
                    opacity: [0, 0.5, 0],
                    scale: [0.5, 1, 0.5]
                  }}
                  transition={{ 
                    duration: 2 + Math.random() * 2, 
                    repeat: Infinity,
                    delay: Math.random() * 2
                  }}
                  className="absolute w-1 h-1 bg-brand-primary rounded-full blur-[1px]"
                />
              ))}
            </div>

            <div className="relative z-20 flex flex-col items-center gap-4">
              <div className="relative">
                <motion.div 
                  animate={{ 
                    rotate: 360,
                    scale: [1, 1.1, 1],
                  }}
                  transition={{ 
                    rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                    scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
                  }}
                  className="w-16 h-16 rounded-full border border-brand-primary/20 flex items-center justify-center"
                >
                  <Sparkles className="w-6 h-6 text-brand-primary" />
                </motion.div>
                <div className="absolute inset-0 blur-xl bg-brand-primary/10 animate-pulse" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={loadingStep}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-primary font-bold"
                  >
                    {steps[loadingStep]}
                  </motion.p>
                </AnimatePresence>
                <div className="flex gap-1.5 mt-2">
                  {steps.map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        scale: loadingStep >= i ? [1, 1.2, 1] : 1,
                        backgroundColor: loadingStep >= i ? "var(--brand-primary)" : "rgba(255,255,255,0.1)"
                      }}
                      transition={{ duration: 0.5 }}
                      className="w-1.5 h-1.5 rounded-full"
                    />
                  ))}
                </div>
                <p className="text-[10px] text-text-muted italic mt-4 max-w-[200px] text-center">"{quote}"</p>
              </div>
            </div>
          </motion.div>
        )}

        {items.length === 0 && !isGenerating && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-full group relative glass-panel overflow-hidden aspect-[21/9] flex items-center justify-center bg-black/20 border-dashed border-2 border-brand-primary/20"
          >
            <div className="absolute inset-0 opacity-40 grayscale group-hover:grayscale-0 transition-all duration-1000">
              <img 
                src="https://picsum.photos/seed/prism-creative/1280/720?blur=2" 
                alt="Creative Workspace" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/80 to-[var(--bg)]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20 group-hover:scale-110 transition-transform duration-500">
                  <Sparkles className="w-8 h-8 text-brand-primary" />
                </div>
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute inset-0 blur-2xl bg-brand-primary/20 -z-10"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <h3 className="text-2xl font-bold tracking-tight text-[var(--text)]">Your creative journey starts here.</h3>
                <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                  Use the voice agent or manual controls to describe your vision. 
                  Prism will synthesize high-fidelity concepts in seconds.
                </p>
              </div>

              <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
                <span className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-primary" />
                  Voice Activated
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-primary" />
                  Multi-Modal
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-primary" />
                  Instant Render
                </span>
              </div>
            </div>

            {/* Decorative corner accents */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-brand-primary/20 rounded-tl-lg" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-brand-primary/20 rounded-br-lg" />
          </motion.div>
        )}

        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative glass-panel overflow-hidden aspect-video"
          >
            {item.type === 'image' ? (
              <img 
                src={item.url} 
                alt={item.prompt} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <video 
                src={item.url} 
                controls 
                className="w-full h-full object-cover"
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-6 flex flex-col justify-end">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {item.type === 'image' ? <ImageIcon className="w-4 h-4 text-brand-primary" /> : <VideoIcon className="w-4 h-4 text-brand-primary" />}
                    <span className="text-[10px] uppercase tracking-widest font-mono text-text-secondary">
                      {item.type} Concept
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text)] line-clamp-2 italic">"{item.prompt}"</p>
                </div>
                
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => onGenerateBrief(item.prompt)}
                    disabled={isGeneratingBrief}
                    className="p-2 bg-brand-primary/20 text-brand-primary rounded-full hover:bg-brand-primary/40 transition-colors disabled:opacity-50 flex items-center justify-center"
                    title="Generate Creative Brief"
                  >
                    {isGeneratingBrief ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => onDelete(item.id)}
                    className="p-2 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <a 
                    href={item.url} 
                    download={`concept-${item.id}`}
                    className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
