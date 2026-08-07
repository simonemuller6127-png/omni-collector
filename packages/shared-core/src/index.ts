export const PACKAGE_NAME = "@omni/shared-core";
export {
  MESSAGE_TYPES,
  REQUIRED_PAYLOAD_FIELDS,
  validateOmniMessage,
} from "./comm.js";
export type { OmniMessage, OmniMessageType, ValidationResult } from "./comm.js";
export { SYNC_TASK_STATUSES, SYNC_TASK_TRANSITIONS, validateSyncTransition } from "./status.js";
export type { SyncTaskStatus, SyncTransitionResult } from "./status.js";
export type { CollectionDTO, UserZone } from "./dto.js";
export { scoreSeriesPair, findSeriesMatches } from "./series.js";
export type { SeriesCandidate, SeriesMatch } from "./series.js";
