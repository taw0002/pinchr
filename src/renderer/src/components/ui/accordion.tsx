import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type AccordionType = 'single' | 'multiple'

interface AccordionContextValue {
  isOpen: (value: string) => boolean
  toggle: (value: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)
const AccordionItemContext = React.createContext<{ value: string } | null>(null)

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: AccordionType
  collapsible?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[]) => void
}

function normalizeValue(value: string | string[] | undefined, type: AccordionType): string[] {
  if (value === undefined) return []
  if (type === 'single') return typeof value === 'string' ? [value] : value.slice(0, 1)
  return Array.isArray(value) ? value : [value]
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    { className, type = 'single', collapsible = false, value, defaultValue, onValueChange, children, ...props },
    ref
  ) => {
    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = React.useState<string[]>(() => normalizeValue(defaultValue, type))

    React.useEffect(() => {
      if (!isControlled) return
      setInternalValue(normalizeValue(value, type))
    }, [isControlled, type, value])

    const currentValue = isControlled ? normalizeValue(value, type) : internalValue

    const setValue = (nextValue: string[]) => {
      if (!isControlled) setInternalValue(nextValue)
      if (onValueChange) {
        if (type === 'single') onValueChange(nextValue[0] ?? '')
        else onValueChange(nextValue)
      }
    }

    const toggle = (itemValue: string) => {
      if (type === 'single') {
        const isAlreadyOpen = currentValue.includes(itemValue)
        if (isAlreadyOpen && !collapsible) return
        setValue(isAlreadyOpen ? [] : [itemValue])
        return
      }

      const isAlreadyOpen = currentValue.includes(itemValue)
      if (isAlreadyOpen) setValue(currentValue.filter((entry) => entry !== itemValue))
      else setValue([...currentValue, itemValue])
    }

    return (
      <AccordionContext.Provider value={{ isOpen: (itemValue) => currentValue.includes(itemValue), toggle }}>
        <div ref={ref} className={cn('space-y-3', className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    )
  }
)
Accordion.displayName = 'Accordion'

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(({ className, value, children, ...props }, ref) => (
  <AccordionItemContext.Provider value={{ value }}>
    <div ref={ref} className={cn('rounded-xl border border-border bg-surface', className)} {...props}>
      {children}
    </div>
  </AccordionItemContext.Provider>
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, onClick, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext)
    const itemContext = React.useContext(AccordionItemContext)
    if (!accordionContext || !itemContext) {
      throw new Error('AccordionTrigger must be used within Accordion and AccordionItem')
    }

    const open = accordionContext.isOpen(itemContext.value)

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-t-xl px-5 py-4 text-left text-sm font-medium text-text-primary hover:bg-surface-2',
          className
        )}
        onClick={(event) => {
          accordionContext.toggle(itemContext.value)
          onClick?.(event)
        }}
        {...props}
      >
        <span>{children}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
    )
  }
)
AccordionTrigger.displayName = 'AccordionTrigger'

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext)
    const itemContext = React.useContext(AccordionItemContext)
    if (!accordionContext || !itemContext) {
      throw new Error('AccordionContent must be used within Accordion and AccordionItem')
    }

    const open = accordionContext.isOpen(itemContext.value)

    return (
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-[2000px]' : 'max-h-0')} aria-hidden={!open}>
        <div ref={ref} className={cn('px-5 pb-5', className)} {...props}>
          {children}
        </div>
      </div>
    )
  }
)
AccordionContent.displayName = 'AccordionContent'

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }

