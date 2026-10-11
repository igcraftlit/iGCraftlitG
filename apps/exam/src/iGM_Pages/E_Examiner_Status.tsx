/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Examiner_Status.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Examiner_Status（/status）
 * 模块：iGM_ExaminerStatusPage
 * 作用：展示当前用户的命题创作者准入状态、最近申请信息、审核意见与历史申请列表
 * 内容：加载 / 失败 / 未申请 / 已申请四种状态；gate 标签、申请明细、审核意见、历史列表、前往申请入口
 * 说明：纯静态导出，数据在客户端挂载后读取；未申请时给出前往申请链接；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, FileText } from "lucide-react";
import {
  iGM_Examiner_FetchStatus,
  type iGM_ExaminerApplicationDto,
  type iGM_ExaminerGate,
  type iGM_ExaminerStatus,
} from "../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_Examiner_Status.module.css";

// 类型定义 //
type iGM_ExaminerStatusState = "loading" | "ready" | "error";

/** 准入状态 → 文案键 */
const iGM_Examiner_GateKeys: Record<iGM_ExaminerGate, iGM_I18nKey> = {
  none: "examinerStatusNone",
  pending: "examinerStatusPending",
  approved: "examinerStatusApproved",
  rejected: "examinerStatusRejected",
  suspended: "examinerStatusSuspended",
};

/** 命题方向 → 文案键 */
const iGM_Examiner_DirectionKeys: Record<string, iGM_I18nKey> = {
  minecraft: "examinerDirectionMinecraft",
  java: "examinerDirectionJava",
  informatics: "examinerDirectionInformatics",
  general: "examinerDirectionGeneral",
};

// 核心逻辑 //
/** 申请状态 → 文案键（复用准入状态文案） */
function iGM_Examiner_ApplicationGate(
  status: iGM_ExaminerApplicationDto["status"],
): iGM_ExaminerGate {
  return status === "approved"
    ? "approved"
    : status === "rejected"
      ? "rejected"
      : "pending";
}

/** 命题创作者申请状态页 */
export function E_ExaminerStatus() {
  const { t } = useI18n();
  const [state, setState] = useState<iGM_ExaminerStatusState>("loading");
  const [status, setStatus] = useState<iGM_ExaminerStatus | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const data = await iGM_Examiner_FetchStatus();
      setStatus(data);
      setState("ready");
    } catch (err) {
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 渲染单条申请明细 */
  function renderApplication(application: iGM_ExaminerApplicationDto) {
    const directions =
      application.directions.length > 0
        ? application.directions
            .map((item) =>
              iGM_Examiner_DirectionKeys[item]
                ? t(iGM_Examiner_DirectionKeys[item])
                : item,
            )
            .join(" · ")
        : "—";
    return (
      <dl className={styles.spec}>
        <div className={styles.specRow}>
          <dt className={`igm-mono ${styles.specKey}`}>
            {t("examinerFieldRealName")}
          </dt>
          <dd className={styles.specValue}>{application.realName || "—"}</dd>
        </div>
        <div className={styles.specRow}>
          <dt className={`igm-mono ${styles.specKey}`}>
            {t("examinerFieldContact")}
          </dt>
          <dd className={styles.specValue}>{application.contact || "—"}</dd>
        </div>
        <div className={styles.specRow}>
          <dt className={`igm-mono ${styles.specKey}`}>
            {t("examinerFieldDirections")}
          </dt>
          <dd className={styles.specValue}>{directions}</dd>
        </div>
        <div className={styles.specRow}>
          <dt className={`igm-mono ${styles.specKey}`}>
            {t("examinerFieldBio")}
          </dt>
          <dd className={styles.specValue}>{application.bio || "—"}</dd>
        </div>
        {application.portfolioUrl && (
          <div className={styles.specRow}>
            <dt className={`igm-mono ${styles.specKey}`}>
              {t("examinerFieldPortfolio")}
            </dt>
            <dd className={styles.specValue}>
              <a
                className={styles.link}
                href={application.portfolioUrl}
                target="_blank"
                rel="noreferrer"
              >
                {application.portfolioUrl}
              </a>
            </dd>
          </div>
        )}
        <div className={styles.specRow}>
          <dt className={`igm-mono ${styles.specKey}`}>
            {t("examinerFieldReason")}
          </dt>
          <dd className={styles.specValue}>{application.reason || "—"}</dd>
        </div>
      </dl>
    );
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>
          {t("examinerApplyEyebrow")}
        </p>
        <h1 className={`igm-serif ${styles.headTitle}`}>
          {t("examinerStatusTitle")}
        </h1>
        <p className={styles.headLead}>{t("examinerStatusLead")}</p>
      </header>

      {state === "loading" && (
        <p className={`igm-mono ${styles.state}`}>
          {t("examinerStatusLoading")}
        </p>
      )}

      {state === "error" && (
        <p className={`igm-mono ${styles.stateError}`}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {message || t("examinerApplyFailed")}
        </p>
      )}

      {state === "ready" && status && (
        <section className={styles.section}>
          {/* gate 标签 */}
          <div className={styles.gateRow}>
            <span className={`igm-mono ${styles.gateLabel}`}>
              {t("examinerGateTitle")}
            </span>
            <span className={`igm-mono ${styles.gateTag} ${styles[`gate_${status.gate}`]}`}>
              {t(iGM_Examiner_GateKeys[status.gate])}
            </span>
          </div>

          {/* 未申请 */}
          {status.gate === "none" && (
            <div className={styles.noneBox}>
              <FileText size={28} strokeWidth={1.4} className={styles.noneIcon} />
              <p className={`igm-serif ${styles.noneText}`}>
                {t("examinerStatusNone")}
              </p>
              <Link href="/apply" className={styles.gotoBtn}>
                <span className={`igm-mono ${styles.gotoLabel}`}>
                  {t("examinerStatusGotoApply")}
                </span>
              </Link>
            </div>
          )}

          {/* 最近申请 */}
          {status.application && (
            <div className={styles.block}>
              <h2 className={`igm-serif ${styles.blockTitle}`}>
                {t("examinerApplyFormTitle")}
              </h2>
              {renderApplication(status.application)}
              {status.application.reviewComment && (
                <div className={styles.comment}>
                  <span className={`igm-mono ${styles.commentLabel}`}>
                    {t("examinerStatusReviewComment")}
                  </span>
                  <p className={styles.commentBody}>
                    {status.application.reviewComment}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 历史列表 */}
          {status.history.length > 0 && (
            <div className={styles.block}>
              <h2 className={`igm-serif ${styles.blockTitle}`}>
                {t("examinerStatusTitle")}
              </h2>
              <ul className={styles.history}>
                {status.history.map((item) => {
                  const gate = iGM_Examiner_ApplicationGate(item.status);
                  return (
                    <li key={item.id} className={styles.historyRow}>
                      <span
                        className={`igm-mono ${styles.gateTag} ${styles[`gate_${gate}`]}`}
                      >
                        {t(iGM_Examiner_GateKeys[gate])}
                      </span>
                      <span className={`igm-mono ${styles.historyDate}`}>
                        {item.createdAt}
                      </span>
                      <span className={styles.historyComment}>
                        {item.reviewComment || "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// 导出 //
export default E_ExaminerStatus;
