export interface LevelPreset {
  id: string;
  name: string;
  description: string;
  stack: number[];
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
}

export interface SolverResult {
  minFlips: number;
  sequence: number[]; // e.g. [6, 4, 2, ...] where each number is k (number of pancakes flipped from top)
}

export type CameraPreset = 'default' | 'top' | 'side' | 'diner';

export interface ParticleEffect {
  x: number;
  y: number;
  z: number;
  color?: string;
}
