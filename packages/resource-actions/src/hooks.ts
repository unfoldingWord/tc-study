/**
 * Resource action hooks for resource viewers
 * Cross-platform (React & React Native)
 */

import { useContext, useCallback } from 'react';
import { ResourceActionsContext } from './context';
import type {
  ResourceActionsProvider,
  DownloadOptions,
  ResourceUpdate,
  CollectionRef,
  ShareOptions,
  ExportOptions,
} from './types';

/**
 * Access resource actions functionality
 * 
 * @throws Error if used outside of ResourceActionsContext.Provider
 * 
 * @example
 * ```tsx
 * function ResourceViewer({ resourceId }) {
 *   const actions = useResourceActions();
 *   
 *   const handleDownload = async () => {
 *     await actions.downloadResource(resourceId);
 *   };
 *   
 *   return <button onClick={handleDownload}>Download</button>;
 * }
 * ```
 */
export function useResourceActions(): ResourceActionsProvider {
  const actions = useContext(ResourceActionsContext);
  
  if (!actions) {
    throw new Error(
      'useResourceActions must be used within a ResourceActionsContext.Provider. ' +
      'Make sure your app provides a resource actions implementation.'
    );
  }
  
  return actions;
}

/**
 * Check if resource actions are available
 * Useful for optional features
 * 
 * @example
 * ```tsx
 * function DownloadButton() {
 *   const hasActions = useHasResourceActions();
 *   
 *   if (!hasActions) return null;
 *   
 *   return <button>Download</button>;
 * }
 * ```
 */
export function useHasResourceActions(): boolean {
  const actions = useContext(ResourceActionsContext);
  return actions !== null;
}

/**
 * Resource management actions
 * Convenience hook for download/delete/update operations
 * 
 * @example
 * ```tsx
 * function ResourceCard({ resourceId }) {
 *   const { download, deleteResource, update, isOffline } = useResourceManagement(resourceId);
 *   const [offline, setOffline] = useState(false);
 *   
 *   useEffect(() => {
 *     isOffline().then(setOffline);
 *   }, [isOffline]);
 *   
 *   return (
 *     <div>
 *       <button onClick={download}>Download</button>
 *       <button onClick={() => deleteResource()}>Delete</button>
 *       {offline && <span>Available offline</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useResourceManagement(resourceId: string) {
  const actions = useResourceActions();
  
  const download = useCallback(
    (options?: DownloadOptions) => actions.downloadResource(resourceId, options),
    [actions, resourceId]
  );
  
  const deleteResource = useCallback(
    (localOnly?: boolean) => actions.deleteResource(resourceId, localOnly),
    [actions, resourceId]
  );
  
  const update = useCallback(
    (updates: ResourceUpdate) => actions.updateResource(resourceId, updates),
    [actions, resourceId]
  );
  
  const refresh = useCallback(
    () => actions.refreshResource(resourceId),
    [actions, resourceId]
  );
  
  const isOffline = useCallback(
    () => actions.isResourceAvailableOffline(resourceId),
    [actions, resourceId]
  );
  
  const getProgress = useCallback(
    () => actions.getDownloadProgress(resourceId),
    [actions, resourceId]
  );
  
  return {
    download,
    deleteResource,
    update,
    refresh,
    isOffline,
    getProgress,
  };
}

/**
 * Collection management for a resource
 * 
 * @example
 * ```tsx
 * function CollectionButtons({ resourceId }) {
 *   const { addTo, removeFrom, getCollections } = useResourceCollections(resourceId);
 *   
 *   const handleAddToCollection = async () => {
 *     await addTo({ id: 'my-collection', name: 'My Collection' });
 *   };
 *   
 *   return <button onClick={handleAddToCollection}>Add to Collection</button>;
 * }
 * ```
 */
export function useResourceCollections(resourceId: string) {
  const actions = useResourceActions();
  
  const addTo = useCallback(
    (collection: CollectionRef) => actions.addToCollection(resourceId, collection),
    [actions, resourceId]
  );
  
  const removeFrom = useCallback(
    (collectionId: string) => actions.removeFromCollection(resourceId, collectionId),
    [actions, resourceId]
  );
  
  const getCollections = useCallback(
    () => actions.getResourceCollections(resourceId),
    [actions, resourceId]
  );
  
  return {
    addTo,
    removeFrom,
    getCollections,
  };
}

/**
 * Sharing and export actions
 * 
 * @example
 * ```tsx
 * function ShareMenu({ resourceId }) {
 *   const { share, exportResource, copyToClipboard } = useResourceSharing(resourceId);
 *   
 *   return (
 *     <div>
 *       <button onClick={() => share()}>Share</button>
 *       <button onClick={() => exportResource({ format: 'pdf' })}>Export PDF</button>
 *       <button onClick={() => copyToClipboard()}>Copy</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useResourceSharing(resourceId: string) {
  const actions = useResourceActions();
  
  const share = useCallback(
    (options?: ShareOptions) => actions.shareResource(resourceId, options),
    [actions, resourceId]
  );
  
  const exportResource = useCallback(
    (options: ExportOptions) => actions.exportResource(resourceId, options),
    [actions, resourceId]
  );
  
  const copyToClipboard = useCallback(
    (contentId?: string) => actions.copyToClipboard(resourceId, contentId),
    [actions, resourceId]
  );
  
  return {
    share,
    exportResource,
    copyToClipboard,
  };
}
