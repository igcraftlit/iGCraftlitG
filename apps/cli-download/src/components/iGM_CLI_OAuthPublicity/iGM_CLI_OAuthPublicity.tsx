/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthPublicity/iGM_CLI_OAuthPublicity.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/publicity
 * 模块：iGM_CLI_OAuthPublicity
 * 作用：开发者公示查看页——按批次展示已通过审核的开发者名单，最新批次置顶
 * 内容：拉取后端 GET /G_Developer/publicity 并按批次分组渲染（开发者名称、社区 iGMUid、
 *       项目名称、通过时间），附名额、公示时间与公示说明；公开可浏览，无需登录
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, RotateCcw } from "lucide-react";
import {
  iGM_CLI_ApiGetDeveloperPublicity,
  iGM_CLI_ResolveErrorText,
  type iGM_CLI_DeveloperPublicityBatch,
} from "../../services/iGM_CLI_OAuthClient";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_OAuthShell as IGM_CLI_OAuthShell } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthShell";
import styles from "../iGM_CLI_OAuthShell/iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 公示加载状态 */
type iGM_CLI_PublicityState = "loading" | "ready" | "failed";

// 核心逻辑 //
/** 日期格式化（固定时区，避免各端渲染差异） */
function iGM_CLI_FormatDate(locale: string, value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

/** 开发者公示页（公开） */
export function iGM_CLI_OAuthPublicity() {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();
  const [state, setState] = useState<iGM_CLI_PublicityState>("loading");
  const [batches, setBatches] = useState<iGM_CLI_DeveloperPublicityBatch[]>([]);
  const [errorText, setErrorText] = useState("");

  /** 拉取公示数据 */
  const iGM_Load = useCallback(() => {
    setState("loading");
    iGM_CLI_ApiGetDeveloperPublicity()
      .then((res) => {
        setBatches(res.data?.batches ?? []);
        setState("ready");
      })
      .catch((error) => {
        setErrorText(
          iGM_CLI_ResolveErrorText(t, error, "oauth.publicity.loadFailed"),
        );
        setState("failed");
      });
  }, [t]);

  useEffect(() => {
    iGM_Load();
  }, [iGM_Load]);

  return (
    <IGM_CLI_OAuthShell active="publicity">
      <p className={styles.pageDesc}>{t("oauth.publicity.intro")}</p>

      <div className={styles.body}>
        {state === "loading" && (
          <div className={styles.stateBox}>
            <LoaderCircle size={16} className={styles.spinner} aria-hidden />
          </div>
        )}

        {state === "failed" && (
          <div className={styles.form}>
            <div className={`${styles.alert} ${styles.alertError}`}>
              {errorText}
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={iGM_Load}
              >
                <RotateCcw size={15} strokeWidth={1.8} aria-hidden />
                {t("oauth.publicity.retry")}
              </button>
            </div>
          </div>
        )}

        {state === "ready" && batches.length === 0 && (
          <div className={styles.emptyBox}>{t("oauth.publicity.empty")}</div>
        )}

        {state === "ready" && batches.length > 0 && (
          <>
            {batches.map((batch, index) => (
              <section key={batch.id} className={styles.pubBatch}>
                <div className={styles.pubBatchHead}>
                  <div>
                    <h2 className={styles.pubBatchTitle}>{batch.batchName}</h2>
                    <div className={styles.pubMeta}>
                      <span>
                        {t("oauth.publicity.quota", { quota: batch.quota })}
                      </span>
                      <span>
                        {t("oauth.publicity.count", {
                          count: batch.items.length,
                        })}
                      </span>
                      {batch.publishedAt && (
                        <>
                          <span>{t("oauth.publicity.publishedAt")}</span>
                          <span>
                            {iGM_CLI_FormatDate(locale, batch.publishedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {index === 0 && (
                    <span className={`${styles.badge} ${styles.badgeApproved}`}>
                      {t("oauth.publicity.latest")}
                    </span>
                  )}
                </div>

                <div className={styles.pubTableWrap}>
                  <table className={styles.pubTable}>
                    <thead>
                      <tr>
                        <th>{t("oauth.publicity.developerName")}</th>
                        <th>{t("oauth.publicity.uid")}</th>
                        <th>{t("oauth.publicity.projectName")}</th>
                        <th>{t("oauth.publicity.approvedAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.items.map((item) => (
                        <tr key={item.id}>
                          <td className={styles.pubName}>
                            {item.developerName}
                          </td>
                          <td className={styles.pubUid}>{item.uid ?? ""}</td>
                          <td>{item.projectName}</td>
                          <td>{iGM_CLI_FormatDate(locale, item.approvedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <ul className={styles.pubNoteList}>
              <li>{t("oauth.publicity.note1")}</li>
              <li>{t("oauth.publicity.note2")}</li>
              <li>{t("oauth.publicity.note3")}</li>
            </ul>
          </>
        )}
      </div>
    </IGM_CLI_OAuthShell>
  );
}

// 导出 //
export default iGM_CLI_OAuthPublicity;