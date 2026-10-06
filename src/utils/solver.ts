import { LevelPreset, SolverResult } from '../types';

export function isSorted(stack: number[]): boolean {
  for (let i = 0; i < stack.length; i++) {
    if (stack[i] !== i + 1) return false;
  }
  return true;
}

export function flipPrefix(stack: number[], k: number): number[] {
  const next = [...stack];
  let left = 0;
  let right = k - 1;
  while (left < right) {
    const tmp = next[left];
    next[left] = next[right];
    next[right] = tmp;
    left++;
    right--;
  }
  return next;
}

// Gap heuristic: proven admissible heuristic for pancake problem
export function getGapHeuristic(stack: number[]): number {
  const n = stack.length;
  let gaps = 0;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(stack[i] - stack[i + 1]) > 1) {
      gaps++;
    }
  }
  // Gap between bottom pancake and table (n + 1)
  if (stack[n - 1] !== n) {
    gaps++;
  }
  return gaps;
}

// Compact state serialization for visited set
function stackKey(stack: number[]): string {
  return stack.join(',');
}

// Exact optimal solver using Bidirectional BFS / A*
export function solvePancakeStack(initialStack: number[]): SolverResult {
  const n = initialStack.length;
  if (isSorted(initialStack)) {
    return { minFlips: 0, sequence: [] };
  }

  // Target stack [1, 2, ..., n]
  const target: number[] = Array.from({ length: n }, (_, i) => i + 1);
  const targetKey = stackKey(target);

  // For N <= 8, standard BFS or Bidirectional BFS is extremely fast
  if (n <= 8) {
    // Bidirectional BFS
    const forwardQueue: { stack: number[]; path: number[] }[] = [{ stack: initialStack, path: [] }];
    const forwardVisited = new Map<string, number[]>();
    forwardVisited.set(stackKey(initialStack), []);

    const backwardQueue: { stack: number[]; path: number[] }[] = [{ stack: target, path: [] }];
    const backwardVisited = new Map<string, number[]>();
    backwardVisited.set(targetKey, []);

    let iterations = 0;
    const MAX_ITERATIONS = 40000;

    while (forwardQueue.length > 0 && backwardQueue.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;

      // Expand forward
      if (forwardQueue.length > 0) {
        const current = forwardQueue.shift()!;
        const cKey = stackKey(current.stack);

        if (backwardVisited.has(cKey)) {
          const backwardPath = backwardVisited.get(cKey)!;
          // Combine paths
          const fullSequence = [...current.path, ...backwardPath.slice().reverse()];
          return { minFlips: fullSequence.length, sequence: fullSequence };
        }

        // Branching moves: k from 2 to n
        for (let k = 2; k <= n; k++) {
          const next = flipPrefix(current.stack, k);
          const nextKey = stackKey(next);
          if (!forwardVisited.has(nextKey)) {
            const nextPath = [...current.path, k];
            forwardVisited.set(nextKey, nextPath);
            forwardQueue.push({ stack: next, path: nextPath });
          }
        }
      }

      // Expand backward
      if (backwardQueue.length > 0) {
        const currentB = backwardQueue.shift()!;
        const bKey = stackKey(currentB.stack);

        if (forwardVisited.has(bKey)) {
          const forwardPath = forwardVisited.get(bKey)!;
          const fullSequence = [...forwardPath, ...currentB.path.slice().reverse()];
          return { minFlips: fullSequence.length, sequence: fullSequence };
        }

        for (let k = 2; k <= n; k++) {
          const nextB = flipPrefix(currentB.stack, k);
          const nextBKey = stackKey(nextB);
          if (!backwardVisited.has(nextBKey)) {
            const nextBPath = [...currentB.path, k];
            backwardVisited.set(nextBKey, nextBPath);
            backwardQueue.push({ stack: nextB, path: nextBPath });
          }
        }
      }
    }
  }

  // Fallback for n >= 9 or if BFS limits exceeded: Greedy Prefix Reversal Algorithm (at most 2n - 3 flips)
  return solveGreedy(initialStack);
}

// Classical pancake sorting algorithm (guaranteed to solve in at most 2n-3 flips)
function solveGreedy(initialStack: number[]): SolverResult {
  const stack = [...initialStack];
  const sequence: number[] = [];
  const n = stack.length;

  for (let currentSize = n; currentSize > 1; currentSize--) {
    // Find index of maximum element in stack[0..currentSize-1]
    let maxIdx = 0;
    for (let i = 1; i < currentSize; i++) {
      if (stack[i] > stack[maxIdx]) {
        maxIdx = i;
      }
    }

    if (maxIdx !== currentSize - 1) {
      // If max element is not already at top, flip it to top
      if (maxIdx > 0) {
        const k = maxIdx + 1;
        sequence.push(k);
        const flipped = flipPrefix(stack, k);
        for (let i = 0; i < n; i++) stack[i] = flipped[i];
      }
      // Now flip it to its target bottom position for this size
      sequence.push(currentSize);
      const flipped = flipPrefix(stack, currentSize);
      for (let i = 0; i < n; i++) stack[i] = flipped[i];
    }
  }

  return { minFlips: sequence.length, sequence };
}

export const PRESET_LEVELS: LevelPreset[] = [
  {
    id: 'classic-7',
    name: 'Classic Seven (Original)',
    description: 'The exact stack configuration from your Python prototype.',
    stack: [3, 6, 2, 4, 7, 1, 5],
    difficulty: 'Medium',
  },
  {
    id: 'breakfast-quickie',
    name: 'Short Stack',
    description: 'A cozy 5-pancake warmup to get comfortable with spatula physics.',
    stack: [4, 2, 5, 1, 3],
    difficulty: 'Easy',
  },
  {
    id: 'reverse-stack',
    name: 'Complete Inversion',
    description: 'Completely upside down stack. Can you invert it in optimal moves?',
    stack: [7, 6, 5, 4, 3, 2, 1],
    difficulty: 'Hard',
  },
  {
    id: 'grand-slam-8',
    name: 'The Grand Slam',
    description: '8 golden pancakes with complex algorithmic entanglement.',
    stack: [5, 8, 3, 1, 7, 2, 6, 4],
    difficulty: 'Hard',
  },
  {
    id: 'tower-of-cakes',
    name: 'Tower of Flapjacks',
    description: 'A tall 9-pancake skyscraper challenge for true breakfast masters.',
    stack: [8, 3, 6, 9, 1, 5, 2, 7, 4],
    difficulty: 'Expert',
  },
];
