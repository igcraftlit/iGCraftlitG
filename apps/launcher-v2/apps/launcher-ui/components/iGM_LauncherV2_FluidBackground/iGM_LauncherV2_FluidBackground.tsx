/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_FluidBackground/iGM_LauncherV2_FluidBackground.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（欢迎首页 / 登录页 / 安装向导背景）
 * 模块：iGM_LauncherV2_FluidBackground
 * 作用：与主站首页同款的 WebGL 流体云背景，品牌色带缓慢流动并随鼠标轻扰
 * 内容：OGL 渲染器 + 全屏三角网格、Simplex/FBM 片元着色器、30fps 节流、
 *       document.hidden 暂停、半分辨率渲染、指针平滑跟随、
 *       低端设备与 prefers-reduced-motion 静态渐变降级、
 *       画布由副作用自建自销（避免 StrictMode / Fast Refresh 复用已释放的 WebGL 上下文）
 * 说明：与主站 iGM_FluidBackground 同源；配色由 palette 决定（经典深紫 / 梦幻冷蓝 / 极光幻粉），
 *       仅改变背景色调，不影响界面主题色；配色切换通过 uniform 实时改写，不重建 WebGL 上下文
 */

// 导入依赖 //
"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import type { iGM_LauncherV2_CloudPalette } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_FluidBackground.module.css";

// 类型定义 //
export interface iGM_LauncherV2_FluidBackgroundProps {
  /** 追加到容器上的样式类 */
  className?: string;
  /** 流体云配色方案，默认经典深紫 */
  palette?: iGM_LauncherV2_CloudPalette;
}

/** 单套配色的四个色相与底色（归一化 RGB，供着色器 uniform 使用） */
interface iGM_LauncherV2_FluidPalette {
  brand: [number, number, number];
  deep: [number, number, number];
  mid: [number, number, number];
  accent: [number, number, number];
  base: [number, number, number];
}

// 常量与着色器 //

/** 全屏三角网格顶点着色器：裁剪空间坐标透传，uv 作为片元坐标 */
const IGM_VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * 流体云片元着色器：
 * 3D Simplex 噪声（Ashima Arts / Stefan Gustavson）叠加 4 个八度 FBM，
 * 以品牌色为核心，混合深色 / 中间色 / 点缀色，形成缓慢流动的柔和色带。
 * 五个色值全部由 uniform 传入，配色切换无需重建程序。
 */
const IGM_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uAspect;
uniform float uMouseX;
uniform float uMouseY;
uniform vec3 uBrand;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uAccent;
uniform vec3 uBase;

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

  /* 品牌色系：品牌色 / 深色 / 中间色 / 点缀色，全部由 uniform 传入 */
  vec3 col = mix(uDeep, uBrand, band);
  col = mix(col, uMid, smoothstep(0.25, 1.0, n1 + 0.45));
  col = mix(col, uAccent, smoothstep(0.35, 1.0, -n2) * 0.65);

  /* 深空基调：整体压暗，保证前景文字与卡片始终清晰 */
  col = mix(col, uBase, 0.5);

  /* 中心柔光：内容区域更干净，边缘自然融入窗口底色 */
  float vignette = 1.0 - smoothstep(0.18, 1.1, length((uv - 0.5) * vec2(uAspect, 1.0)));
  col *= 0.88 + 0.3 * vignette;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** 帧节流间隔：约 30fps，兼顾流畅与能耗 */
const IGM_FRAME_INTERVAL = 1000 / 30;

/**
 * 三套流体云配色的色值表（归一化 RGB）。
 * - purple 经典深紫：深蓝与紫色交融，即启动器原有默认观感
 * - blue 梦幻冷蓝：冷蓝与青色交融
 * - pink 极光幻粉：深紫与粉色交融
 */
const IGM_FLUID_PALETTES: Record<iGM_LauncherV2_CloudPalette, iGM_LauncherV2_FluidPalette> = {
  purple: {
    brand: [0.302, 0.42, 0.996],
    deep: [0.075, 0.106, 0.396],
    mid: [0.494, 0.302, 0.996],
    accent: [0.133, 0.827, 0.933],
    base: [0.02, 0.024, 0.055],
  },
  blue: {
    brand: [0.235, 0.549, 1.0],
    deep: [0.039, 0.122, 0.302],
    mid: [0.133, 0.827, 0.933],
    accent: [0.404, 0.91, 0.976],
    base: [0.008, 0.039, 0.102],
  },
  pink: {
    brand: [0.549, 0.278, 0.922],
    deep: [0.165, 0.059, 0.341],
    mid: [0.98, 0.451, 0.722],
    accent: [0.753, 0.518, 0.988],
    base: [0.071, 0.02, 0.141],
  },
};

/** 判定是否走静态渐变降级：减少动态偏好 / 核心数过低 / 内存过低 */
function iGM_ShouldFallback(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= 2) return true;

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory <= 2) return true;

  return false;
}

// 核心逻辑 //
export function iGM_LauncherV2_FluidBackground({
  className = "",
  palette = "purple",
}: iGM_LauncherV2_FluidBackgroundProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** 着色器程序实例：供配色切换时实时改写 uniform，不重建 WebGL 上下文 */
  const programRef = useRef<Program | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    // 静态降级：不初始化 WebGL，直接透出容器上的 CSS 渐变背景
    if (iGM_ShouldFallback()) return;
    if (!host) return;

    /*
     * 画布由副作用自建自销，而非写在 JSX 里复用：
     * StrictMode（开发环境）与 Fast Refresh 会重复执行副作用，
     * 复用同一 canvas 时，上一次清理释放掉的 WebGL 上下文会被再次取回，
     * 着色器因此编译失败，OGL 的 program.uniformLocations 保持 undefined，
     * 每逢渲染帧即在 Program.use() 抛出 TypeError。
     */
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    host.appendChild(canvas);

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
      // 无 WebGL 支持或上下文创建失败：移除画布，透出静态渐变
      canvas.remove();
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const program = new Program(gl, {
      vertex: IGM_VERTEX_SHADER,
      fragment: IGM_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uMouseX: { value: 0 },
        uMouseY: { value: 0 },
        // 初始配色固定为经典深紫，挂载后由配色副作用立即改写为实际配色
        uBrand: { value: [...IGM_FLUID_PALETTES.purple.brand] },
        uDeep: { value: [...IGM_FLUID_PALETTES.purple.deep] },
        uMid: { value: [...IGM_FLUID_PALETTES.purple.mid] },
        uAccent: { value: [...IGM_FLUID_PALETTES.purple.accent] },
        uBase: { value: [...IGM_FLUID_PALETTES.purple.base] },
      },
    });
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let raf = 0;
    let disposed = false;
    let lastFrame = 0;
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    /** 按容器尺寸重设画布与宽高比 */
    function resize(): void {
      const rect = host!.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      renderer!.setSize(rect.width, rect.height);
      program.uniforms.uAspect.value = rect.width / rect.height;
    }

    /** 渲染帧：30fps 节流 + 鼠标平滑跟随 */
    function frame(now: number): void {
      if (disposed) return;
      raf = window.requestAnimationFrame(frame);
      if (now - lastFrame < IGM_FRAME_INTERVAL) return;
      lastFrame = now;

      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      program.uniforms.uTime.value = now * 0.001;
      program.uniforms.uMouseX.value = mouse.x;
      program.uniforms.uMouseY.value = mouse.y;

      renderer!.render({ scene: mesh });
    }

    /** document.hidden 时暂停渲染，可见时恢复 */
    function handleVisibility(): void {
      if (document.hidden) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !disposed) {
        lastFrame = 0;
        raf = window.requestAnimationFrame(frame);
      }
    }

    /** 指针移动：换算为 -1..1 的归一化坐标作为扰动目标 */
    function handlePointerMove(event: PointerEvent): void {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.targetY = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    }

    /** 指针离开：扰动回落到中心 */
    function handlePointerLeave(): void {
      mouse.targetX = 0;
      mouse.targetY = 0;
    }

    resize();
    raf = window.requestAnimationFrame(frame);

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);

    return () => {
      disposed = true;
      programRef.current = null;
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      // 主动释放本次副作用独占的 WebGL 上下文并移除画布，避免长会话下的上下文泄漏
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  // 配色切换：实时改写着色器 uniform，画布持续渲染，无需重建上下文
  useEffect(() => {
    const program = programRef.current;
    if (!program) return;
    const preset = IGM_FLUID_PALETTES[palette] ?? IGM_FLUID_PALETTES.purple;
    program.uniforms.uBrand.value = [...preset.brand];
    program.uniforms.uDeep.value = [...preset.deep];
    program.uniforms.uMid.value = [...preset.mid];
    program.uniforms.uAccent.value = [...preset.accent];
    program.uniforms.uBase.value = [...preset.base];
  }, [palette]);

  return (
    <div
      ref={hostRef}
      className={`${styles.host} ${className}`}
      data-palette={palette}
      aria-hidden
    />
  );
}

// 导出 //
export default iGM_LauncherV2_FluidBackground;
