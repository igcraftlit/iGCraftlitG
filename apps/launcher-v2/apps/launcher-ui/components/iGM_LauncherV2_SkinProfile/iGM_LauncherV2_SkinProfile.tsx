/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_SkinProfile/iGM_LauncherV2_SkinProfile.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（账号中心 - 正版档案详情）
 * 模块：iGM_LauncherV2_SkinProfile
 * 作用：微软正版账号档案页（3D 角色展示 + 皮肤 / 披风纹理与模型信息）
 * 内容：由账号中心点击已绑定的正版账号进入；纹理经外壳向 Mojang 会话服务取回
 *       （base64 textures 属性解析出皮肤与披风地址及 Slim / Classic 模型），
 *       转 data URL 后交由 skinview3d 渲染 3D 模型，支持鼠标拖拽旋转与滚轮缩放；
 *       展示正版 ID、UUID（可复制）与模型类型；提供前往官网更换皮肤与重新载入
 * 说明：正版皮肤由官方账号体系管理，本页不提供本地一键应用，仅展示与跳转官网
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import {
  iGM_LauncherV2_UseMsa as IGM_LauncherV2_UseMsa,
  iGM_LauncherV2_UseSkinProfile as IGM_LauncherV2_UseSkinProfile,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_SkinViewer as IGM_LauncherV2_SkinViewer,
} from "@/components/iGM_LauncherV2_SkinViewer/iGM_LauncherV2_SkinViewer";
import styles from "./iGM_LauncherV2_SkinProfile.module.css";

// 类型定义 //

/** 正版档案页入参 */
export interface iGM_LauncherV2_SkinProfileProps {
  /** 返回账号中心的回调 */
  onBack: () => void;
}

// 核心逻辑 //

/**
 * 复制文本到剪贴板。
 * 剪贴板 API 在权限受限时不可用，退回临时文本域方案。
 */
async function iGM_LauncherV2_SkinProfileCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** 正版档案详情页：3D 角色展示与账号纹理信息 */
export function iGM_LauncherV2_SkinProfile({ onBack }: iGM_LauncherV2_SkinProfileProps) {
  const msa = IGM_LauncherV2_UseMsa();
  const profile = IGM_LauncherV2_UseSkinProfile();
  const [copied, setCopied] = useState(false);

  const account = msa.account;
  const detail = profile.profile;

  // 复制提示短暂停留后自动复位
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <section className={styles.screen}>
      <header className={styles.head}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span>返回账号中心</span>
        </button>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => profile.refresh()}
          >
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>重新载入</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => profile.openOfficial()}>
            <ExternalLink size={14} strokeWidth={2.2} />
            <span>前往官网更换</span>
          </button>
        </div>
      </header>

      <h1 className={styles.title}>正版账号档案</h1>
      <p className={styles.desc}>
        纹理来自 Mojang 会话服务的 profile 接口，仅用于本地 3D 展示。
      </p>

      {/* 未绑定正版账号：本页仅在账号中心点击已绑定账号时进入 */}
      {!account ? (
        <IGM_LauncherV2_Card className={styles.emptyCard}>
          <p className={styles.emptyText}>尚未绑定微软正版账号，请先在账号中心完成验证。</p>
        </IGM_LauncherV2_Card>
      ) : (
        <div className={styles.layout}>
          <IGM_LauncherV2_Card className={styles.stageCard}>
            <div className={styles.stage}>
              <IGM_LauncherV2_SkinViewer
                skinUrl={profile.skinDataUrl}
                capeUrl={profile.capeDataUrl}
                model={detail?.model ?? "classic"}
                autoRotate
                emptyHint={profile.loaded ? profile.message || "未取回皮肤纹理" : "正在载入正版档案…"}
              />
            </div>
          </IGM_LauncherV2_Card>

          <IGM_LauncherV2_Card className={styles.infoCard}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>正版 ID</span>
              <span className={styles.fieldValue}>{detail?.name ?? account.name}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>模型类型</span>
              <span className={styles.fieldValue}>
                {detail ? (detail.model === "slim" ? "Slim（细手臂）" : "Classic（粗手臂）") : "-"}
              </span>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>UUID</span>
              <span className={styles.fieldValueMono}>{detail?.uuid ?? account.uuid}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>披风</span>
              <span className={styles.fieldValue}>{detail?.capeUrl ? "已佩戴" : "未佩戴"}</span>
            </div>

            <div className={styles.infoActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  void (async () => {
                    const ok = await iGM_LauncherV2_SkinProfileCopy(
                      detail?.uuid ?? account.uuid,
                    );
                    setCopied(ok);
                  })();
                }}
              >
                {copied ? (
                  <Check size={14} strokeWidth={2.2} />
                ) : (
                  <Copy size={14} strokeWidth={2.2} />
                )}
                <span>{copied ? "已复制 UUID" : "复制 UUID"}</span>
              </button>
            </div>

            {profile.message ? <p className={styles.notice}>{profile.message}</p> : null}
          </IGM_LauncherV2_Card>
        </div>
      )}
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_SkinProfile;
