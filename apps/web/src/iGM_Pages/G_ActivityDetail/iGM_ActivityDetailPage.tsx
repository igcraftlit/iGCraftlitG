/**
 * 文件路径：apps/web/src/iGM_Pages/G_ActivityDetail/iGM_ActivityDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ActivityDetail?activityId=xxx（静态壳，查询参数驱动详情加载）
 * 模块：G_ActivityDetail
 * 作用：活动详情——活动信息展示、报名/取消报名、报名名单、活动资源与编辑删除入口
 * 内容：返回链接、活动主卡片（标题/状态/创建者/时间地点/人数/正文）、
 *       报名操作行、编辑删除按钮、报名列表卡片、活动资源卡片、加载/不存在状态
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
  CalendarDays,
  Check,
  Clock,
  Download,
  Library,
  LoaderCircle,
  MapPin,
  Pencil,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  iGM_ApiCancelRegistration,
  iGM_ApiDeleteActivity,
  iGM_ApiGetActivity,
  iGM_ApiListRegistrations,
  iGM_ApiRegisterActivity,
  type iGM_ActivityDetail,
  type iGM_ActivityRegistration,
  type iGM_ActivityStatus,
} from "../../iGM_Services/iGM_ActivityClient";
import { iGM_FilePreviewUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResourceDownloadUrl } from "../../iGM_Services/iGM_ResourceClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 活动状态到徽标样式的映射 */
const iGM_StatusBadgeClass: Record<iGM_ActivityStatus, string> = {
  draft: styles.badgeDraft,
  open: styles.badgeOpen,
  closed: styles.badgeClosed,
};

// 核心逻辑 //
/** 活动详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_ActivityDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityId = searchParams.get("activityId");
  const { status: authStatus } = iGM_UseAuth();

  const [detail, setDetail] = useState<iGM_ActivityDetail | null>(null);
  const [registrations, setRegistrations] = useState<iGM_ActivityRegistration[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  /** 拉取活动详情 */
  const iGM_LoadDetail = useCallback(async () => {
    if (!activityId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await iGM_ApiGetActivity(activityId);
      const activity = response.data?.activity;
      if (!activity) {
        setNotFound(true);
        setDetail(null);
        return;
      }
      setNotFound(false);
      setDetail(activity);
    } catch {
      // 不存在与请求失败对访客呈现同一空状态
      setNotFound(true);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  /** 拉取报名名单 */
  const iGM_LoadRegistrations = useCallback(async () => {
    if (!activityId) return;
    try {
      const response = await iGM_ApiListRegistrations(activityId);
      setRegistrations(response.data?.items ?? []);
    } catch {
      // 报名名单加载失败不阻塞详情展示
      setRegistrations([]);
    }
  }, [activityId]);

  useEffect(() => {
    void iGM_LoadDetail();
    void iGM_LoadRegistrations();
  }, [iGM_LoadDetail, iGM_LoadRegistrations]);

  /** 报名 */
  async function iGM_HandleRegister(): Promise<void> {
    if (!activityId || acting) return;
    setActing(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiRegisterActivity(activityId);
      setNoticeText(t("activity.messages.registered"));
      await iGM_LoadDetail();
      await iGM_LoadRegistrations();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActing(false);
    }
  }

  /** 取消报名 */
  async function iGM_HandleCancel(): Promise<void> {
    if (!activityId || acting) return;
    setActing(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiCancelRegistration(activityId);
      setNoticeText(t("activity.messages.cancelled"));
      await iGM_LoadDetail();
      await iGM_LoadRegistrations();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActing(false);
    }
  }

  /** 删除活动（二次确认），成功后回到活动列表 */
  async function iGM_HandleDelete(): Promise<void> {
    if (!activityId || acting) return;
    if (!window.confirm(t("activity.confirmDelete"))) return;
    setActing(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiDeleteActivity(activityId);
      router.push("/G_Activity");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setActing(false);
    }
  }

  // 加载中
  if (loading) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("activity.stateLoading")}
      </div>
    );
  }

  // 缺少参数、不存在或加载失败
  if (notFound || !detail) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={CalendarDays}
          title={t("activity.notFound")}
          action={
            <Link href="/G_Activity" className={styles.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("activity.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  const creatorName = detail.creator.displayName ?? detail.creator.username;

  return (
    <div className={pageStyles.page}>
      {/* 返回列表 */}
      <Link href="/G_Activity" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("activity.backToList")}
      </Link>

      {/* 操作结果与错误提示 */}
      {noticeText && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>
            <Check size={14} strokeWidth={2} />
          </span>
          {noticeText}
        </div>
      )}
      {errorText && (
        <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
      )}

      {/* 活动主卡片 */}
      <article className={styles.sectionCard}>
        <div className={styles.detailHeader}>
          <h1 className={styles.detailTitle}>{detail.title}</h1>
          <div className={styles.detailMeta}>
            <span
              className={`${styles.badge} ${iGM_StatusBadgeClass[detail.status]}`}
            >
              {t(`activity.statusLabel.${detail.status}`)}
            </span>
            <span className={styles.detailMetaAuthor}>
              <IGM_Avatar
                src={detail.creator.avatar}
                name={creatorName}
                size="sm"
              />
              {creatorName}
            </span>
            {detail.location && (
              <span className={styles.activityMetaItem}>
                <MapPin size={13} strokeWidth={1.8} />
                {detail.location}
              </span>
            )}
            {detail.startTime && (
              <span className={styles.activityMetaItem}>
                <Clock size={13} strokeWidth={1.8} />
                {t("activity.startTime")}:{" "}
                {new Date(detail.startTime).toLocaleString()}
              </span>
            )}
            {detail.endTime && (
              <span className={styles.activityMetaItem}>
                <Clock size={13} strokeWidth={1.8} />
                {t("activity.endTime")}:{" "}
                {new Date(detail.endTime).toLocaleString()}
              </span>
            )}
            <span className={styles.activityMetaItem}>
              <Users size={13} strokeWidth={1.8} />
              {t("activity.maxParticipants")}:{" "}
              {detail.maxParticipants === null
                ? t("activity.unlimited")
                : detail.maxParticipants}
            </span>
            <span className={styles.activityMetaItem}>
              <Users size={13} strokeWidth={1.8} />
              {t("activity.registeredCount", {
                count: detail.registeredCount,
              })}
            </span>
          </div>
        </div>

        <hr className={styles.divider} />

        <div className={styles.detailContent}>{detail.description}</div>

        <hr className={styles.divider} />

        {/* 报名操作与拥有者操作 */}
        <div className={styles.actionRow}>
          {authStatus === "loading" ? null : authStatus !== "authenticated" ? (
            <Link href="/G_Auth/login" className={styles.primaryButton}>
              {t("activity.register")}
            </Link>
          ) : detail.registeredByMe ? (
            <button
              type="button"
              className={styles.ghostButton}
              disabled={acting}
              onClick={() => void iGM_HandleCancel()}
            >
              <UserMinus size={15} strokeWidth={1.8} />
              {t("activity.cancelRegistration")}
            </button>
          ) : detail.status === "open" ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={acting}
              onClick={() => void iGM_HandleRegister()}
            >
              <UserPlus size={15} strokeWidth={1.8} />
              {t("activity.register")}
            </button>
          ) : null}

          {detail.canEdit && (
            <div className={styles.ownerActions}>
              <Link
                href={`/G_ActivityEdit?activityId=${encodeURIComponent(detail.id)}`}
                className={styles.ghostButton}
              >
                <Pencil size={14} strokeWidth={1.8} />
                {t("activity.edit")}
              </Link>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={acting}
                onClick={() => void iGM_HandleDelete()}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {t("activity.delete")}
              </button>
            </div>
          )}
        </div>
      </article>

      {/* 报名名单 */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>
              <Users size={16} strokeWidth={1.8} />
            </span>
            {t("activity.registrations")}
          </h2>
        </div>
        {registrations.length > 0 ? (
          <div className={styles.regList}>
            {registrations.map((item) => {
              const name = item.user.displayName ?? item.user.username;
              return (
                <div key={item.id} className={styles.regItem}>
                  <IGM_Avatar src={item.user.avatar} name={name} size="sm" />
                  <div className={styles.regText}>
                    <span className={styles.regName}>{name}</span>
                    <span className={styles.regMeta}>
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.stateBox}>
            {t("activity.noRegistrations")}
          </div>
        )}
      </section>

      {/* 活动资源 */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>
              <Library size={16} strokeWidth={1.8} />
            </span>
            {t("nav.resources")}
          </h2>
          {authStatus === "authenticated" && (
            <Link
              href={`/G_ResourceEdit?activityId=${encodeURIComponent(detail.id)}`}
              className={styles.ghostButton}
            >
              <Upload size={14} strokeWidth={1.8} />
              {t("activity.uploadResource")}
            </Link>
          )}
        </div>
        {detail.resources.length > 0 ? (
          <div className={styles.grid3}>
            {detail.resources.map((resource) => (
              <article key={resource.id} className={styles.resourceCard}>
                <div className={styles.resourceCover}>
                  {resource.cover ? (
                    <img
                      src={iGM_FilePreviewUrl(resource.cover.id)}
                      alt={resource.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.resourceCoverFallback}>
                      <Library size={26} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div className={styles.resourceMain}>
                  <div className={styles.resourceTitleRow}>
                    <Link
                      href={`/G_ResourceDetail?resourceId=${encodeURIComponent(resource.id)}`}
                      className={styles.resourceTitle}
                    >
                      {resource.title}
                    </Link>
                  </div>
                  <p className={styles.resourceExcerpt}>{resource.excerpt}</p>
                  <div className={styles.resourceMeta}>
                    <span className={styles.resourceMetaItem}>
                      <Download size={12} strokeWidth={1.8} />
                      {t("resource.downloadCount", {
                        count: resource.downloadCount,
                      })}
                    </span>
                  </div>
                  {resource.tags.length > 0 && (
                    <div className={styles.resourceTags}>
                      {resource.tags.map((tag) => (
                        <span key={tag.id} className={styles.resourceTag}>
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.resourceFooter}>
                  <a
                    href={iGM_ResourceDownloadUrl(resource.id)}
                    className={styles.downloadLink}
                  >
                    <Download size={14} strokeWidth={1.8} />
                    {t("resource.download")}
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.stateBox}>{t("activity.noResources")}</div>
        )}
      </section>
    </div>
  );
}

// 导出 //
export default iGM_ActivityDetailPage;
