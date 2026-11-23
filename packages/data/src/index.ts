export { buildDataset, applyManualOverrides, estimateFirstSeen, repairFirstSeen, FIRST_SEEN_BEFORE_TRACKING, type BuildOptions, type BuildResult, type ManualOverrides } from './build.js';
export { fetchLiveEvents, mergeEvents, type ArchivedEvent, type LiveEvent } from './events.js';
export { SOURCES, type FetchOptions } from './sources.js';
/** Bump when the generated dataset's shape or rules change: running servers rebuild at startup instead of waiting for the next slot. */
export const PIPELINE_VERSION = 12;
