/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserAgreement/iGM_UserAgreementPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserAgreement（可带 ?from=register 由注册向导第三步跳入）
 * 模块：G_UserAgreement
 * 作用：《iGCraftLit 用户管理规定》查看页——从 Markdown 静态文件读取并渲染
 * 内容：左侧规定正文（十四篇、三十八章，自 /docs/iGM_UserAgreement.md 解析）、
 *       右侧 ON THIS PAGE 目录（依据篇章节自动生成）、
 *       from=register 模式下滚动到底 + 勾选同意 + 点击「已完成阅读，选择遵守规定」
 * 说明：纯静态 SSG，文档以静态资源形式随 out 发布，前端自研极简 Markdown 渲染；
 *       同意记录写入版本号，由注册接口随 body 提交至后端 iGM_UserAgreements
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpenCheck, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  iGM_FetchUserAgreement,
  type iGM_AgreementDoc,
} from "../../iGM_Services/iGM_AgreementClient";
import { iGM_PageToc as IGM_PageToc } from "../../iGM_Components/iGM_PageToc/iGM_PageToc";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_SaveRulesAccepted } from "../G_RootAuth/iGM_RegisterDraft";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
/** 距页面底部小于该像素数即视为阅读到底 */
const iGM_BottomThreshold = 32;

// 核心逻辑 //
/** 用户管理规定查看页（搜索参数需由路由入口的 Suspense 包裹） */
export function iGM_UserAgreementPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const fromRegister = searchParams.get("from") === "register";

  const [doc, setDoc] = useState<iGM_AgreementDoc | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [checked, setChecked] = useState(false);

  /* 拉取并解析规定 Markdown（静态资源） */
  useEffect(() => {
    let cancelled = false;
    iGM_FetchUserAgreement()
      .then((parsed) => {
        if (!cancelled) setDoc(parsed);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 注册模式：监听窗口滚动，到达底部后允许勾选同意 */
  useEffect(() => {
    if (!fromRegister) return;
    const checkBottom = () => {
      const el = document.documentElement;
      if (
        window.scrollY + window.innerHeight >=
        el.scrollHeight - iGM_BottomThreshold
      ) {
        setReachedBottom(true);
      }
    };
    checkBottom();
    window.addEventListener("scroll", checkBottom, { passive: true });
    window.addEventListener("resize", checkBottom);
    return () => {
      window.removeEventListener("scroll", checkBottom);
      window.removeEventListener("resize", checkBottom);
    };
  }, [fromRegister]);

  // 顶部折叠条仅放主篇目，避免横向条目过长
  const topItems = useMemo(
    () => (doc?.toc ?? []).filter((item) => item.level === 1),
    [doc],
  );

  /** 同意规定：写入同意凭证（时间 + 版本号），返回注册向导第三步 */
  function iGM_HandleAccept() {
    iGM_SaveRulesAccepted({
      at: new Date().toISOString(),
      ip: "",
      version: doc?.version ?? "",
    });
    router.replace("/G_Auth/register");
  }

  /** 按区块类型渲染正文 */
  function iGM_RenderBlock(block: iGM_AgreementDoc["blocks"][number], index: number) {
    switch (block.type) {
      case "h1":
        return (
          <h1 key={index} id={block.id} className={styles.docH1}>
            {block.text}
          </h1>
        );
      case "h2":
        return (
          <h2 key={index} id={block.id} className={styles.docH2}>
            {block.text}
          </h2>
        );
      case "h3":
        return (
          <h3 key={index} id={block.id} className={styles.docH3}>
            {block.text}
          </h3>
        );
      case "h4":
        return (
          <h4 key={index} id={block.id} className={styles.docH4}>
            {block.text}
          </h4>
        );
      case "ul":
        return (
          <ul key={index} className={styles.docList}>
            {block.items?.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={index} className={styles.docList}>
            {block.items?.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ol>
        );
      case "hr":
        return <hr key={index} className={styles.docHr} />;
      default:
        return (
          <p key={index} className={styles.docP}>
            {block.text}
          </p>
        );
    }
  }

  if (loadFailed) {
    return (
      <div className={pageStyles.page}>
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("agreement.loadFailed")}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className={pageStyles.page}>
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 注册模式：操作提示条 */}
      {fromRegister && (
        <p className={styles.examStatus}>
          <BookOpenCheck size={15} strokeWidth={1.8} aria-hidden />{" "}
          {t("agreement.registerHint")}
        </p>
      )}

      <div className={styles.docLayout}>
        {/* 平板（<1024px）：目录折叠到页面顶部 */}
        <div className={styles.tocTop}>
          <IGM_PageToc
            variant="top"
            items={topItems}
            title={t("agreement.tocTitle")}
          />
        </div>

        <article className={styles.docBody}>
          <p className={styles.docMeta}>
            {t("agreement.version", { version: doc.version })}
          </p>
          {doc.blocks.map(iGM_RenderBlock)}
        </article>

        {/* 桌面（≥1024px）：右侧常驻目录 */}
        <aside className={styles.tocRail}>
          <IGM_PageToc items={doc.toc} title={t("agreement.tocTitle")} />
        </aside>
      </div>

      {/* 注册模式：滚动到底 + 勾选同意后解锁确认按钮 */}
      {fromRegister && (
        <div className={styles.examBox}>
          <label className={styles.progressActions}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!reachedBottom}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>{t("agreement.acceptLabel")}</span>
          </label>
          <div className={styles.progressActions}>
            <span
              className={`${styles.examStatus} ${reachedBottom ? styles.levelTagCurrent : ""}`}
            >
              {reachedBottom && (
                <CheckCircle2 size={15} strokeWidth={2} aria-hidden />
              )}{" "}
              {reachedBottom ? t("agreement.reached") : t("agreement.scrollHint")}
            </span>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!reachedBottom || !checked}
              onClick={iGM_HandleAccept}
            >
              {t("agreement.acceptAction")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_UserAgreementPage;