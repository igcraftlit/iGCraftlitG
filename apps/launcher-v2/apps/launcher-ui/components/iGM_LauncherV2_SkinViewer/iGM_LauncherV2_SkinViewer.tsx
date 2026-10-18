/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_SkinViewer/iGM_LauncherV2_SkinViewer.tsx
 * 所属层：前端 / 3D 渲染组件层
 * 路由：全局（皮肤库与正版档案共用）
 * 模块：iGM_LauncherV2_SkinViewer
 * 作用：3D 角色查看器的动态加载外壳（隔离 skinview3d 与静态导出）
 * 内容：以 dynamic(..., { ssr: false }) 引入 iGM_LauncherV2_SkinCanvas，
 *       静态导出阶段不加载 skinview3d，避免引用了浏览器专属 API 而构建失败；
 *       加载期间显示占位文案，纹理缺失时显示空态提示；
 *       文案已接入多语言（skin 命名空间，含动态加载占位与默认空态）
 * 说明：任何页面都必须经本组件使用 3D 渲染，禁止直接静态引入 Canvas 组件
 */

// 导入依赖 //
"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import styles from "./iGM_LauncherV2_SkinViewer.module.css";

// 类型定义 //

/** 3D 查看器入参（与 Canvas 组件保持一致） */
export interface iGM_LauncherV2_SkinViewerProps {
  /** 皮肤纹理地址（data URL 或 https 地址）；为空表示暂无纹理 */
  skinUrl: string;
  /** 披风纹理地址；为空表示不渲染披风 */
  capeUrl?: string;
  /** 角色模型：classic 为粗手臂（默认），slim 为细手臂 */
  model?: "classic" | "slim";
  /** 是否自动缓慢旋转 */
  autoRotate?: boolean;
  /** 空态提示文案 */
  emptyHint?: string;
}

// 核心逻辑 //

/** 动态画布加载期间的占位组件（组件内部解析多语言文案） */
function IGM_LauncherV2_SkinViewerLoading() {
  const t = useTranslations();
  return <span className={styles.viewportLoading}>{t("skin.viewer.loading")}</span>;
}

/** 动态引入的 3D 画布：禁止服务端渲染，静态导出阶段不触碰浏览器专属 API */
const IGM_LauncherV2_SkinCanvasLazy = dynamic(
  () => import("./iGM_LauncherV2_SkinCanvas").then((mod) => mod.iGM_LauncherV2_SkinCanvas),
  {
    ssr: false,
    loading: () => <IGM_LauncherV2_SkinViewerLoading />,
  },
);

/** 3D 角色查看器外壳：纹理缺失时给出空态而非空白画布 */
export function iGM_LauncherV2_SkinViewer({
  skinUrl,
  capeUrl = "",
  model = "classic",
  autoRotate = false,
  emptyHint,
}: iGM_LauncherV2_SkinViewerProps) {
  const t = useTranslations();
  if (!skinUrl) {
    return (
      <div className={styles.viewportEmpty}>
        <span className={styles.viewportLoading}>{emptyHint ?? t("skin.viewer.empty")}</span>
      </div>
    );
  }

  return (
    <IGM_LauncherV2_SkinCanvasLazy
      skinUrl={skinUrl}
      capeUrl={capeUrl}
      model={model}
      autoRotate={autoRotate}
    />
  );
}

// 导出 //
export default iGM_LauncherV2_SkinViewer;
