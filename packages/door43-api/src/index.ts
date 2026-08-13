/**
 * @bt-synergy/door43-api
 * 
 * Centralized Door43 API client for BT Synergy monorepo
 */

export {
    Door43ApiClient, createDoor43ApiClient, getDoor43ApiClient, resetDoor43ApiClient,
    Door43ApiError, isDoor43ApiError,
} from './Door43ApiClient';

export type {
    Door43ApiConfig, Door43Catalog, Door43Language, Door43Organization, Door43Owner, Door43Resource
} from './Door43ApiClient';

export {
  readResponseArrayBufferWithProgress,
} from './readResponseArrayBufferWithProgress'

export type { ByteProgressCallback } from './readResponseArrayBufferWithProgress'

export {
    getContentUrl,
    getUSFMUrl,
    getNotesUrl,
    getQuestionsUrl,
    getWordsLinksUrl,
} from './content-helpers';

export type { ContentUrlOptions } from './content-helpers';