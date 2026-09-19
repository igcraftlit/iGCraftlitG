/**
 * 文件路径：apps/web/src/iGM_Pages/G_Notification/iGM_NotificationPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Notification（静态壳，查询参数驱动筛选与分页）
 * 模块：G_Notification
 * 作用：通知中心——列表展示、全部/未读筛选、单条已读、全部已读、删除与点击跳转
 * 内容：页头、全部/未读胶囊筛选、全部已读按钮、通知条目列表、分页、加载/错误/空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  Download,
  LoaderCircle,
  MessageCircleReply,
  MessageSquareText,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  iGM_ApiDeleteNotification,
  iGM_ApiListNotifications,
  iGM_ApiMarkAllRead,
  iGM_ApiMarkRead,
  type iGM_Notification,
  type iGM_NotificationListData,
  type iGM_NotificationType,
} from "../../iGM_Services/iGM_NotificationClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 通知类型到 lucide 图标的映射 */
const iGM_NotificationIcon: Record<iGM_NotificationType, LucideIcon> = {
  comment: MessageSquareText,
  reply: MessageCircleReply,
  activity: CalendarDays,
  resource: Download,
  system: Bell,
};

// 核心逻辑 //
/** 通知中心页主体（在登录守卫内） */
function iGM_NotificationInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 首屏从查询参数读取筛选，保证静态壳可分享链接
  const [unreadOnly, setUnreadOnly] = useState(
    searchParams.get("unread") === "true",
  );
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_NotificationListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  /** 按当前筛选与页码拉取通知列表 */
  const iGM_LoadNotifications = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListNotifications(page, unreadOnly);
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly, t]);

  useEffect(() => {
    void iGM_LoadNotifications();
  }, [iGM_LoadNotifications]);

  /** 切换筛选：重置到第一页并同步地址栏 */
  function iGM_HandleFilterChange(nextUnread: boolean): void {
    if (nextUnread === unreadOnly) return;
    setUnreadOnly(nextUnread);
    setPage(1);
    setNoticeText(null);
    router.replace(nextUnread ? "/G_Notification?unread=true" : "/G_Notification");
  }

  /** 翻页并同步地址栏 */
  function iGM_HandlePageChange(nextPage: number): void {
    setPage(nextPage);
    const params = new URLSearchParams();
    if (unreadOnly) params.set("unread", "true");
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    router.replace(query ? `/G_Notification?${query}` : "/G_Notification");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 全部标记已读 */
  async function iGM_HandleMarkAllRead(): Promise<void> {
    if (acting) return;
    setActing(true);
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiMarkAllRead();
      setNoticeText(t("notification.messages.allMarkedRead"));
      await iGM_LoadNotifications();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActing(false);
    }
  }

  /** 标记单条已读 */
  async function iGM_HandleMarkRead(notificationId: string): Promise<void> {
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiMarkRead(notificationId);
      setNoticeText(t("notification.messages.markedRead"));
      await iGM_LoadNotifications();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 删除单条通知 */
  async function iGM_HandleDelete(notificationId: string): Promise<void> {
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiDeleteNotification(notificationId);
      setNoticeText(t("notification.messages.deleted"));
      await iGM_LoadNotifications();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 点击通知：未读先标记已读，存在站内链接则跳转，否则刷新列表 */
  async function iGM_HandleOpen(item: iGM_Notification): Promise<void> {
    if (!item.isRead) {
      try {
        await iGM_ApiMarkRead(item.id);
      } catch {
        // 标记已读失败不阻塞后续跳转
      }
    }
    if (item.link) {
      router.push(item.link);
      return;
    }
    await iGM_LoadNotifications();
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Bell size={22} strokeWidth={1.8} />
          </span>
          {t("notification.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("notification.description")}
        </p>
      </header>

      {/* 操作结果提示 */}
      {noticeText && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>
            <Check size={14} strokeWidth={2} />
          </span>
          {noticeText}
        </div>
      )}

      {/* 筛选与全部已读 */}
      <div className={styles.toolbar}>
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${!unreadOnly ? styles.chipActive : ""}`}
            onClick={() => iGM_HandleFilterChange(false)}
          >
            {t("notification.filterAll")}
          </button>
          <button
            type="button"
            className={`${styles.chip} ${unreadOnly ? styles.chipActive : ""}`}
            onClick={() => iGM_HandleFilterChange(true)}
          >
            {t("notification.filterUnread")}
          </button>
        </div>
        <div className={styles.ownerActions}>
          <button
            type="button"
            className={styles.ghostButton}
            disabled={acting || unreadCount === 0}
            onClick={() => void iGM_HandleMarkAllRead()}
          >
            {acting ? (
              <LoaderCircle size={14} className="igm-spin" />
            ) : (
              <Check size={14} strokeWidth={1.8} />
            )}
            {t("notification.markAllRead")}
          </button>
        </div>
      </div>

      {/* 列表主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("notification.stateLoading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>
            <span className={styles.alertIcon}>
              <BellOff size={14} strokeWidth={1.8} />
            </span>
            {errorText}
          </div>
          <div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void iGM_LoadNotifications()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {data.items.map((item) => {
              const Icon = iGM_NotificationIcon[item.type] ?? Bell;
              return (
                <div
                  key={item.id}
                  className={`${styles.notifItem} ${
                    item.isRead ? "" : styles.notifUnread
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void iGM_HandleOpen(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void iGM_HandleOpen(item);
                    }
                  }}
                >
                  <span className={styles.notifIcon}>
                    <Icon size={17} strokeWidth={1.8} />
                  </span>
                  <div className={styles.notifBody}>
                    <div className={styles.notifTitle}>
                      <span className={styles.badge}>
                        {t(`notification.type.${item.type}`)}
                      </span>
                      {!item.isRead && (
                        <span className={`${styles.badge} ${styles.badgeUnread}`}>
                          {t("notification.unreadBadge")}
                        </span>
                      )}
                      {item.title}
                    </div>
                    <p className={styles.notifContent}>{item.content}</p>
                    <span className={styles.notifMeta}>
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.notifActions}>
                    {!item.isRead && (
                      <button
                        type="button"
                        className={styles.iconOnlyButton}
                        title={t("notification.markRead")}
                        aria-label={t("notification.markRead")}
                        onClick={(event) => {
                          event.stopPropagation();
                          void iGM_HandleMarkRead(item.id);
                        }}
                      >
                        <Check size={15} strokeWidth={1.8} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      title={t("notification.delete")}
                      aria-label={t("notification.delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void iGM_HandleDelete(item.id);
                      }}
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={iGM_HandlePageChange}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={BellOff}
          title={t("notification.empty")}
          description={t("notification.emptyDescription")}
        />
      )}
    </div>
  );
}

/** 通知中心页（登录守卫包裹） */
export function iGM_NotificationPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_NotificationInner = iGM_NotificationInner;
  return (
    <IGM_RequireAuth>
      <IGM_NotificationInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_NotificationPage;
