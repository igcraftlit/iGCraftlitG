/**
 * 文件路径：apps/web/src/iGM_Components/iGM_FluidBackground/iGM_FluidBackground.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Landing（首页 Hero 背景）
 * 模块：iGM_FluidBackground
 * 作用：WebGL 流体 / 液态渐变背景，品牌色系色带缓慢流动，鼠标移动产生轻微扰动与跟随
 * 内容：OGL 渲染器与全屏三角网格、Simplex/FBM 流体片元着色器、均匀量更新、
 *       30fps 帧节流、document.hidden 暂停、半分辨率渲染、鼠标平滑跟随、
 *       明暗主题取色、低端设备与 prefers-reduced-motion 静态渐变降级
 * 说明：基于轻量 WebGL 库 OGL；渲染失败或无 WebGL 支持时自动回退为 CSS 静态渐变
 */

// 导入依赖 //
"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import styles from "./iGM_FluidBackground.module.css";

// 类型定义 //
export interface iGM_FluidBackgroundProps {
  /** 追加到容器上的样式类 */
  className?: string;
}

// 常量与着色器 //
/** 全屏三角网格顶点着色器：直接把裁剪空间坐标透传，uv 作为片元坐标 */
const iGM_VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * 流体片元着色器：
 * 3D Simplex 噪声（Ashima Arts / Stefan Gustavson）叠加 4 个八度 FBM，
 * 以品牌蓝 #4d6bfe 为核心，混合深蓝 / 紫 / 青，形成缓慢流动的柔和色带。
 */
const iGM_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uAspect;
uniform float uMouseX;
uniform float uMouseY;
uniform float uDark;

/* ---------- Simplex 噪声 3D ---------- */
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

/* ---------- 分形叠加：柔软流动的色带 ---------- */
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2(uv.x * uAspect, uv.y);

  /* 鼠标扰动：把指针位置混入噪声坐标，形成轻微的跟随偏移 */
  vec2 drift = vec2(uMouseX, uMouseY) * 0.22;

  vec3 q = vec3(p * 1.25 + drift, uTime * 0.055);
  float n1 = fbm(q);
  float n2 = fbm(q + vec3(2.7, 1.3, 0.0) + n1 * 0.7);
  float band = smoothstep(-0.7, 0.9, n2 + n1 * 0.35);

  /* 品牌色系：品牌蓝 / 深蓝 / 紫 / 青 */
  vec3 cBrand  = vec3(0.302, 0.420, 0.996);  /* #4d6bfe */
  vec3 cDeep   = vec3(0.075, 0.106, 0.396);  /* 深蓝 */
  vec3 cPurple = vec3(0.494, 0.302, 0.996);  /* 紫 */
  vec3 cCyan   = vec3(0.133, 0.827, 0.933);  /* 青 */

  vec3 col = mix(cDeep, cBrand, band);
  col = mix(col, cPurple, smoothstep(0.25, 1.0, n1 + 0.45));
  col = mix(col, cCyan, smoothstep(0.35, 1.0, -n2) * 0.65);

  /* 主题适配：亮色提亮柔化，暗色压暗加深 */
  float light = 1.0 - uDark;
  col = mix(col, vec3(1.0), light * 0.78);
  col = mix(col, vec3(0.02, 0.024, 0.055), (1.0 - light) * 0.5);

  /* 中心柔光：标题区域更干净，边缘自然融入页面背景 */
  float vignette = 1.0 - smoothstep(0.18, 1.1, length((uv - 0.5) * vec2(uAspect, 1.0)));
  col *= 0.88 + 0.3 * vignette;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** 帧节流间隔：约 30fps，兼顾流畅与能耗 */
const iGM_FRAME_INTERVAL = 1000 / 30;

// 核心逻辑 //
/**
 * 判定是否走静态渐变降级：
 * 1) 用户偏好减少动态；2) 设备核心数过低；3) 设备内存过低
 */
function iGM_ShouldFallback(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= 2) return true;

  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory <= 2) return true;

  return false;
}

/** WebGL 流体渐变背景 */
export function iGM_FluidBackground({
  className = "",
}: iGM_FluidBackgroundProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;

    // 静态降级：不初始化 WebGL，直接透出容器上的 CSS 渐变背景
    if (iGM_ShouldFallback()) return;
    if (!host || !canvas) return;

    let renderer: Renderer | null;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false,
        // 分辨率限制为屏幕物理像素的 1/2，显著降低填充率压力
        dpr: Math.max(0.5, (window.devicePixelRatio || 1) * 0.5),
      });
    } catch {
      // 无 WebGL 支持或上下文创建失败：保持透明画布，透出静态渐变
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const program = new Program(gl, {
      vertex: iGM_VERTEX_SHADER,
      fragment: iGM_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uMouseX: { value: 0 },
        uMouseY: { value: 0 },
        uDark: { value: 0 },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let raf = 0;
    let disposed = false;
    let lastFrame = 0;
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    /** 读取当前主题，写入 uDark 均匀量 */
    function iGM_SyncTheme(): void {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      program.uniforms.uDark.value = dark ? 1 : 0;
    }

    /** 按容器尺寸重设画布与宽高比 */
    function iGM_Resize(): void {
      const rect = host!.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      renderer!.setSize(rect.width, rect.height);
      program.uniforms.uAspect.value = rect.width / rect.height;
    }

    /** 渲染帧：30fps 节流 + 鼠标平滑跟随 */
    function iGM_Frame(now: number): void {
      if (disposed) return;
      raf = window.requestAnimationFrame(iGM_Frame);
      if (now - lastFrame < iGM_FRAME_INTERVAL) return;
      lastFrame = now;

      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      program.uniforms.uTime.value = now * 0.001;
      program.uniforms.uMouseX.value = mouse.x;
      program.uniforms.uMouseY.value = mouse.y;

      renderer!.render({ scene: mesh });
    }

    /** document.hidden 时暂停渲染，可见时恢复 */
    function iGM_HandleVisibility(): void {
      if (document.hidden) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !disposed) {
        lastFrame = 0;
        raf = window.requestAnimationFrame(iGM_Frame);
      }
    }

    /** 指针移动：换算为 -1..1 的归一化坐标作为扰动目标 */
    function iGM_HandlePointerMove(event: PointerEvent): void {
      const rect = canvas!.getBoundingClientRect();
      mouse.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.targetY = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    }

    /** 指针离开：扰动回落到中心 */
    function iGM_HandlePointerLeave(): void {
      mouse.targetX = 0;
      mouse.targetY = 0;
    }

    iGM_SyncTheme();
    iGM_Resize();
    raf = window.requestAnimationFrame(iGM_Frame);

    const resizeObserver = new ResizeObserver(() => iGM_Resize());
    resizeObserver.observe(host);

    const themeObserver = new MutationObserver(() => iGM_SyncTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    document.addEventListener("visibilitychange", iGM_HandleVisibility);
    window.addEventListener("pointermove", iGM_HandlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerleave", iGM_HandlePointerLeave);
    window.addEventListener("blur", iGM_HandlePointerLeave);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", iGM_HandleVisibility);
      window.removeEventListener("pointermove", iGM_HandlePointerMove);
      window.removeEventListener("pointerleave", iGM_HandlePointerLeave);
      window.removeEventListener("blur", iGM_HandlePointerLeave);
      // 主动释放 WebGL 上下文，避免长会话下的上下文泄漏
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`${styles.host} ${className}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}

// 导出 //
export default iGM_FluidBackground;
