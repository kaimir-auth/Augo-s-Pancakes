import React, { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { RotateCcw, Undo2, Shuffle, Volume2, VolumeX } from 'lucide-react';
import { PancakeCanvas } from './components/PancakeCanvas';
import { flipPrefix, isSorted } from './utils/solver';
import { sound } from './utils/sound';

const DEFAULT_STACK = [3, 6, 2, 4, 7, 1, 5];

export default function App() {
  const [initialStack, setInitialStack] = useState<number[]>(DEFAULT_STACK);
  const [stack, setStack] = useState<number[]>(DEFAULT_STACK);
  const [history, setHistory] = useState<number[][]>([]);
  const [flipsCount, setFlipsCount] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const isWon = useMemo(() => isSorted(stack), [stack]);

  // Victory celebration
  useEffect(() => {
    if (isWon && flipsCount > 0 && !isAnimating) {
      sound.playVictoryBell();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#d97706', '#fbbf24', '#10b981'],
      });
    }
  }, [isWon, flipsCount, isAnimating]);

  // Flip callback from 3D animation
  const handleFinishFlip = useCallback((k: number) => {
    setStack((prev) => {
      setHistory((hist) => [...hist, prev]);
      return flipPrefix(prev, k);
    });
    setFlipsCount((c) => c + 1);
    setIsAnimating(false);
  }, []);

  // Trigger flip through 3D spatula animation
  const handleTriggerFlip = useCallback((k: number) => {
    if (isAnimating || isWon || k < 2 || k > stack.length) return;
    setIsAnimating(true);
    const trigger = (window as unknown as { triggerPancakeFlip?: (k: number) => void }).triggerPancakeFlip;
    if (trigger) {
      trigger(k);
    } else {
      handleFinishFlip(k);
    }
  }, [isAnimating, isWon, stack.length, handleFinishFlip]);

  // Reset to original stack
  const handleReset = useCallback(() => {
    if (isAnimating) return;
    setStack([...initialStack]);
    setHistory([]);
    setFlipsCount(0);
    sound.playHoverTick();
  }, [isAnimating, initialStack]);

  // Undo last flip
  const handleUndo = useCallback(() => {
    if (isAnimating || history.length === 0) return;
    const prevStack = history[history.length - 1];
    setHistory((hist) => hist.slice(0, hist.length - 1));
    setStack(prevStack);
    setFlipsCount((c) => Math.max(0, c - 1));
    sound.playHoverTick();
  }, [isAnimating, history]);

  // Shuffle a new random stack
  const handleShuffle = useCallback(() => {
    if (isAnimating) return;
    const size = initialStack.length;
    const arr = Array.from({ length: size }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (isSorted(arr)) {
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    setInitialStack(arr);
    setStack(arr);
    setHistory([]);
    setFlipsCount(0);
    sound.playHoverTick();
  }, [isAnimating, initialStack.length]);

  const handleToggleSound = () => {
    sound.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Keyboard shortcuts (R, Z, U)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        handleReset();
      } else if (key === 'z' || key === 'u') {
        e.preventDefault();
        handleUndo();
      } else if (key >= '2' && key <= '9') {
        const k = parseInt(key, 10);
        if (k <= stack.length) {
          e.preventDefault();
          handleTriggerFlip(k);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReset, handleUndo, handleTriggerFlip, stack.length]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#18120e] select-none">
      {/* 3D Canvas (plate, table, pancakes, animations) */}
      <div className="absolute inset-0">
        <PancakeCanvas
          stack={stack}
          hoveredIndex={hoveredIndex}
          onHoverIndex={setHoveredIndex}
          onFlip={handleFinishFlip}
          isAnimating={isAnimating}
          isWon={isWon}
          hintK={null}
          cameraPreset="default"
        />
      </div>

      {/* Minimal Top Header */}
      <div className="absolute top-8 inset-x-0 flex flex-col items-center pointer-events-none text-center">
        <h1 className="text-xl sm:text-2xl font-serif-display font-semibold text-[#f5ebd9] tracking-wide drop-shadow-md">
          3D Pancake Sorting
        </h1>
        <p
          className={`text-xs sm:text-sm mt-1 transition-colors drop-shadow ${
            isWon
              ? 'text-emerald-400 font-medium'
              : flipsCount > 0
              ? 'text-[#e6cfb8]'
              : 'text-[#baa18c]'
          }`}
        >
          {isWon
            ? `Solved in ${flipsCount} flips!`
            : flipsCount > 0
            ? `Flips: ${flipsCount}`
            : 'Click any pancake to flip everything above it'}
        </p>
      </div>

      {/* Minimal Bottom Floating Controls */}
      <div className="absolute bottom-6 inset-x-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 bg-[#221711]/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl pointer-events-auto">
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || isAnimating}
            title="Undo (Z)"
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              history.length > 0 && !isAnimating
                ? 'text-[#d6c2af] hover:text-white hover:bg-white/10'
                : 'text-white/20 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleReset}
            disabled={isAnimating}
            title="Reset (R)"
            className="p-2 rounded-full text-[#d6c2af] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleShuffle}
            disabled={isAnimating}
            title="Shuffle New Stack"
            className="p-2 rounded-full text-[#d6c2af] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          <button
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute' : 'Unmute'}
            className="p-2 rounded-full text-[#d6c2af] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-red-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
