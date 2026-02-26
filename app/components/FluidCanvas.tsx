'use client';

import { useEffect, useRef } from 'react';

export default function FluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const WIDTH = 200;
    const HEIGHT = 200;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const ctx = canvas.getContext('2d')!;

    let mouseX = WIDTH / 2;
    let mouseY = HEIGHT / 2;
    let lastMouseX = mouseX;
    let lastMouseY = mouseY;

    const updateMouse = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = ((clientX - rect.left) / rect.width * WIDTH) | 0;
      mouseY = ((clientY - rect.top) / rect.height * HEIGHT) | 0;
    };

    const onMouseMove = (e: MouseEvent) => updateMouse(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateMouse(e.touches[0].clientX, e.touches[0].clientY);
        lastMouseX = mouseX;
        lastMouseY = mouseY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    const step = 4.0;

    const velocityField0 = new Float32Array(WIDTH * HEIGHT * 2);
    const velocityField1 = new Float32Array(WIDTH * HEIGHT * 2);
    const pressureField0 = new Float32Array(WIDTH * HEIGHT);
    const pressureField1 = new Float32Array(WIDTH * HEIGHT);
    const divergenceField = new Float32Array(WIDTH * HEIGHT);

    type Sampler = ((x: number, y: number, value?: number) => number) & {
      a: Float32Array;
    };

    function sampler(
      a: Float32Array,
      width: number,
      height: number,
      stride: number,
      offset: number
    ): Sampler {
      const f = function (x: number, y: number, value?: number): number {
        x = (x < 0 ? 0 : x > width - 1 ? width - 1 : x) | 0;
        y = (y < 0 ? 0 : y > height - 1 ? height - 1 : y) | 0;
        if (value !== undefined) {
          a[(x + y * width) * stride + offset] = value;
          return value;
        }
        return a[(x + y * width) * stride + offset];
      } as Sampler;
      f.a = a;
      return f;
    }

    let u0x = sampler(velocityField0, WIDTH, HEIGHT, 2, 0);
    let u0y = sampler(velocityField0, WIDTH, HEIGHT, 2, 1);
    let u1x = sampler(velocityField1, WIDTH, HEIGHT, 2, 0);
    let u1y = sampler(velocityField1, WIDTH, HEIGHT, 2, 1);
    let p0 = sampler(pressureField0, WIDTH, HEIGHT, 1, 0);
    let p1 = sampler(pressureField1, WIDTH, HEIGHT, 1, 0);
    const div = sampler(divergenceField, WIDTH, HEIGHT, 1, 0);

    velocityboundary(u0x, u0y);

    function lerp(a: number, b: number, c: number) {
      c = c < 0 ? 0 : c > 1 ? 1 : c;
      return a * (1 - c) + b * c;
    }

    function clamp(a: number, min: number, max: number) {
      return Math.max(Math.min(a, max), min);
    }

    function bilerp(sample: Sampler, x: number, y: number) {
      const x0 = ~~x;
      const y0 = ~~y;
      return lerp(
        lerp(sample(x0, y0), sample(x0 + 1, y0), x - x0),
        lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), x - x0),
        y - y0
      );
    }

    function advect(
      ux: Sampler,
      uy: Sampler,
      src: Sampler,
      dest: Sampler,
      t: number
    ) {
      for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
          dest(x, y, bilerp(src, x + ux(x, y) * t, y + uy(x, y) * t));
        }
      }
    }

    function computeDivergence(ux: Sampler, uy: Sampler, d: Sampler) {
      for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
          d(
            x,
            y,
            (ux(x + 1, y) - ux(x - 1, y) + uy(x, y + 1) - uy(x, y - 1)) *
              0.5
          );
        }
      }
    }

    function fastjacobi(
      fp0: Sampler,
      fp1: Sampler,
      b: Sampler,
      alpha: number,
      beta: number,
      iterations: number
    ) {
      let pa = fp0.a;
      let pb = fp1.a;
      const ba = b.a;
      for (let i = 0; i < iterations; i++) {
        for (let y = 1; y < HEIGHT - 1; y++) {
          for (let x = 1; x < WIDTH - 1; x++) {
            const pi = x + y * WIDTH;
            pb[pi] =
              (pa[pi - 1] +
                pa[pi + 1] +
                pa[pi - WIDTH] +
                pa[pi + WIDTH] +
                alpha * ba[pi]) *
              beta;
          }
        }
        const aux = pa;
        pa = pb;
        pb = aux;
      }
    }

    function subtractPressureGradient(ux: Sampler, uy: Sampler, p: Sampler) {
      for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
          ux(x, y, ux(x, y) - (p(x + 1, y) - p(x - 1, y)) / 2);
          uy(x, y, uy(x, y) - (p(x, y + 1) - p(x, y - 1)) / 2);
        }
      }
    }

    function velocityboundary(ux: Sampler, uy: Sampler) {
      for (let x = 0; x < WIDTH; x++) {
        ux(x, 0, -ux(x, 1));
        uy(x, 0, -uy(x, 1));
        ux(x, HEIGHT - 1, -ux(x, HEIGHT - 2));
        uy(x, HEIGHT - 1, -uy(x, HEIGHT - 2));
      }
      for (let y = 0; y < HEIGHT; y++) {
        ux(0, y, -ux(1, y));
        uy(0, y, -uy(1, y));
        ux(WIDTH - 1, y, -ux(WIDTH - 2, y));
        uy(WIDTH - 1, y, -uy(WIDTH - 2, y));
      }
    }

    function addMouseForce(ux: Sampler, uy: Sampler) {
      const x = clamp(mouseX, 1, WIDTH - 2);
      const y = clamp(mouseY, 1, HEIGHT - 2);
      const dx = mouseX - lastMouseX;
      const dy = mouseY - lastMouseY;
      lastMouseX = mouseX;
      lastMouseY = mouseY;
      ux(x, y, ux(x, y) - dx * 2);
      uy(x, y, uy(x, y) - dy * 2);
    }

    function simulate() {
      velocityboundary(u0x, u0y);
      advect(u0x, u0y, u0x, u1x, step);
      advect(u0x, u0y, u0y, u1y, step);
      addMouseForce(u1x, u1y);
      computeDivergence(u1x, u1y, div);
      fastjacobi(p0, p1, div, -1, 0.25, 16);
      subtractPressureGradient(u1x, u1y, p0);
      let aux: Sampler;
      aux = p0;
      p0 = p1;
      p1 = aux;
      aux = u0x;
      u0x = u1x;
      u1x = aux;
      aux = u0y;
      u0y = u1y;
      u1y = aux;
    }

    function draw() {
      const d = imageData.data;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const pi = y * WIDTH + x;
          const di = pi * 4;
          d[di] = p0(x, y) * 555;
          d[di + 1] = u0x(x, y) * 128 + 128;
          d[di + 2] = u0y(x, y) * 128 + 128;
          d[di + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    let animationId: number;
    const animate = () => {
      simulate();
      draw();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
