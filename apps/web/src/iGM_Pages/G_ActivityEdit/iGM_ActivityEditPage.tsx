/**
 * 文件路径：apps/web/src/iGM_Pages/G_ActivityEdit/iGM_ActivityEditPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ActivityEdit（新建）、/G_ActivityEdit?activityId=xxx（编辑）
 * 模块：G_ActivityEdit
 * 作用：活动创建与编辑表单
 * 内容：标题、描述（字数计数）、地点、状态、起止时间、人数上限、封面上传、
 *       前端校验、创建/编辑提交、编辑数据回填、错误提示
 * 说明：需要登录（iGM_RequireAuth 守卫）；纯静态 SSG，数据全部在客户端经
 *       iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, CalendarPlus, LoaderCircle } from "lucide-react";
import {
  iGM_ApiCreateActivity,
  iGM_ApiGetActivity,
  iGM_ApiUpdateActivity,
  type iGM_ActivityPayload,
  type iGM_ActivityStatus,
} from "../../iGM_Services/iGM_ActivityClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_ImageUploader as IGM_ImageUploader } from "../../iGM_Components/iGM_ImageUploader/iGM_ImageUploader";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 描述长度上限，与后端服务保持一致 */
const iGM_DescriptionMax = 5000;

/** 状态选项 */
const iGM_StatusOptions: iGM_ActivityStatus[] = ["draft", "open", "closed"];

/** 表单字段级错误 */
interface iGM_ActivityFormErrors {
  title?: string;
  time?: string;
  max?: string;
}

// 核心逻辑 //
/** 将 ISO 时间串按本地时区转为 datetime-local 需要的 YYYY-MM-DDTHH:mm */
function iGM_ToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 活动创建/编辑页主体（在登录守卫内） */
function iGM_ActivityEditInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityId = searchParams.get("activityId");
  const isEdit = activityId !== null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<iGM_ActivityStatus>("draft");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [coverFileId, setCoverFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<iGM_ActivityFormErrors>({});

  /** 编辑模式：拉取原活动并回填 */
  const iGM_LoadForEdit = useCallback(async () => {
    if (!activityId) return;
    try {
      const response = await iGM_ApiGetActivity(activityId);
      const activity = response.data?.activity;
      if (!activity) return;
      setTitle(activity.title);
      setDescription(activity.description);
      setLocation(activity.location ?? "");
      setStatus(activity.status);
      setStartTime(iGM_ToDateTimeLocal(activity.startTime));
      setEndTime(iGM_ToDateTimeLocal(activity.endTime));
      setMaxParticipants(
        activity.maxParticipants === null
          ? ""
          : String(activity.maxParticipants),
      );
      setCoverFileId(activity.cover?.id ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [activityId, t]);

  useEffect(() => {
    if (isEdit) void iGM_LoadForEdit();
  }, [isEdit, iGM_LoadForEdit]);

  /** 提交：新建走 create，编辑走 edit，成功后跳转活动详情 */
  async function iGM_HandleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const trimmedTitle = title.trim();
    const trimmedMax = maxParticipants.trim();
    const nextErrors: iGM_ActivityFormErrors = {};

    if (trimmedTitle.length < 1) {
      nextErrors.title = t("activity.errors.titleInvalid");
    }
    if (
      startTime &&
      endTime &&
      new Date(endTime).getTime() < new Date(startTime).getTime()
    ) {
      nextErrors.time = t("activity.errors.timeInvalid");
    }
    if (trimmedMax) {
      const maxValue = Number(trimmedMax);
      if (!Number.isInteger(maxValue) || maxValue < 1 || maxValue > 9999) {
        nextErrors.max = t("activity.errors.maxInvalid");
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setErrorText(null);
    try {
      const payload: iGM_ActivityPayload = {
        title: trimmedTitle,
        description: description.trim(),
        coverFileId,
        location: location.trim(),
        startTime: startTime ? new Date(startTime).toISOString() : "",
        endTime: endTime ? new Date(endTime).toISOString() : "",
        status,
        maxParticipants: trimmedMax,
      };
      const response = isEdit
        ? await iGM_ApiUpdateActivity({
            ...payload,
            activityId: activityId as string,
          })
        : await iGM_ApiCreateActivity(payload);
      const savedId = response.data?.activity.id;
      router.push(
        savedId
          ? `/G_ActivityDetail?activityId=${encodeURIComponent(savedId)}`
          : "/G_Activity",
      );
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
            <CalendarPlus size={22} strokeWidth={1.8} />
          </span>
          {isEdit ? t("activity.edit") : t("activity.create")}
        </h1>
      </header>

      <Link href="/G_Activity" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("activity.backToList")}
      </Link>

      <form className={styles.form} onSubmit={iGM_HandleSubmit} noValidate>
        {errorText && (
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
        )}

        {/* 标题 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-activity-title">
            {t("activity.form.title")}
          </label>
          <input
            id="igm-activity-title"
            className={styles.input}
            type="text"
            value={title}
            placeholder={t("activity.form.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          {fieldErrors.title && (
            <span className={styles.fieldError}>{fieldErrors.title}</span>
          )}
        </div>

        {/* 描述 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-activity-description">
            {t("activity.form.description")}
          </label>
          <textarea
            id="igm-activity-description"
            className={styles.textarea}
            value={description}
            maxLength={iGM_DescriptionMax}
            placeholder={t("activity.form.descriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <span className={styles.counter}>
            {description.length} / {iGM_DescriptionMax}
          </span>
        </div>

        {/* 地点与状态 */}
        <div className={styles.formColumns}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-activity-location">
              {t("activity.form.location")}
            </label>
            <input
              id="igm-activity-location"
              className={styles.input}
              type="text"
              value={location}
              placeholder={t("activity.form.locationPlaceholder")}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-activity-status">
              {t("activity.form.status")}
            </label>
            <select
              id="igm-activity-status"
              className={styles.select}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as iGM_ActivityStatus)
              }
            >
              {iGM_StatusOptions.map((item) => (
                <option key={item} value={item}>
                  {t(`activity.statusLabel.${item}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 起止时间 */}
        <div className={styles.formColumns}>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-activity-start">
              {t("activity.form.startTime")}
            </label>
            <input
              id="igm-activity-start"
              className={styles.input}
              type="datetime-local"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.label} htmlFor="igm-activity-end">
              {t("activity.form.endTime")}
            </label>
            <input
              id="igm-activity-end"
              className={styles.input}
              type="datetime-local"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        </div>
        {fieldErrors.time && (
          <span className={styles.fieldError}>{fieldErrors.time}</span>
        )}

        {/* 人数上限 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-activity-max">
            {t("activity.form.maxParticipants")}
          </label>
          <input
            id="igm-activity-max"
            className={styles.input}
            type="number"
            min={1}
            max={9999}
            value={maxParticipants}
            placeholder={t("activity.form.maxParticipantsPlaceholder")}
            onChange={(event) => setMaxParticipants(event.target.value)}
          />
          {fieldErrors.max && (
            <span className={styles.fieldError}>{fieldErrors.max}</span>
          )}
        </div>

        {/* 封面（图片专用上传组件） */}
        <div className={styles.formRow}>
          <label className={styles.label}>{t("activity.form.cover")}</label>
          <IGM_ImageUploader
            value={coverFileId}
            onChange={setCoverFileId}
            disabled={submitting}
            onUploadingChange={setUploading}
          />
          <span className={styles.hint}>{t("activity.form.coverHint")}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={submitting || uploading || !title.trim()}
          >
            {submitting && <LoaderCircle size={14} className="igm-spin" />}
            {submitting
              ? t("activity.form.submitting")
              : isEdit
                ? t("activity.form.submitEdit")
                : t("activity.form.submitCreate")}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => router.push("/G_Activity")}
          >
            {t("activity.form.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 活动创建/编辑页（登录守卫包裹） */
export function iGM_ActivityEditPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_ActivityEditInner = iGM_ActivityEditInner;
  return (
    <IGM_RequireAuth>
      <IGM_ActivityEditInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_ActivityEditPage;
