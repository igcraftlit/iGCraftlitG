/**
 * 文件路径：apps/web/src/iGM_Pages/G_Community/iGM_CommunityPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Community?tab=square|friends|messages（静态壳，查询参数驱动）
 * 模块：G_Community
 * 作用：社区广场整合页——广场（帖子/用户搜索）、好友、私信三标签统一入口
 * 内容：顶层标签条（含好友申请/私信未读计数）、三标签面板；
 *       未登录标签显示登录引导，面板保持挂载以保留各自查询状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LoaderCircle,
  LogIn,
  MessageSquare,
  MessagesSquare,
  Users,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseWebSocket } from "../../iGM_Providers/iGM_WebSocketProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import pageStyles from "../iGM_Page.module.css";
import hubStyles from "./iGM_CommunityHub.module.css";
import { iGM_CommunitySquarePanel as IGM_CommunitySquarePanel } from "./iGM_CommunitySquarePanel";
import { iGM_CommunityFriendsPanel as IGM_CommunityFriendsPanel } from "./iGM_CommunityFriendsPanel";
import { iGM_CommunityMessagesPanel as IGM_CommunityMessagesPanel } from "./iGM_CommunityMessagesPanel";

// 类型定义 //
/** 社区广场顶层标签 */
type iGM_CommunityTab = "square" | "friends" | "messages";

/** 解析合法标签，缺省/非法均回到广场 */
function iGM_ResolveTab(raw: string | null): iGM_CommunityTab {
  if (raw === "friends" || raw === "messages") return raw;
  return "square";
}

// 核心逻辑 //
/** 社区广场整合页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_CommunityPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { status } = iGM_UseAuth();
  const { messageUnreadCount } = iGM_UseWebSocket();

  const tab = iGM_ResolveTab(searchParams.get("tab"));
  const authenticated = status === "authenticated";
  const [incomingCount, setIncomingCount] = useState(0);

  /** 切换顶层标签：保留 q/category 等其他查询参数 */
  function iGM_HandleTabChange(next: iGM_CommunityTab): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "square") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `/G_Community?${query}` : "/G_Community");
  }

  /** 未登录引导卡片（登录后回跳当前标签） */
  function iGM_RenderLoginGuide(kind: "friends" | "messages") {
    const redirect = encodeURIComponent(`${pathname}?${searchParams.toString()}`);
    return (
      <div className={hubStyles.loginCard}>
        <h2 className={hubStyles.loginTitle}>
          {kind === "friends"
            ? t("community.communityPage.loginFriendsTitle")
            : t("community.communityPage.loginMessagesTitle")}
        </h2>
        <p className={hubStyles.loginDescription}>
          {kind === "friends"
            ? t("community.communityPage.loginFriendsDesc")
            : t("community.communityPage.loginMessagesDesc")}
        </p>
        <Link
          href={`/G_Auth/login?redirect=${redirect}`}
          className={hubStyles.loginButton}
        >
          <LogIn size={15} strokeWidth={1.8} />
          {t("community.comments.goLogin")}
        </Link>
      </div>
    );
  }

  /** 顶层标签定义（计数徽标仅在有值时出现） */
  const tabs: Array<{
    key: iGM_CommunityTab;
    label: string;
    icon: typeof Users;
    count: number;
  }> = [
    {
      key: "square",
      label: t("community.communityPage.tabSquare"),
      icon: MessagesSquare,
      count: 0,
    },
    {
      key: "friends",
      label: t("community.communityPage.tabFriends"),
      icon: Users,
      count: authenticated ? incomingCount : 0,
    },
    {
      key: "messages",
      label: t("community.communityPage.tabMessages"),
      icon: MessageSquare,
      count: authenticated ? messageUnreadCount : 0,
    },
  ];

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Users size={22} strokeWidth={1.8} />
          </span>
          {t("community.communityPage.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("community.communityPage.description")}
        </p>
      </header>

      {/* 顶层标签条 */}
      <nav className={hubStyles.topTabs} aria-label={t("community.communityPage.title")}>
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={`${hubStyles.topTab} ${
                tab === item.key ? hubStyles.topTabActive : ""
              }`}
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => iGM_HandleTabChange(item.key)}
            >
              <Icon size={15} strokeWidth={1.8} />
              {item.label}
              {item.count > 0 && <span className={hubStyles.tabCount}>{item.count}</span>}
            </button>
          );
        })}
      </nav>

      {/* 面板区：会话恢复中显示极简占位；三面板保持挂载以保留切换前状态 */}
      {status === "loading" ? (
        <div className={hubStyles.panelLoading}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("auth.state.checking")}
        </div>
      ) : (
        <>
          <div hidden={tab !== "square"}>
            <IGM_CommunitySquarePanel authenticated={authenticated} />
          </div>
          <div hidden={tab !== "friends"}>
            {authenticated ? (
              <IGM_CommunityFriendsPanel onIncomingCount={setIncomingCount} />
            ) : (
              iGM_RenderLoginGuide("friends")
            )}
          </div>
          <div hidden={tab !== "messages"}>
            {authenticated ? (
              <IGM_CommunityMessagesPanel />
            ) : (
              iGM_RenderLoginGuide("messages")
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 导出 //
export default iGM_CommunityPage;
