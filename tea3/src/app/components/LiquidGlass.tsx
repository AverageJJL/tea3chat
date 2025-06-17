import React, { useRef, useEffect, ReactNode } from "react";
import { AdvancedLiquidGlass } from "../AdvancedLiquidGlass";
import "../liquid-glass.css";

interface LiquidGlassProps {
  children: ReactNode;
  className?: string;
  distortionStrength?: number;
  borderWidth?: "thin" | "medium" | "thick";
  transitionWidth?: number;
}

const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className = "",
  distortionStrength = 120,
  borderWidth = "medium",
  transitionWidth = 8,
}) => {
  const glassRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let glassInstance: AdvancedLiquidGlass | null = null;

    if (glassRef.current) {
      // Set transition width CSS variable
      glassRef.current.style.setProperty(
        "--transition-width", 
        `${transitionWidth}px`
      );

      glassInstance = new AdvancedLiquidGlass(glassRef.current, {
        distortionStrength,
      });

      glassInstance.setBorderWidth(borderWidth);
    }

    return () => {
      if (glassInstance) {
        glassInstance.destroy();
      }
    };
  }, [distortionStrength, borderWidth, transitionWidth]);

  // Create transition element after mount
  useEffect(() => {
    if (glassRef.current && !glassRef.current.querySelector('.liquid-glass-transition')) {
      const transitionElement = document.createElement('div');
      transitionElement.className = 'liquid-glass-transition';
      glassRef.current.appendChild(transitionElement);
    }
  }, []);

  return (
    <div ref={glassRef} className={`liquid-glass ${className}`}>
      <div className="liquid-glass-content">{children}</div>
    </div>
  );
};

export default LiquidGlass;