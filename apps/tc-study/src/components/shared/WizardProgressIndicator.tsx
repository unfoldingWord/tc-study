/**
 * Wizard Progress Indicator - Shared Component
 * Displays step progress with icons and optional item count
 */

import clsx from 'clsx'
import { LucideIcon } from 'lucide-react'

export interface WizardStep<T extends string = string> {
  id: T
  icon: LucideIcon
  label: string
  isVisible?: boolean
}

export interface WizardProgressIndicatorProps<T extends string = string> {
  steps: WizardStep<T>[]
  currentStep: T
  itemCount?: number
  itemCountIcon?: LucideIcon
}

export function WizardProgressIndicator<T extends string = string>({
  steps,
  currentStep,
  itemCount,
  itemCountIcon: ItemCountIcon,
}: WizardProgressIndicatorProps<T>) {
  const visibleSteps = steps.filter((step) => step.isVisible !== false)
  const currentStepIndex = visibleSteps.findIndex((step) => step.id === currentStep)

  return (
    <div className="border-b border-border bg-muted px-6 py-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {visibleSteps.map((step, index) => {
            const isActive = currentStep === step.id
            const isComplete = index < currentStepIndex
            const filled = isActive || isComplete

            return (
              <div
                key={step.id}
                className={clsx(
                  'size-2 rounded-full',
                  filled ? 'bg-accent-fill' : 'bg-muted border border-border'
                )}
                title={step.label}
                aria-label={step.label}
              />
            )
          })}
        </div>

        {(itemCount !== undefined || ItemCountIcon) && (
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
            {ItemCountIcon && <ItemCountIcon className="h-4 w-4 text-fg-secondary" />}
            {itemCount !== undefined && <span className="font-medium text-fg">{itemCount}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
