import * as React from "react";

import { cn } from "./lib/cn";

export interface PageHeaderBreadcrumb {
  label: string;
  /** Omit for the current (last) item; it is rendered as text, not a link. */
  href?: string;
}

export interface PageHeaderTab {
  label: string;
  href: string;
  current?: boolean;
}

export interface PageHeaderLinkProps {
  href: string;
  className: string;
  children: React.ReactNode;
  "aria-current"?: "page";
}

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Department › section › current page (2–4 levels). Omit on a department root. */
  breadcrumbs?: PageHeaderBreadcrumb[];
  /** One-line description under the title. Use either this or `meta`. */
  description?: React.ReactNode;
  /** Metadata items (location, code, last update…) shown inline, separated by `·`. */
  meta?: React.ReactNode[];
  /** Usually a StatusBadge, rendered beside the title. */
  status?: React.ReactNode;
  /** Header actions: up to two outline buttons, then at most one primary button last. */
  actions?: React.ReactNode;
  /** @deprecated Use `actions`. */
  action?: React.ReactNode;
  /** Section tabs; each is a link with its own URL. */
  tabs?: PageHeaderTab[];
  /**
   * Renders breadcrumb/tab links. Defaults to a plain `<a>`; pass a router link
   * (e.g. TanStack `Link`) to get client-side navigation.
   */
  renderLink?: (props: PageHeaderLinkProps) => React.ReactNode;
  className?: string;
}

const defaultRenderLink = ({ href, className, children, ...rest }: PageHeaderLinkProps) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

function ChevronRight() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0 opacity-70"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * The top of every routed page: breadcrumb, title (+ status), description or
 * metadata line, actions, and an optional tab row.
 */
function PageHeader({
  title,
  breadcrumbs,
  description,
  meta,
  status,
  actions,
  action,
  tabs,
  renderLink = defaultRenderLink,
  className,
}: PageHeaderProps) {
  const resolvedActions = actions ?? action;
  const hasMeta = meta !== undefined && meta.length > 0;

  return (
    <div className={cn("font-sans", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Trilha" className="mb-[6px]">
          <ol className="flex flex-wrap items-center gap-[6px] text-[13px] leading-[18px] text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-[6px]">
                  {isLast || !crumb.href ? (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className={isLast ? "font-medium text-foreground" : undefined}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    renderLink({
                      href: crumb.href,
                      className: "transition-colors hover:text-foreground",
                      children: crumb.label,
                    })
                  )}
                  {isLast ? null : <ChevronRight />}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[10px]">
            {typeof title === "string" || typeof title === "number" ? (
              <h1 className="text-[22px] leading-[30px] font-semibold tracking-[-0.015em] text-foreground">
                {title}
              </h1>
            ) : (
              title
            )}
            {status}
          </div>
          {hasMeta ? (
            <ul className="mt-[6px] flex flex-wrap gap-x-[14px] gap-y-[6px] text-[13px] leading-[18px] text-muted-foreground">
              {meta.map((item, index) => (
                <li key={index} className="flex items-center gap-[14px]">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-control-border">
                      ·
                    </span>
                  ) : null}
                  {item}
                </li>
              ))}
            </ul>
          ) : description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {resolvedActions ? (
          <div className="flex flex-wrap items-center gap-2">{resolvedActions}</div>
        ) : null}
      </div>

      {tabs && tabs.length > 0 ? (
        <nav
          aria-label="Seções"
          className="mt-[18px] flex gap-[22px] overflow-x-auto border-b border-border text-sm font-medium"
        >
          {tabs.map((tab) => (
            <React.Fragment key={tab.href}>
              {renderLink({
                href: tab.href,
                className: cn(
                  "whitespace-nowrap pb-[10px] transition-colors",
                  tab.current
                    ? "text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                    : "text-muted-foreground hover:text-foreground",
                ),
                children: tab.label,
                "aria-current": tab.current ? "page" : undefined,
              })}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export { PageHeader };
