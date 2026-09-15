import type { DemeRoadmapApi } from './types';

declare global {
  interface Window {
    demeRoadmap?: DemeRoadmapApi;
  }
}

export {};
