import React, { useState } from 'react';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

/**
 * TodoList: A creative task manager for the Prism AI dashboard.
 * Features:
 * - Task creation and deletion
 * - Completion toggling with visual indicators (strikethrough and color change)
 * - Framer Motion animations for list interactions
 */
export function TodoList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const task: Task = {
      id: Math.random().toString(36).substring(7),
      text: newTask,
      completed: false,
    };
    setTasks([task, ...tasks]);
    setNewTask('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-brand-primary" />
        <h3 className="font-bold text-lg">Creative Tasks</h3>
      </div>

      <form onSubmit={addTask} className="relative">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a creative task..."
          className="w-full bg-white/5 border border-glass-border rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-brand-primary/50 transition-all"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-brand-primary/20 text-brand-primary rounded-lg hover:bg-brand-primary/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={cn(
                "group flex items-center justify-between p-3 rounded-xl border transition-all",
                task.completed 
                  ? "bg-brand-primary/5 border-brand-primary/20" 
                  : "bg-glass border-transparent hover:border-glass-border"
              )}
            >
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => toggleTask(task.id)}
                  className={cn(
                    "transition-colors shrink-0",
                    task.completed ? "text-brand-primary" : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
                <span className={cn(
                  "text-sm transition-all break-words",
                  task.completed ? "text-text-muted line-through" : "text-[var(--text)]"
                )}>
                  {task.text}
                </span>
              </div>
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500/50 hover:text-red-500 transition-all shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <p className="text-center py-8 text-text-muted text-xs font-mono uppercase tracking-widest opacity-50">
            No tasks yet
          </p>
        )}
      </div>
    </div>
  );
}
