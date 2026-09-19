/**
 * 文件路径：apps/web/src/iGM_Pages/G_FileManager/iGM_FileManagerPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_FileManager（静态壳，查询参数驱动分页）
 * 模块：G_FileManager
 * 作用：个人文件管理——上传文件、查看缩略图、下载、复制链接与删除
 * 内容：页头、拖拽/点选批量上传区（本地校验、逐文件进度、结果汇总）、
 *       文件卡片网格、分页、加载/错误/空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
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
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  Download,
  File as FileIcon,
  FileArchive,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Trash2,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  iGM_ApiDeleteFile,
  iGM_ApiMyFiles,
  iGM_ApiUploadFile,
  iGM_FileAccept,
  iGM_FileDownloadUrl,
  iGM_FilePreviewUrl,
  iGM_FormatFileSize,
  iGM_ValidateLocalFile,
  type iGM_FileItem,
  type iGM_FileListData,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";
import uploaderStyles from "../../iGM_Components/iGM_ImageUploader/iGM_ImageUploader.module.css";

// 类型定义 //
/** 每页文件数 */
const iGM_FilePageSize = 12;

/** 批量上传队列项状态 */
type iGM_QueueStatus = "uploading" | "done" | "error";

/** 上传队列项 */
interface iGM_QueueItem {
  /** 本次会话内唯一键 */
  key: string;
  file: File;
  status: iGM_QueueStatus;
  /** 上传进度 0-100 */
  progress: number;
  /** 失败时的已翻译错误文案 */
  errorText: string | null;
  /** 图片类文件的本地预览地址（blob） */
  localUrl: string | null;
}

// 核心逻辑 //
/** 依据 MIME 与是否为图片选择文件类型图标 */
function iGM_ResolveFileIcon(item: iGM_FileItem): LucideIcon {
  if (item.isImage) return ImageIcon;
  const mime = item.mimeType.toLowerCase();
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("tar") ||
    mime.includes("rar") ||
    mime.includes("7z")
  ) {
    return FileArchive;
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("pdf") ||
    mime.includes("word") ||
    mime.includes("document") ||
    mime.includes("sheet") ||
    mime.includes("presentation") ||
    mime.includes("json") ||
    mime.includes("xml")
  ) {
    return FileText;
  }
  return FileIcon;
}

/** 判断本地文件是否可能为图片（用于上传队列本地缩略图） */
function iGM_LooksLikeImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const lowerName = file.name.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName);
}

/** 个人文件管理页主体（在登录守卫内） */
function iGM_FileManagerInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_FileListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [queue, setQueue] = useState<iGM_QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  // 拖拽深度计数：经过子元素时 enter/leave 成对触发
  const dragDepth = useRef(0);
  // 队列自增键
  const queueSeq = useRef(0);

  // 卸载时释放队列中全部本地预览 URL
  useEffect(() => {
    return () => {
      queue.forEach((item) => {
        if (item.localUrl) URL.revokeObjectURL(item.localUrl);
      });
    };
    // 仅在卸载时执行；queue 取最新值不影响清理语义
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 首屏从查询参数读取页码，保证静态壳可分享链接
  useEffect(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    if (Number.isInteger(raw) && raw > 1) setPage(raw);
  }, [searchParams]);

  /** 拉取当前页文件列表 */
  const iGM_LoadFiles = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiMyFiles(page, iGM_FilePageSize);
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void iGM_LoadFiles();
  }, [iGM_LoadFiles]);

  /**
   * 接收一批本地文件：逐个本地预校验后顺序上传，
   * 每个文件独立展示进度与结果，全部结束后刷新列表并汇总提示
   */
  const iGM_EnqueueFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setErrorText(null);
      setNoticeText(null);

      const items: iGM_QueueItem[] = files.map((file) => {
        const invalidKey = iGM_ValidateLocalFile(file);
        const localUrl = iGM_LooksLikeImage(file)
          ? URL.createObjectURL(file)
          : null;
        return {
          key: `igm-upload-${Date.now()}-${(queueSeq.current += 1)}`,
          file,
          status: invalidKey ? "error" : "uploading",
          progress: 0,
          errorText: invalidKey ? t(invalidKey) : null,
          localUrl,
        };
      });
      setQueue((previous) => [...previous, ...items]);

      let success = 0;
      let failed = 0;

      for (const item of items) {
        // 本地预校验未通过的项直接计失败，不发请求
        if (item.status === "error") {
          failed += 1;
          continue;
        }
        try {
          const response = await iGM_ApiUploadFile(item.file, {
            onProgress: (loaded, total) => {
              const next = total > 0
                ? Math.min(100, Math.round((loaded / total) * 100))
                : 0;
              setQueue((previous) =>
                previous.map((entry) =>
                  entry.key === item.key
                    ? { ...entry, progress: next }
                    : entry,
                ),
              );
            },
          });
          if (response.success) {
            success += 1;
            setQueue((previous) =>
              previous.map((entry) =>
                entry.key === item.key
                  ? { ...entry, status: "done", progress: 100 }
                  : entry,
              ),
            );
          }
        } catch (error) {
          failed += 1;
          setQueue((previous) =>
            previous.map((entry) =>
              entry.key === item.key
                ? {
                    ...entry,
                    status: "error",
                    errorText: iGM_ResolveErrorText(t, error),
                  }
                : entry,
            ),
          );
        }
      }

      // 汇总提示
      if (success > 0 && failed === 0) {
        setNoticeText(t("file.queueSuccess", { count: success }));
      } else if (success > 0) {
        setNoticeText(
          t("file.queuePartial", { success, failed }),
        );
      } else {
        setErrorText(t("file.queueAllFailed", { count: failed }));
      }
      if (success > 0) await iGM_LoadFiles();
    },
    [iGM_LoadFiles, t],
  );

  /** 文件选择框：多选，选中后自动上传 */
  function iGM_HandleSelect(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void iGM_EnqueueFiles(files);
  }

  /** 拖拽进入：含文件类型时高亮 */
  function iGM_HandleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current += 1;
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      setDragging(true);
    }
  }

  function iGM_HandleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function iGM_HandleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function iGM_HandleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    void iGM_EnqueueFiles(files);
  }

  /** 清空已完成的队列记录并释放本地预览 URL */
  function iGM_HandleClearQueue(): void {
    setQueue((previous) => {
      previous.forEach((item) => {
        if (item.localUrl) URL.revokeObjectURL(item.localUrl);
      });
      return [];
    });
  }

  /** 复制下载链接 */
  async function iGM_HandleCopy(fileId: string): Promise<void> {
    setErrorText(null);
    setNoticeText(null);
    try {
      await navigator.clipboard.writeText(iGM_FileDownloadUrl(fileId));
      setNoticeText(t("file.copied"));
    } catch {
      setErrorText(t("file.copyFailed"));
    }
  }

  /** 删除文件（二次确认） */
  async function iGM_HandleDelete(fileId: string): Promise<void> {
    if (!window.confirm(t("file.confirmDelete"))) return;
    setErrorText(null);
    setNoticeText(null);
    try {
      await iGM_ApiDeleteFile(fileId);
      await iGM_LoadFiles();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 缩略图加载失败时回退为图标 */
  function iGM_HandleThumbError(fileId: string): void {
    setFailedThumbs((previous) => ({ ...previous, [fileId]: true }));
  }

  /** 队列中是否仍有上传中的文件 */
  const queueBusy = queue.some((item) => item.status === "uploading");
  /** 队列是否存在可清理的已结束项 */
  const queueSettled = queue.some(
    (item) => item.status === "done" || item.status === "error",
  );

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <FolderOpen size={22} strokeWidth={1.8} />
          </span>
          {t("file.title")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("file.description")}</p>
      </header>

      {/* 操作结果提示 */}
      {noticeText && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>
            <Check size={14} strokeWidth={2} />
          </span>
          {noticeText}
        </div>
      )}
      {errorText && (
        <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
      )}

      {/* 上传区：拖拽或点击，支持多选批量上传 */}
      <div className={styles.sectionCard}>
        <div
          className={`${uploaderStyles.dropZone} ${
            dragging ? uploaderStyles.dropZoneActive : ""
          }`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={iGM_HandleDragEnter}
          onDragLeave={iGM_HandleDragLeave}
          onDragOver={iGM_HandleDragOver}
          onDrop={iGM_HandleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={iGM_FileAccept}
            className={uploaderStyles.hiddenInput}
            hidden
            onChange={iGM_HandleSelect}
          />
          <span className={uploaderStyles.dropIcon}>
            <UploadCloud size={22} strokeWidth={1.6} />
          </span>
          <span className={uploaderStyles.dropText}>{t("file.dropAny")}</span>
          <span className={uploaderStyles.dropHint}>{t("file.uploadHint")}</span>
        </div>

        {/* 批量上传队列：逐文件进度与结果 */}
        {queue.length > 0 && (
          <div className={styles.uploadQueue}>
            {queue.map((item) => (
              <div key={item.key} className={styles.uploadQueueItem}>
                <span className={styles.uploadQueueThumb}>
                  {item.localUrl ? (
                    <img src={item.localUrl} alt="" />
                  ) : item.status === "done" ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : item.status === "error" ? (
                    <X size={14} strokeWidth={2.2} />
                  ) : (
                    <LoaderCircle size={14} className="igm-spin" />
                  )}
                </span>
                <span
                  className={styles.uploadQueueName}
                  title={item.file.name}
                >
                  {item.file.name}
                </span>
                <span className={styles.uploadQueueMeta}>
                  {item.status === "uploading"
                    ? `${item.progress}%`
                    : iGM_FormatFileSize(item.file.size)}
                </span>
                {item.status === "error" && item.errorText && (
                  <span className={styles.uploadQueueError}>
                    {item.errorText}
                  </span>
                )}
                {item.status === "uploading" && (
                  <span className={styles.uploadQueueTrack}>
                    <span
                      className={styles.uploadQueueBar}
                      style={{ width: `${item.progress}%` }}
                    />
                  </span>
                )}
              </div>
            ))}
            {!queueBusy && queueSettled && (
              <button
                type="button"
                className={styles.ghostButton}
                onClick={iGM_HandleClearQueue}
              >
                <X size={14} strokeWidth={1.8} />
                {t("file.clearQueue")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 列表主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("file.stateLoading")}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.fileGrid}>
            {data.items.map((item) => {
              const Icon = iGM_ResolveFileIcon(item);
              const showPreview = item.isImage && !failedThumbs[item.id];
              return (
                <article key={item.id} className={styles.fileCard}>
                  <div className={styles.fileThumb}>
                    {showPreview ? (
                      <img
                        src={iGM_FilePreviewUrl(item.id)}
                        alt={item.originalName}
                        loading="lazy"
                        onError={() => iGM_HandleThumbError(item.id)}
                      />
                    ) : (
                      <div className={styles.fileThumbFallback}>
                        <Icon size={28} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName} title={item.originalName}>
                      {item.originalName}
                    </span>
                    <span className={styles.fileMeta}>
                      {iGM_FormatFileSize(item.size)} ·{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.fileActions}>
                    <a
                      href={iGM_FileDownloadUrl(item.id)}
                      className={styles.ghostButton}
                      download
                    >
                      <Download size={14} strokeWidth={1.8} />
                      {t("file.download")}
                    </a>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => void iGM_HandleCopy(item.id)}
                    >
                      <Link2 size={14} strokeWidth={1.8} />
                      {t("file.copyLink")}
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void iGM_HandleDelete(item.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                      {t("file.delete")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => {
              setPage(nextPage);
              router.replace(
                nextPage > 1
                  ? `/G_FileManager?page=${nextPage}`
                  : "/G_FileManager",
              );
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      ) : data ? (
        <IGM_EmptyState
          icon={FolderOpen}
          title={t("file.empty")}
          description={t("file.emptyDescription")}
        />
      ) : null}
    </div>
  );
}

/** 个人文件管理页（登录守卫包裹） */
export function iGM_FileManagerPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_FileManagerInner = iGM_FileManagerInner;
  return (
    <IGM_RequireAuth>
      <IGM_FileManagerInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_FileManagerPage;
