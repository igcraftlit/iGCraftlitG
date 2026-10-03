/**
 * 文件路径：apps/web/src/iGM_Pages/G_OrgVerify/iGM_OrgVerifyPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_OrgVerify
 * 模块：G_OrgVerify
 * 作用：组织认证页——已认证用户展示组织详情（负责人可编辑“关于组织”、可申请退出）；
 *       未认证用户展示受信任组织卡片，填写理由与可选证明材料并提交申请
 * 内容：我的组织详情（iGM_OrgDetailCard）、组织卡片栅格（单选）、
 *       申请理由表单、证明材料可选上传（G_File）、待审核提示
 * 说明：纯静态 SSG，数据在客户端经 iGM_OrgVerifyClient 调用本地后端；
 *       仅登录用户可访问；提交限流由后端校验
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  CircleCheck,
  FileUp,
  LoaderCircle,
  Mail,
  Send,
  X,
} from "lucide-react";
import {
  iGM_ApiOrgVerifyMine,
  iGM_ApiOrgVerifyMyOrg,
  iGM_ApiOrgVerifyOrganizations,
  iGM_ApiOrgVerifySubmit,
  type iGM_MyOrgDetail,
  type iGM_Organization,
} from "../../iGM_Services/iGM_OrgVerifyClient";
import {
  iGM_ApiUploadFile,
  iGM_ValidateLocalFile,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_OrgDetailCard as IGM_OrgDetailCard } from "../../iGM_Components/iGM_OrgDetailCard/iGM_OrgDetailCard";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_OrgVerify.module.css";

// 类型定义 //
// （页面内部状态均为 React state，无额外类型）

// 核心逻辑 //
/** 组织认证页主体（需登录） */
function iGM_OrgVerifyInner() {
  const t = useTranslations();

  /** 已认证（含负责人）：我的组织详情；null 表示未认证，展示申请栏 */
  const [myOrg, setMyOrg] = useState<iGM_MyOrgDetail | null>(null);
  const [orgs, setOrgs] = useState<iGM_Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  /** 已上传证明材料的站内文件 ID */
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** 初始加载：我的组织详情（409 表示未认证）+ 组织列表 + 是否有待审核申请 */
  const iGM_Load = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    Promise.all([
      iGM_ApiOrgVerifyMyOrg().catch(() => null),
      iGM_ApiOrgVerifyOrganizations().catch(() => null),
      iGM_ApiOrgVerifyMine().catch(() => null),
    ])
      .then(([myOrgResponse, orgResponse, mineResponse]) => {
        setMyOrg(myOrgResponse?.data ?? null);
        if (orgResponse?.data) setOrgs(orgResponse.data.items);
        if (mineResponse?.data) {
          setHasPending(
            mineResponse.data.items.some((item) => item.status === "pending"),
          );
        }
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    iGM_Load();
  }, [iGM_Load]);

  /** 上传证明材料（可选；复用模块四文件上传体系） */
  async function iGM_HandleProofUpload(file: File): Promise<void> {
    setErrorText(null);
    const validationError = iGM_ValidateLocalFile(file);
    if (validationError) {
      // 返回值为 i18n 文案键
      setErrorText(t(validationError));
      return;
    }
    setUploading(true);
    try {
      const response = await iGM_ApiUploadFile(file, { kind: "file" });
      if (response.data) {
        setProofFileId(response.data.file.id);
        setProofName(response.data.file.originalName);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setUploading(false);
    }
  }

  /** 移除已上传的证明材料 */
  function iGM_RemoveProof(): void {
    setProofFileId(null);
    setProofName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** 提交申请 */
  async function iGM_HandleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedOrgId || !reason.trim() || submitting) return;
    setErrorText(null);
    setSuccessText(null);
    setSubmitting(true);
    try {
      await iGM_ApiOrgVerifySubmit({
        orgId: selectedOrgId,
        reason: reason.trim(),
        proof: proofFileId,
      });
      setSuccessText(t("orgVerify.messages.submitted"));
      setReason("");
      iGM_RemoveProof();
      setSelectedOrgId(null);
      setHasPending(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Building2 size={22} strokeWidth={1.8} />
          </span>
          {t("pages.orgVerify.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.orgVerify.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}
      {successText && !myOrg && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck size={15} strokeWidth={1.8} className={uiStyles.alertIcon} />
          {successText}
          {" · "}
          <Link href="/G_OrgVerifyStatus">{t("orgVerify.apply.viewStatus")}</Link>
        </div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("orgVerify.errors.loadFailed")}
        </div>
      ) : myOrg ? (
        /* 已认证（含组织负责人）：直接展示组织详情，不显示申请栏 */
        <IGM_OrgDetailCard
          organization={myOrg.organization}
          isOwner={myOrg.isOwner}
          showLeave
          onLeft={() => {
            setMyOrg(null);
            iGM_Load();
          }}
        />
      ) : hasPending ? (
        /* 已有待审核申请：禁止重复提交 */
        <section className={uiStyles.sectionCard}>
          <p className={uiStyles.hint}>{t("orgVerify.apply.pendingTip")}</p>
          <div className={uiStyles.formActions}>
            <Link href="/G_OrgVerifyStatus" className={uiStyles.primaryButton}>
              {t("orgVerify.apply.viewStatus")}
            </Link>
          </div>
        </section>
      ) : (
        <form className={uiStyles.form} onSubmit={iGM_HandleSubmit}>
          {/* 组织选择 */}
          <div className={uiStyles.formRow}>
            <span className={uiStyles.label}>{t("orgVerify.apply.chooseOrg")}</span>
            <div className={styles.orgGrid}>
              {orgs.map((org) =>
                /* 无负责人入驻的组织：不可选中，提示申请将长期挂起与官方联系方式 */
                org.hasOwner === false ? (
                  <div
                    key={org.id}
                    className={`${styles.orgCard} ${styles.orgCardPending}`}
                    aria-disabled="true"
                  >
                    <span className={styles.orgName}>
                      <Building2 size={15} strokeWidth={1.8} />
                      {org.name}
                    </span>
                    <span className={styles.orgDesc}>{org.description}</span>
                    <span className={styles.orgPendingTip}>
                      <Mail size={12} strokeWidth={1.8} />
                      {t("orgVerify.apply.ownerPending", {
                        email: "igcraftlit@outlook.com",
                      })}
                    </span>
                  </div>
                ) : (
                  <button
                    key={org.id}
                    type="button"
                    className={`${styles.orgCard} ${
                      selectedOrgId === org.id ? styles.orgCardActive : ""
                    }`}
                    aria-pressed={selectedOrgId === org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                  >
                    <span className={styles.orgName}>
                      <Building2 size={15} strokeWidth={1.8} />
                      {org.name}
                    </span>
                    <span className={styles.orgDesc}>{org.description}</span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* 申请理由 */}
          <div className={uiStyles.formRow}>
            <label className={uiStyles.label} htmlFor="igm-org-reason">
              {t("orgVerify.apply.reason")}
            </label>
            <textarea
              id="igm-org-reason"
              className={uiStyles.textarea}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("orgVerify.apply.reasonPlaceholder")}
              maxLength={1000}
              required
            />
            <span className={uiStyles.hint}>{t("orgVerify.apply.reasonHint")}</span>
          </div>

          {/* 证明材料（可选上传） */}
          <div className={uiStyles.formRow}>
            <span className={uiStyles.label}>{t("orgVerify.apply.proof")}</span>
            {proofFileId ? (
              <div className={uiStyles.chips}>
                <span className={uiStyles.chip}>
                  {t("orgVerify.apply.proofUploaded")}
                  {proofName ? ` · ${proofName}` : ""}
                </span>
                <button
                  type="button"
                  className={uiStyles.ghostButton}
                  onClick={iGM_RemoveProof}
                >
                  <X size={13} strokeWidth={1.8} />
                  {t("orgVerify.apply.proofRemove")}
                </button>
              </div>
            ) : (
              <div className={uiStyles.formActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void iGM_HandleProofUpload(file);
                  }}
                />
                <button
                  type="button"
                  className={uiStyles.ghostButton}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <LoaderCircle size={14} className="igm-spin" />
                  ) : (
                    <FileUp size={14} strokeWidth={1.8} />
                  )}
                  {uploading
                    ? t("orgVerify.apply.proofUploading")
                    : t("orgVerify.apply.proofUpload")}
                </button>
              </div>
            )}
            <span className={uiStyles.hint}>{t("orgVerify.apply.proofHint")}</span>
          </div>

          {/* 提交 */}
          <div className={uiStyles.formActions}>
            <button
              type="submit"
              className={uiStyles.primaryButton}
              disabled={!selectedOrgId || !reason.trim() || submitting || uploading}
            >
              {submitting ? (
                <LoaderCircle size={14} className="igm-spin" />
              ) : (
                <Send size={14} strokeWidth={1.8} />
              )}
              {submitting ? t("orgVerify.apply.submitting") : t("orgVerify.apply.submit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** 组织认证页（需登录） */
export function iGM_OrgVerifyPage() {
  // JSX 组件名须大写开头
  const IGM_OrgVerifyInner = iGM_OrgVerifyInner;
  return (
    <IGM_RequireAuth>
      <IGM_OrgVerifyInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_OrgVerifyPage;
