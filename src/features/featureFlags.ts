// Kept out of the public beta while the local speech model is evaluated.
// Set VITE_ENABLE_VOICE_AUTO_PAUSE=true only for dedicated development builds.
export const voiceAutoPauseAvailable = import.meta.env.VITE_ENABLE_VOICE_AUTO_PAUSE === 'true';
