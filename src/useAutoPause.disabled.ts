export type SensorState = 'idle' | 'starting' | 'watching' | 'analyzing' | 'unavailable' | 'denied' | 'error';
export type LocalModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface AutoPauseSensorStates {
  voice: SensorState;
  model: LocalModelState;
}

export function useAutoPause(): AutoPauseSensorStates {
  return { voice: 'idle', model: 'idle' };
}
