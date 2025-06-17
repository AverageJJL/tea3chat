import React, {
  useRef,
  useEffect,
  ReactNode,
  Children,
  isValidElement,
  ReactElement,
} from "react";
import { AdvancedLiquidGlass } from "../AdvancedLiquidGlass";
import "../liquid-glass.css";

const Background: React.FC<{ children: ReactNode }> = ({ children }) => (
  <>{children}</>
);
const Foreground: React.FC<{ children: ReactNode }> = ({ children }) => (
  <>{children}</>
);

interface LiquidGlassProps {
  children: ReactNode;
  className?: string;
  distortionStrength?: number;
  borderWidth?: "thin" | "medium" | "thick";
}

const LiquidGlass: React.FC<LiquidGlassProps> & {
  Background: typeof Background;
  Foreground: typeof Foreground;
} = ({
  children,
  className = "",
  distortionStrength = 120,
  borderWidth = "thick",
}) => {
  const glassRef = useRef<HTMLDivElement>(null);

  let backgroundContent: ReactNode = null;
  let foregroundContent: ReactNode = null;

  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      const element = child as ReactElement<{ children?: ReactNode }>;

      if (element.type === Background) {
        backgroundContent = element.props.children;
      } else if (element.type === Foreground) {
        foregroundContent = element.props.children;
      }
    }
  });

  useEffect(() => {
    let glassInstance: AdvancedLiquidGlass | null = null;
    if (glassRef.current) {
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
  }, [distortionStrength, borderWidth]);

  return (
    <div ref={glassRef} className={`liquid-glass ${className}`}>
      <div className="liquid-glass-background-content">
        {backgroundContent}
      </div>
      <div className="liquid-glass-foreground-content">
        {foregroundContent}
      </div>
      {/* This new div creates the shine effect */}
      <div className="liquid-glass-shine" />
    </div>
  );
};

LiquidGlass.Background = Background;
LiquidGlass.Foreground = Foreground;

export default LiquidGlass;