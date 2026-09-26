/**
 * 文件路径：apps/web/src/iGM_Pages/G_MinecraftDetail/iGM_MinecraftDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MinecraftDetail?resourceId=xxx（静态壳，查询参数驱动加载）
 * 模块：G_MinecraftDetail
 * 作用：Minecraft 资源详情——封面、兼容性、简介、下载、归属信息、更新日志、
 *       上传者管理（编辑/删除）
 * 内容：返回链接、封面与主体双栏布局、类型徽标、版本/加载器/平台胶囊、
 *       下载按钮与统计、文件信息、许可/原作者/原帖、更新日志
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowUpRight,
  Blocks,
  Calendar,
  Download,
  FileText,
  HardDrive,
  LoaderCircle,
  Pencil,
  ScrollText,
  Trash2,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiDeleteMinecraft,
  iGM_ApiGetMinecraft,
  iGM_MinecraftDownloadUrl,
} from "../../iGM_Services/iGM_MinecraftClient";
import type { iGM_ResourceDetail } from "../../iGM_Services/iGM_ResourceClient";
import {
  iGM_FilePreviewUrl,
  iGM_FormatFileSize,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import styles from "../iGM_Minecraft.module.css";

// 类型定义 //
// （状态类型来自 iGM_ResourceClient）

// 核心逻辑 //
/** 资源类型本地化标签 */
function iGM_TypeLabel(t: ReturnType<typeof useTranslations>, value: string | null): string {
  if (!value) return "";
  const key = `minecraft.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** Minecraft 资源详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftDetailPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();
  const resourceId = searchParams.get("resourceId");
  const { status: authStatus } = iGM_UseAuth();

  const [resource, setResource] = useState<iGM_ResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 拉取详情（resourceType 为空时后端返回 404） */
  const iGM_Load = useCallback(async () => {
    if (!resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetMinecraft(resourceId);
      setResource(response.data?.resource ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 删除资源：二次确认后返回分区 */
  async function iGM_HandleDelete(): Promise<void> {
    if (!resource || busy) return;
    if (!window.confirm(t("minecraft.confirmDelete"))) return;
    setBusy(true);
    try {
      await iGM_ApiDeleteMinecraft(resource.id);
      router.push("/G_Minecraft");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("minecraft.stateLoading")}
      </div>
    );
  }

  if (!resource) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Blocks}
          title={t("minecraft.notFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_Minecraft" className={m10.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("minecraft.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  const uploaderName = resource.uploader.displayName ?? resource.uploader.username;
  const canManage = resource.canManage && authStatus === "authenticated";

  return (
    <div className={pageStyles.page}>
      {/* 返回与状态 */}
      <Link href="/G_Minecraft" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("minecraft.backToList")}
      </Link>
      {errorText && <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>}

      <div className={styles.detailLayout}>
        {/* 左侧：封面与下载 */}
        <div className={styles.detailMain}>
          <div className={styles.detailCover}>
            {resource.cover ? (
              <img
                src={iGM_FilePreviewUrl(resource.cover.id)}
                alt={resource.title}
                crossOrigin="anonymous"
              />
            ) : (
              <div className={styles.detailCoverFallback}>
                <Blocks size={40} strokeWidth={1.4} />
              </div>
            )}
          </div>

          {/* 下载区 */}
          <div className={`${m10.sectionCard} ${m10.actionRow}`}>
            <a
              href={iGM_MinecraftDownloadUrl(resource.id)}
              className={m10.primaryButton}
              download
            >
              <Download size={15} strokeWidth={1.8} />
              {t("minecraft.download")}
            </a>
            <span className={styles.mcCardMetaItem}>
              <Download size={13} strokeWidth={1.8} />
              {t("minecraft.downloadCount", { count: resource.downloadCount })}
            </span>
          </div>

          {/* 文件信息 */}
          <section className={m10.sectionCard}>
            <span className={styles.subTitle}>
              <FileText size={16} strokeWidth={1.8} />
              {t("minecraft.fileInfo")}
            </span>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t("minecraft.fileName")}</span>
                <span className={styles.infoValue}>{resource.file.originalName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t("minecraft.fileSize")}</span>
                <span className={styles.infoValue}>
                  <HardDrive size={12} strokeWidth={1.8} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                  {iGM_FormatFileSize(resource.file.size)}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* 右侧：主体信息 */}
        <div className={styles.detailMain}>
          <article className={m10.sectionCard}>
            <div className={styles.detailMetaRow}>
              <span className={`${styles.mcCardType} ${styles.mcCardTypeStatic}`}>
                {iGM_TypeLabel(t, resource.resourceType)}
              </span>
              <IGM_Avatar size="sm" src={resource.uploader.avatar} name={uploaderName} />
              <span>
                {t("minecraft.uploadedBy", { name: uploaderName })}
              </span>
              <Calendar size={13} strokeWidth={1.8} />
              {iGM_FormatDateTime(locale, resource.createdAt)}
            </div>

            <h1 className={styles.detailTitle}>{resource.title}</h1>

            {resource.tags.length > 0 && (
              <div className={styles.compatChips}>
                {resource.tags.map((tag) => (
                  <span key={tag.id} className={styles.compatChip}>{tag.name}</span>
                ))}
              </div>
            )}

            {/* 兼容性 */}
            <div className={styles.compatRow}>
              <div className={styles.compatGroup}>
                <span className={styles.compatLabel}>{t("minecraft.compatVersions")}</span>
                <div className={styles.compatChips}>
                  {resource.mcVersions.map((value) => (
                    <span key={value} className={styles.compatChip}>{value}</span>
                  ))}
                </div>
              </div>
              <div className={styles.compatGroup}>
                <span className={styles.compatLabel}>{t("minecraft.compatLoaders")}</span>
                <div className={styles.compatChips}>
                  {resource.loaders.map((value) => (
                    <span key={value} className={styles.compatChip}>{value}</span>
                  ))}
                </div>
              </div>
              <div className={styles.compatGroup}>
                <span className={styles.compatLabel}>{t("minecraft.compatPlatforms")}</span>
                <div className={styles.compatChips}>
                  {resource.platforms.map((value) => (
                    <span key={value} className={styles.compatChip}>{value}</span>
                  ))}
                </div>
              </div>
            </div>
          </article>

          {/* 简介 */}
          <section className={m10.sectionCard}>
            <span className={styles.subTitle}>
              <Blocks size={16} strokeWidth={1.8} />
              {t("minecraft.descriptionLabel")}
            </span>
            <div className={styles.description}>{resource.description}</div>
          </section>

          {/* 归属信息 */}
          <section className={m10.sectionCard}>
            <span className={styles.subTitle}>
              <ArrowUpRight size={16} strokeWidth={1.8} />
              {t("minecraft.creditTitle")}
            </span>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t("minecraft.license")}</span>
                <span className={styles.infoValue}>
                  {resource.license ?? t("minecraft.unspecified")}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t("minecraft.originalAuthor")}</span>
                <span className={styles.infoValue}>
                  {resource.originalAuthor ?? t("minecraft.unspecified")}
                </span>
              </div>
            </div>
            {resource.originalUrl && (
              <a
                href={resource.originalUrl}
                className={styles.externalLink}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ArrowUpRight size={13} strokeWidth={1.8} />
                {t("minecraft.originalUrl")}
              </a>
            )}
          </section>

          {/* 更新日志 */}
          {resource.changelog && (
            <section className={m10.sectionCard}>
              <span className={styles.subTitle}>
                <ScrollText size={16} strokeWidth={1.8} />
                {t("minecraft.changelogLabel")}
              </span>
              <div className={styles.description}>{resource.changelog}</div>
            </section>
          )}

          {/* 上传者管理操作 */}
          {canManage && (
            <section className={`${m10.sectionCard} ${m10.actionRow}`}>
              <Link
                href={`/G_MinecraftUpload?resourceId=${encodeURIComponent(resource.id)}`}
                className={m10.ghostButton}
              >
                <Pencil size={14} strokeWidth={1.8} />
                {t("minecraft.edit")}
              </Link>
              <button
                type="button"
                className={m10.dangerButton}
                disabled={busy}
                onClick={() => void iGM_HandleDelete()}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {t("minecraft.delete")}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_MinecraftDetailPage;
