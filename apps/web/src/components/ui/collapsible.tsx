"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

// Abre e fecha animando a altura (a única forma de revelar conteúdo de tamanho
// desconhecido) com fade; com "reduzir movimento" fica só o fade.
const collapsibleContentClass =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-snappy data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 data-ending-style:duration-150 motion-reduce:transition-opacity"

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={(state) =>
        cn(
          collapsibleContentClass,
          typeof className === "function" ? className(state) : className
        )
      }
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
