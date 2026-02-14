/**
 * @bt-synergy/door43-api
 * 
 * Centralized Door43 API client for BT Synergy monorepo
 */

export {
    Door43ApiClient, createDoor43ApiClient, getDoor43ApiClient, resetDoor43ApiClient
} from './Door43ApiClient';

export type {
    Door43ApiConfig, Door43ApiError, Door43Catalog, Door43Language, Door43Organization, Door43Owner, Door43Resource
} from './Door43ApiClient';

export {
    getContentUrl,
    getUSFMUrl,
    getNotesUrl,
    getQuestionsUrl,
    getWordsLinksUrl,
} from './content-helpers';

export type { ContentUrlOptions } from './content-helpers';