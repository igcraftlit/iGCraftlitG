/**
 * 文件路径：apps/web/src/iGM_Components/iGM_FriendButton/iGM_FriendButton.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community（用户搜索）、G_User、G_Post 等出现目标用户操作的场景
 * 模块：iGM_FriendButton
 * 作用：按当前用户视角的好友关系渲染单一操作入口——
 *       陌生人可发起申请、已发申请可撤回、收到申请引导去处理、已是好友展示徽标
 * 内容：本地维护状态机，调用 iGM_SocialClient 好友接口；
 *       错误统一经 iGM_ResolveErrorText 兜底（onError 上抛或 title 提示）
 * 说明：纯体验组件，真正权限边界在后端 /G_Social/friend/*
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, LoaderCircle, UserPlus, Users } from "lucide-react";
import {
  iGM_ApiRemoveFriend,
  iGM_ApiSendFriendRequest,
  type iGM_FriendState,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ResolveErrorText } from "../iGM_AuthUI/iGM_AuthUI";
import styles from "./iGM_FriendButton.module.css";

// 类型定义 //
export interface iGM_FriendButtonProps {
  /** 目标用户 ID */
  targetId: string;
  /** 初始好友状态（来自接口 DTO） */
  initialState: iGM_FriendState;
  /** 未建立关系时按钮风格，默认 ghost；首屏强引导场景可用 primary */
  variant?: "primary" | "ghost";
  /** 收到对方申请时点击“回应申请”的回调（通常跳转申请列表） */
  onRespond?: () => void;
  /** 操作失败兜底文案上抛（列表级错误条）；不传则仅以 title 呈现 */
  onError?: (message: string) => void;
}

// 核心逻辑 //
/** 好友关系单按钮状态机 */
export function iGM_FriendButton({
  targetId,
  initialState,
  variant = "ghost",
  onRespond,
  onError,
}: iGM_FriendButtonProps) {
  const t = useTranslations();
  const [state, setState] = useState<iGM_FriendState>(initialState);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 统一错误兜底：上抛列表级提示并保留按钮可重试 */
  function iGM_HandleError(error: unknown): void {
    const message = iGM_ResolveErrorText(t, error);
    setErrorText(message);
    onError?.(message);
  }

  /** 发起好友申请 */
  async function iGM_HandleSend(): Promise<void> {
    setBusy(true);
    setErrorText(null);
    try {
      await iGM_ApiSendFriendRequest(targetId);
      setState("pending_outgoing");
    } catch (error) {
      iGM_HandleError(error);
    } finally {
      setBusy(false);
    }
  }

  /** 撤回已发出的申请（remove 接口同时作用于 pending 申请） */
  async function iGM_HandleCancel(): Promise<void> {
    setBusy(true);
    setErrorText(null);
    try {
      await iGM_ApiRemoveFriend(targetId);
      setState(null);
    } catch (error) {
      iGM_HandleError(error);
    } finally {
      setBusy(false);
    }
  }

  if (state === "accepted") {
    return (
      <span className={styles.friendBadge}>
        <Check size={13} strokeWidth={2} />
        {t("social.friendsBadge")}
      </span>
    );
  }

  if (state === "pending_outgoing") {
    return (
      <button
        type="button"
        className={styles.ghostButton}
        disabled={busy}
        title={t("social.cancelRequest")}
        onClick={() => void iGM_HandleCancel()}
      >
        {busy ? (
          <LoaderCircle size={14} className="igm-spin" />
        ) : (
          <Users size={14} strokeWidth={1.8} />
        )}
        {t("social.requestSent")}
      </button>
    );
  }

  if (state === "pending_incoming") {
    return (
      <button
        type="button"
        className={styles.ghostButton}
        title={t("social.respondRequest")}
        onClick={onRespond}
      >
        <UserPlus size={14} strokeWidth={1.8} />
        {t("social.respondRequest")}
      </button>
    );
  }

  // null / rejected：均可发起（被拒后重新申请由后端判定）
  return (
    <button
      type="button"
      className={variant === "primary" ? styles.primaryButton : styles.ghostButton}
      disabled={busy}
      title={errorText ?? undefined}
      onClick={() => void iGM_HandleSend()}
    >
      {busy ? (
        <LoaderCircle size={14} className="igm-spin" />
      ) : (
        <UserPlus size={14} strokeWidth={1.8} />
      )}
      {t("social.addFriend")}
    </button>
  );
}

// 导出 //
export default iGM_FriendButton;
