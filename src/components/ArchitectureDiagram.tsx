import React from 'react';
import { motion } from 'motion/react';
import { Layout, Server, Cloud, Database, Cpu, Globe, Lock, Zap } from 'lucide-react';

/**
 * ArchitectureDiagram Component
 * Visually documents the system's cloud-native architecture.
 * Maps the frontend client, Gemini SDK integration, and Google Cloud hosting.
 */
export const ArchitectureDiagram: React.FC = () => {
  const nodes = [
    {
      id: 'client',
      title: 'Frontend Client',
      icon: <Layout className="w-6 h-6" />,
      description: 'React + Vite SPA',
      tech: ['TypeScript', 'Tailwind CSS', 'Motion'],
      color: 'blue'
    },
    {
      id: 'sdk',
      title: 'Google GenAI SDK',
      icon: <Cpu className="w-6 h-6" />,
      description: 'Real-time Multimodal Bridge',
      tech: ['Live API', 'WebSockets', 'PCM Audio'],
      color: 'orange'
    },
    {
      id: 'cloud',
      title: 'Google Cloud Platform',
      icon: <Cloud className="w-6 h-6" />,
      description: 'Production Hosting',
      tech: ['Cloud Run', 'Nginx Reverse Proxy'],
      color: 'green'
    },
    {
      id: 'models',
      title: 'Gemini Models',
      icon: <Zap className="w-6 h-6" />,
      description: 'Intelligence Layer',
      tech: ['Gemini 2.5 Flash', 'Veo 3.1'],
      color: 'purple'
    }
  ];

  return (
    <div className="w-full max-w-5xl mx-auto p-8 glass-panel overflow-hidden relative">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-brand-primary)_0%,_transparent_70%)]" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col gap-2 mb-12">
          <h2 className="text-2xl font-mono uppercase tracking-widest text-brand-primary">System Architecture</h2>
          <p className="text-text-secondary text-sm max-w-2xl">
            Prism is built on a high-performance, real-time architecture leveraging Google's most advanced multimodal models and cloud infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connection Lines (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent -translate-y-1/2 -z-10" />

          {nodes.map((node, i) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-panel p-6 flex flex-col gap-4 border-brand-primary/10 hover:border-brand-primary/30 transition-colors group relative"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                {node.icon}
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-1">{node.title}</h3>
                <p className="text-xs text-text-muted mb-4">{node.description}</p>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto">
                {node.tech.map(t => (
                  <span key={t} className="text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-text-secondary">
                    {t}
                  </span>
                ))}
              </div>

              {/* Status Indicator */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[8px] uppercase tracking-tighter text-green-500/70 font-mono">Active</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 border-t border-white/5">
          <div className="flex gap-4">
            <Globe className="w-5 h-5 text-brand-primary shrink-0" />
            <div>
              <h4 className="text-sm font-semibold mb-1">Global Delivery</h4>
              <p className="text-xs text-text-muted">Deployed via Cloud Run with automatic scaling and low-latency edge routing.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Lock className="w-5 h-5 text-brand-primary shrink-0" />
            <div>
              <h4 className="text-sm font-semibold mb-1">Secure SDK</h4>
              <p className="text-xs text-text-muted">Encrypted WebSocket connections for real-time multimodal streaming.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Zap className="w-5 h-5 text-brand-primary shrink-0" />
            <div>
              <h4 className="text-sm font-semibold mb-1">Vertex AI Integration</h4>
              <p className="text-xs text-text-muted">Direct access to Gemini 2.5 Flash and Veo 3.1 for state-of-the-art creative synthesis.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
