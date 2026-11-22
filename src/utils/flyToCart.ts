import gsap from 'gsap';
import type { Product } from '../types';

/**
 * Finds the currently active/visible shopping cart button in the UI.
 */
export const getActiveCartButton = (): HTMLElement | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  // On desktop / tablet (width >= 768px), prioritize the desktop pill button
  if (window.innerWidth >= 768) {
    const desktopBtn = document.getElementById('desktop-cart-btn');
    if (desktopBtn && desktopBtn.offsetParent !== null) return desktopBtn;
  }

  // On mobile, check mobile bottom nav first if visible
  const mobileBottomBtn = document.getElementById('mobile-bottom-cart-btn');
  if (mobileBottomBtn && mobileBottomBtn.offsetParent !== null) {
    const rect = mobileBottomBtn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return mobileBottomBtn;
  }

  // Check mobile header cart button
  const mobileHeaderBtn = document.getElementById('mobile-header-cart-btn');
  if (mobileHeaderBtn && mobileHeaderBtn.offsetParent !== null) return mobileHeaderBtn;

  // Fallback to any element with data-cart-btn="true"
  const anyBtn = document.querySelector<HTMLElement>('[data-cart-btn="true"]');
  return anyBtn || null;
};

/**
 * Spawns a delicate golden stardust particle in the wake of the flying item.
 */
const spawnTrailParticle = (x: number, y: number) => {
  const p = document.createElement('div');
  const size = Math.random() * 4 + 3; // 3px to 7px
  const isYellow = Math.random() > 0.35;
  p.style.cssText = `
    position: fixed;
    top: ${y - size / 2}px;
    left: ${x - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    border-radius: 9999px;
    background: ${isYellow ? '#F5D103' : '#FDE047'};
    box-shadow: 0 0 8px ${isYellow ? '#F5D103' : '#FEF08A'};
    pointer-events: none;
    z-index: 999997;
    opacity: 0.85;
    will-change: transform, opacity;
  `;
  document.body.appendChild(p);

  gsap.to(p, {
    scale: 0,
    opacity: 0,
    x: `+=${(Math.random() - 0.5) * 18}`,
    y: `+=${Math.random() * 12 + 4}`,
    duration: 0.45,
    ease: 'power2.out',
    onComplete: () => p.remove(),
  });
};

/**
 * Spawns a celebratory mini sparkle burst when the item lands in the cart.
 */
const spawnLandingSparkles = (x: number, y: number) => {
  const particleCount = 7;
  for (let i = 0; i < particleCount; i++) {
    const dot = document.createElement('div');
    const size = Math.random() * 4 + 3;
    const angle = (i / particleCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
    const distance = Math.random() * 22 + 16;
    dot.style.cssText = `
      position: fixed;
      top: ${y - size / 2}px;
      left: ${x - size / 2}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 9999px;
      background: #F5D103;
      box-shadow: 0 0 8px #F5D103;
      pointer-events: none;
      z-index: 999999;
      will-change: transform, opacity;
    `;
    document.body.appendChild(dot);

    gsap.to(dot, {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      scale: 0,
      opacity: 0,
      duration: 0.55,
      ease: 'power2.out',
      onComplete: () => dot.remove(),
    });
  }
};

/**
 * Executes a smooth, cinematic, slow parabolic arc animation
 * with weightless zero-g lift, golden stardust trail, and tactile basket impact.
 */
export const animateFlyToCart = (
  product: Product,
  source?: HTMLElement | React.MouseEvent | { x: number; y: number } | null
) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const targetCartBtn = getActiveCartButton();
  if (!targetCartBtn) return;

  const CLONE_SIZE = 58;
  const HALF_SIZE = CLONE_SIZE / 2;
  const MIN_TOP_PADDING = 14;

  // 1. Get starting coordinates
  let startX = window.innerWidth / 2;
  let startY = window.innerHeight / 2;

  if (source) {
    if ('getBoundingClientRect' in source && typeof source.getBoundingClientRect === 'function') {
      const rect = source.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
    } else if ('clientX' in source && 'clientY' in source) {
      startX = Number((source as unknown as { clientX: number }).clientX);
      startY = Number((source as unknown as { clientY: number }).clientY);
    } else if ('x' in source && 'y' in source) {
      startX = (source as { x: number; y: number }).x;
      startY = (source as { x: number; y: number }).y;
    }
  } else {
    // Attempt to locate product card or image on page
    const productEl = document.querySelector<HTMLElement>(`[data-product-id="${product.id}"]`);
    if (productEl) {
      const rect = productEl.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
    }
  }

  // 2. Get target cart coordinates
  const targetRect = targetCartBtn.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;

  // 3. Create the floating thumbnail element
  const clone = document.createElement('div');
  clone.className = 'fly-to-cart-clone';
  clone.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: ${CLONE_SIZE}px;
    height: ${CLONE_SIZE}px;
    border-radius: 9999px;
    background: #ffffff;
    border: 2.5px solid #F5D103;
    box-shadow: 0 18px 36px -6px rgba(0, 0, 0, 0.32), 0 0 24px rgba(245, 209, 3, 0.6);
    pointer-events: none;
    z-index: 999998;
    will-change: transform, opacity;
    transform: translate3d(${startX - HALF_SIZE}px, ${startY - HALF_SIZE}px, 0px) scale(0.25);
    opacity: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    overflow: visible;
  `;

  // Product thumbnail image
  const img = document.createElement('img');
  img.src = product.image?.url ?? '';
  img.alt = product.name;
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 9999px;
    pointer-events: none;
  `;

  // Mini gold pill badge
  const badge = document.createElement('div');
  badge.innerText = '+1';
  badge.style.cssText = `
    position: absolute;
    top: -3px;
    right: -3px;
    background: #18181B;
    color: #F5D103;
    font-size: 9.5px;
    font-weight: 900;
    border-radius: 9999px;
    padding: 1.5px 5.5px;
    border: 1.5px solid #ffffff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    pointer-events: none;
  `;

  clone.appendChild(img);
  clone.appendChild(badge);
  document.body.appendChild(clone);

  // 4. Calculate Quadratic Bezier Control Point (P1)
  const p0 = { x: startX, y: startY };
  const p2 = { x: targetX, y: targetY };

  // Control point X: placed at ~45% between start and target
  const p1x = p0.x + (p2.x - p0.x) * 0.45;

  // Control point Y: High graceful arc, strictly clamped below screen ceiling
  const higherY = Math.min(p0.y, p2.y);
  const verticalSpan = Math.abs(p0.y - p2.y);
  const arcLift = Math.min(90, Math.abs(p2.x - p0.x) * 0.14);
  const p1y = Math.max(MIN_TOP_PADDING + HALF_SIZE, higherY - arcLift + verticalSpan * 0.08);

  const isMovingRight = p2.x >= p0.x;
  const maxTilt = isMovingRight ? 24 : -24;

  // 5. Cinematic continuous animation (1.15 seconds)
  const animState = { t: 0 };
  const DURATION = 1.15; // Slow, relaxed, luxurious pacing
  let lastParticleTime = 0;

  gsap.to(animState, {
    t: 1,
    duration: DURATION,
    ease: 'power2.inOut',
    onUpdate: () => {
      const t = animState.t;
      const oneMinusT = 1 - t;

      // Quadratic Bezier Formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      const curX = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1x + t * t * p2.x;
      let curY = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1y + t * t * p2.y;

      // Ensure the top of the element never goes off-screen
      curY = Math.max(MIN_TOP_PADDING + HALF_SIZE, curY);

      // Spawn subtle golden stardust particle trail during flight
      const now = performance.now();
      if (t > 0.12 && t < 0.88 && now - lastParticleTime > 45) {
        lastParticleTime = now;
        spawnTrailParticle(curX, curY);
      }

      // Smooth scale curve:
      // Weightless pop (0.25 -> 1.25) -> gentle glide (1.25 -> 1.0) -> funnel into cart (1.0 -> 0.15)
      let scale = 1.0;
      if (t < 0.22) {
        scale = 0.25 + (t / 0.22) * 1.0; // 0.25 -> 1.25
      } else if (t < 0.78) {
        scale = 1.25 - ((t - 0.22) / 0.56) * 0.28; // 1.25 -> 0.97
      } else {
        scale = 0.97 - ((t - 0.78) / 0.22) * 0.82; // 0.97 -> 0.15
      }

      // Smooth opacity:
      // Fades in fast, stays solid during flight, fades smoothly into the basket opening
      let opacity = 1;
      if (t < 0.08) {
        opacity = t / 0.08;
      } else if (t > 0.88) {
        opacity = 1 - (t - 0.88) / 0.12;
      }

      // Smooth banking & spin:
      // Tilts along the curve, then spirals slightly into the cart opening
      const tilt = Math.sin(t * Math.PI) * maxTilt;
      const spin = t > 0.75 ? ((t - 0.75) / 0.25) * (isMovingRight ? 45 : -45) : 0;
      const totalRotation = tilt + spin;

      clone.style.transform = `translate3d(${curX - HALF_SIZE}px, ${curY - HALF_SIZE}px, 0px) scale(${scale}) rotate(${totalRotation}deg)`;
      clone.style.opacity = `${opacity}`;
    },
    onComplete: () => {
      clone.remove();
      spawnLandingSparkles(targetX, targetY);
      triggerCartImpact(targetCartBtn);
    },
  });
};

/**
 * Triggers an elastic jelly impact bounce on the cart button when the product lands.
 */
export const triggerCartImpact = (cartBtn: HTMLElement) => {
  // Elastic squash & stretch on basket
  gsap.timeline()
    .to(cartBtn, {
      scaleX: 1.26,
      scaleY: 0.84,
      duration: 0.14,
      ease: 'power2.out',
    })
    .to(cartBtn, {
      scaleX: 0.92,
      scaleY: 1.16,
      duration: 0.12,
      ease: 'power2.in',
    })
    .to(cartBtn, {
      scaleX: 1.05,
      scaleY: 0.97,
      duration: 0.12,
      ease: 'power2.out',
    })
    .to(cartBtn, {
      scale: 1,
      duration: 0.35,
      ease: 'elastic.out(1.4, 0.4)',
    });

  // Soft expanding gold shockwave ring
  const rect = cartBtn.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.className = 'cart-impact-ring';
  ring.style.cssText = `
    position: fixed;
    top: ${rect.top + rect.height / 2 - 22}px;
    left: ${rect.left + rect.width / 2 - 22}px;
    width: 44px;
    height: 44px;
    border-radius: 9999px;
    border: 2.5px solid #F5D103;
    pointer-events: none;
    z-index: 999999;
    box-shadow: 0 0 16px rgba(245, 209, 3, 0.7);
  `;
  document.body.appendChild(ring);

  gsap.to(ring, {
    scale: 2.3,
    opacity: 0,
    duration: 0.48,
    ease: 'power2.out',
    onComplete: () => ring.remove(),
  });
};
