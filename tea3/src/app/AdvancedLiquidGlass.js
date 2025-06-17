export class AdvancedLiquidGlass {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      updateInterval: 100,
      distortionStrength: 120,
      colorSampleRadius: 25,
      ...options,
    };

    this.animationId = null;
    this.frameCount = 0;

    this.handleUpdate = this.throttle(
      this.updateGlassEffect.bind(this),
      this.options.updateInterval
    );
    this.animate = this.animate.bind(this);

    this.init();
  }

  init() {
    this.createBorderElement();
    this.createTransitionElement();
    this.createDistortionFilter();
    this.setBorderWidth("thin"); // Set default
    this.updateGlassEffect();
    this.startAnimation();

    window.addEventListener("scroll", this.handleUpdate, { passive: true });
    window.addEventListener("resize", this.handleUpdate);

    const observer = new MutationObserver(this.handleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    this.observer = observer;
  }

  createBorderElement() {
    if (!this.element.querySelector(".liquid-glass-border")) {
      const borderElement = document.createElement("div");
      borderElement.className = "liquid-glass-border";
      this.element.appendChild(borderElement);
      this.borderElement = borderElement;
    }
  }

  createTransitionElement() {
        if (!this.element.querySelector('.liquid-glass-transition')) {
            const transitionElement = document.createElement('div');
            transitionElement.className = 'liquid-glass-transition';
            this.element.appendChild(transitionElement);
            this.transitionElement = transitionElement;
        }
    }

  createDistortionFilter() {
    let svg = document.querySelector("#liquid-glass-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("id", "liquid-glass-svg");
      svg.style.position = "absolute";
      svg.style.width = "0";
      svg.style.height = "0";
      svg.setAttribute("aria-hidden", "true");
      document.body.appendChild(svg);
    }

    const defs =
      svg.querySelector("defs") ||
      svg.appendChild(
        document.createElementNS("http://www.w3.org/2000/svg", "defs")
      );

    if (!defs.querySelector("#border-glass-distortion")) {
      const filter = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "filter"
      );
      filter.setAttribute("id", "border-glass-distortion");
      filter.setAttribute("x", "-50%");
      filter.setAttribute("y", "-50%");
      filter.setAttribute("width", "200%");
      filter.setAttribute("height", "200%");
      filter.setAttribute("filterUnits", "objectBoundingBox");

      const turbulence = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feTurbulence"
      );
      turbulence.setAttribute("type", "fractalNoise");
      turbulence.setAttribute("baseFrequency", "0.008 0.012");
      turbulence.setAttribute("numOctaves", "2");
      turbulence.setAttribute("result", "turbulence");
      turbulence.setAttribute("stitchTiles", "stitch");

      const componentTransfer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feComponentTransfer"
      );
      componentTransfer.setAttribute("in", "turbulence");
      componentTransfer.setAttribute("result", "mapped");

      const funcR = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feFuncR"
      );
      funcR.setAttribute("type", "gamma");
      funcR.setAttribute("amplitude", "1");
      funcR.setAttribute("exponent", "8");
      funcR.setAttribute("offset", "0.5");

      const funcG = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feFuncG"
      );
      funcG.setAttribute("type", "gamma");
      funcG.setAttribute("amplitude", "0.8");
      funcG.setAttribute("exponent", "6");
      funcG.setAttribute("offset", "0.3");

      const funcB = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feFuncB"
      );
      funcB.setAttribute("type", "gamma");
      funcB.setAttribute("amplitude", "0");
      funcB.setAttribute("exponent", "1");
      funcB.setAttribute("offset", "0.5");

      componentTransfer.appendChild(funcR);
      componentTransfer.appendChild(funcG);
      componentTransfer.appendChild(funcB);

      const gaussianBlur = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feGaussianBlur"
      );
      gaussianBlur.setAttribute("in", "mapped");
      gaussianBlur.setAttribute("stdDeviation", "2");
      gaussianBlur.setAttribute("result", "softMap");

      const displacement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feDisplacementMap"
      );
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "softMap");
      displacement.setAttribute(
        "scale",
        this.options.distortionStrength.toString()
      );
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");

      filter.appendChild(turbulence);
      filter.appendChild(componentTransfer);
      filter.appendChild(gaussianBlur);
      filter.appendChild(displacement);
      defs.appendChild(filter);

      this.turbulenceElement = turbulence;
      this.displacementElement = displacement;
    }
  }

  destroy() {
    this.stopAnimation();
    window.removeEventListener("scroll", this.handleUpdate);
    window.removeEventListener("resize", this.handleUpdate);
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.borderElement && this.borderElement.parentNode) {
      this.borderElement.parentNode.removeChild(this.borderElement);
    }
  }

  startAnimation() {
    if (!this.animationId) {
      this.animate();
    }
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    this.frameCount += 0.002;

    if (this.turbulenceElement) {
      const baseX = 0.008;
      const baseY = 0.012;
      const offsetX = Math.sin(this.frameCount) * 0.003;
      const offsetY = Math.cos(this.frameCount * 1.2) * 0.003;
      this.turbulenceElement.setAttribute(
        "baseFrequency",
        `${baseX + offsetX} ${baseY + offsetY}`
      );
    }

    if (this.displacementElement) {
      const baseScale = this.options.distortionStrength;
      const scaleVariation = Math.sin(this.frameCount * 0.6) * 20;
      this.displacementElement.setAttribute(
        "scale",
        (baseScale + scaleVariation).toString()
      );
    }

    this.animationId = requestAnimationFrame(this.animate);
  }

  updateGlassEffect() {
    if (!this.element || !this.borderElement) return;

    const rect = this.element.getBoundingClientRect();
    const backgroundColors = this.sampleBackgroundColors(rect);
    const hasText = this.checkForTextBehind(rect);

    const borderGradient = this.createAdaptiveBorderGradient(
      backgroundColors,
      hasText
    );
    this.element.style.setProperty("--adaptive-border-gradient", borderGradient);
    this.element.classList.toggle("has-text-behind", hasText);

    if (this.displacementElement) {
      const strength = hasText
        ? this.options.distortionStrength * 0.6
        : this.options.distortionStrength;
      this.displacementElement.setAttribute("scale", strength.toString());
    }
  }

  sampleBackgroundColors(rect) {
    const sampleDistance = this.options.colorSampleRadius;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const samplePoints = [
      { x: centerX, y: rect.top - sampleDistance, angle: 0 },
      { x: rect.right + sampleDistance, y: centerY - sampleDistance, angle: 45 },
      { x: rect.right + sampleDistance, y: centerY, angle: 90 },
      { x: rect.right + sampleDistance, y: centerY + sampleDistance, angle: 135 },
      { x: centerX, y: rect.bottom + sampleDistance, angle: 180 },
      { x: rect.left - sampleDistance, y: centerY + sampleDistance, angle: 225 },
      { x: rect.left - sampleDistance, y: centerY, angle: 270 },
      { x: rect.left - sampleDistance, y: centerY - sampleDistance, angle: 315 },
    ];

    const originalVisibility = this.element.style.visibility;
    this.element.style.visibility = "hidden";

    const colors = samplePoints.map((point) => {
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > window.innerWidth ||
        point.y > window.innerHeight
      ) {
        return { color: "rgba(0, 0, 0, 0)", angle: point.angle };
      }

      const element = document.elementFromPoint(point.x, point.y);
      if (element) {
        const style = getComputedStyle(element);
        const bgColor = style.backgroundColor;
        const textColor = style.color;
        const finalColor =
          bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent"
            ? bgColor
            : textColor;
        return { color: finalColor, angle: point.angle };
      }
      return { color: "rgba(0, 0, 0, 0)", angle: point.angle };
    });

    this.element.style.visibility = originalVisibility;
    return colors;
  }

  createAdaptiveBorderGradient(colorSamples, hasText) {
    const gradientStops = [];
    const getLightIntensity = (angle) => {
      const normalizedAngle = ((angle % 360) + 360) % 360;
      const distanceFromTopLeft = Math.min(
        Math.abs(normalizedAngle - 315),
        360 - Math.abs(normalizedAngle - 315)
      );
      const distanceFromBottomRight = Math.min(
        Math.abs(normalizedAngle - 135),
        360 - Math.abs(normalizedAngle - 135)
      );
      const minDistance = Math.min(distanceFromTopLeft, distanceFromBottomRight);
      return Math.max(0.2, 1 - minDistance / 90);
    };

    colorSamples.forEach((sample) => {
      const lightIntensity = getLightIntensity(sample.angle);
      const adaptedColor = this.adaptColorForBorder(
        sample.color,
        lightIntensity,
        hasText
      );
      gradientStops.push(`${adaptedColor} ${sample.angle}deg`);
    });

    return `conic-gradient(from 0deg at 50% 50%, ${gradientStops.join(", ")})`;
  }

  adaptColorForBorder(color, lightIntensity, hasText) {
    if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent") {
      const opacity = hasText ? 0.9 : 0.6;
      return `rgba(255, 255, 255, ${opacity * lightIntensity})`;
    }

    const match = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (!match) return `rgba(255, 255, 255, ${lightIntensity * 0.6})`;

    let [r, g, b] = match.slice(1, 4).map(Number);
    const brightnessFactor = 1 + lightIntensity * 0.4;
    r = Math.min(255, Math.floor(r * brightnessFactor));
    g = Math.min(255, Math.floor(g * brightnessFactor));
    b = Math.min(255, Math.floor(b * brightnessFactor));

    const whiteMix = lightIntensity * 0.3;
    r = Math.floor(r + (255 - r) * whiteMix);
    g = Math.floor(g + (255 - g) * whiteMix);
    b = Math.floor(b + (255 - b) * whiteMix);

    const baseOpacity = hasText ? 0.8 : 0.7;
    const finalOpacity = baseOpacity * lightIntensity;
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, finalOpacity)})`;
  }

  checkForTextBehind(rect) {
    const points = [
      { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.5 },
      { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 },
      { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.5 },
    ];

    const originalVisibility = this.element.style.visibility;
    this.element.style.visibility = "hidden";

    let hasText = false;
    for (const point of points) {
      const element = document.elementFromPoint(point.x, point.y);
      if (element && element.textContent?.trim().length > 5) {
        hasText = true;
        break;
      }
    }

    this.element.style.visibility = originalVisibility;
    return hasText;
  }

  throttle(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  setBorderWidth(width = "medium") {
  const borderWidths = {
    thin: 10,
    medium: 15,
    thick: 20,
  };
  
  const transitionWidths = {
    thin: 6,
    medium: 8,
    thick: 10,
  };
  
  const borderWidth = borderWidths[width] || borderWidths.medium;
  const transitionWidth = transitionWidths[width] || transitionWidths.medium;
  
  this.element.style.setProperty("--border-width", `${borderWidth}px`);
  this.element.style.setProperty("--transition-width", `${transitionWidth}px`);

  if (this.displacementElement) {
    const strengthMultipliers = {
      thin: 0.8,
      medium: 1.2,
      thick: 1.5,
    };
    const multiplier = strengthMultipliers[width] || strengthMultipliers.medium;
    const newStrength = this.options.distortionStrength * multiplier;
    this.displacementElement.setAttribute("scale", newStrength.toString());
  }
}
  
}