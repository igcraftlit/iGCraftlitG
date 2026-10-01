/**
 * 文件路径：apps/web/src/iGM_Pages/G_ThirdPartyDetail/iGM_ThirdPartyDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ThirdPartyDetail?id=xxx（静态壳，查询参数驱动加载）
 * 模块：G_ThirdPartyDetail
 * 作用：第三方资源详情——展示资源信息与版本列表，并编排下载任务
 * 内容：返回链接、封面与资源信息、版本列表（版本号/游戏版本/加载器/大小/发布时间）、
 *       每个版本的下载设置面板（目标目录输入 + 后端原生目录选择器）、确认下载
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 本模块仅支持 Fabric 加载器与 Modrinth 平台
 *   - 确认下载后跳转 /G_DownloadCenter 并携带 taskId
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  Package,
  User,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiGetThirdPartyResource,
  iGM_ApiStartThirdPartyDownload,
  type iGM_ThirdPartyDetailData,
  type iGM_ThirdPartyVersion,
} from "../../iGM_Services/iGM_ThirdPartyClient";
import { iGM_ApiPickFolder } from "../../iGM_Services/iGM_GameClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import m15 from "../iGM_Module15.module.css";
import styles from "./iGM_ThirdPartyDetailPage.module.css";

// 类型定义 //
/** localStorage 中记住上次选择的目标目录的键 */
const iGM_TargetDirStorageKey = "igm.thirdParty.downloadDir";

// 核心逻辑 //
/** 资源类型本地化标签（键缺失时原样显示） */
function iGM_TypeLabel(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string {
  const key = `thirdParty.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 版本发布类型本地化标签（键缺失时原样显示） */
function iGM_VersionTypeLabel(
  t: ReturnType<typeof useTranslations>,
  value: iGM_ThirdPartyVersion["versionType"],
): string {
  const key = `thirdParty.versionType.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 第三方资源详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_ThirdPartyDetailPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();
  const resourceId = searchParams.get("id");

  const [data, setData] = useState<iGM_ThirdPartyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 展开下载设置面板的版本 id */
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [targetDir, setTargetDir] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [starting, setStarting] = useState(false);

  /** 恢复上次选择的目标目录 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(iGM_TargetDirStorageKey);
    if (saved) setTargetDir(saved);
  }, []);

  /** 拉取资源详情与版本列表 */
  const iGM_Load = useCallback(async () => {
    if (!resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetThirdPartyResource(resourceId);
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 展开 / 收起某个版本的下载设置面板 */
  function iGM_ToggleVersion(versionId: string): void {
    if (starting) return;
    setActiveVersionId((prev) => (prev === versionId ? null : versionId));
  }

  /** 调起后端所在机器的原生文件夹选择器 */
  async function iGM_HandleBrowse(): Promise<void> {
    if (browsing || starting) return;
    setBrowsing(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiPickFolder();
      const picked = response.data?.path;
      if (picked) setTargetDir(picked);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBrowsing(false);
    }
  }

  /** 创建下载任务并跳转到下载中心 */
  async function iGM_HandleDownload(version: iGM_ThirdPartyVersion): Promise<void> {
    if (!data || starting) return;
    setStarting(true);
    setErrorText(null);
    const dir = targetDir.trim();
    try {
      const response = await iGM_ApiStartThirdPartyDownload({
        resourceId: data.resource.id,
        versionId: version.id,
        target: dir || undefined,
      });
      if (dir) window.localStorage.setItem(iGM_TargetDirStorageKey, dir);
      const taskId = response.data?.taskId ?? response.data?.task?.id;
      if (taskId) {
        router.push(`/G_DownloadCenter?taskId=${encodeURIComponent(taskId)}`);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("thirdParty.stateLoading")}
      </div>
    );
  }

  if (!data) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Package}
          title={t("thirdParty.notFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_Minecraft?source=thirdparty" className={m10.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("thirdParty.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  const { resource, versions } = data;

  return (
    <div className={pageStyles.page}>
      <Link href="/G_Minecraft?source=thirdparty" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("thirdParty.backToList")}
      </Link>

      {/* 资源信息 */}
      <section className={styles.detailLayout}>
        <div className={styles.detailCover}>
          {resource.coverUrl ? (
            // 第三方图源，使用原生 img 避免额外域名配置
            <img src={resource.coverUrl} alt={resource.name} loading="lazy" />
          ) : (
            <span className={styles.detailCoverFallback}>
              <Package size={34} strokeWidth={1.5} />
            </span>
          )}
        </div>

        <div className={styles.detailMain}>
          <h1 className={styles.detailTitle}>{resource.name}</h1>

          <div className={styles.detailMetaRow}>
            <span className={styles.typeBadge}>
              {iGM_TypeLabel(t, resource.type)}
            </span>
            <span className={styles.sourceBadge}>
              {t("thirdParty.sourceModrinth")}
            </span>
            {resource.author && (
              <span className={styles.metaItem}>
                <User size={13} strokeWidth={1.8} />
                {resource.author}
              </span>
            )}
            <span className={styles.metaItem}>
              <Download size={13} strokeWidth={1.8} />
              {resource.downloads === null
                ? t("thirdParty.unspecified")
                : t("thirdParty.downloadCount", { count: resource.downloads })}
            </span>
            <span className={styles.metaItem}>
              <Calendar size={13} strokeWidth={1.8} />
              {iGM_FormatDate(locale, resource.updatedAt)}
            </span>
          </div>

          {resource.description && (
            <p className={styles.description}>{resource.description}</p>
          )}

          <div className={styles.kvList}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>{t("thirdParty.sourceLabel")}</span>
              <span className={styles.kvValue}>
                {t("thirdParty.sourceModrinth")}
              </span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>{t("thirdParty.slugLabel")}</span>
              <span className={styles.kvValue}>{resource.slug}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 版本列表 */}
      <section className={m10.sectionCard}>
        <span className={styles.sectionTitle}>
          <HardDrive size={16} strokeWidth={1.8} />
          {t("thirdParty.versionsTitle")}
        </span>

        {versions.length === 0 ? (
          <p className={m10.hint}>{t("thirdParty.noVersions")}</p>
        ) : (
          <div className={styles.versionList}>
            {versions.map((version) => {
              const active = activeVersionId === version.id;
              return (
                <div key={version.id} className={styles.versionItem}>
                  <div className={styles.versionHead}>
                    <div className={styles.versionInfo}>
                      <div className={styles.versionNameRow}>
                        <span className={styles.versionName}>{version.version}</span>
                        <span
                          className={`${styles.vtBadge} ${
                            version.versionType === "release"
                              ? styles.vtRelease
                              : version.versionType === "beta"
                                ? styles.vtBeta
                                : styles.vtAlpha
                          }`}
                        >
                          {iGM_VersionTypeLabel(t, version.versionType)}
                        </span>
                      </div>
                      <div className={styles.versionMeta}>
                        <span className={styles.metaItem}>
                          <HardDrive size={13} strokeWidth={1.8} />
                          {iGM_FormatFileSize(version.size)}
                        </span>
                        {version.publishedAt && (
                          <span className={styles.metaItem}>
                            <Calendar size={13} strokeWidth={1.8} />
                            {iGM_FormatDate(locale, version.publishedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={m10.primaryButton}
                      disabled={starting}
                      onClick={() => iGM_ToggleVersion(version.id)}
                    >
                      <Download size={14} strokeWidth={1.8} />
                      {t("thirdParty.download")}
                    </button>
                  </div>

                  {/* 兼容性标签 */}
                  <div className={styles.compatRow}>
                    <div className={styles.compatGroup}>
                      <span className={styles.compatLabel}>
                        {t("thirdParty.gameVersionsLabel")}
                      </span>
                      <div className={styles.compatChips}>
                        {version.gameVersions.length > 0 ? (
                          version.gameVersions.map((value) => (
                            <span key={value} className={styles.compatChip}>
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className={styles.compatChip}>
                            {t("thirdParty.unspecified")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.compatGroup}>
                      <span className={styles.compatLabel}>
                        {t("thirdParty.loadersLabel")}
                      </span>
                      <div className={styles.compatChips}>
                        {version.loaders.length > 0 ? (
                          version.loaders.map((value) => (
                            <span key={value} className={styles.compatChip}>
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className={styles.compatChip}>
                            {t("thirdParty.unspecified")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 下载设置面板 */}
                  {active && (
                    <div className={styles.downloadPanel}>
                      <span className={styles.downloadPanelTitle}>
                        {t("thirdParty.downloadSettings")}
                      </span>
                      <div className={m15.field}>
                        <label
                          className={m15.label}
                          htmlFor={`igm-thirdparty-dir-${version.id}`}
                        >
                          {t("thirdParty.targetDirLabel")}
                        </label>
                        <div className={styles.pathRow}>
                          <input
                            id={`igm-thirdparty-dir-${version.id}`}
                            className={`${m15.input} ${styles.pathInput}`}
                            type="text"
                            value={targetDir}
                            placeholder={t("thirdParty.targetDirPlaceholder")}
                            disabled={starting}
                            onChange={(event) => setTargetDir(event.target.value)}
                          />
                          <button
                            type="button"
                            className={m10.ghostButton}
                            disabled={browsing || starting}
                            onClick={() => void iGM_HandleBrowse()}
                          >
                            {browsing ? (
                              <LoaderCircle size={15} className="igm-spin" />
                            ) : (
                              <FolderOpen size={15} strokeWidth={1.8} />
                            )}
                            {t("thirdParty.browse")}
                          </button>
                        </div>
                        <p className={m10.hint}>
                          <Info
                            size={13}
                            strokeWidth={1.8}
                            style={{ verticalAlign: "-2px", marginRight: 4 }}
                          />
                          {t("thirdParty.targetDirHint")}
                        </p>
                      </div>

                      <div className={styles.downloadActions}>
                        <button
                          type="button"
                          className={m10.primaryButton}
                          disabled={starting}
                          onClick={() => void iGM_HandleDownload(version)}
                        >
                          {starting ? (
                            <LoaderCircle size={15} className="igm-spin" />
                          ) : (
                            <Download size={15} strokeWidth={1.8} />
                          )}
                          {t("thirdParty.confirmDownload")}
                        </button>
                        <button
                          type="button"
                          className={m10.ghostButton}
                          disabled={starting}
                          onClick={() => setActiveVersionId(null)}
                        >
                          {t("thirdParty.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {errorText && (
        <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ThirdPartyDetailPage;