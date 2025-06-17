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
    this.currentDistortionStrength = this.options.distortionStrength;

    this.handleUpdate = this.throttle(
      this.updateGlassEffect.bind(this),
      this.options.updateInterval
    );
    this.animate = this.animate.bind(this);

    this.init();
  }

  init() {
    this.createBorderElement();
    this.createDistortionFilter();
    this.setBorderWidth("thin");
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

      // Step 1: Turbulence (same as before)
      const turbulence = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feTurbulence"
      );
      turbulence.setAttribute("type", "fractalNoise");
      turbulence.setAttribute("baseFrequency", "0.002 0.008");
      turbulence.setAttribute("numOctaves", "1");
      turbulence.setAttribute("result", "turbulence");
      turbulence.setAttribute("stitchTiles", "stitch");

      // Step 2: Displacement Map (same as before, but give it a result)
      const displacement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feDisplacementMap"
      );
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "turbulence");
      displacement.setAttribute(
        "scale",
        this.options.distortionStrength.toString()
      );
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");
      displacement.setAttribute("result", "displaced"); // Give the result a name

      // --- NEW: Specular Lighting ---
      // This creates the shiny reflection effect.
      const specularLighting = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feSpecularLighting"
      );
      specularLighting.setAttribute("in", "turbulence"); // Use the turbulence as a bump map
      specularLighting.setAttribute("surfaceScale", "15"); // How "bumpy" the surface is
      specularLighting.setAttribute("specularConstant", "1.2"); // How reflective
      specularLighting.setAttribute("specularExponent", "30"); // How sharp/glossy the highlight is
      specularLighting.setAttribute("lighting-color", "#ffffff"); // Color of the light
      specularLighting.setAttribute("result", "specular");

      // --- NEW: Light Source ---
      // Defines the light that hits the surface.
      const distantLight = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feDistantLight"
      );
      distantLight.setAttribute("azimuth", "235"); // Direction of the light (from bottom-right)
      distantLight.setAttribute("elevation", "60"); // Angle of the light from the surface
      specularLighting.appendChild(distantLight);

      // --- NEW: Composite Lighting and Distortion ---
      // This combines the original displaced image with the new shiny highlight.
      const composite = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feComposite"
      );
      composite.setAttribute("in", "displaced"); // The original distorted image
      composite.setAttribute("in2", "specular"); // The new highlight layer
      composite.setAttribute("operator", "arithmetic"); // Use 'arithmetic' to add the layers
      composite.setAttribute("k1", "0");
      composite.setAttribute("k2", "1"); // Keep 100% of the original image
      composite.setAttribute("k3", "0.005"); // Add 100% of the highlight on top
      composite.setAttribute("k4", "0");

      // Append all filters in order
      filter.appendChild(turbulence);
      filter.appendChild(displacement);
      filter.appendChild(specularLighting);
      filter.appendChild(composite); // The composite is the final step
      defs.appendChild(filter);

      this.turbulenceElement = turbulence;
      this.displacementElement = displacement;
    }
  }

  destroy() {
    this.stopAnimation();
    window.removeEventListener("scroll", this.handleUpdate);
    window.removeEventListener("resize", this.handleUpdate);
    if (this.observer) this.observer.disconnect();
    if (this.borderElement && this.borderElement.parentNode) {
      this.borderElement.parentNode.removeChild(this.borderElement);
    }
  }

  startAnimation() {
    if (!this.animationId) this.animate();
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
      const baseScale = this.currentDistortionStrength;
      const scaleVariation = Math.sin(this.frameCount * 0.6) * 15;
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
    const borderGradient = this.createAdaptiveBorderGradient(backgroundColors);
    this.element.style.setProperty("--adaptive-border-gradient", borderGradient);
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
      const color = element
        ? getComputedStyle(element).backgroundColor
        : "rgba(0,0,0,0)";
      return { color, angle: point.angle };
    });
    this.element.style.visibility = originalVisibility;
    return colors;
  }

  createAdaptiveBorderGradient(colorSamples) {
    const gradientStops = [];
    const getLightIntensity = (angle) => {
      const normalizedAngle = ((angle % 360) + 360) % 360;
      const highlightAngles = [135, 315];
      const angularDistance = (a1, a2) => {
        const diff = Math.abs(a1 - a2);
        return Math.min(diff, 360 - diff);
      };
      const minDistance = Math.min(
        ...highlightAngles.map((hAngle) =>
          angularDistance(normalizedAngle, hAngle)
        )
      );
      const normalizedDistance = Math.min(1, minDistance / 90);
      return 1 - Math.pow(normalizedDistance, 2.5);
    };
    colorSamples.forEach((sample) => {
      const lightIntensity = getLightIntensity(sample.angle);
      const adaptedColor = this.adaptColorForBorder(
        sample.color,
        lightIntensity
      );
      gradientStops.push(`${adaptedColor} ${sample.angle}deg`);
    });
    gradientStops.push(gradientStops[0].replace("0deg", "360deg"));
    return `conic-gradient(from 0deg at 50% 50%, ${gradientStops.join(", ")})`;
  }

  adaptColorForBorder(color, lightIntensity) {
    if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent") {
      const opacity = 0.1 + Math.pow(lightIntensity, 2) * 0.8;
      return `rgba(255, 255, 255, ${opacity})`;
    }
    const match = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (!match) {
      const opacity = 0.1 + Math.pow(lightIntensity, 2) * 0.7;
      return `rgba(255, 255, 255, ${opacity})`;
    }
    let [r, g, b] = match.slice(1, 4).map(Number);
    const glowAmount = Math.floor(220 * Math.pow(lightIntensity, 3));
    r = Math.min(255, r + glowAmount);
    g = Math.min(255, g + glowAmount);
    b = Math.min(255, b + glowAmount);
    const brightnessFactor = 1 + Math.pow(lightIntensity, 2) * 0.2;
    r = Math.min(255, r * brightnessFactor);
    g = Math.min(255, g * brightnessFactor);
    b = Math.min(255, b * brightnessFactor);
    const finalOpacity = 0.7 * lightIntensity;
    return `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(
      b
    )}, ${Math.min(1, finalOpacity)})`;
  }

  throttle(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  setBorderWidth(width = "medium") {
    const borderWidths = { thin: 5, medium: 12, thick: 18 };
    const borderWidth = borderWidths[width] || borderWidths.medium;
    this.element.style.setProperty("--border-width", `${borderWidth}px`);
    if (this.displacementElement) {
      const strengthMultipliers = { thin: 0.8, medium: 1.0, thick: 1.3 };
      const multiplier =
        strengthMultipliers[width] || strengthMultipliers.medium;
      this.currentDistortionStrength =
        this.options.distortionStrength * multiplier;
    }
  }
}