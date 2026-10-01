/**
 * 文件路径：apps/web/src/iGM_Pages/G_MinecraftVersionDetail/iGM_MinecraftVersionDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MinecraftVersionDetail?id=xxx（静态壳，查询参数驱动加载）
 * 模块：G_MinecraftVersionDetail
 * 作用：资源库 Minecraft 本体版本详情——展示版本信息并提供下载入口
 * 内容：返回链接、版本标题与类型徽标、发布时间/完整大小信息表、
 *       版本说明、下载入口（进入安装确认页）
 * 说明：模块十八仅展示「完整大小」，不再展示客户端/服务端细分大小与 SHA1
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CircleDashed,
  Download,
  FileText,
  LoaderCircle,
  ScrollText,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_ApiGetMinecraftVersion } from "../../iGM_Services/iGM_MinecraftClient";
import type { iGM_GameVersion } from "../../iGM_Services/iGM_GameClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import mc from "../iGM_Minecraft.module.css";
import styles from "../iGM_Game.module.css";

// 类型定义 //
// （版本类型来自 iGM_GameClient）

// 核心逻辑 //
/** 版本类型本地化标签 */
function iGM_VersionTypeLabel(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string {
  const key = `game.versionTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 本体版本详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftVersionDetailPage() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();
  const versionId = searchParams.get("id");

  const [version, setVersion] = useState<iGM_GameVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const iGM_Load = useCallback(async () => {
    if (!versionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetMinecraftVersion(versionId);
      setVersion(response.data?.version ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setVersion(null);
    } finally {
      setLoading(false);
    }
  }, [versionId, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("game.stateLoading")}
      </div>
    );
  }

  if (!version) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Download}
          title={t("game.notFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_MinecraftVersions" className={m10.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("game.backToVersions")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <Link href="/G_MinecraftVersions" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("game.backToVersions")}
      </Link>

      <article className={m10.sectionCard}>
        <div className={mc.detailMetaRow}>
          <span className={`${mc.mcCardType} ${mc.mcCardTypeStatic}`}>
            {iGM_VersionTypeLabel(t, version.type)}
          </span>
          {version.installed ? (
            <span className={styles.versionMetaRow}>
              <CheckCircle2 size={13} strokeWidth={1.8} />
              {t("game.installed")}
            </span>
          ) : (
            <span className={styles.versionMetaRow}>
              <CircleDashed size={13} strokeWidth={1.8} />
              {t("game.notInstalled")}
            </span>
          )}
          {version.releaseTime && (
            <>
              <Calendar size={13} strokeWidth={1.8} />
              {iGM_FormatDateTime(locale, version.releaseTime)}
            </>
          )}
        </div>

        <h1 className={mc.detailTitle}>{version.version}</h1>

        {/* 下载入口 */}
        <div className={m10.actionRow}>
          <Link
            href={`/G_GameInstall?version=${encodeURIComponent(version.version)}`}
            className={m10.primaryButton}
          >
            <Download size={15} strokeWidth={1.8} />
            {t("game.download")}
          </Link>
        </div>
      </article>

      {/* 版本信息 */}
      <section className={m10.sectionCard}>
        <span className={mc.subTitle}>
          <FileText size={16} strokeWidth={1.8} />
          {t("game.versionInfo")}
        </span>
        <div className={styles.kvList}>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.versionLabel")}</span>
            <span className={styles.kvValue}>{version.version}</span>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.typeLabel")}</span>
            <span className={styles.kvValue}>
              {iGM_VersionTypeLabel(t, version.type)}
            </span>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.releaseTimeLabel")}</span>
            <span className={styles.kvValue}>
              {version.releaseTime
                ? iGM_FormatDateTime(locale, version.releaseTime)
                : t("game.unspecified")}
            </span>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.sizeLabel")}</span>
            <span className={styles.kvValue}>
              {typeof version.totalSize === "number"
                ? iGM_FormatFileSize(version.totalSize)
                : t("game.sizeComputing")}
            </span>
          </div>
        </div>
      </section>

      {/* 版本说明 */}
      {version.notes && (
        <section className={m10.sectionCard}>
          <span className={mc.subTitle}>
            <ScrollText size={16} strokeWidth={1.8} />
            {t("game.notesLabel")}
          </span>
          <div className={mc.description}>{version.notes}</div>
        </section>
      )}
    </div>
  );
}

// 导出 //
export default iGM_MinecraftVersionDetailPage;