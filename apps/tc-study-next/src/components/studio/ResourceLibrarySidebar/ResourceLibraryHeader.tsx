import { FolderOpen, Plus } from 'lucide-react';
import type { SidebarDisplayMode } from './types';

interface ResourceLibraryHeaderProps {
  displayMode: SidebarDisplayMode;
  activeCollection?: { title?: string; name?: string };
  onAddClick: () => void;
}

export function ResourceLibraryHeader({
  displayMode,
  activeCollection,
  onAddClick,
}: ResourceLibraryHeaderProps) {
  const { isExpanded, isMedium, isCompact } = displayMode;

  return (
    <div
      className={`border-b border-gray-100 bg-white ${
        isExpanded
          ? 'px-3 py-2'
          : isMedium
            ? 'px-2.5 py-2'
            : isCompact
              ? 'px-2 py-1.5'
              : 'px-1 py-1.5 justify-center'
      }`}
    >
      {activeCollection && (isExpanded || isMedium) && (
        <div className="flex items-center gap-1.5 mb-2">
          <FolderOpen className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <span
            className="text-xs font-medium text-blue-900 truncate"
            title={activeCollection.title || activeCollection.name}
          >
            {activeCollection.title || activeCollection.name}
          </span>
        </div>
      )}

      <div className="flex items-center">
        <button
          onClick={onAddClick}
          className="p-1 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
          title="Add resources"
          aria-label="Add resources to library"
        >
          <Plus className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
