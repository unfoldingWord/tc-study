/**
 * Hierarchical Passage Set Creator
 * Visual tree builder with drag-and-drop support
 */

import { useState } from 'react'
import {
  Plus,
  FolderPlus,
  FileText,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  GripVertical,
  Save,
  X,
} from 'lucide-react'
// import { createPassageSetBuilder } from '@bt-synergy/passage-sets'
// TODO: Re-enable when passage-sets package is properly set up
const createPassageSetBuilder = () => ({ build: () => ({}) })
import type {
  PassageSet,
  PassageSetNode,
  PassageGroup,
  PassageLeaf,
  Passage,
  PassageSetTemplate,
} from '@bt-synergy/passage-sets'

interface HierarchicalPassageSetCreatorProps {
  initialSet?: PassageSet
  onSave: (passageSet: PassageSet) => void
  onCancel: () => void
}

type NodeWithParent = {
  node: PassageSetNode
  parentId: string | null
  path: string[]
}

export function HierarchicalPassageSetCreator({
  initialSet,
  onSave,
  onCancel,
}: HierarchicalPassageSetCreatorProps) {
  // Basic info
  const [name, setName] = useState(initialSet?.name || '')
  const [description, setDescription] = useState(initialSet?.description || '')
  const [template, setTemplate] = useState<PassageSetTemplate>('custom')
  const [category, setCategory] = useState(initialSet?.metadata?.category || '')
  const [tags, setTags] = useState<string[]>(initialSet?.metadata?.tags || [])
  const [tagInput, setTagInput] = useState('')

  // Tree state
  const [root, setRoot] = useState<PassageSetNode[]>(initialSet?.root || [])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Drag and drop state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)

  // Modals
  const [showNodeEditor, setShowNodeEditor] = useState(false)
  const [editingNode, setEditingNode] = useState<NodeWithParent | null>(null)

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const addRootGroup = () => {
    const newGroup: PassageGroup = {
      id: `group-${Date.now()}`,
      type: 'group',
      label: 'New Group',
      children: [],
    }
    setRoot([...root, newGroup])
    setExpandedNodes(prev => new Set([...prev, newGroup.id]))
  }

  const addChildToGroup = (parentId: string, type: 'group' | 'passage') => {
    const addChild = (nodes: PassageSetNode[]): PassageSetNode[] => {
      return nodes.map(node => {
        if (node.id === parentId && node.type === 'group') {
          const group = node as PassageGroup
          const newChild: PassageSetNode = type === 'group'
            ? {
                id: `group-${Date.now()}`,
                type: 'group',
                label: 'New Group',
                children: [],
              }
            : {
                id: `passage-${Date.now()}`,
                type: 'passage',
                label: 'New Passage',
                passages: [],
              }

          return {
            ...group,
            children: [...group.children, newChild],
          }
        }

        if (node.type === 'group') {
          return {
            ...node,
            children: addChild((node as PassageGroup).children),
          }
        }

        return node
      })
    }

    setRoot(addChild(root))
    if (type === 'group') {
      setExpandedNodes(prev => new Set([...prev, parentId]))
    }
  }

  const deleteNode = (nodeId: string) => {
    const removeNode = (nodes: PassageSetNode[]): PassageSetNode[] => {
      return nodes.filter(node => {
        if (node.id === nodeId) return false
        if (node.type === 'group') {
          return {
            ...node,
            children: removeNode((node as PassageGroup).children),
          }
        }
        return true
      }).map(node => {
        if (node.type === 'group') {
          return {
            ...node,
            children: removeNode((node as PassageGroup).children),
          }
        }
        return node
      })
    }

    setRoot(removeNode(root))
  }

  const updateNode = (nodeId: string, updates: Partial<PassageSetNode>) => {
    const update = (nodes: PassageSetNode[]): PassageSetNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, ...updates }
        }

        if (node.type === 'group') {
          return {
            ...node,
            children: update((node as PassageGroup).children),
          }
        }

        return node
      })
    }

    setRoot(update(root))
  }

  const findNode = (nodeId: string, nodes: PassageSetNode[], parentId: string | null = null, path: string[] = []): NodeWithParent | null => {
    for (const node of nodes) {
      const currentPath = [...path, node.label]
      
      if (node.id === nodeId) {
        return { node, parentId, path: currentPath }
      }

      if (node.type === 'group') {
        const found = findNode(nodeId, (node as PassageGroup).children, node.id, currentPath)
        if (found) return found
      }
    }

    return null
  }

  const handleEditNode = (nodeId: string) => {
    const found = findNode(nodeId, root)
    if (found) {
      setEditingNode(found)
      setShowNodeEditor(true)
    }
  }

  const handleSaveNodeEdit = (updatedNode: PassageSetNode) => {
    updateNode(updatedNode.id, updatedNode)
    setShowNodeEditor(false)
    setEditingNode(null)
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.stopPropagation()
    setDraggingNodeId(nodeId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', nodeId)
  }

  const handleDragEnd = () => {
    setDraggingNodeId(null)
    setDragOverNodeId(null)
  }

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggingNodeId && draggingNodeId !== nodeId) {
      setDragOverNodeId(nodeId)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    setDragOverNodeId(null)
  }

  const handleDrop = (e: React.DragEvent, targetNodeId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggingNodeId || draggingNodeId === targetNodeId) {
      setDraggingNodeId(null)
      setDragOverNodeId(null)
      return
    }

    // Move the node
    moveNode(draggingNodeId, targetNodeId)
    
    setDraggingNodeId(null)
    setDragOverNodeId(null)
  }

  const moveNode = (sourceId: string, targetId: string) => {
    // Find both nodes and their parents
    const sourceInfo = findNodeWithParent(sourceId, root)
    const targetInfo = findNodeWithParent(targetId, root)

    if (!sourceInfo || !targetInfo) return

    // Remove source node from its current location
    const newRoot = removeNodeById(root, sourceId)

    // Find target's parent and insert after target
    const insertNode = (nodes: PassageSetNode[], parentId: string | null): PassageSetNode[] => {
      if (parentId === null) {
        // Insert at root level
        const targetIndex = nodes.findIndex(n => n.id === targetId)
        if (targetIndex >= 0) {
          const updated = [...nodes]
          updated.splice(targetIndex + 1, 0, sourceInfo.node)
          return updated
        }
        return nodes
      }

      return nodes.map(node => {
        if (node.id === parentId && node.type === 'group') {
          const group = node as PassageGroup
          const targetIndex = group.children.findIndex(n => n.id === targetId)
          if (targetIndex >= 0) {
            const updatedChildren = [...group.children]
            updatedChildren.splice(targetIndex + 1, 0, sourceInfo.node)
            return { ...group, children: updatedChildren }
          }
        }

        if (node.type === 'group') {
          return {
            ...node,
            children: insertNode((node as PassageGroup).children, parentId),
          }
        }

        return node
      })
    }

    const finalRoot = insertNode(newRoot, targetInfo.parentId)
    setRoot(finalRoot)
  }

  const findNodeWithParent = (
    nodeId: string,
    nodes: PassageSetNode[],
    parentId: string | null = null
  ): { node: PassageSetNode; parentId: string | null } | null => {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return { node, parentId }
      }

      if (node.type === 'group') {
        const found = findNodeWithParent(nodeId, (node as PassageGroup).children, node.id)
        if (found) return found
      }
    }
    return null
  }

  const removeNodeById = (nodes: PassageSetNode[], nodeId: string): PassageSetNode[] => {
    return nodes
      .filter(node => node.id !== nodeId)
      .map(node => {
        if (node.type === 'group') {
          return {
            ...node,
            children: removeNodeById((node as PassageGroup).children, nodeId),
          }
        }
        return node
      })
  }

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a name')
      return
    }

    if (root.length === 0) {
      alert('Please add at least one group or passage')
      return
    }

    const builder = createPassageSetBuilder()
    builder.setName(name.trim())
    
    if (description.trim()) {
      builder.setDescription(description.trim())
    }

    builder.setMetadata({
      category,
      tags,
    })

    // For now, we'll use the direct PassageSet structure
    // TODO: Properly use the builder pattern
    const passageSet: PassageSet = {
      id: initialSet?.id || `ps-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      version: '1.0.0',
      createdAt: initialSet?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        category,
        tags,
        passageCount: countPassages(root),
      },
      root,
    }

    onSave(passageSet)
  }

  const countPassages = (nodes: PassageSetNode[]): number => {
    let count = 0
    for (const node of nodes) {
      if (node.type === 'passage') {
        count += (node as PassageLeaf).passages.length
      } else {
        count += countPassages((node as PassageGroup).children)
      }
    }
    return count
  }

  const renderNode = (node: PassageSetNode, level: number = 0) => {
    const isGroup = node.type === 'group'
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedNodeId === node.id
    const isDragging = draggingNodeId === node.id
    const isDragOver = dragOverNodeId === node.id
    const indent = level * 20

    return (
      <div key={node.id} className="select-none group">
        {/* Node Row */}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            isDragging ? 'opacity-50 cursor-grabbing' : 'hover:bg-gray-50 cursor-grab'
          } ${isSelected ? 'bg-blue-50 border border-blue-200' : ''} ${
            isDragOver ? 'border-t-2 border-t-blue-500' : ''
          }`}
          style={{ marginLeft: `${indent}px` }}
          onClick={() => setSelectedNodeId(node.id)}
        >
          {/* Drag Handle */}
          <div
            className="p-1 hover:bg-gray-100 rounded cursor-move"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>

          {/* Expand/Collapse */}
          {isGroup ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(node.id)
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Icon */}
          {isGroup ? (
            <FolderPlus className="w-4 h-4 text-blue-600" />
          ) : (
            <FileText className="w-4 h-4 text-green-600" />
          )}

          {/* Label */}
          <span className="flex-1 text-sm font-medium text-gray-900">
            {node.label}
            {node.type === 'passage' && (
              <span className="ml-2 text-xs text-gray-500">
                ({(node as PassageLeaf).passages.length} passage{(node as PassageLeaf).passages.length !== 1 ? 's' : ''})
              </span>
            )}
          </span>

          {/* Actions */}
          <div className={`flex items-center gap-1 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
            {isGroup && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    addChildToGroup(node.id, 'group')
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Add group"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    addChildToGroup(node.id, 'passage')
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Add passage"
                >
                  <FileText className="w-4 h-4 text-green-600" />
                </button>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                handleEditNode(node.id)
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-gray-600" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete "${node.label}"?`)) {
                  deleteNode(node.id)
                }
              }}
              className="p-1 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>

        {/* Children */}
        {isGroup && isExpanded && (
          <div className="mt-1">
            {(node as PassageGroup).children.map(child =>
              renderNode(child, level + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            {initialSet ? 'Edit Passage Set' : 'Create Passage Set'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Parables of Jesus"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template
                  </label>
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as PassageSetTemplate)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="custom">Custom</option>
                    <option value="reading-plan">Reading Plan</option>
                    <option value="topical-study">Topical Study</option>
                    <option value="curriculum">Curriculum</option>
                    <option value="devotional">Devotional</option>
                    <option value="comparative">Comparative</option>
                    <option value="chronological">Chronological</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., parables"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="Add tag..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:bg-blue-100 rounded p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hierarchy Builder */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Structure <span className="text-red-500">*</span>
                </label>
                <button
                  onClick={addRootGroup}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Group</span>
                </button>
              </div>

              {root.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <FolderPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm font-medium">No structure yet</p>
                  <p className="text-gray-500 text-xs mt-1">Click "Add Group" to start building</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-1">
                  {root.map(node => renderNode(node))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <div className="text-sm text-gray-600">
            {countPassages(root)} total passage{countPassages(root) !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || root.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>

      {/* Node Editor Modal */}
      {showNodeEditor && editingNode && (
        <NodeEditorModal
          node={editingNode.node}
          onSave={handleSaveNodeEdit}
          onCancel={() => {
            setShowNodeEditor(false)
            setEditingNode(null)
          }}
        />
      )}
    </div>
  )
}

// Node Editor Modal Component
interface NodeEditorModalProps {
  node: PassageSetNode
  onSave: (node: PassageSetNode) => void
  onCancel: () => void
}

function NodeEditorModal({ node, onSave, onCancel }: NodeEditorModalProps) {
  const [label, setLabel] = useState(node.label)
  const [description, setDescription] = useState(node.description || '')

  // Passage-specific state
  const [passages, setPassages] = useState<Passage[]>(
    node.type === 'passage' ? (node as PassageLeaf).passages : []
  )

  const handleAddPassage = () => {
    setPassages([
      ...passages,
      {
        bookCode: 'GEN',
        ref: { startChapter: 1, startVerse: 1 },
      },
    ])
  }

  const handleRemovePassage = (index: number) => {
    setPassages(passages.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const updated = {
      ...node,
      label,
      description: description.trim() || undefined,
    }

    if (node.type === 'passage') {
      (updated as PassageLeaf).passages = passages
    }

    onSave(updated)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Edit {node.type === 'group' ? 'Group' : 'Passage'}
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {node.type === 'passage' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Passages
                </label>
                <button
                  onClick={handleAddPassage}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>

              {passages.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">No passages yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {passages.map((passage, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 text-sm">
                        {passage.bookCode} {typeof passage.ref === 'string' ? passage.ref : `${passage.ref.startChapter}:${passage.ref.startVerse || 1}`}
                      </div>
                      <button
                        onClick={() => handleRemovePassage(index)}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Save className="w-4 h-4" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  )
}
