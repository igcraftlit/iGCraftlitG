/**
 * 文件路径：apps/web/src/iGM_Pages/G_PostEdit/iGM_PostEditPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_PostEdit（发帖）、/G_PostEdit?postId=xxx（编辑）
 * 模块：G_PostEdit
 * 作用：发帖与编辑帖子表单
 * 内容：标题、分类选择、标签输入（逗号/顿号分隔）、正文、字数计数、
 *       创建与编辑提交、加载编辑数据、错误提示
 * 说明：需要登录（iGM_RequireAuth 守卫）；内容安全以服务端净化为准，
 *       前端仅做长度提示
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, LoaderCircle, PenSquare } from "lucide-react";
import {
  iGM_ApiCreatePost,
  iGM_ApiListCategories,
  type iGM_Category,
} from "../../iGM_Services/iGM_CommunityClient";
import {
  iGM_ApiGetPost,
  iGM_ApiUpdatePost,
} from "../../iGM_Services/iGM_PostClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
/** 标题与正文长度常量，与后端服务保持一致 */
const iGM_TitleMax = 100;
const iGM_ContentMax = 10000;

// 核心逻辑 //
/** 发帖/编辑页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_PostEditPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");
  const isEdit = postId !== null;

  const [categories, setCategories] = useState<iGM_Category[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取分类 */
  useEffect(() => {
    iGM_ApiListCategories()
      .then((response) => setCategories(response.data?.items ?? []))
      .catch(() => undefined);
  }, []);

  /** 编辑模式：拉取原帖并回填（后端同时校验作者身份） */
  const iGM_LoadForEdit = useCallback(async () => {
    if (!postId) return;
    try {
      const response = await iGM_ApiGetPost(postId);
      const post = response.data?.post;
      if (!post) return;
      setTitle(post.title);
      setContent(post.content);
      setCategoryId(post.category?.id ?? "");
      setTags(post.tags.map((tag) => tag.name).join(", "));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [postId, t]);

  useEffect(() => {
    if (isEdit) void iGM_LoadForEdit();
  }, [isEdit, iGM_LoadForEdit]);

  /** 提交：编辑走 PUT，发帖走 POST，成功后跳转帖子详情 */
  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (
      trimmedTitle.length < 1 ||
      trimmedTitle.length > iGM_TitleMax ||
      trimmedContent.length < 1 ||
      trimmedContent.length > iGM_ContentMax
    ) {
      setErrorText(t("community.editor.invalid"));
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const payload = {
        title: trimmedTitle,
        content: trimmedContent,
        categoryId: categoryId || null,
        tags,
      };
      const response = isEdit
        ? await iGM_ApiUpdatePost({ postId: postId as string, ...payload })
        : await iGM_ApiCreatePost(payload);
      const newPostId = response.data?.post.id;
      if (newPostId) {
        router.replace(`/G_Post?postId=${encodeURIComponent(newPostId)}`);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <PenSquare size={22} strokeWidth={1.8} />
          </span>
          {isEdit ? t("community.editor.editTitle") : t("community.editor.createTitle")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {isEdit
            ? t("community.editor.editDescription")
            : t("community.editor.createDescription")}
        </p>
      </header>

      <Link href={isEdit ? `/G_Post?postId=${postId}` : "/G_Community"} className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("community.editor.back")}
      </Link>

      <form className={styles.sectionCard} onSubmit={iGM_HandleSubmit} noValidate>
        {errorText && (
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
        )}

        {/* 标题 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-post-title">
            {t("community.editor.titleLabel")}
          </label>
          <input
            id="igm-post-title"
            className={styles.input}
            type="text"
            value={title}
            maxLength={iGM_TitleMax}
            placeholder={t("community.editor.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <span className={styles.counter}>
            {title.length} / {iGM_TitleMax}
          </span>
        </div>

        {/* 分类 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-post-category">
            {t("community.editor.categoryLabel")}
          </label>
          <select
            id="igm-post-category"
            className={styles.select}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">{t("community.editor.categoryNone")}</option>
            {categories.map((category) => {
              const key = `community.categories.${category.slug}`;
              return (
                <option key={category.id} value={category.id}>
                  {t.has(key) ? t(key) : category.name}
                </option>
              );
            })}
          </select>
        </div>

        {/* 标签 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-post-tags">
            {t("community.editor.tagsLabel")}
          </label>
          <input
            id="igm-post-tags"
            className={styles.input}
            type="text"
            value={tags}
            placeholder={t("community.editor.tagsPlaceholder")}
            onChange={(event) => setTags(event.target.value)}
          />
          <span className={styles.hint}>{t("community.editor.tagsHint")}</span>
        </div>

        {/* 正文 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-post-content">
            {t("community.editor.contentLabel")}
          </label>
          <textarea
            id="igm-post-content"
            className={styles.textarea}
            value={content}
            maxLength={iGM_ContentMax}
            placeholder={t("community.editor.contentPlaceholder")}
            onChange={(event) => setContent(event.target.value)}
            required
          />
          <span className={styles.counter}>
            {content.length} / {iGM_ContentMax}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting && <LoaderCircle size={14} className="igm-spin" />}
            {isEdit ? t("community.editor.save") : t("community.editor.publish")}
          </button>
          <Link
            href={isEdit ? `/G_Post?postId=${postId}` : "/G_Community"}
            className={styles.ghostButton}
          >
            {t("community.editor.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

// 导出 //
export default iGM_PostEditPage;
