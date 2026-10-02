/**
 * 文件路径：apps/web/src/iGM_Pages/G_OrgVerifyStatus/iGM_OrgVerifyStatusPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_OrgVerifyStatus
 * 模块：G_OrgVerifyStatus
 * 作用：组织认证申请记录页——查看自己的申请状态与历史，可取消待审核申请
 * 内容：申请记录列表（组织、状态徽标、理由、证明材料、审核意见、审核人、时间）、
 *       待审核申请的取消操作
 * 说明：纯静态 SSG，数据在客户端经 iGM_OrgVerifyClient 调用本地后端；
 *       仅登录用户可访问；取消操作由后端校验本人 + pending 状态
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  CircleCheck,
  ClipboardList,
  Crown,
  FileDown,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  iGM_ApiOrgVerifyCancel,
  iGM_ApiOrgVerifyMine,
  type iGM_OrgVerification,
  type iGM_OrgVerifyStatus,
} from "../../iGM_Services/iGM_OrgVerifyClient";
import { iGM_FileDownloadUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import adminStyles from "../iGM_Admin.module.css";
import styles from "../iGM_OrgVerify.module.css";

// 类型定义 //
// （页面内部状态均为 React state，无额外类型）

// 核心逻辑 //
/** 申请状态徽标样式映射（复用管理后台徽标色系） */
const iGM_StatusClass: Record<iGM_OrgVerifyStatus, string> = {
  pending: adminStyles.statusPending,
  approved: adminStyles.statusActive,
  rejected: adminStyles.statusSuspended,
  cancelled: "",
  left: "",
};

/** 申请记录页主体（需登录） */
function iGM_OrgVerifyStatusInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { user } = iGM_UseAuth();

  /**
   * 模块二十五：已加入组织的用户不再展示「组织认证申请记录」栏，
   * 只显示当前所属组织与认证状态。
   */
  const currentOrg = user?.verifiedOrg ?? null;

  const [items, setItems] = useState<iGM_OrgVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 正在取消的申请 ID（防重复点击） */
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  /** 加载我的申请记录 */
  const iGM_Load = useCallback(() => {
    setLoading(true);
    iGM_ApiOrgVerifyMine()
      .then((response) => {
        if (response.data) setItems(response.data.items);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    iGM_Load();
  }, [iGM_Load]);

  /** 取消待审核申请 */
  async function iGM_HandleCancel(verificationId: string): Promise<void> {
    if (cancellingId) return;
    setErrorText(null);
    setSuccessText(null);
    setCancellingId(verificationId);
    try {
      await iGM_ApiOrgVerifyCancel(verificationId);
      setSuccessText(t("orgVerify.messages.cancelled"));
      iGM_Load();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ClipboardList size={22} strokeWidth={1.8} />
          </span>
          {t("pages.orgVerifyStatus.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.orgVerifyStatus.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}
      {successText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck size={15} strokeWidth={1.8} className={uiStyles.alertIcon} />
          {successText}
        </div>
      )}

      {/* 模块二十五：已加入组织——只显示当前所属组织与认证状态，隐藏申请记录栏 */}
      {currentOrg ? (
        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <BadgeCheck size={16} strokeWidth={1.8} />
            </span>
            {t("orgVerify.current.title")}
          </h2>
          <div className={tileStyles.recordList}>
            <div className={tileStyles.recordRow}>
              <div className={tileStyles.recordMain}>
                <span className={tileStyles.recordAction}>
                  <span className={styles.userNameRow}>
                    {currentOrg.name}
                    <span
                      className={`${adminStyles.statusBadge} ${adminStyles.statusActive}`}
                    >
                      {t("orgVerify.current.verified")}
                    </span>
                    {currentOrg.isOwner && (
                      <span
                        className={`${adminStyles.statusBadge} ${adminStyles.statusPending}`}
                      >
                        <Crown size={11} strokeWidth={1.8} />
                        {t("orgVerify.current.owner")}
                      </span>
                    )}
                  </span>
                </span>
                <span className={tileStyles.recordDesc}>
                  {t("orgVerify.current.description")}
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("orgVerify.errors.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        /* 空态：引导前往申请页 */
        <div className={uiStyles.stateBox}>
          <p>{t("orgVerify.list.empty")}</p>
          <div className={uiStyles.formActions}>
            <Link href="/G_OrgVerify" className={uiStyles.primaryButton}>
              {t("orgVerify.list.applyNow")}
            </Link>
          </div>
        </div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((item) => (
              <div key={item.id} className={tileStyles.recordRow}>
                <div className={tileStyles.recordMain}>
                  {/* 组织名 + 状态徽标 */}
                  <span className={tileStyles.recordAction}>
                    <span className={styles.userNameRow}>
                      {item.org.name}
                      <span
                        className={`${adminStyles.statusBadge} ${iGM_StatusClass[item.status]}`}
                      >
                        {t(`orgVerify.status.${item.status}`)}
                      </span>
                    </span>
                  </span>
                  {/* 申请理由 */}
                  <span className={tileStyles.recordDesc}>
                    {t("orgVerify.list.reason")}：{item.reason}
                  </span>
                  {/* 证明材料附件 */}
                  {item.proof && (
                    <a
                      className={styles.proofLink}
                      href={iGM_FileDownloadUrl(item.proof)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileDown size={12} strokeWidth={1.8} />
                      {t("orgVerify.list.proofView")}
                    </a>
                  )}
                  {/* 审核意见与审核人（已审核时展示） */}
                  {item.reviewComment && (
                    <span className={tileStyles.recordDesc}>
                      {t("orgVerify.list.reviewComment")}：{item.reviewComment}
                    </span>
                  )}
                  <span className={adminStyles.userMeta}>
                    {t("orgVerify.list.submittedAt", {
                      time: iGM_FormatDateTime(locale, item.createdAt),
                    })}
                    {item.reviewerName
                      ? ` · ${t("orgVerify.list.reviewer")}：${item.reviewerName}`
                      : ""}
                  </span>
                </div>
                {/* 待审核可取消 */}
                {item.status === "pending" && (
                  <div className={adminStyles.rowActions}>
                    <button
                      type="button"
                      className={`${adminStyles.smallButton} ${adminStyles.smallButtonDanger}`}
                      disabled={cancellingId === item.id}
                      onClick={() => iGM_HandleCancel(item.id)}
                    >
                      {cancellingId === item.id ? (
                        <LoaderCircle size={13} className="igm-spin" />
                      ) : (
                        <X size={13} strokeWidth={1.8} />
                      )}
                      {t("orgVerify.list.cancel")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** 组织认证申请记录页（需登录） */
export function iGM_OrgVerifyStatusPage() {
  // JSX 组件名须大写开头
  const IGM_OrgVerifyStatusInner = iGM_OrgVerifyStatusInner;
  return (
    <IGM_RequireAuth>
      <IGM_OrgVerifyStatusInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_OrgVerifyStatusPage;
