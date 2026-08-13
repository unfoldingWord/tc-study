import { FolderOpen, Save, Trash2 } from 'lucide-react';
import type { SidebarDisplayMode } from './types';

interface ResourceLibraryControlsProps {
  displayMode: SidebarDisplayMode;
  selectedCount: number;
  isDraggingOverTrash: boolean;
  onTrashDragOver: (e: React.DragEvent) => void;
  onTrashDragLeave: (e: React.DragEvent) => void;
  onTrashDrop: (e: React.DragEvent) => void;
  onDeleteSelected: () => void;
  onSaveCollection: () => void;
  onLoadCollection: () => void;
}

function TrashButton({
  selectedCount,
  isDraggingOverTrash,
  isExpanded,
  onTrashDragOver,
  onTrashDragLeave,
  onTrashDrop,
  onDeleteSelected,
}: {
  selectedCount: number;
  isDraggingOverTrash: boolean;
  isExpanded: boolean;
  onTrashDragOver: (e: React.DragEvent) => void;
  onTrashDragLeave: (e: React.DragEvent) => void;
  onTrashDrop: (e: React.DragEvent) => void;
  onDeleteSelected: () => void;
}) {
  const iconSize = isExpanded ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const badgeSize = isExpanded
    ? 'absolute -top-1 -right-1 w-4 h-4 text-[10px]'
    : 'absolute -top-0.5 -right-0.5 w-3 h-3 text-[8px]';

  return (
    <button
      onDragOver={onTrashDragOver}
      onDragLeave={onTrashDragLeave}
      onDrop={onTrashDrop}
      onClick={selectedCount > 0 ? onDeleteSelected : undefined}
      className={`${isExpanded ? 'p-2' : 'p-1 flex items-center justify-center'} rounded transition-all relative ${
        isDraggingOverTrash
          ? 'bg-red-100 text-red-700 scale-110'
          : selectedCount > 0
            ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : isExpanded
              ? 'text-red-600 hover:bg-red-50'
              : 'text-red-600 hover:bg-red-50'
      }`}
      title={
        selectedCount > 0
          ? isExpanded
            ? `Delete ${selectedCount} selected resource(s) from collection`
            : `Delete ${selectedCount} selected`
          : isExpanded
            ? 'Drag resource here to remove from collection'
            : 'Drag to delete'
      }
      aria-label={
        selectedCount > 0
          ? isExpanded
            ? `Delete ${selectedCount} selected resources from collection`
            : `Delete ${selectedCount} selected resources`
          : isExpanded
            ? 'Delete resource from collection'
            : 'Delete resource'
      }
    >
      <Trash2 className={iconSize} />
      {selectedCount > 0 && (
        <span
          className={`${badgeSize} bg-purple-600 text-white font-bold rounded-full flex items-center justify-center`}
        >
          {selectedCount}
        </span>
      )}
    </button>
  );
}

export function ResourceLibraryControls({
  displayMode,
  selectedCount,
  isDraggingOverTrash,
  onTrashDragOver,
  onTrashDragLeave,
  onTrashDrop,
  onDeleteSelected,
  onSaveCollection,
  onLoadCollection,
}: ResourceLibraryControlsProps) {
  const { isExpanded, isMedium, isCompact } = displayMode;
  const actionIconSize = isExpanded ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const actionPadding = isExpanded ? 'p-2' : 'p-1 flex items-center justify-center';

  return (
    <div
      className={`border-t border-gray-100 bg-white ${
        isExpanded ? 'px-3 py-2' : isMedium ? 'px-2.5 py-2' : isCompact ? 'px-2 py-1.5' : 'px-1 py-1.5'
      }`}
    >
      {isExpanded ? (
        <div className="flex items-center justify-center gap-2">
          <TrashButton
            selectedCount={selectedCount}
            isDraggingOverTrash={isDraggingOverTrash}
            isExpanded
            onTrashDragOver={onTrashDragOver}
            onTrashDragLeave={onTrashDragLeave}
            onTrashDrop={onTrashDrop}
            onDeleteSelected={onDeleteSelected}
          />
          <button
            onClick={onSaveCollection}
            className={`${actionPadding} text-gray-700 hover:bg-gray-100 rounded transition-colors`}
            title="Save or download collection"
            aria-label="Save or download collection"
          >
            <Save className={actionIconSize} />
          </button>
          <button
            onClick={onLoadCollection}
            className={`${actionPadding} text-gray-700 hover:bg-gray-100 rounded transition-colors`}
            title="Load collection"
            aria-label="Load collection"
          >
            <FolderOpen className={actionIconSize} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <TrashButton
            selectedCount={selectedCount}
            isDraggingOverTrash={isDraggingOverTrash}
            isExpanded={false}
            onTrashDragOver={onTrashDragOver}
            onTrashDragLeave={onTrashDragLeave}
            onTrashDrop={onTrashDrop}
            onDeleteSelected={onDeleteSelected}
          />
          <button
            onClick={onSaveCollection}
            className={`${actionPadding} text-gray-500 hover:bg-gray-50 rounded transition-colors`}
            title="Save or download collection"
            aria-label="Save or download collection"
          >
            <Save className={actionIconSize} />
          </button>
          <button
            onClick={onLoadCollection}
            className={`${actionPadding} text-gray-500 hover:bg-gray-50 rounded transition-colors`}
            title="Load collection"
            aria-label="Load collection"
          >
            <FolderOpen className={actionIconSize} />
          </button>
        </div>
      )}
    </div>
  );
}
