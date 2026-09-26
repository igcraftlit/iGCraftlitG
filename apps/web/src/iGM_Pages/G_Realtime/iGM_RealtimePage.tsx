/**
 * 文件路径：apps/web/src/iGM_Pages/G_Realtime/iGM_RealtimePage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Realtime
 * 模块：G_Realtime
 * 作用：实时在线状态页面——当前在线用户列表、在线人数、实时通知流
 * 内容：连接状态、在线用户（头像/用户名/认证标识）、实时通知流
 * 说明：仅登录用户可见；数据经全局 WebSocketProvider 获取
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import {
  Bell,
  CircleAlert,
  LoaderCircle,
  Radio,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseWebSocket } from "../../iGM_Providers/iGM_WebSocketProvider";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "./iGM_RealtimePage.module.css";

// 类型定义 //
// （数据类型来自 iGM_WebSocketProvider）

// 核心逻辑 //
/** 页面主体（已登录） */
function iGM_RealtimeInner() {
  const t = useTranslations();
  const { user } = iGM_UseAuth();
  const { connected, onlineCount, onlineUsers, notifications } = iGM_UseWebSocket();

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Radio size={22} strokeWidth={1.8} />
          </span>
          {t("pages.realtime.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.realtime.description")}
        </p>
      </header>

      {/* 连接状态与在线人数 */}
      <div className={styles.statusRow}>
        <span
          className={`${styles.statusBadge} ${connected ? styles.statusOnline : styles.statusOffline}`}
        >
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          {connected ? t("realtime.status.connected") : t("realtime.status.disconnected")}
        </span>
        <span className={styles.onlineCount}>
          <Users size={14} />
          {t("realtime.onlineCount", { count: onlineCount })}
        </span>
      </div>

      <div className={styles.twoCol}>
        {/* 在线用户 */}
        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <Users size={16} />
            </span>
            {t("realtime.onlineUsers")}
          </h2>
          {onlineUsers.length === 0 ? (
            <div className={styles.emptyState}>
              {connected ? t("realtime.noOnline") : t("realtime.status.disconnected")}
            </div>
          ) : (
            <div className={styles.userList}>
              {onlineUsers.map((item) => (
                <div key={item.userId} className={styles.userRow}>
                  <IGM_Avatar
                    src={item.avatar}
                    name={item.displayName ?? item.username}
                    size="sm"
                  />
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>
                      {item.displayName ?? item.username}
                      {item.userId === user?.id && (
                        <span className={styles.selfTag}>{t("realtime.you")}</span>
                      )}
                    </span>
                    {item.verifiedOrg && (
                      <span className={styles.verifiedBadge}>
                        {item.verifiedOrg.name}
                        {item.verifiedOrg.isOwner && (
                          <span className={styles.ownerTag}>{t("realtime.owner")}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 实时通知流 */}
        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <Bell size={16} />
            </span>
            {t("realtime.notificationStream")}
          </h2>
          {notifications.length === 0 ? (
            <div className={styles.emptyState}>{t("realtime.noNotifications")}</div>
          ) : (
            <div className={styles.notificationList}>
              {notifications.map((item) => (
                <div key={item.id} className={styles.notificationRow}>
                  <div className={styles.notificationIcon}>
                    <Bell size={14} />
                  </div>
                  <div className={styles.notificationBody}>
                    <div className={styles.notificationTitle}>{item.title}</div>
                    <div className={styles.notificationContent}>{item.content}</div>
                    <div className={styles.notificationMeta}>
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    {item.link && (
                      <Link href={item.link} className={styles.notificationLink}>
                        {t("realtime.viewDetail")}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 连接异常提示 */}
      {!connected && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          <CircleAlert size={14} />
          {t("realtime.alert.disconnected")}
        </div>
      )}
    </div>
  );
}

/** 实时在线状态页（需登录） */
export function iGM_RealtimePage() {
  // JSX 要求组件名大写开头，内部函数保留 iGM_ 前缀命名
  const IGM_RealtimeInner = iGM_RealtimeInner;
  return (
    <IGM_RequireAuth>
      <IGM_RealtimeInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_RealtimePage;
