import { Package } from 'lucide-react';
import { getLanguageName, getResourceIcon, getResourceId } from './resourceLibraryUtils';
import type { ResourceItem, SidebarDisplayMode } from './types';

interface ResourceLibraryItemProps {
  resource: ResourceItem;
  displayMode: SidebarDisplayMode;
  availableLanguages: Array<{ code: string; name: string }>;
  usageCount: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function getItemClassName(
  displayMode: SidebarDisplayMode,
  isSelected: boolean,
  isMultiSelected: boolean,
): string {
  const { isExpanded, isMedium, isCompact } = displayMode;

  if (isExpanded) {
    return `mx-2 mb-2 rounded-lg border-2 p-3 ${
      isSelected
        ? 'border-blue-500 bg-blue-50 shadow-md'
        : isMultiSelected
          ? 'border-purple-500 bg-purple-50 shadow-md'
          : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
    }`;
  }
  if (isMedium) {
    return `mx-2 mb-2 rounded-lg border p-2.5 ${
      isSelected
        ? 'border-blue-500 bg-blue-50 shadow-sm'
        : isMultiSelected
          ? 'border-purple-500 bg-purple-50 shadow-sm'
          : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
    }`;
  }
  if (isCompact) {
    return `mx-1.5 mb-1.5 rounded-md border p-2 ${
      isSelected
        ? 'border-blue-500 bg-blue-50 shadow-sm'
        : isMultiSelected
          ? 'border-purple-500 bg-purple-50 shadow-sm'
          : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
    }`;
  }
  return `mx-1 mb-1.5 rounded-md border py-1.5 px-1 ${
    isSelected
      ? 'border-blue-400 bg-blue-50'
      : isMultiSelected
        ? 'border-purple-400 bg-purple-50'
        : 'border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300'
  }`;
}

export function ResourceLibraryItem({
  resource,
  displayMode,
  availableLanguages,
  usageCount,
  isSelected,
  isMultiSelected,
  onClick,
  onDragStart,
  onDragEnd,
}: ResourceLibraryItemProps) {
  const { isExpanded, isMedium, isCompact, isMinimal } = displayMode;
  const Icon = getResourceIcon(resource.type, resource.subject);
  const resourceId = getResourceId(resource.key, resource);
  const languageName = getLanguageName(
    resource.languageName,
    resource.languageCode || resource.language,
    availableLanguages,
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`transition-all group relative cursor-pointer ${getItemClassName(displayMode, isSelected, isMultiSelected)}`}
      title={
        isExpanded
          ? `Click to select (multi-select), drag to add or drag to trash\n${resource.title}${usageCount > 0 ? ` (${usageCount} in use)` : ''}`
          : resource.title
      }
    >
      {usageCount > 0 && (
        <div
          className={`absolute rounded-full bg-gray-200 text-gray-600 font-medium opacity-70 group-hover:opacity-100 transition-opacity ${
            isExpanded || isMedium
              ? 'top-1 right-1 px-1.5 py-0.5 text-[9px]'
              : isCompact
                ? 'top-0.5 right-0.5 px-1 py-0.5 text-[8px]'
                : 'top-0.5 right-0.5 w-3 h-3 text-[7px] flex items-center justify-center'
          }`}
        >
          {usageCount}
        </div>
      )}

      {isMinimal ? (
        <div className="flex flex-col items-center gap-0.5">
          <Icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
          <span className="text-[8px] font-bold text-gray-600 group-hover:text-blue-700 leading-tight text-center">
            {resourceId}
          </span>
        </div>
      ) : isCompact ? (
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-600 group-hover:text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-900 group-hover:text-blue-900">
              {resourceId}
            </div>
            <div className="text-[10px] text-gray-500 truncate mt-0.5">{languageName}</div>
          </div>
        </div>
      ) : isMedium ? (
        <div className="flex items-start gap-2.5">
          <Icon className="w-4 h-4 text-gray-600 group-hover:text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-900 group-hover:text-blue-900">
              {resourceId}
            </div>
            <div className="text-[11px] text-gray-700 truncate mt-0.5 leading-tight">
              {resource.title}
            </div>
            <div className="text-[10px] text-gray-500 truncate mt-0.5">{languageName}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 text-gray-600 group-hover:text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900 group-hover:text-blue-900">
              {resourceId}
            </div>
            <div className="text-xs text-gray-700 truncate mt-0.5">{resource.title}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-600">{languageName}</span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500 truncate">{resource.owner}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ResourceLibraryListProps {
  resources: ResourceItem[];
  displayMode: SidebarDisplayMode;
  availableLanguages: Array<{ code: string; name: string }>;
  selectedResourceKey: string | null;
  selectedResources: Set<string>;
  getResourceUsageCount: (key: string) => number;
  onResourceClick: (resourceKey: string) => void;
  onDragStart: (e: React.DragEvent, resourceKey: string) => void;
  onDragEnd: () => void;
}

export function ResourceLibraryList({
  resources,
  displayMode,
  availableLanguages,
  selectedResourceKey,
  selectedResources,
  getResourceUsageCount,
  onResourceClick,
  onDragStart,
  onDragEnd,
}: ResourceLibraryListProps) {
  const { isExpanded, isMedium, isCompact } = displayMode;
  const isLoading = false;

  if (isLoading) {
    return (
      <div
        className={`text-center text-sm text-gray-400 ${
          isExpanded ? 'p-4' : isMedium ? 'p-3.5' : isCompact ? 'p-3' : 'p-2'
        }`}
      >
        {isExpanded || isMedium || isCompact ? 'Loading...' : '...'}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div
        className={`text-center ${isExpanded ? 'p-4' : isMedium ? 'p-3.5' : isCompact ? 'p-3' : 'p-2'}`}
      >
        {isExpanded || isMedium ? (
          <div className="text-sm text-gray-500">
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No resources</p>
          </div>
        ) : isCompact ? (
          <div className="text-xs text-gray-500">
            <Package className="w-6 h-6 mx-auto mb-1 text-gray-300" />
            <p>Empty</p>
          </div>
        ) : (
          <Package className="w-4 h-4 mx-auto text-gray-300" />
        )}
      </div>
    );
  }

  return (
    <div className={isExpanded ? 'py-2' : isMedium ? 'py-2' : isCompact ? 'py-1.5' : 'py-1'}>
      {resources.map((resource) => (
        <ResourceLibraryItem
          key={resource.key}
          resource={resource}
          displayMode={displayMode}
          availableLanguages={availableLanguages}
          usageCount={getResourceUsageCount(resource.key)}
          isSelected={selectedResourceKey === resource.key}
          isMultiSelected={selectedResources.has(resource.key)}
          onClick={() => onResourceClick(resource.key)}
          onDragStart={(e) => onDragStart(e, resource.key)}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

interface ResourceLibraryFooterProps {
  resourceCount: number;
  displayMode: SidebarDisplayMode;
}

export function ResourceLibraryFooter({ resourceCount, displayMode }: ResourceLibraryFooterProps) {
  const { isExpanded, isMedium, isCompact } = displayMode;
  const label = `${resourceCount} ${resourceCount === 1 ? 'resource' : 'resources'}`;

  return (
    <div
      className={`border-t border-gray-100 bg-white ${
        isExpanded ? 'px-3 py-1.5' : isMedium ? 'px-2.5 py-1.5' : isCompact ? 'px-2 py-1' : 'px-1 py-1'
      }`}
    >
      {isExpanded || isMedium ? (
        <div className="text-xs text-gray-500 text-center font-semibold" title={label}>
          {resourceCount}
        </div>
      ) : isCompact ? (
        <div className="text-[10px] text-gray-500 text-center font-semibold" title={label}>
          {resourceCount}
        </div>
      ) : (
        <div className="text-[10px] text-gray-400 text-center font-medium" title={label}>
          {resourceCount}
        </div>
      )}
    </div>
  );
}
