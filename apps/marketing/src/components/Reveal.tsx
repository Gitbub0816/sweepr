import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Below-the-fold "fade up on scroll" reveal. This replaces framer-motion's
 * `whileInView` for the marketing landing page's grid sections — a plain
 * IntersectionObserver + CSS class toggle gets the same visual effect
 * without pulling framer-motion (vendor-motion, ~126KB) into the initial
 * bundle. See src/index.css for the `.sweepr-reveal` / `.is-visible`
 * transition rules (which also respect prefers-reduced-motion).
 */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mergedStyle: CSSProperties | undefined =
    delayMs || style ? { ...style, ...(delayMs ? { transitionDelay: `${delayMs}ms` } : null) } : undefined;

  return (
    <div
      ref={ref}
      className={`sweepr-reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={mergedStyle}
    >
      {children}
    </div>
  );
}

export default Reveal;
