interface SidebarResizeHandleProps {
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}

export function SidebarResizeHandle({
  isResizing,
  onMouseDown,
  onTouchStart,
}: SidebarResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={`absolute right-0 top-0 w-1.5 h-full cursor-ew-resize transition-colors ${
        isResizing ? 'bg-blue-500' : 'bg-gray-300 hover:bg-blue-400'
      }`}
      title="Drag to resize"
      aria-label="Resize sidebar"
    >
      <div className="absolute right-0 top-0 w-4 h-full -translate-x-1/2" />
      <div className="absolute flex flex-col gap-1 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${
              isResizing ? 'bg-white' : 'bg-gray-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
