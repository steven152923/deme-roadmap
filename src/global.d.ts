import type { DemeRoadmapApi } from './types';

declare module '*.css';

declare global {
  interface Window {
    demeRoadmap?: DemeRoadmapApi;
  }
}

export {};
