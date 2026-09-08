import type { MemoItem } from '../store/useAppStore';

// add-quadmemo-classification replaces this stub with dictionary matching.
export function resolvePlacement(_token: string): Pick<MemoItem, 'quadrant' | 'matchedEntry'> {
  return { quadrant: 'q4', matchedEntry: null };
}
