/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_SkinViewer/iGM_LauncherV2_SkinCanvas.tsx
 * 所属层：前端 / 3D 渲染组件层
 * 路由：全局（皮肤库与正版档案共用）
 * 模块：iGM_LauncherV2_SkinCanvas
 * 作用：基于 skinview3d 的 Minecraft 角色 3D 查看器（唯一直接依赖 skinview3d 的组件）
 * 内容：挂载时创建 SkinViewer 与 canvas，播放待机动画，启用 OrbitControls
 *       （鼠标拖拽旋转、滚轮缩放）；纹理变更时重新装载皮肤与披风；
 *       容器尺寸变化经 ResizeObserver 同步画布；卸载时释放渲染资源
 * 说明：本组件不得被静态引入到任何页面组件中，必须经 iGM_LauncherV2_SkinViewer
 *       以 dynamic(..., { ssr: false }) 动态加载，避免 Next.js 静态导出阶段报错；
 *       皮肤纹理以 data URL 传入，规避 WebView 内跨域取图限制
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import styles from "./iGM_LauncherV2_SkinViewer.module.css";

// 类型定义 //

/** 3D 查看器入参 */
export interface iGM_LauncherV2_SkinCanvasProps {
  /** 皮肤纹理地址（data URL 或 https 地址）；为空表示暂无纹理 */
  skinUrl: string;
  /** 披风纹理地址；为空表示不渲染披风 */
  capeUrl?: string;
  /** 角色模型：classic 为粗手臂（默认），slim 为细手臂 */
  model?: "classic" | "slim";
  /** 是否自动缓慢旋转（空转展示） */
  autoRotate?: boolean;
}

// 核心逻辑 //

/** 画布容器最小边长：容器尚未完成布局时避免渲染出 0 尺寸画布 */
const IGM_SKIN_CANVAS_MIN_SIZE = 320;

/** 自动旋转角速度（弧度每秒），保持缓慢以便观察 */
const IGM_SKIN_AUTO_ROTATE_SPEED = 0.7;

/**
 * 3D 角色查看器。
 * 单次挂载创建渲染器，纹理与旋转状态经独立副作用更新，避免重建渲染器闪烁。
 */
export function iGM_LauncherV2_SkinCanvas({
  skinUrl,
  capeUrl = "",
  model = "classic",
  autoRotate = false,
}: iGM_LauncherV2_SkinCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [ready, setReady] = useState(false);

  // 创建渲染器：仅在挂载时执行一次
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const viewer = new SkinViewer({
      canvas,
      width: Math.max(host.clientWidth, IGM_SKIN_CANVAS_MIN_SIZE),
      height: Math.max(host.clientHeight, IGM_SKIN_CANVAS_MIN_SIZE),
      model: model === "slim" ? "slim" : "default",
      zoom: 0.86,
      pixelRatio: "match-device",
      enableControls: true,
      animation: new IdleAnimation(),
    });
    viewer.autoRotate = autoRotate;
    viewer.autoRotateSpeed = IGM_SKIN_AUTO_ROTATE_SPEED;
    viewerRef.current = viewer;

    // 容器尺寸随窗口与布局变化，画布需同步尺寸后再重算相机距离
    const observer = new ResizeObserver(() => {
      viewer.setSize(
        Math.max(host.clientWidth, IGM_SKIN_CANVAS_MIN_SIZE),
        Math.max(host.clientHeight, IGM_SKIN_CANVAS_MIN_SIZE),
      );
      viewer.adjustCameraDistance();
    });
    observer.observe(host);

    setReady(true);

    return () => {
      observer.disconnect();
      viewer.dispose();
      viewerRef.current = null;
      setReady(false);
    };
    // 模型类型在重建渲染器时一并生效，故此处只需挂载依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 皮肤纹理：变更后重新装载，未提供纹理时清空角色
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!skinUrl) {
      viewer.resetSkin();
      return;
    }
    void viewer.loadSkin(skinUrl, { model: model === "slim" ? "slim" : "default" });
  }, [skinUrl, model, ready]);

  // 披风纹理：变更后重新装载，未提供时清空
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!capeUrl) {
      viewer.resetCape();
      return;
    }
    void viewer.loadCape(capeUrl);
  }, [capeUrl, ready]);

  // 自动旋转开关
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.autoRotate = autoRotate;
  }, [autoRotate, ready]);

  return (
    <div className={styles.viewport} ref={hostRef}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Minecraft 角色 3D 预览" />
      <span className={styles.viewportHint}>拖拽旋转 · 滚轮缩放</span>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_SkinCanvas;
