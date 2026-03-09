import React, { useState, useEffect } from 'react';
import { Sparkles, Image as ImageIcon, Video as VideoIcon, Plus, History, Settings, Info, AlertCircle, FileText, X, Sun, Moon, BookOpen, Mic } from 'lucide-react';
import { LiveAgent } from './components/LiveAgent';
import { MediaGallery, MediaItem } from './components/MediaGallery';
import { TodoList } from './components/TodoList';
import { ArchitectureDiagram } from './components/ArchitectureDiagram';
import { StoryboardCreator } from './components/StoryboardCreator';
import { gemini } from './services/gemini';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

/**
 * Prism: AI Creative Director
 * Main application entry point. Manages the state of generated media,
 * visual generation requests, and the overall user experience.
 */
export default function App() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualPromptError, setManualPromptError] = useState(false);
  const [genType, setGenType] = useState<'image' | 'video'>('image');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [brandVoice, setBrandVoice] = useState('Professional & Creative');
  const [moodBoard, setMoodBoard] = useState<string[]>([]);
  const [showMoodBoard, setShowMoodBoard] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<'live' | 'storyboard'>('live');
  // Set by voice tool calls to auto-trigger storyboard generation
  const [voiceStoryboardConcept, setVoiceStoryboardConcept] = useState<string | undefined>(undefined);

  // Initialization: Check API key and load theme
  useEffect(() => {
    checkApiKey();
    const savedTheme = localStorage.getItem('prism-theme') as 'dark' | 'light';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  // Theme Management: Apply light/dark mode classes to the document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('prism-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const voices = [
    { name: 'Professional & Creative', icon: '👔' },
    { name: 'Bold & Brutalist', icon: '⚡' },
    { name: 'Warm & Organic', icon: '🌿' },
    { name: 'Minimalist & Modern', icon: '⚪' },
    { name: 'Playful & Vibrant', icon: '🎨' },
  ];

  const checkApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setHasApiKey(true); // Fallback for local dev if needed
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  /**
   * Orchestrates the visual generation process (Image/Video).
   * 1. Validates input prompt.
   * 2. Handles API key selection for premium models (Veo).
   * 3. Enriches prompts with the selected brand voice.
   * 4. Manages generation state and handles API-specific errors.
   */
  const handleGenerate = async (type: 'image' | 'video', prompt: string) => {
    if (!prompt.trim()) {
      setManualPromptError(true);
      setTimeout(() => setManualPromptError(false), 2000);
      return;
    }
    setManualPromptError(false);

    // Video generation via Veo requires a paid API key selection from the user
    if (type === 'video' && !hasApiKey) {
      if (window.aistudio) {
        try {
          await window.aistudio.openSelectKey();
          setHasApiKey(true);
        } catch (err) {
          console.error("API Key selection failed:", err);
          return;
        }
      } else {
        console.warn("API Key selection not available in this environment.");
        return;
      }
    }

    setIsGenerating(true);
    try {
      // Inject brand voice into prompt for visual consistency across the campaign
      const enrichedPrompt = `${prompt}. Style: ${brandVoice}`;
      const url = type === 'image' 
        ? await gemini.generateImage(enrichedPrompt)
        : await gemini.generateVideo(enrichedPrompt);

      if (url) {
        // Create a new media item with a unique ID and timestamp for the gallery
        const newItem: MediaItem = {
          id: Math.random().toString(36).substring(7),
          type,
          url,
          prompt,
          timestamp: Date.now(),
        };
        setMediaItems(prev => [newItem, ...prev]);
      } else {
        console.warn("Generation returned no URL. This might be due to safety filters.");
      }
    } catch (error) {
      console.error("Generation failed:", error);
      // Graceful degradation: Check for specific API key errors to prompt re-selection
      if (error instanceof Error && error.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
    } finally {
      setIsGenerating(false);
      setManualPrompt('');
    }
  };

  /**
   * Generates a professional creative brief based on a visual concept.
   */
  const handleGenerateBrief = async (prompt: string) => {
    setIsGeneratingBrief(true);
    try {
      const brief = await gemini.generateBrief(`Concept: ${prompt}. Brand Voice: ${brandVoice}`);
      setActiveBrief(brief || null);
    } catch (error) {
      console.error("Brief generation failed:", error);
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const toggleMoodBoard = (id: string) => {
    setMoodBoard(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const deleteItem = (id: string) => {
    setMediaItems(prev => prev.filter(item => item.id !== id));
    setMoodBoard(prev => prev.filter(i => i !== id));
  };

  return (
    <div className="min-h-screen pb-24 relative overflow-x-hidden">
      <div className="atmosphere fixed inset-0" />
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[var(--bg)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">Prism AI</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono">Creative Director</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-glass transition-colors text-text-muted hover:text-[var(--text)]"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => setShowMoodBoard(true)}
              className="relative text-text-muted hover:text-[var(--text)] transition-colors"
            >
              <History className="w-5 h-5" />
              {moodBoard.length > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-brand-primary text-[10px] text-white rounded-full flex items-center justify-center font-bold">
                  {moodBoard.length}
                </span>
              )}
            </button>
            <button className="text-text-muted hover:text-[var(--text)] transition-colors"><Settings className="w-5 h-5" /></button>
            <div className="h-6 w-[1px] bg-glass-border" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-text-secondary uppercase tracking-widest">System Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
        
        {/* Left Column: Live Interaction */}
        <section className="lg:col-span-7 flex flex-col gap-12">
          <header>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-bold tracking-tighter leading-none mb-4"
            >
              Bring your <span className="text-brand-primary">vision</span> to life.
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-text-secondary max-w-xl leading-relaxed"
            >
              Speak to Prism to brainstorm concepts, then generate high-fidelity 
              visuals and video prototypes instantly.
            </motion.p>
          </header>

          <LiveAgent
            brandVoice={brandVoice}
            onVisualRequest={(type, prompt) => handleGenerate(type, prompt)}
            onStoryboardRequest={(concept) => {
              setActiveTab('storyboard');
              setVoiceStoryboardConcept(concept);
            }}
            onBriefRequest={(concept) => handleGenerateBrief(concept)}
          />

          {/* Tab Bar: Live Agent / Storyboard Creator */}
          <div className="flex p-1 bg-white/5 rounded-2xl w-full">
            <button
              onClick={() => setActiveTab('live')}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                activeTab === 'live'
                  ? "bg-glass-border text-[var(--text)] shadow-lg"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              <Mic className="w-4 h-4" />
              Live Agent
            </button>
            <button
              onClick={() => setActiveTab('storyboard')}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                activeTab === 'storyboard'
                  ? "bg-glass-border text-[var(--text)] shadow-lg"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              <BookOpen className="w-4 h-4" />
              Storyboard
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'storyboard' && (
              <motion.div
                key="storyboard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="glass-panel p-8"
              >
                <StoryboardCreator
                  brandVoice={brandVoice}
                  autoConcept={voiceStoryboardConcept}
                  onAutoConceptConsumed={() => setVoiceStoryboardConcept(undefined)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-text-muted">Concept History</h3>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-glass rounded-full text-[10px] font-mono text-text-muted uppercase tracking-widest">
                  {mediaItems.length} Items
                </span>
              </div>
            </div>
            <MediaGallery 
              items={mediaItems} 
              onDelete={deleteItem} 
              onGenerateBrief={handleGenerateBrief}
              isGenerating={isGenerating}
              isGeneratingBrief={isGeneratingBrief}
            />
          </div>
        </section>

        {/* Right Column: Manual Controls & Info */}
        <aside className="lg:col-span-5 flex flex-col gap-8">
          <div className="glass-panel p-8 sticky top-32">
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-lg">Brand Voice</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {voices.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setBrandVoice(v.name)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl text-sm transition-all border",
                      brandVoice === v.name 
                        ? "bg-brand-primary/10 border-brand-primary/50 text-[var(--text)]" 
                        : "bg-glass border-transparent text-text-muted hover:bg-glass-border"
                    )}
                  >
                    <span className="text-xl">{v.icon}</span>
                    <span className="font-medium">{v.name}</span>
                    {brandVoice === v.name && <div className="ml-auto w-2 h-2 bg-brand-primary rounded-full" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 pt-8">
              <div className="flex items-center gap-3 mb-8">
                <Plus className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-lg">Manual Generation</h3>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex p-1 bg-white/5 rounded-2xl">
                  <button 
                    onClick={() => setGenType('image')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                      genType === 'image' ? "bg-glass-border text-[var(--text)] shadow-lg" : "text-text-muted hover:text-text-secondary"
                    )}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Image
                  </button>
                  <button 
                    onClick={() => setGenType('video')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                      genType === 'video' ? "bg-glass-border text-[var(--text)] shadow-lg" : "text-text-muted hover:text-text-secondary"
                    )}
                  >
                    <VideoIcon className="w-4 h-4" />
                    Video
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] uppercase tracking-widest text-text-muted font-mono">Prompt</label>
                    <AnimatePresence>
                      {manualPromptError && (
                        <motion.span 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-[10px] uppercase tracking-widest text-red-400 font-mono"
                        >
                          Prompt required
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <motion.textarea 
                    animate={manualPromptError ? { x: [0, -5, 5, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    value={manualPrompt}
                    onChange={(e) => {
                      setManualPrompt(e.target.value);
                      if (e.target.value.trim()) setManualPromptError(false);
                    }}
                    placeholder={genType === 'image' ? "Describe the visual concept..." : "Describe the video motion..."}
                    className={cn(
                      "w-full h-32 bg-glass border rounded-2xl p-4 text-sm focus:outline-none transition-all resize-none",
                      manualPromptError 
                        ? "border-red-500/50 bg-red-500/5" 
                        : "border-glass-border focus:border-brand-primary/50"
                    )}
                  />
                </div>

                <button 
                  onClick={() => handleGenerate(genType, manualPrompt)}
                  disabled={isGenerating || !manualPrompt.trim()}
                  className="w-full py-4 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-brand-primary/20 group relative overflow-hidden"
                >
                  <AnimatePresence mode="wait">
                    {isGenerating ? (
                      <motion.div 
                        key="generating"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3"
                      >
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Creating...</span>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="idle"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3"
                      >
                        <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                        <span>Generate {genType === 'image' ? 'Concept' : 'Video'}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {isGenerating && (
                    <motion.div 
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    />
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-white/5 pt-8">
              <TodoList />
            </div>
          </div>
        </aside>
      </main>

      {/* Mood Board Modal */}
      <AnimatePresence>
        {showMoodBoard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoodBoard(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-panel w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative z-10"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-bold tracking-tight">Mood Board</h3>
                  <p className="text-text-muted text-sm font-mono uppercase tracking-widest mt-1">Curated Concepts • {brandVoice}</p>
                </div>
                <button 
                  onClick={() => setShowMoodBoard(false)}
                  className="p-3 hover:bg-glass rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 gap-6">
                {mediaItems.length === 0 ? (
                  <div className="col-span-full py-20 text-center text-text-muted opacity-50">
                    <p className="font-mono uppercase tracking-widest">No concepts to display</p>
                  </div>
                ) : (
                  mediaItems.map((item) => (
                    <div key={item.id} className="relative group rounded-2xl overflow-hidden aspect-square border border-glass-border">
                      {item.type === 'image' ? (
                        <img src={item.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <video src={item.url} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                        <p className="text-[10px] text-white/80 italic line-clamp-3">"{item.prompt}"</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-8 border-t border-glass-border flex justify-between items-center bg-glass">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-medium">Export Mood Board as Presentation</p>
                </div>
                <button className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all">
                  Download PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Brief Modal */}
      <AnimatePresence>
        {(activeBrief || isGeneratingBrief) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveBrief(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-panel w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col relative z-10"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-brand-primary" />
                  <h3 className="font-bold text-lg">Creative Brief</h3>
                </div>
                <button 
                  onClick={() => setActiveBrief(null)}
                  className="p-2 hover:bg-glass rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto custom-scrollbar">
                {isGeneratingBrief ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
                    <p className="text-text-muted font-mono text-xs uppercase tracking-widest">Drafting brief with Gemini Pro...</p>
                  </div>
                ) : (
                  <div className="markdown-body prose prose-invert max-w-none">
                    <Markdown>{activeBrief}</Markdown>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Status Indicator */}
      <AnimatePresence>
        {(isGenerating || isGeneratingBrief) && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] glass-panel px-6 py-3 flex items-center gap-4 border-brand-primary/30 shadow-2xl shadow-brand-primary/20 overflow-hidden"
          >
            {/* Shimmer Effect */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-primary/5 to-transparent -skew-x-12 animate-shimmer" />
            </div>

            <div className="relative z-10 flex items-center gap-4">
              <div className="relative">
                <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                <div className="absolute inset-0 blur-sm bg-brand-primary/40 animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
                  Prism is active
                </span>
                <motion.span 
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-xs font-mono uppercase tracking-[0.1em] text-[var(--text)]"
                >
                  {isGenerating ? "Synthesizing Visual Concept..." : "Drafting Creative Brief..."}
                </motion.span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Architecture Section */}
      <section className="max-w-7xl mx-auto px-6 mt-32">
        <ArchitectureDiagram />
      </section>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-6 mt-24 py-12 border-t border-glass-border text-center">
        <p className="text-text-muted opacity-50 text-xs font-mono uppercase tracking-[0.3em]">
          Powered by Gemini 2.5 Flash & Google GenMedia
        </p>
      </footer>
    </div>
  );
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("animate-spin", className)}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
