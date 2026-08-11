/**
 * Linked-panels message plugins registered by Studio / Read containers.
 */
import {
  entryLinkClickPlugin,
  linkClickPlugin,
  notesTokenGroupsPlugin,
  obsFrameHighlightPlugin,
  obsFrameQuotesPlugin,
  scriptureContentRequestPlugin,
  scriptureContentResponsePlugin,
  scriptureTokensBroadcastPlugin,
  tokenClickPlugin,
  verseFilterPlugin,
} from '../../plugins/messageTypePlugins'

export const STUDIO_MESSAGE_PLUGINS = [
  tokenClickPlugin,
  verseFilterPlugin,
  linkClickPlugin,
  entryLinkClickPlugin,
  notesTokenGroupsPlugin,
  scriptureTokensBroadcastPlugin,
  scriptureContentRequestPlugin,
  scriptureContentResponsePlugin,
  obsFrameHighlightPlugin,
  obsFrameQuotesPlugin,
] as const
