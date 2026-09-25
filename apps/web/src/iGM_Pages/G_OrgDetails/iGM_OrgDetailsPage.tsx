/**
 * 文件路径：apps/web/src/iGM_Pages/G_OrgDetails/iGM_OrgDetailsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_OrgDetails?orgId=xxx（或 slug）
 * 模块：G_OrgDetails
 * 作用：组织详情页——公开展示受信任组织信息与“关于组织”内容
 * 内容：组织详情卡片；负责人可就地编辑关于组织；
 *       已认证该组织的成员底部可申请退出（复用 iGM_OrgDetailCard）
 * 说明：纯静态 SSG，数据在客户端经 iGM_OrgVerifyClient 调用本地后端；
 *       页面本身公开可读，编辑/退出权限由后端严格校验
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, LoaderCircle } from "lucide-react";
import {
  iGM_ApiOrgDetail,
  iGM_ApiOrgVerifyMyOrg,
  type iGM_MyOrgDetail,
  type iGM_Organization,
} from "../../iGM_Services/iGM_OrgVerifyClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_OrgDetailCard as IGM_OrgDetailCard } from "../../iGM_Components/iGM_OrgDetailCard/iGM_OrgDetailCard";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";

// 类型定义 //
// （页面内部状态均为 React state，无额外类型）

// 核心逻辑 //
/** 组织详情页主体（在 Suspense 内使用 useSearchParams） */
function iGM_OrgDetailsInner() {
  const t = useTranslations();
  const { status } = iGM_UseAuth();
  const searchParams = useSearchParams();
  const orgId = searchParams.get("orgId");
  const slug = searchParams.get("slug");

  const [org, setOrg] = useState<iGM_Organization | null>(null);
  /** 当前登录用户在该组织的成员/负责人身份（未登录或非成员为 null） */
  const [membership, setMembership] = useState<iGM_MyOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 加载公开组织详情；登录时额外加载我的组织身份 */
  const iGM_Load = useCallback(async () => {
    if (!orgId && !slug) {
      setLoading(false);
      setOrg(null);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiOrgDetail({ orgId, slug });
      const organization = response.data?.organization ?? null;
      setOrg(organization);
      if (status === "authenticated" && organization) {
        const myResponse = await iGM_ApiOrgVerifyMyOrg().catch(() => null);
        setMembership(
          myResponse?.data?.organization.id === organization.id
            ? myResponse.data
            : null,
        );
      } else {
        setMembership(null);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [orgId, slug, status, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Building2 size={22} strokeWidth={1.8} />
          </span>
          {t("pages.orgDetails.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.orgDetails.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : errorText ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      ) : !org ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("orgVerify.errors.orgNotFound")}
        </div>
      ) : (
        <IGM_OrgDetailCard
          organization={
            // 编辑保存后卡片内部自管状态；成员身份只用于初始权限
            org
          }
          isOwner={membership?.isOwner ?? false}
          showLeave={membership !== null}
          onLeft={() => setMembership(null)}
        />
      )}
    </div>
  );
}

/** 组织详情页（公开可读） */
export function iGM_OrgDetailsPage() {
  // JSX 组件名须大写开头
  const IGM_OrgDetailsInner = iGM_OrgDetailsInner;
  return <IGM_OrgDetailsInner />;
}

// 导出 //
export default iGM_OrgDetailsPage;
