/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserRules/iGM_UserRulesPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserRules（可带 ?from=register 由注册向导第四框跳入）
 * 模块：G_UserRules
 * 作用：《iGCraftLit 用户管理规定》公开查看页
 * 内容：左侧规定全文（七章 + Q1-Q4），右侧 iGM_PageToc 目录常驻（ON THIS PAGE）；
 *       768-1023px 目录折叠为页面顶部横向条，<768px 隐藏；
 *       模块八第三轮：IP 检测告知（纯后端自研解析，无第三方服务）；
 *       from=register 模式底部固定操作条，滚动到底解锁
 *       "我已阅读完毕，同意并返回注册"
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenCheck, CheckCircle2, Globe, Loader2 } from "lucide-react";
import {
  iGM_BuildRulesToc,
  iGM_UserRulesDocument as IGM_UserRulesDocument,
  iGM_UseRulesMessages,
} from "../../iGM_Components/iGM_UserRules/iGM_UserRulesDocument";
import { iGM_PageToc as IGM_PageToc } from "../../iGM_Components/iGM_PageToc/iGM_PageToc";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_ApiGetClientIp } from "../../iGM_Services/iGM_SystemClient";
import { iGM_SaveRulesAccepted } from "../G_RootAuth/iGM_RegisterDraft";
import styles from "../../iGM_Components/iGM_UserRules/iGM_UserRules.module.css";

// 类型定义 //
/** 距页面底部小于该像素数即视为阅读到底 */
const iGM_BottomThreshold = 32;

/** 用户管理规定查看页（搜索参数需由路由入口的 Suspense 包裹） */
export function iGM_UserRulesPage() {
  const rules = iGM_UseRulesMessages();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const fromRegister = searchParams.get("from") === "register";

  // IP 检测状态：检测中 / 成功 IP / 失败
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [ipFailed, setIpFailed] = useState(false);
  // 注册模式：是否已滚动到页面底部
  const [reachedBottom, setReachedBottom] = useState(false);

  const tocItems = useMemo(() => iGM_BuildRulesToc(rules), [rules]);
  // 顶部折叠条仅放主章节，避免横向条目过长
  const topItems = useMemo(
    () => tocItems.filter((item) => item.level === 1),
    [tocItems],
  );

  /* IP 检测：进入页面即向后端查询（纯自研解析，不使用任何第三方服务） */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiGetClientIp()
      .then((response) => {
        if (cancelled) return;
        if (response.data?.ip) setClientIp(response.data.ip);
        else setIpFailed(true);
      })
      .catch(() => {
        if (!cancelled) setIpFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 注册模式：监听窗口滚动，到达底部后解锁同意按钮 */
  useEffect(() => {
    if (!fromRegister) return;
    const checkBottom = () => {
      const doc = document.documentElement;
      if (
        window.scrollY + window.innerHeight >=
        doc.scrollHeight - iGM_BottomThreshold
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

  /** 同意规定：写入凭证（时间 + 检测 IP），返回注册向导第四框 */
  function iGM_HandleAccept() {
    iGM_SaveRulesAccepted({
      at: new Date().toISOString(),
      ip: clientIp ?? "",
    });
    router.replace("/G_Auth/register");
  }

  return (
    <div
      className={`${styles.pageWrap} ${fromRegister ? styles.pageWrapRegister : ""}`}
    >
      {/* IP 检测告知条（任何访客可见） */}
      <p className={styles.ipBar}>
        {ipFailed ? (
          <>
            <Globe size={15} strokeWidth={1.8} aria-hidden />
            <span>{rules.ipDetectFailed}</span>
          </>
        ) : clientIp ? (
          <>
            <Globe size={15} strokeWidth={1.8} aria-hidden />
            <span>{rules.ipNotice.replace("{ip}", clientIp)}</span>
          </>
        ) : (
          <>
            <Loader2 size={15} strokeWidth={1.8} className={styles.ipSpin} aria-hidden />
            <span>{rules.ipDetecting}</span>
          </>
        )}
      </p>

      {/* 注册模式：操作提示条 */}
      {fromRegister && (
        <p className={styles.registerHintBar}>
          <BookOpenCheck size={15} strokeWidth={1.8} aria-hidden />
          <span>{rules.registerHint}</span>
        </p>
      )}

      <div className={styles.docLayout}>
        {/* 平板（768-1023px）：目录折叠到页面顶部 */}
        <div className={styles.tocTop}>
          <IGM_PageToc
            variant="top"
            items={topItems}
            title={rules.tocTitle}
          />
        </div>

        <IGM_UserRulesDocument />

        {/* 桌面（≥1024px）：右侧常驻目录 */}
        <aside className={styles.tocRail}>
          <IGM_PageToc items={tocItems} title={rules.tocTitle} />
        </aside>
      </div>

      {/* 注册模式：底部固定操作条，滚到底部解锁 */}
      {fromRegister && (
        <div className={styles.acceptBar} role="region" aria-label={rules.acceptAndReturn}>
          <span
            className={`${styles.acceptHint} ${reachedBottom ? styles.acceptHintReady : ""}`}
          >
            {reachedBottom && <CheckCircle2 size={15} strokeWidth={2} aria-hidden />}
            {reachedBottom ? rules.acceptAndReturn : rules.scrollToAccept}
          </span>
          <button
            type="button"
            className={styles.acceptBarButton}
            disabled={!reachedBottom}
            onClick={iGM_HandleAccept}
          >
            {rules.acceptAndReturn}
          </button>
        </div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_UserRulesPage;
