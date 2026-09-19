/**
 * 文件路径：apps/web/src/iGM_Pages/G_ResourceEdit/iGM_ResourceEditPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ResourceEdit（新建）、/G_ResourceEdit?resourceId=xxx（编辑）、
 *       /G_ResourceEdit?activityId=xxx（从活动详情带入关联活动）
 * 模块：G_ResourceEdit
 * 作用：资源上传与编辑表单
 * 内容：标题、描述、分类、标签、资源文件上传、封面上传与清除、
 *       字数计数、校验与提交、编辑数据回填、错误提示
 * 说明：需要登录（iGM_RequireAuth 守卫）；文件先经 /G_File/upload 落库，
 *       再以 fileId 关联资源
 */

// 导入依赖 //
"use client";

import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  LoaderCircle,
  Upload,
} from "lucide-react";
import {
  iGM_ApiCreateResource,
  iGM_ApiGetResource,
  iGM_ApiListResourceCategories,
  iGM_ApiUpdateResource,
  type iGM_ResourceCategory,
  type iGM_ResourcePayload,
} from "../../iGM_Services/iGM_ResourceClient";
import {
  iGM_ApiUploadFile,
  iGM_FormatFileSize,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_ImageUploader as IGM_ImageUploader } from "../../iGM_Components/iGM_ImageUploader/iGM_ImageUploader";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 标题与描述长度上限，与后端服务保持一致 */
const iGM_ResourceTitleMax = 100;
const iGM_ResourceDescriptionMax = 5000;

// 核心逻辑 //
/** 资源上传/编辑页主体（在登录守卫内使用 useSearchParams） */
function iGM_ResourceEditInner() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const resourceId = searchParams.get("resourceId");
  const isEdit = resourceId !== null;
  // 活动详情页「上传活动资源」入口：仅新建时作为关联活动
  const queryActivityId = searchParams.get("activityId");

  const [categories, setCategories] = useState<iGM_ResourceCategory[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [coverFileId, setCoverFileId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(queryActivityId);
  const [fileUploading, setFileUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  /** 拉取资源分类字典 */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiListResourceCategories()
      .then((response) => {
        if (!cancelled) setCategories(response.data?.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** 编辑模式：拉取原资源并回填（后端同时校验上传者身份） */
  const iGM_LoadForEdit = useCallback(async () => {
    if (!resourceId) return;
    try {
      const response = await iGM_ApiGetResource(resourceId);
      const resource = response.data?.resource;
      if (!resource) return;
      setTitle(resource.title);
      setDescription(resource.description);
      setCategoryId(resource.category?.id ?? "");
      setTags(resource.tags.map((tag) => tag.name).join(", "));
      setFileId(resource.file.id);
      setFileName(resource.file.originalName);
      setFileSize(resource.file.size);
      setCoverFileId(resource.cover?.id ?? null);
      // 编辑模式保持资源原有活动关联，不因查询参数改变
      setActivityId(resource.activityId);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    if (isEdit) void iGM_LoadForEdit();
  }, [isEdit, iGM_LoadForEdit]);

  /** 选择并上传资源文件 */
  async function iGM_HandleFileSelect(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileUploading(true);
    setErrorText(null);
    setFileError(null);
    try {
      const response = await iGM_ApiUploadFile(file);
      const uploaded = response.data?.file;
      if (!uploaded) return;
      setFileId(uploaded.id);
      setFileName(uploaded.originalName);
      setFileSize(uploaded.size);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setFileUploading(false);
    }
  }

  /** 提交：新建走 POST，编辑走 PUT，成功后跳转资源详情 */
  async function iGM_HandleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > iGM_ResourceTitleMax) {
      setErrorText(t("resource.errors.titleInvalid"));
      return;
    }
    if (trimmedDescription.length > iGM_ResourceDescriptionMax) {
      setErrorText(t("resource.errors.descriptionInvalid"));
      return;
    }
    if (!fileId) {
      setFileError(t("resource.errors.fileRequired"));
      return;
    }
    setFileError(null);
    setSubmitting(true);
    setErrorText(null);
    try {
      const payload: iGM_ResourcePayload = {
        title: trimmedTitle,
        description: trimmedDescription,
        categoryId: categoryId || null,
        fileId,
        coverFileId,
        activityId,
        tags,
      };
      const response = isEdit
        ? await iGM_ApiUpdateResource({
            resourceId: resourceId as string,
            ...payload,
          })
        : await iGM_ApiCreateResource(payload);
      const newResourceId = response.data?.resource.id;
      if (newResourceId) {
        router.replace(
          `/G_ResourceDetail?resourceId=${encodeURIComponent(newResourceId)}`,
        );
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
        {t("resource.stateLoading")}
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Upload size={22} strokeWidth={1.8} />
          </span>
          {isEdit ? t("resource.edit") : t("resource.upload")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("resource.description")}</p>
      </header>

      <Link href="/G_Resource" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("resource.backToList")}
      </Link>

      <form
        className={`${styles.sectionCard} ${styles.form}`}
        onSubmit={(event) => void iGM_HandleSubmit(event)}
        noValidate
      >
        {errorText && (
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
        )}

        {/* 标题 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-resource-title">
            {t("resource.form.title")}
          </label>
          <input
            id="igm-resource-title"
            className={styles.input}
            type="text"
            value={title}
            maxLength={iGM_ResourceTitleMax}
            placeholder={t("resource.form.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <span className={styles.counter}>
            {title.length} / {iGM_ResourceTitleMax}
          </span>
        </div>

        {/* 描述 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-resource-description">
            {t("resource.form.description")}
          </label>
          <textarea
            id="igm-resource-description"
            className={styles.textarea}
            value={description}
            maxLength={iGM_ResourceDescriptionMax}
            placeholder={t("resource.form.descriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <span className={styles.counter}>
            {description.length} / {iGM_ResourceDescriptionMax}
          </span>
        </div>

        {/* 分类与标签 */}
        <div className={styles.formColumns}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-resource-category">
              {t("resource.form.category")}
            </label>
            <select
              id="igm-resource-category"
              className={styles.select}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{t("resource.form.categoryPlaceholder")}</option>
              {categories.map((category) => {
                const key = `resource.categories.${category.slug}`;
                return (
                  <option key={category.id} value={category.id}>
                    {t.has(key) ? t(key) : category.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-resource-tags">
              {t("resource.form.tags")}
            </label>
            <input
              id="igm-resource-tags"
              className={styles.input}
              type="text"
              value={tags}
              placeholder={t("resource.form.tagsPlaceholder")}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
        </div>

        {/* 资源文件（必填） */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-resource-file">
            {t("resource.form.file")}
          </label>
          <div className={styles.uploadBox}>
            <div className={styles.uploadRow}>
              <input
                id="igm-resource-file"
                type="file"
                className={styles.uploadInput}
                hidden
                onChange={(event) => void iGM_HandleFileSelect(event)}
              />
              <label htmlFor="igm-resource-file" className={styles.primaryButton}>
                {fileUploading ? (
                  <LoaderCircle size={15} className="igm-spin" />
                ) : (
                  <Upload size={15} strokeWidth={1.8} />
                )}
                {t("resource.form.uploadFile")}
              </label>
              {fileId && (
                <span className={styles.uploadedFile}>
                  <span>{fileName}</span>
                  <span className={styles.hint}>
                    {iGM_FormatFileSize(fileSize)}
                  </span>
                </span>
              )}
            </div>
            <span className={styles.hint}>{t("resource.form.fileHint")}</span>
            {fileError && (
              <span className={styles.fieldError}>{fileError}</span>
            )}
          </div>
        </div>

        {/* 封面（可选，图片专用上传组件） */}
        <div className={styles.formRow}>
          <label className={styles.label}>{t("resource.form.cover")}</label>
          <IGM_ImageUploader
            value={coverFileId}
            onChange={setCoverFileId}
            disabled={submitting}
            onUploadingChange={setCoverUploading}
          />
          <span className={styles.hint}>{t("resource.form.coverHint")}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={submitting || fileUploading || coverUploading}
          >
            {submitting && <LoaderCircle size={14} className="igm-spin" />}
            {submitting
              ? t("resource.form.submitting")
              : isEdit
                ? t("resource.form.submitEdit")
                : t("resource.form.submitCreate")}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => router.push("/G_Resource")}
          >
            {t("resource.form.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 资源上传/编辑页（登录守卫包裹） */
export function iGM_ResourceEditPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_ResourceEditInner = iGM_ResourceEditInner;
  return (
    <IGM_RequireAuth>
      <IGM_ResourceEditInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_ResourceEditPage;
