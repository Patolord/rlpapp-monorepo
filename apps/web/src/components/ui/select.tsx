"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectRootProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Root>,
  "onValueChange"
> & {
  onValueChange?: (value: string) => void;
};

function getNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }
  return "";
}

function getComponentDisplayName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    return type.displayName || type.name || "";
  }
  if (typeof type === "object" && type && "displayName" in type) {
    return String((type as { displayName?: string }).displayName ?? "");
  }
  return "";
}

/** Deriva `items` a partir dos SelectItem para o trigger mostrar o rótulo, não o value. */
function collectItemsFromChildren(
  children: React.ReactNode
): Record<string, React.ReactNode> {
  const items: Record<string, React.ReactNode> = {};

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: unknown; children?: React.ReactNode }>(child)) {
      return;
    }

    const displayName = getComponentDisplayName(child.type);
    if (displayName === "SelectItem" && typeof child.props.value === "string") {
      const label = getNodeText(child.props.children).replace(/\s+/g, " ").trim();
      items[child.props.value] = label || child.props.value;
      return;
    }

    if (child.props.children != null) {
      Object.assign(items, collectItemsFromChildren(child.props.children));
    }
  });

  return items;
}

// Normaliza o `null` do Base UI (clear) para string vazia, já que todos os
// consumidores controlam o valor como string.
function Select({
  onValueChange,
  items,
  children,
  ...props
}: SelectRootProps) {
  const derivedItems = React.useMemo(() => {
    if (items) return items;
    const collected = collectItemsFromChildren(children);
    return Object.keys(collected).length > 0 ? collected : undefined;
  }, [items, children]);

  return (
    <SelectPrimitive.Root
      items={derivedItems}
      onValueChange={
        onValueChange
          ? (value) => onValueChange((value as string | null) ?? "")
          : undefined
      }
      {...props}
    >
      {children}
    </SelectPrimitive.Root>
  );
}
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "border-input bg-transparent ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon className="shrink-0">
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

const SelectPortal = SelectPrimitive.Portal;

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> & {
    position?: "popper" | "item-aligned";
  }
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPortal>
    <SelectPrimitive.Positioner sideOffset={4} className="z-[100]">
      <SelectPrimitive.Popup
        ref={ref}
        className={cn(
          "bg-popover text-popover-foreground relative z-[100] max-h-96 min-w-[var(--anchor-width)] overflow-hidden rounded-md border shadow-md data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          className
        )}
        {...props}
      >
        <div className="p-1">{children}</div>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPortal>
));
SelectContent.displayName = "SelectContent";

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.GroupLabel>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.GroupLabel
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("bg-muted -mx-1 my-1 h-px", className)}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
