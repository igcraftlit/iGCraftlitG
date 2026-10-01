/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_DeveloperPortalButton/iGM_CLI_DeveloperPortalButton.tsx
 * 所属层：前端 / 组件层
 * 路由：/{locale}（首页 Hero 区）
 * 模块：iGM_CLI_DeveloperPortalButton
 * 作用：首页「进入开发者平台」按钮——运行时解析主站开发者平台页地址
 * 内容：生产环境指向 https://igcraftlit.com/G_DeveloperPortal，
 *       本地开发指向 http://localhost:3000/G_DeveloperPortal
 * 说明：开发者申请通过后凭站点登录会话直接进入，无需密钥；
 *       初始渲染使用生产地址以避免静态导出与首屏水合不一致，挂载后再按域名切换
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

// 类型定义 //
interface iGM_CLI_DeveloperPortalButtonProps {
  /** 复用首页 Hero 区的按钮样式类 */
  className?: string;
}

/** 生产环境主站开发者平台页 */
const iGM_CLI_PortalUrlProduction = "https://igcraftlit.com/G_DeveloperPortal";
/** 本地开发主站开发者平台页 */
const iGM_CLI_PortalUrlLocal = "http://localhost:3000/G_DeveloperPortal";

// 核心逻辑 //
/** 进入开发者平台按钮（外链主站开发者平台登录页） */
export function iGM_CLI_DeveloperPortalButton({
  className,
}: iGM_CLI_DeveloperPortalButtonProps) {
  const t = useTranslations();
  const [href, setHref] = useState(iGM_CLI_PortalUrlProduction);

  // 本地开发时切换到本地主站地址（避免水合不一致，仅在挂载后执行）
  useEffect(() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      setHref(iGM_CLI_PortalUrlLocal);
    }
  }, []);

  return (
    <a href={href} className={className}>
      <ExternalLink size={16} aria-hidden />
      {t("hero.enterDeveloperPortal")}
    </a>
  );
}

// 导出 //
export default iGM_CLI_DeveloperPortalButton;
