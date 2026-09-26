/**
 * 文件路径：apps/web/src/iGM_Pages/G_MinecraftUpload/iGM_MinecraftUploadPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MinecraftUpload（新建）、/G_MinecraftUpload?resourceId=xxx（编辑）
 * 模块：G_MinecraftUpload
 * 作用：Minecraft 资源上传与编辑表单（苦力怕论坛风格）
 * 内容：标题、资源类型（单选）、MC 版本（多选）、加载器（多选）、平台（多选）、
 *       资源文件上传、封面上传、标签、许可、原作者、原帖链接、简介、更新日志
 * 说明：需要登录；文件先经 /G_File/upload 落库再以 fileId 关联；
 *       服务端为权威校验（白名单防伪装、限长），本页仅做客户端预校验
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Blocks,
  FileArchive,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiCreateMinecraft,
  iGM_ApiGetMinecraft,
  iGM_ApiMinecraftOptions,
  iGM_ApiUpdateMinecraft,
  type iGM_MinecraftOptions,
  type iGM_MinecraftPayload,
} from "../../iGM_Services/iGM_MinecraftClient";
import {
  iGM_ApiUploadFile,
  iGM_FileAccept,
  iGM_FormatFileSize,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_ImageUploader as IGM_ImageUploader } from "../../iGM_Components/iGM_ImageUploader/iGM_ImageUploader";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import styles from "../iGM_Minecraft.module.css";

// 类型定义 //
/** 长度上限（与后端一致） */
const iGM_TitleMax = 100;
const iGM_DescriptionMax = 5000;
const iGM_ChangelogMax = 5000;
const iGM_LicenseMax = 100;
const iGM_OriginalAuthorMax = 50;
const iGM_OriginalUrlMax = 300;
const iGM_MaxVersions = 10;

// 核心逻辑 //
/** 资源类型本地化标签 */
function iGM_TypeLabel(t: ReturnType<typeof useTranslations>, value: string): string {
  const key = `minecraft.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 上传/编辑页主体（在登录守卫内使用 useSearchParams） */
function iGM_UploadInner() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const resourceId = searchParams.get("resourceId");
  const isEdit = resourceId !== null;

  const [options, setOptions] = useState<iGM_MinecraftOptions | null>(null);
  const [title, setTitle] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [coverFileId, setCoverFileId] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [license, setLicense] = useState("");
  const [originalAuthor, setOriginalAuthor] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [description, setDescription] = useState("");
  const [changelog, setChangelog] = useState("");

  const [fileUploading, setFileUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 加载表单选项字典 */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiMinecraftOptions()
      .then((response) => {
        if (!cancelled) setOptions(response.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** 编辑模式：回填 */
  const iGM_LoadForEdit = useCallback(async () => {
    if (!resourceId) return;
    try {
      const response = await iGM_ApiGetMinecraft(resourceId);
      const resource = response.data?.resource;
      if (!resource) return;
      setTitle(resource.title);
      setResourceType(resource.resourceType ?? "");
      setMcVersions(resource.mcVersions);
      setLoaders(resource.loaders);
      setPlatforms(resource.platforms);
      setFileId(resource.file.id);
      setFileName(resource.file.originalName);
      setFileSize(resource.file.size);
      setCoverFileId(resource.cover?.id ?? null);
      setTags(resource.tags.map((tag) => tag.name).join(", "));
      setLicense(resource.license ?? "");
      setOriginalAuthor(resource.originalAuthor ?? "");
      setOriginalUrl(resource.originalUrl ?? "");
      setDescription(resource.description);
      setChangelog(resource.changelog ?? "");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    if (isEdit) void iGM_LoadForEdit();
  }, [isEdit, iGM_LoadForEdit]);

  /** 多选切换（版本数量受限） */
  function iGM_ToggleMulti(
    value: string,
    current: string[],
    setter: (next: string[]) => void,
    limit = Infinity,
  ): void {
    if (current.includes(value)) {
      setter(current.filter((item) => item !== value));
    } else if (current.length < limit) {
      setter([...current, value]);
    }
  }

  /** 选择并上传资源文件 */
  async function iGM_HandleFileSelect(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileUploading(true);
    setErrorText(null);
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

  /** 提交前客户端预校验 */
  function iGM_Validate(): string | null {
    if (title.trim().length < 1 || title.length > iGM_TitleMax) {
      return "minecraft.errors.titleInvalid";
    }
    if (!resourceType) return "minecraft.errors.typeRequired";
    if (mcVersions.length === 0) return "minecraft.errors.versionRequired";
    if (platforms.length === 0) return "minecraft.errors.platformRequired";
    if (description.trim().length < 1 || description.length > iGM_DescriptionMax) {
      return "minecraft.errors.descriptionInvalid";
    }
    if (!fileId) return "minecraft.errors.fileRequired";
    if (license.length > iGM_LicenseMax) return "minecraft.errors.licenseInvalid";
    if (originalAuthor.length > iGM_OriginalAuthorMax) {
      return "minecraft.errors.originalAuthorInvalid";
    }
    if (originalUrl.length > iGM_OriginalUrlMax) {
      return "minecraft.errors.originalUrlInvalid";
    }
    if (originalUrl && !/^https?:\/\//i.test(originalUrl.trim())) {
      return "minecraft.errors.originalUrlInvalid";
    }
    if (changelog.length > iGM_ChangelogMax) {
      return "minecraft.errors.changelogInvalid";
    }
    return null;
  }

  /** 提交：新建走 POST，编辑走 PUT */
  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const errorKey = iGM_Validate();
    if (errorKey) {
      setErrorText(t(errorKey));
      return;
    }
    setSubmitting(true);
    setErrorText(null);

    const payload: iGM_MinecraftPayload = {
      title: title.trim(),
      description: description.trim(),
      resourceType,
      mcVersions,
      loaders,
      platforms,
      license: license.trim(),
      originalAuthor: originalAuthor.trim(),
      originalUrl: originalUrl.trim(),
      changelog: changelog.trim(),
      fileId,
      coverFileId,
      tags,
    };

    try {
      const response = isEdit
        ? await iGM_ApiUpdateMinecraft({
            resourceId: resourceId as string,
            ...payload,
          })
        : await iGM_ApiCreateMinecraft(payload);
      const nextId = response.data?.resource.id;
      if (nextId) {
        router.replace(
          `/G_MinecraftDetail?resourceId=${encodeURIComponent(nextId)}`,
        );
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("minecraft.stateLoading")}
      </div>
    );
  }

  const disableForm = submitting || fileUploading || coverUploading;

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Upload size={22} strokeWidth={1.8} />
          </span>
          {isEdit ? t("minecraft.editTitle") : t("minecraft.upload")}
        </h1>
      </header>

      <Link href="/G_Minecraft" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("minecraft.backToList")}
      </Link>

      <form className={styles.formCard} onSubmit={(event) => void iGM_HandleSubmit(event)} noValidate>
        {errorText && <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>}

        {/* 基础信息 */}
        <span className={styles.formSectionTitle}>
          <Blocks size={15} strokeWidth={1.8} />
          {t("minecraft.sectionBasic")}
        </span>

        {/* 标题 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-mc-title">
            {t("minecraft.form.title")}
          </label>
          <input
            id="igm-mc-title"
            className={styles.input}
            type="text"
            value={title}
            maxLength={iGM_TitleMax}
            placeholder={t("minecraft.form.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
          />
          <span className={styles.counter}>{title.length} / {iGM_TitleMax}</span>
        </div>

        {/* 资源类型 */}
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.resourceType")}</span>
          <div className={styles.filterChips}>
            {(options?.resourceTypes ?? []).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.mcChip} ${resourceType === value ? styles.mcChipActive : ""}`}
                onClick={() => setResourceType(value)}
              >
                {iGM_TypeLabel(t, value)}
              </button>
            ))}
          </div>
        </div>

        {/* MC 版本多选 */}
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.mcVersions")}</span>
          <div className={styles.filterChips}>
            {(options?.versionOptions ?? []).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.mcChip} ${mcVersions.includes(value) ? styles.mcChipActive : ""}`}
                onClick={() => iGM_ToggleMulti(value, mcVersions, setMcVersions, iGM_MaxVersions)}
              >
                {value}
              </button>
            ))}
          </div>
          <span className={styles.hint}>
            {t("minecraft.form.versionHint", {
              selected: mcVersions.length,
              max: iGM_MaxVersions,
            })}
          </span>
        </div>

        {/* 加载器与平台 */}
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.loaders")}</span>
          <div className={styles.filterChips}>
            {(options?.loaders ?? []).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.mcChip} ${loaders.includes(value) ? styles.mcChipActive : ""}`}
                onClick={() => iGM_ToggleMulti(value, loaders, setLoaders)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.platforms")}</span>
          <div className={styles.filterChips}>
            {(options?.platforms ?? []).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.mcChip} ${platforms.includes(value) ? styles.mcChipActive : ""}`}
                onClick={() => iGM_ToggleMulti(value, platforms, setPlatforms)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* 文件信息 */}
        <span className={styles.formSectionTitle}>
          <FileArchive size={15} strokeWidth={1.8} />
          {t("minecraft.sectionFiles")}
        </span>

        {/* 资源文件 */}
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.file")}</span>
          <div className={styles.uploadRow}>
            <input
              id="igm-mc-file"
              type="file"
              accept={iGM_FileAccept}
              hidden
              onChange={(event) => void iGM_HandleFileSelect(event)}
            />
            <label htmlFor="igm-mc-file" className={m10.primaryButton}>
              {fileUploading ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <Upload size={15} strokeWidth={1.8} />
              )}
              {t("minecraft.form.uploadFile")}
            </label>
            {fileId && (
              <span className={styles.uploadedFile}>
                <span>{fileName}</span>
                <span className={styles.hint}>{iGM_FormatFileSize(fileSize)}</span>
              </span>
            )}
          </div>
          <span className={styles.hint}>{t("minecraft.form.fileHint")}</span>
        </div>

        {/* 封面 */}
        <div className={styles.formRow}>
          <span className={styles.label}>{t("minecraft.form.cover")}</span>
          <IGM_ImageUploader
            value={coverFileId}
            onChange={setCoverFileId}
            disabled={submitting}
            onUploadingChange={setCoverUploading}
          />
        </div>

        {/* 标签与许可 */}
        <div className={styles.formColumns}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-mc-tags">
              {t("minecraft.form.tags")}
            </label>
            <input
              id="igm-mc-tags"
              className={styles.input}
              type="text"
              value={tags}
              placeholder={t("minecraft.form.tagsPlaceholder")}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-mc-license">
              {t("minecraft.form.license")}
            </label>
            <input
              id="igm-mc-license"
              className={styles.input}
              type="text"
              value={license}
              maxLength={iGM_LicenseMax}
              placeholder={t("minecraft.form.licensePlaceholder")}
              onChange={(event) => setLicense(event.target.value)}
            />
          </div>
        </div>

        {/* 归属信息 */}
        <span className={styles.formSectionTitle}>
          <ArrowLeft size={15} strokeWidth={1.8} style={{ transform: "rotate(90deg)" }} />
          {t("minecraft.sectionCredit")}
        </span>
        <div className={styles.formColumns}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-mc-author">
              {t("minecraft.form.originalAuthor")}
            </label>
            <input
              id="igm-mc-author"
              className={styles.input}
              type="text"
              value={originalAuthor}
              maxLength={iGM_OriginalAuthorMax}
              placeholder={t("minecraft.form.originalAuthorPlaceholder")}
              onChange={(event) => setOriginalAuthor(event.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-mc-url">
              {t("minecraft.form.originalUrl")}
            </label>
            <input
              id="igm-mc-url"
              className={styles.input}
              type="url"
              value={originalUrl}
              maxLength={iGM_OriginalUrlMax}
              placeholder={t("minecraft.form.originalUrlPlaceholder")}
              onChange={(event) => setOriginalUrl(event.target.value)}
            />
          </div>
        </div>

        {/* 简介与更新日志 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-mc-description">
            {t("minecraft.form.description")}
          </label>
          <textarea
            id="igm-mc-description"
            className={styles.textarea}
            value={description}
            maxLength={iGM_DescriptionMax}
            placeholder={t("minecraft.form.descriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <span className={styles.counter}>{description.length} / {iGM_DescriptionMax}</span>
        </div>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-mc-changelog">
            {t("minecraft.form.changelog")}
          </label>
          <textarea
            id="igm-mc-changelog"
            className={styles.textarea}
            value={changelog}
            maxLength={iGM_ChangelogMax}
            placeholder={t("minecraft.form.changelogPlaceholder")}
            onChange={(event) => setChangelog(event.target.value)}
          />
          <span className={styles.counter}>{changelog.length} / {iGM_ChangelogMax}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.formActions}>
          <button type="submit" className={m10.primaryButton} disabled={disableForm}>
            {submitting ? (
              <LoaderCircle size={14} className="igm-spin" />
            ) : isEdit ? (
              t("minecraft.form.submitEdit")
            ) : (
              t("minecraft.form.submitCreate")
            )}
          </button>
          <button
            type="button"
            className={m10.ghostButton}
            onClick={() => router.push("/G_Minecraft")}
          >
            {t("minecraft.form.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 上传/编辑页（登录守卫） */
const IGM_UploadInner = iGM_UploadInner;
export function iGM_MinecraftUploadPage() {
  return (
    <IGM_RequireAuth>
      <IGM_UploadInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_MinecraftUploadPage;
