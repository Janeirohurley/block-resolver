import BlockPuzzlePage from './pages/BlockPuzzlePage';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: 'Block Puzzle Assistant',
    path: '/',
    element: <BlockPuzzlePage />,
    public: true,
  },
];
