/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminUsers/iGM_AdminUsersPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminUsers
 * 模块：G_AdminUsers
 * 作用：用户管理——用户检索、封禁/解封与角色调整
 * 内容：搜索框、分页用户列表（角色/状态/积分/发帖评论数）、
 *       封禁与解封按钮、角色下拉（仅 admin 可见，不可操作自己与其他 admin）
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端；
 *       权限由后端严格校验，前端按当前角色隐藏 admin 专属操作
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, CircleCheck, LoaderCircle, Search, Users } from "lucide-react";
import {
  iGM_ApiAdminSetUserRole,
  iGM_ApiAdminSetUserStatus,
  iGM_ApiAdminUsers,
  type iGM_AdminUser,
} from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
type iGM_RoleOption = "user" | "moderator" | "admin";

// 核心逻辑 //
/** 用户管理页主体（moderator 及以上） */
function iGM_UsersInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { user: currentUser } = iGM_UseAuth();

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<iGM_AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 当前用户是否 admin（决定封禁/角色操作可见性） */
  const isAdmin = currentUser?.role === "admin";

  /** 加载用户列表 */
  const iGM_Load = useCallback(
    (nextPage: number, query: string) => {
      setLoading(true);
      iGM_ApiAdminUsers(query, nextPage, 10)
        .then((response) => {
          if (response.data) {
            setUsers(response.data.items);
            setPage(response.data.page);
            setTotalPages(response.data.totalPages);
          }
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    iGM_Load(1, "");
  }, [iGM_Load]);

  /** 检索提交 */
  function iGM_HandleSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    iGM_Load(1, search);
  }

  /** 封禁/解封 */
  async function iGM_HandleStatus(
    target: iGM_AdminUser,
    status: "active" | "suspended",
  ): Promise<void> {
    setErrorText(null);
    try {
      await iGM_ApiAdminSetUserStatus(target.id, status);
      iGM_Load(page, search);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 调整角色 */
  async function iGM_HandleRole(
    target: iGM_AdminUser,
    role: iGM_RoleOption,
  ): Promise<void> {
    if (role === target.role) return;
    setErrorText(null);
    try {
      await iGM_ApiAdminSetUserRole(target.id, role);
      iGM_Load(page, search);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Users size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminUsers.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminUsers.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {errorText}
        </div>
      )}

      {/* 检索 */}
      <form className={uiStyles.toolbar} onSubmit={iGM_HandleSearch}>
        <div className={uiStyles.searchBox}>
          <span className={uiStyles.searchIcon}>
            <Search size={15} strokeWidth={1.8} />
          </span>
          <input
            className={uiStyles.searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
            maxLength={100}
          />
        </div>
        <button type="submit" className={uiStyles.primaryButton}>
          {t("admin.users.search")}
        </button>
      </form>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      ) : users.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("admin.users.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {users.map((user) => {
              /** 不可操作对象：自己，或其他 admin（仅 admin 可操作非自身 admin） */
              const isSelf = user.id === currentUser?.id;
              return (
                <div key={user.id} className={tileStyles.recordRow}>
                  <div className={tileStyles.recordMain}>
                    <span className={tileStyles.recordAction}>
                      {user.displayName || user.username}
                      <span className={styles.userMeta}>
                        {" "}
                        · @{user.username} · {t(`admin.roles.${user.role}`)}
                      </span>
                    </span>
                    <span className={styles.userEmail}>{user.email}</span>
                    <span className={styles.userMeta}>
                      {t("admin.users.meta", {
                        points: user.totalPoints,
                        posts: user.postCount,
                        comments: user.commentCount,
                        date: iGM_FormatDate(locale, user.createdAt),
                      })}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <span
                      className={`${styles.statusBadge} ${
                        user.status === "active"
                          ? styles.statusActive
                          : styles.statusSuspended
                      }`}
                    >
                      {t(`admin.status.${user.status}`)}
                    </span>
                    {isAdmin && !isSelf && user.role !== "admin" && (
                      <select
                        className={styles.roleSelect}
                        value={user.role}
                        aria-label={t("admin.users.roleLabel")}
                        onChange={(event) =>
                          iGM_HandleRole(
                            user,
                            event.target.value as iGM_RoleOption,
                          )
                        }
                      >
                        <option value="user">{t("admin.roles.user")}</option>
                        <option value="moderator">
                          {t("admin.roles.moderator")}
                        </option>
                        <option value="admin">{t("admin.roles.admin")}</option>
                      </select>
                    )}
                    {isAdmin && !isSelf && user.role !== "admin" && (
                      user.status === "active" ? (
                        <button
                          type="button"
                          className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                          onClick={() => iGM_HandleStatus(user, "suspended")}
                        >
                          <Ban size={13} strokeWidth={1.8} />
                          {t("admin.users.ban")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.smallButton}
                          onClick={() => iGM_HandleStatus(user, "active")}
                        >
                          <CircleCheck size={13} strokeWidth={1.8} />
                          {t("admin.users.unban")}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <IGM_Pagination
            page={page}
            totalPages={totalPages}
            onChange={(next) => iGM_Load(next, search)}
          />
        </section>
      )}
    </div>
  );
}

/** 用户管理页（moderator 及以上进入，admin 专属操作按角色隐藏） */
export function iGM_AdminUsersPage() {
  const IGM_UsersInner = iGM_UsersInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_UsersInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminUsersPage;
