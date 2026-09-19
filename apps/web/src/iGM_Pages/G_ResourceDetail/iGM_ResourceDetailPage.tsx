/**
 * 文件路径：apps/web/src/iGM_Pages/G_ResourceDetail/iGM_ResourceDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ResourceDetail?resourceId=xxx（静态壳，查询参数驱动加载）
 * 模块：G_ResourceDetail
 * 作用：资源详情——资源信息、下载、上传者管理（编辑/上下架/删除）、
 *       文件信息、在线预览、关联活动入口
 * 内容：返回链接、详情卡片、下载与下载次数、管理操作、文件信息卡片、
 *       预览卡片、关联活动卡片、加载/缺失空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  HardDrive,
  Library,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  iGM_ApiDeleteResource,
  iGM_ApiGetResource,
  iGM_ApiSetResourceStatus,
  iGM_ResourceDownloadUrl,
  type iGM_ResourceDetail,
} from "../../iGM_Services/iGM_ResourceClient";
import { iGM_ApiGetActivity } from "../../iGM_Services/iGM_ActivityClient";
import {
  iGM_FilePreviewUrl,
  iGM_FormatFileSize,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
// （本页状态类型来自 iGM_ResourceClient）

// 核心逻辑 //
/** 资源详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_ResourceDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resourceId = searchParams.get("resourceId");
  const { status: authStatus } = iGM_UseAuth();

  const [resource, setResource] = useState<iGM_ResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activityTitle, setActivityTitle] = useState<string | null>(null);

  /** 加载资源详情 */
  const iGM_LoadResource = useCallback(async () => {
    if (!resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetResource(resourceId);
      setResource(response.data?.resource ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    void iGM_LoadResource();
  }, [iGM_LoadResource]);

  /** 关联活动标题：取不到时降级为仅显示链接 */
  const activityId = resource?.activityId ?? null;
  useEffect(() => {
    if (!activityId) {
      setActivityTitle(null);
      return;
    }
    let cancelled = false;
    iGM_ApiGetActivity(activityId)
      .then((response) => {
        if (!cancelled) setActivityTitle(response.data?.activity.title ?? null);
      })
      .catch(() => {
        if (!cancelled) setActivityTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  /** 上架/下架切换 */
  async function iGM_HandleToggleStatus(): Promise<void> {
    if (!resource || busy) return;
    setBusy(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiSetResourceStatus(
        resource.id,
        resource.status === "published" ? "hidden" : "published",
      );
      setNoticeText(t("resource.messages.statusUpdated"));
      await iGM_LoadResource();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusy(false);
    }
  }

  /** 删除资源：二次确认后返回资源库 */
  async function iGM_HandleDelete(): Promise<void> {
    if (!resource || busy) return;
    if (!window.confirm(t("resource.confirmDelete"))) return;
    setBusy(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiDeleteResource(resource.id);
      router.push("/G_Resource");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setBusy(false);
    }
  }

  /* ---------- 渲染分支 ---------- */
  if (loading) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("resource.stateLoading")}
      </div>
    );
  }

  if (!resource) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Library}
          title={t("resource.notFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_Resource" className={styles.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("resource.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  const uploaderName =
    resource.uploader.displayName ?? resource.uploader.username;
  const categoryLabel = resource.category
    ? t.has(`resource.categories.${resource.category.slug}`)
      ? t(`resource.categories.${resource.category.slug}`)
      : resource.category.name
    : null;
  const canManage = resource.canManage && authStatus === "authenticated";

  return (
    <div className={pageStyles.page}>
      {/* 返回资源库 */}
      <Link href="/G_Resource" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("resource.backToList")}
      </Link>

      {/* 操作结果与错误提示 */}
      {noticeText && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>
            <CheckCircle2 size={14} strokeWidth={2} />
          </span>
          {noticeText}
        </div>
      )}
      {errorText && (
        <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
      )}

      {/* 资源详情卡片 */}
      <article className={styles.sectionCard}>
        <header className={styles.detailHeader}>
          <div className={styles.detailMeta}>
            <span className={styles.detailMetaAuthor}>
              <IGM_Avatar
                size="sm"
                src={resource.uploader.avatar}
                name={uploaderName}
              />
              <span>
                {t("resource.uploadedBy")} {uploaderName}
              </span>
            </span>
            <span className={styles.resourceMetaItem}>
              <Calendar size={13} strokeWidth={1.8} />
              {new Date(resource.createdAt).toLocaleString()}
            </span>
          </div>
          <div className={styles.resourceTitleRow}>
            <h1 className={styles.detailTitle}>{resource.title}</h1>
            {resource.status === "hidden" && (
              <span className={`${styles.badge} ${styles.badgeHidden}`}>
                {t("resource.hide")}
              </span>
            )}
          </div>
          {(categoryLabel || resource.tags.length > 0) && (
            <div className={styles.detailTags}>
              {categoryLabel && (
                <span className={styles.detailTag}>{categoryLabel}</span>
              )}
              {resource.tags.map((tag) => (
                <span key={tag.id} className={styles.detailTag}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className={styles.divider} />

        <div className={styles.detailContent}>{resource.description}</div>

        <hr className={styles.divider} />

        {/* 下载与下载次数 */}
        <div className={styles.actionRow}>
          <a
            href={iGM_ResourceDownloadUrl(resource.id)}
            className={styles.primaryButton}
            download
          >
            <Download size={15} strokeWidth={1.8} />
            {t("resource.download")}
          </a>
          <span className={styles.ghostButton}>
            <ChartColumn size={14} strokeWidth={1.8} />
            {t("resource.downloadCount", { count: resource.downloadCount })}
          </span>

          {/* 上传者管理操作 */}
          {canManage && (
            <div className={styles.ownerActions}>
              <Link
                href={`/G_ResourceEdit?resourceId=${encodeURIComponent(resource.id)}`}
                className={styles.ghostButton}
              >
                <Pencil size={14} strokeWidth={1.8} />
                {t("resource.edit")}
              </Link>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={busy}
                onClick={() => void iGM_HandleToggleStatus()}
              >
                <Eye size={14} strokeWidth={1.8} />
                {resource.status === "published"
                  ? t("resource.hide")
                  : t("resource.publish")}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={busy}
                onClick={() => void iGM_HandleDelete()}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {t("resource.delete")}
              </button>
            </div>
          )}
        </div>
      </article>

      {/* 文件信息 */}
      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>
            <FileText size={16} strokeWidth={1.8} />
          </span>
          {t("resource.fileInfo")}
        </h2>
        <div className={styles.resourceMeta}>
          <span className={styles.resourceMetaItem}>
            {resource.file.originalName}
          </span>
          <span className={styles.resourceMetaItem}>
            <HardDrive size={13} strokeWidth={1.8} />
            {iGM_FormatFileSize(resource.file.size)}
          </span>
          <span className={styles.resourceMetaItem}>
            {resource.file.mimeType}
          </span>
          <span className={styles.resourceMetaItem}>
            <Calendar size={13} strokeWidth={1.8} />
            {new Date(resource.file.createdAt).toLocaleString()}
          </span>
        </div>
      </section>

      {/* 在线预览 */}
      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>
            <Eye size={16} strokeWidth={1.8} />
          </span>
          {t("resource.preview")}
        </h2>
        {resource.file.isImage ? (
          <div className={styles.previewFrame}>
            <img
              src={iGM_FilePreviewUrl(resource.file.id)}
              alt={resource.file.originalName}
            />
          </div>
        ) : (
          <div className={styles.stateBox}>
            {t("resource.previewUnavailable")}
          </div>
        )}
      </section>

      {/* 关联活动 */}
      {activityId && (
        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>
              <CalendarDays size={16} strokeWidth={1.8} />
            </span>
            {t("resource.relatedActivity")}
          </h2>
          <div>
            <Link
              href={`/G_ActivityDetail?activityId=${encodeURIComponent(activityId)}`}
              className={styles.ghostButton}
            >
              <ArrowUpRight size={14} strokeWidth={1.8} />
              {activityTitle ?? t("resource.relatedActivity")}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ResourceDetailPage;
