/**
 * Wizard Progress Indicator - Shared Component
 * Displays step progress with icons and optional item count
 */

import { ChevronRight, LucideIcon } from 'lucide-react'

export interface WizardStep<T extends string = string> {
  id: T
  icon: LucideIcon
  label: string
  isVisible?: boolean
}

export interface WizardProgressIndicatorProps<T extends string = string> {
  /**
   * Array of wizard steps
   */
  steps: WizardStep<T>[]
  
  /**
   * Currently active step ID
   */
  currentStep: T
  
  /**
   * Optional: Show item count badge
   */
  itemCount?: number
  
  /**
   * Optional: Custom icon for item count badge
   */
  itemCountIcon?: LucideIcon
}

export function WizardProgressIndicator<T extends string = string>({
  steps,
  currentStep,
  itemCount,
  itemCountIcon: ItemCountIcon,
}: WizardProgressIndicatorProps<T>) {
  // Filter out invisible steps
  const visibleSteps = steps.filter(step => step.isVisible !== false)
  
  // Get current step index
  const currentStepIndex = visibleSteps.findIndex(step => step.id === currentStep)
  
  return (
    <div className="px-6 py-3 border-b border-border bg-muted">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {visibleSteps.map((step, index) => {
            const isActive = currentStep === step.id
            const isComplete = index < currentStepIndex
            const StepIcon = step.icon
            
            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={`
                    p-2 rounded-full transition-colors
                    ${isActive ? 'bg-accent text-white' : ''}
                    ${isComplete ? 'bg-accent text-white' : ''}
                    ${!isActive && !isComplete ? 'bg-muted text-fg-secondary border border-border' : ''}
                  `}
                  title={step.label}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                {index < visibleSteps.length - 1 && (
                  <ChevronRight className="w-4 h-4 mx-1 text-fg-muted" />
                )}
              </div>
            )
          })}
        </div>
        
        {/* Item count badge */}
        {(itemCount !== undefined || ItemCountIcon) && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface rounded-full border border-border">
            {ItemCountIcon && <ItemCountIcon className="w-4 h-4 text-fg-secondary" />}
            {itemCount !== undefined && (
              <span className="font-medium text-fg">{itemCount}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
