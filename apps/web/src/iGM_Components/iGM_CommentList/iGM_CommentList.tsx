/**
 * 文件路径：apps/web/src/iGM_Components/iGM_CommentList/iGM_CommentList.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Post
 * 模块：iGM_CommentList
 * 作用：帖子评论的楼中楼展示与内联操作
 * 内容：平铺评论按 parentId 递归成树、内联回复与编辑、删除、点赞、
 *       协管员隐藏/恢复、隐藏评论对作者本人与协管员可见
 * 说明：所有数据变更通过父组件传入的异步回调完成，本组件只负责交互状态
 */

// 导入依赖 //
"use client";

import { useMemo, useState } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import {
  EyeOff,
  LoaderCircle,
  MessageSquareReply,
  Pencil,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type { iGM_Comment } from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_ResolveErrorText } from "../iGM_AuthUI/iGM_AuthUI";
import { iGM_FormatRelative } from "../iGM_Format/iGM_Format";
import { iGM_Avatar as IGM_Avatar } from "../iGM_Avatar/iGM_Avatar";
import styles from "./iGM_CommentList.module.css";

// 类型定义 //
export interface iGM_CommentListProps {
  comments: iGM_Comment[];
  /** 回复：parentId 为被回复评论 ID */
  onReply: (parentId: string, content: string) => Promise<void>;
  /** 编辑评论 */
  onEdit: (commentId: string, content: string) => Promise<void>;
  /** 删除评论 */
  onDelete: (commentId: string) => Promise<void>;
  /** 切换评论点赞（由父组件处理乐观更新与接口调用） */
  onToggleLike: (comment: iGM_Comment) => Promise<void>;
  /** 协管员隐藏/恢复评论 */
  onToggleHide: (comment: iGM_Comment) => Promise<void>;
}

// 核心逻辑 //
/** 评论列表：将平铺数据按 parentId 组织成楼中楼 */
export function iGM_CommentList({
  comments,
  onReply,
  onEdit,
  onDelete,
  onToggleLike,
  onToggleHide,
}: iGM_CommentListProps) {
  const { childrenMap, rootIds } = useMemo(() => {
    const map = new Map<string, iGM_Comment[]>();
    const roots: string[] = [];
    for (const comment of comments) {
      if (comment.parentId) {
        const list = map.get(comment.parentId) ?? [];
        list.push(comment);
        map.set(comment.parentId, list);
      } else {
        roots.push(comment.id);
      }
    }
    return { childrenMap: map, rootIds: roots };
  }, [comments]);

  if (comments.length === 0) return null;

  return (
    <div className={styles.list}>
      {rootIds.map((id) => {
        const comment = comments.find((item) => item.id === id);
        if (!comment) return null;
        return (
          <IGM_CommentNode
            key={comment.id}
            comment={comment}
            allComments={comments}
            childrenMap={childrenMap}
            depth={0}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleLike={onToggleLike}
            onToggleHide={onToggleHide}
          />
        );
      })}
    </div>
  );
}

/** 单个评论节点及其递归子楼（IGM_ 大写别名以满足 JSX 组件规则） */
const IGM_CommentNode = function iGM_CommentNode(props: {
  comment: iGM_Comment;
  allComments: iGM_Comment[];
  childrenMap: Map<string, iGM_Comment[]>;
  depth: number;
  onReply: iGM_CommentListProps["onReply"];
  onEdit: iGM_CommentListProps["onEdit"];
  onDelete: iGM_CommentListProps["onDelete"];
  onToggleLike: iGM_CommentListProps["onToggleLike"];
  onToggleHide: iGM_CommentListProps["onToggleHide"];
}) {
  const {
    comment,
    childrenMap,
    depth,
    onReply,
    onEdit,
    onDelete,
    onToggleLike,
    onToggleHide,
  } = props;

  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { user, hasRole } = iGM_UseAuth();

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const displayName = comment.author.displayName ?? comment.author.username;
  const isOwner = user?.id === comment.author.id;
  const canModerate = hasRole("moderator");
  const isHidden = comment.status === "hidden";
  // 超过 5 层不再继续缩进，避免窄屏不可读
  const children = childrenMap.get(comment.id) ?? [];

  /** 通用异步动作包装：统一忙碌态与错误文案 */
  async function iGM_RunAction(action: () => Promise<void>): Promise<boolean> {
    setErrorText(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function iGM_HandleReply() {
    const content = replyText.trim();
    if (!content) return;
    const ok = await iGM_RunAction(() => onReply(comment.id, content));
    if (ok) {
      setReplyText("");
      setReplyOpen(false);
    }
  }

  async function iGM_HandleEdit() {
    const content = editText.trim();
    if (!content) return;
    const ok = await iGM_RunAction(() => onEdit(comment.id, content));
    if (ok) setEditOpen(false);
  }

  async function iGM_HandleDelete() {
    const confirmed = window.confirm(t("community.comments.deleteConfirm"));
    if (!confirmed) return;
    await iGM_RunAction(() => onDelete(comment.id));
  }

  return (
    <div className={`${styles.item} ${isHidden ? styles.itemHidden : ""}`}>
      <div className={styles.header}>
        <Link
          href={`/G_User?userId=${encodeURIComponent(comment.author.id)}`}
          className={styles.authorLink}
        >
          <IGM_Avatar size="sm" src={comment.author.avatar} name={displayName} />
          <span>{displayName}</span>
        </Link>
        <span className={styles.time}>
          {iGM_FormatRelative(locale, comment.createdAt)}
        </span>
        {isHidden && (
          <>
            <span className={styles.dot} />
            <span className={styles.hiddenBadge}>
              <EyeOff size={11} strokeWidth={2} style={{ marginRight: 4 }} />
              {t("community.status.hidden")}
            </span>
          </>
        )}
      </div>

      {editOpen ? (
        <div className={styles.inlineForm}>
          <textarea
            className={styles.textarea}
            value={editText}
            maxLength={2000}
            onChange={(event) => setEditText(event.target.value)}
          />
          {errorText && <span className={styles.errorText}>{errorText}</span>}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy || !editText.trim()}
              onClick={() => void iGM_HandleEdit()}
            >
              {busy && <LoaderCircle size={13} className="igm-spin" />}
              {t("community.comments.save")}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={() => {
                setEditOpen(false);
                setEditText(comment.content);
                setErrorText(null);
              }}
            >
              {t("community.comments.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.content}>{comment.content}</p>
      )}

      {/* 操作行 */}
      {!editOpen && (
        <div className={styles.actions}>
          {user && !isHidden && (
            <button
              type="button"
              className={`${styles.actionBtn} ${
                comment.likedByMe ? styles.actionActive : ""
              }`}
              onClick={() => void iGM_RunAction(() => onToggleLike(comment))}
            >
              <ThumbsUp size={13} strokeWidth={1.8} />
              {comment.likeCount > 0 ? comment.likeCount : t("community.actions.like")}
            </button>
          )}
          {user && !isHidden && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                setReplyOpen((open) => !open);
                setErrorText(null);
              }}
            >
              <MessageSquareReply size={13} strokeWidth={1.8} />
              {t("community.comments.reply")}
            </button>
          )}
          {isOwner && !isHidden && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                setEditOpen(true);
                setEditText(comment.content);
                setErrorText(null);
              }}
            >
              <Pencil size={13} strokeWidth={1.8} />
              {t("community.comments.edit")}
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionDanger}`}
              disabled={busy}
              onClick={() => void iGM_HandleDelete()}
            >
              <Trash2 size={13} strokeWidth={1.8} />
              {t("community.comments.delete")}
            </button>
          )}
          {canModerate && (
            <button
              type="button"
              className={`${styles.actionBtn} ${
                isHidden ? "" : styles.actionDanger
              }`}
              disabled={busy}
              onClick={() => void iGM_RunAction(() => onToggleHide(comment))}
            >
              <EyeOff size={13} strokeWidth={1.8} />
              {isHidden
                ? t("community.comments.restore")
                : t("community.comments.hide")}
            </button>
          )}
        </div>
      )}

      {/* 内联回复表单 */}
      {replyOpen && (
        <div className={styles.inlineForm}>
          <textarea
            className={styles.textarea}
            placeholder={t("community.comments.replyPlaceholder")}
            value={replyText}
            maxLength={2000}
            autoFocus
            onChange={(event) => setReplyText(event.target.value)}
          />
          {errorText && <span className={styles.errorText}>{errorText}</span>}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy || !replyText.trim()}
              onClick={() => void iGM_HandleReply()}
            >
              {busy && <LoaderCircle size={13} className="igm-spin" />}
              {t("community.comments.submitReply")}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={() => {
                setReplyOpen(false);
                setReplyText("");
                setErrorText(null);
              }}
            >
              {t("community.comments.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 递归子评论 */}
      {children.length > 0 && (
        <div className={styles.children}>
          {children.map((child) => (
            <IGM_CommentNode
              key={child.id}
              {...props}
              comment={child}
              depth={Math.min(depth + 1, 5)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 导出 //
export default iGM_CommentList;
