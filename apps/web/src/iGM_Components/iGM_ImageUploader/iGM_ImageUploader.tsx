/**
 * 文件路径：apps/web/src/iGM_Components/iGM_ImageUploader/iGM_ImageUploader.tsx
 * 所属层：前端 / 通用组件层
 * 路由：被 G_ActivityEdit、G_ResourceEdit 封面上传与 G_UserSettings 头像上传复用
 * 模块：iGM_ImageUploader
 * 作用：图片专用上传组件
 * 内容：拖拽上传、点击选择、上传前本地校验（类型/体积）、本地图片即时预览、
 *       上传进度条、上传失败提示、已传图片预览与移除
 * 约束：仅作为交互封装；统一经 iGM_FileClient 调用 /G_File/upload（kind=image），
 *       服务端做权威校验，前端校验不作为安全边界
 * 说明：value 支持两种形态——文件 ID 或图片地址本身（http/https、站内相对路径），
 *       统一经 iGM_ResolveMediaUrl 解析为绝对预览地址
 */

// 导入依赖 //
"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  ImagePlus,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import {
  iGM_ApiUploadFile,
  iGM_ImageAccept,
  iGM_ResolveMediaUrl,
  iGM_ValidateLocalFile,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../iGM_AuthUI/iGM_AuthUI";
import styles from "./iGM_ImageUploader.module.css";

// 类型定义 //
interface iGM_ImageUploaderProps {
  /**
   * 当前图片：文件 ID，或图片地址本身（http/https、站内相对路径）；null 表示未设置
   */
  value: string | null;
  /** 上传成功回传新文件 ID，移除图片时回传 null */
  onChange: (fileId: string | null) => void;
  /** 表单提交期间禁用上传与移除 */
  disabled?: boolean;
  /** 上传中状态变化回调：供父表单在封面上传期间阻止提交 */
  onUploadingChange?: (uploading: boolean) => void;
}

// 核心逻辑 //
/** 图片专用上传组件：拖拽 + 点击选择 + 进度 + 预览 + 移除 */
export function iGM_ImageUploader({
  value,
  onChange,
  disabled = false,
  onUploadingChange,
}: iGM_ImageUploaderProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  // 拖拽事件计数器：拖拽经过子元素时 dragenter/leave 会成对触发，
  // 用深度计数避免高亮状态闪烁
  const dragDepth = useRef(0);

  // 组件卸载或本地预览 URL 替换时释放 blob，避免内存泄漏
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  // 上传中状态同步给父表单，用于阻止封面未传完时提交
  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  /** 选择或拖入图片后的统一处理：本地校验 → 上传 → 回传 fileId */
  async function iGM_HandleFile(file: File | null | undefined): Promise<void> {
    if (!file || uploading || disabled) return;
    setErrorText(null);

    // 上传前本地预校验：类型与体积不符时直接提示，不发请求
    const invalidKey = iGM_ValidateLocalFile(file, { imageOnly: true });
    if (invalidKey) {
      setErrorText(t(invalidKey));
      return;
    }

    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    setProgress(0);
    try {
      const response = await iGM_ApiUploadFile(file, {
        kind: "image",
        onProgress: (loaded, total) => {
          if (total > 0) {
            setProgress(Math.min(100, Math.round((loaded / total) * 100)));
          }
        },
      });
      const uploaded = response.data?.file;
      if (uploaded) {
        onChange(uploaded.id);
        setProgress(100);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setUploading(false);
    }
  }

  /** 点击隐藏文件选择框 */
  function iGM_HandleInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    void iGM_HandleFile(file);
  }

  /** 拖拽进入：仅在包含文件时高亮 */
  function iGM_HandleDragEnter(event: DragEvent<HTMLDivElement>): void {
    if (disabled || uploading) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      setDragging(true);
    }
  }

  /** 拖拽离开：深度归零后取消高亮 */
  function iGM_HandleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  /** 拖拽悬停必须阻止默认行为，否则浏览器会直接打开文件 */
  function iGM_HandleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  /** 松手放下：取第一个文件 */
  function iGM_HandleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    void iGM_HandleFile(file);
  }

  /** 移除已上传图片 */
  function iGM_HandleClear(): void {
    if (disabled || uploading) return;
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    setErrorText(null);
    setProgress(0);
    onChange(null);
  }

  /** 预览地址：统一经 iGM_ResolveMediaUrl 解析（相对路径按 API 域名补全）；无 value 时用本地 blob */
  const previewUrl = value ? iGM_ResolveMediaUrl(value) : localPreview;
  const showPreview = Boolean(previewUrl);
  const busy = uploading || disabled;

  return (
    <div className={styles.wrapper}>
      {/* 单一隐藏文件选择框：拖拽区与「更换图片」按钮共用 */}
      <input
        ref={inputRef}
        type="file"
        accept={iGM_ImageAccept}
        className={styles.hiddenInput}
        hidden
        onChange={iGM_HandleInputChange}
      />

      {/* 已选图片：预览 + 进度遮罩 + 移除按钮 */}
      {showPreview && previewUrl ? (
        <div className={styles.previewCard}>
          <img
            src={previewUrl}
            alt=""
            crossOrigin="anonymous"
            className={styles.previewImage}
          />
          {uploading && (
            <div className={styles.progressOverlay}>
              <LoaderCircle size={18} className="igm-spin" />
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={styles.progressText}>{progress}%</span>
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={iGM_HandleClear}
              disabled={disabled}
              aria-label={t("file.removeImage")}
              title={t("file.removeImage")}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      ) : null}

      {/* 拖拽 / 点击上传区：仅在未设置封面时展示 */}
      {!value && (
        <div
          className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${
            busy ? styles.dropZoneDisabled : ""
          }`}
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if (!busy && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={iGM_HandleDragEnter}
          onDragLeave={iGM_HandleDragLeave}
          onDragOver={iGM_HandleDragOver}
          onDrop={iGM_HandleDrop}
        >
          <span className={styles.dropIcon}>
            {uploading ? (
              <LoaderCircle size={22} className="igm-spin" />
            ) : (
              <UploadCloud size={22} strokeWidth={1.6} />
            )}
          </span>
          <span className={styles.dropText}>
            {uploading ? t("file.uploading") : t("file.dropImage")}
          </span>
          <span className={styles.dropHint}>{t("file.imageHint")}</span>
        </div>
      )}

      {/* 已上传后提供更换入口（上传中禁用） */}
      {value && !uploading && (
        <button
          type="button"
          className={styles.replaceButton}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <ImagePlus size={14} strokeWidth={1.8} />
          {t("file.replaceImage")}
        </button>
      )}

      {errorText && <span className={styles.errorText}>{errorText}</span>}
    </div>
  );
}

// 导出 //
export default iGM_ImageUploader;
