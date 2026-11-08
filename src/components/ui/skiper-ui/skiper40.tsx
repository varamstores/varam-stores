import React from "react";
import { cn } from "@/lib/utils";

export interface SkiperLinkProps {
  children: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  target?: string;
  title?: string;
  rel?: string;
}

/**
 * Link000: Clean underline transition (Right to Left on exit, Left to Right on hover)
 */
export const Link000: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href === "#" || !href) {
      e.preventDefault();
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center cursor-pointer",
        className,
        "before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:h-[0.05em] before:w-full before:bg-current before:content-['']",
        "before:origin-right before:scale-x-0 before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:origin-left hover:before:scale-x-100"
      )}
    >
      {children}
    </a>
  );
};

/**
 * Link001: Underline left to right with subtle 45-degree arrow reveal
 */
export const Link001: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href === "#" || !href) {
      e.preventDefault();
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center cursor-pointer",
        "before:pointer-events-none before:absolute before:left-0 before:bottom-0 before:h-[0.05em] before:w-full before:bg-current before:content-['']",
        "before:origin-right before:scale-x-0 before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:origin-left hover:before:scale-x-100",
        className
      )}
    >
      <span>{children}</span>
      <svg
        className="ml-[0.35em] size-[0.6em] translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 shrink-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

/**
 * Link002: Underline right to left with arrow
 */
export const Link002: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  return (
    <a
      href={href}
      onClick={onClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center cursor-pointer",
        className,
        "before:pointer-events-none before:absolute before:left-0 before:bottom-0 before:h-[0.05em] before:w-full before:bg-current before:content-['']",
        "before:origin-right before:scale-x-0 before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "before:origin-left",
        "hover:before:origin-right hover:before:scale-x-100"
      )}
    >
      <span>{children}</span>
      <svg
        className="ml-[0.35em] size-[0.6em] translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 shrink-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

/**
 * Link003: Underline expanding from center
 */
export const Link003: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  return (
    <a
      href={href}
      onClick={onClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center cursor-pointer",
        className,
        "before:pointer-events-none before:absolute before:left-0 before:bottom-0 before:h-[0.05em] before:w-full before:bg-current before:content-['']",
        "before:origin-center before:scale-x-0 before:transition-transform before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:scale-x-100"
      )}
    >
      <span>{children}</span>
      <svg
        className="ml-[0.35em] size-[0.6em] translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 shrink-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

/**
 * Link004: Height transition (Curtain fill upwards with mix-blend-difference)
 */
export const Link004: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  return (
    <a
      href={href}
      onClick={onClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center px-2.5 py-1 cursor-pointer rounded-lg overflow-hidden",
        className,
        "before:pointer-events-none before:absolute before:left-0 before:bottom-0 before:w-full before:bg-current before:content-['']",
        "before:origin-bottom before:transition-all before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "before:h-0 hover:before:h-full before:opacity-10"
      )}
    >
      <span className="relative z-10">{children}</span>
      <svg
        className="relative z-10 ml-[0.45em] size-[0.6em] translate-y-0.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:rotate-45 group-hover:opacity-100 shrink-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

/**
 * Link005: Width transition (Pill fill expanding from left)
 */
export const Link005: React.FC<SkiperLinkProps> = ({
  children,
  href = "#",
  onClick,
  className,
  target,
  title,
  rel,
}) => {
  return (
    <a
      href={href}
      onClick={onClick}
      target={target}
      title={title}
      rel={rel}
      className={cn(
        "group relative inline-flex items-center px-2.5 py-1 cursor-pointer rounded-lg overflow-hidden",
        className,
        "before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-full before:w-full before:bg-current before:content-['']",
        "before:origin-left before:scale-x-0 before:transition-all before:duration-300 before:ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:scale-x-100 before:opacity-10"
      )}
    >
      <span className="relative z-10">{children}</span>
      <svg
        className="relative z-10 ml-[0.45em] size-[0.6em] -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 shrink-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

export const Skiper40 = () => {
  return (
    <div className="flex flex-col items-start gap-4 p-4">
      <Link000 href="#">Link000 - Subtle Underline</Link000>
      <Link001 href="#">Link001 - Left to Right Underline + Arrow</Link001>
      <Link002 href="#">Link002 - Right to Left Underline</Link002>
      <Link003 href="#">Link003 - Center Underline Expand</Link003>
      <Link004 href="#">Link004 - Height Curtain Fill</Link004>
      <Link005 href="#">Link005 - Width Reveal Accent</Link005>
    </div>
  );
};
