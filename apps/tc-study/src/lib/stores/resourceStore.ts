/**
 * Resource Store - placeholder
 */

import { create } from 'zustand'

interface ResourceStore {
  resources: any[]
}

export const useResourceStore = create<ResourceStore>((set) => ({
  resources: []
}))
