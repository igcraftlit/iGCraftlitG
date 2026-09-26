/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PostImageUploader/iGM_PostImageUploader.tsx
 * 所属层：前端 / 通用组件层
 * 路由：被 G_PostEdit 发帖/编辑页使用
 * 模块：iGM_PostImageUploader
 * 作用：帖子多图上传组件（最多 9 张，单张不超过 5MB）
 * 内容：多图选择、粘贴图片（剪贴板截图）、本地预校验（类型/5MB/数量）、
 *       网格预览、删除、拖拽排序、上传中指示
 * 约束：统一经 iGM_FileClient 调用 /G_File/upload（kind=image）；
 *       服务端为权威校验（本人文件/真实图片/数量），前端校验不作为安全边界
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  GripVertical,
  ImagePlus,
  LoaderCircle,
  X,
} from "lucide-react";
import { iGM_ApiUploadFile } from "../../iGM_Services/iGM_FileClient";
import { iGM_FilePreviewUrl } from "../../iGM_Services/iGM_FileClient";
import styles from "./iGM_PostImageUploader.module.css";

// 类型定义 //
/** 待上传（pending）条目：本地预览 + 临时键 */
interface iGM_PendingItem {
  key: string;
  previewUrl: string;
}

interface iGM_PostImageUploaderProps {
  /** 已上传图片文件 ID 有序数组 */
  value: string[];
  /** 数组变化回调（排序/删除/上传成功） */
  onChange: (fileIds: string[]) => void;
  /** 表单提交期间禁用操作 */
  disabled?: boolean;
  /** 上传中状态变化回调：父表单据此阻止提交 */
  onUploadingChange?: (uploading: boolean) => void;
}

/** 最大图片数（与后端一致） */
const iGM_MaxImages = 9;
/** 单张体积上限：5MB */
const iGM_MaxImageSize = 5 * 1024 * 1024;

// 核心逻辑 //
/** 多图上传组件：选择/粘贴 + 预览 + 拖拽排序 + 删除 */
export function iGM_PostImageUploader({
  value,
  onChange,
  disabled = false,
  onUploadingChange,
}: iGM_PostImageUploaderProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCounter = useRef(0);
  /** 拖拽排序的起始下标 */
  const dragIndexRef = useRef<number | null>(null);

  const [pending, setPending] = useState<iGM_PendingItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 上传中状态同步给父表单 */
  useEffect(() => {
    onUploadingChange?.(pending.length > 0);
  }, [pending.length, onUploadingChange]);

  /** 组件卸载释放全部本地预览 blob */
  useEffect(() => {
    return () => {
      setPending((prev) => {
        for (const item of prev) URL.revokeObjectURL(item.previewUrl);
        return [];
      });
    };
  }, []);

  /** 单个文件预校验，失败返回错误文案键 */
  function iGM_ValidateFile(file: File): string | null {
    if (!file.type.startsWith("image/")) return "community.errors.imageInvalid";
    if (file.size <= 0) return "community.errors.imageInvalid";
    if (file.size > iGM_MaxImageSize) return "community.errors.imageInvalid";
    return null;
  }

  /** 处理一批文件：校验数量与类型后逐个上传 */
  const iGM_HandleFiles = useCallback(
    async (files: File[]) => {
      if (disabled || files.length === 0) return;
      setErrorText(null);

      // 数量上限校验：当前 + 待上传占位不得超过 9
      const room = iGM_MaxImages - value.length - pending.length;
      if (room <= 0 || files.length > room) {
        setErrorText(t("community.errors.tooManyImages", { max: iGM_MaxImages }));
        return;
      }

      // 逐文件预校验，任一不合法整体拒绝（避免部分成功造成困惑）
      for (const file of files) {
        const key = iGM_ValidateFile(file);
        if (key) {
          setErrorText(t(key));
          return;
        }
      }

      // 建立 pending 占位（立即在网格中展示），随后顺序上传
      const added: iGM_PendingItem[] = files.map((file) => {
        pendingCounter.current += 1;
        return {
          key: `pending-${pendingCounter.current}`,
          previewUrl: URL.createObjectURL(file),
        };
      });
      setPending((prev) => [...prev, ...added]);

      // 顺序上传：记录成功文件 ID，结束后一次性拼接到当前值
      const succeeded: string[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const item = added[i];
        try {
          const response = await iGM_ApiUploadFile(file, { kind: "image" });
          const uploaded = response.data?.file;
          if (uploaded) succeeded.push(uploaded.id);
        } catch {
          setErrorText(t("community.errors.imagesInvalid"));
        } finally {
          URL.revokeObjectURL(item.previewUrl);
          setPending((prev) => prev.filter((entry) => entry.key !== item.key));
        }
      }
      if (succeeded.length > 0) {
        onChange([...value, ...succeeded].filter(
          (id, idx, arr) => arr.indexOf(id) === idx,
        ));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, value, pending.length, onChange, t],
  );

  /** 文件选择框 */
  function iGM_HandleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void iGM_HandleFiles(files);
  }

  /** 全局粘贴监听：仅处理剪贴板中的图片文件（截图粘贴），文本粘贴不受影响 */
  useEffect(() => {
    function iGM_HandlePaste(event: ClipboardEvent): Promise<void> | void {
      if (disabled) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length > 0) {
        event.preventDefault();
        return iGM_HandleFiles(files);
      }
    }
    window.addEventListener("paste", iGM_HandlePaste);
    return () => window.removeEventListener("paste", iGM_HandlePaste);
  }, [disabled, iGM_HandleFiles]);

  /** 删除已上传图片 */
  function iGM_HandleRemove(index: number): void {
    if (disabled) return;
    onChange(value.filter((_, idx) => idx !== index));
  }

  /* ---------- 拖拽排序（仅已上传图片） ---------- */
  function iGM_HandleDragStart(index: number): void {
    dragIndexRef.current = index;
  }

  function iGM_HandleDragOver(event: DragEvent<HTMLDivElement>, index: number): void {
    event.preventDefault();
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    const next = [...value];
    const from = dragIndexRef.current;
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    dragIndexRef.current = index;
    onChange(next);
  }

  function iGM_HandleDragEnd(): void {
    dragIndexRef.current = null;
  }

  const canAdd = value.length + pending.length < iGM_MaxImages;

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={iGM_HandleInputChange}
      />

      <div className={styles.grid}>
        {/* 已上传图片 */}
        {value.map((fileId, index) => (
          <div
            key={fileId}
            className={styles.tile}
            draggable={!disabled}
            onDragStart={() => iGM_HandleDragStart(index)}
            onDragOver={(event) => iGM_HandleDragOver(event, index)}
            onDragEnd={iGM_HandleDragEnd}
          >
            <img
              src={iGM_FilePreviewUrl(fileId)}
              alt=""
              crossOrigin="anonymous"
              className={styles.tileImage}
            />
            <span className={styles.dragHandle}>
              <GripVertical size={13} strokeWidth={1.8} />
            </span>
            <span className={styles.orderBadge}>{index + 1}</span>
            {!disabled && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => iGM_HandleRemove(index)}
                title={t("file.removeImage")}
                aria-label={t("file.removeImage")}
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        ))}

        {/* 上传中占位 */}
        {pending.map((item) => (
          <div key={item.key} className={styles.tile}>
            <img src={item.previewUrl} alt="" className={styles.tileImage} />
            <span className={styles.uploadingOverlay}>
              <LoaderCircle size={18} className="igm-spin" />
            </span>
          </div>
        ))}

        {/* 添加入口 */}
        {canAdd && (
          <button
            type="button"
            className={styles.addTile}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <ImagePlus size={22} strokeWidth={1.6} />
            <span className={styles.addText}>
              {t("community.editor.addImages")}
            </span>
          </button>
        )}
      </div>

      <span className={styles.hint}>
        {t("community.editor.imagesHint", {
          count: value.length,
          max: iGM_MaxImages,
        })}
      </span>
      {errorText && <span className={styles.errorText}>{errorText}</span>}
    </div>
  );
}

// 导出 //
export default iGM_PostImageUploader;
