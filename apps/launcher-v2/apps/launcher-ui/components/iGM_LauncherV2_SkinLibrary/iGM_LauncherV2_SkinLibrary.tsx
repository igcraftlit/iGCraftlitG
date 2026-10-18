/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_SkinLibrary/iGM_LauncherV2_SkinLibrary.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（皮肤库页签）
 * 模块：iGM_LauncherV2_SkinLibrary
 * 作用：皮肤库页面（左侧三大分类，中间 Tab 与卡片网格，右侧 3D 预览与操作）
 * 内容：左侧仅保留「皮肤库 / 在线查询 / 我的皮肤」三项；
 *       皮肤库整合内置 100 款合辑与已托管 Mineskin 的皮肤，中部顶部提供
 *       「全部」（按名称 A-Z 排列 100 款）与「精选」（按下载量降序前 50 款）两个 Tab，
 *       默认选中「全部」；在线查询按正版用户名向 Minotar 免密钥取图；
 *       我的皮肤列出用户导入的全部条目；
 *       卡片网格每页 15 项，换页与切换分类/标签先展示 300ms 骨架屏再渲染新页；
 *       卡片图片懒加载，加载失败退化为灰色小人占位；进入页面默认选中首张卡片；
 *       应用策略按账号类型区分：离线账号写入本地皮肤目录并提示需皮肤模组生效，
 *      已绑定正版账号禁用一键应用并改为跳转官网更换；
 *      文案已接入多语言（skin 命名空间，含分类、页签、提示与映射表）
 * 说明：所有特权能力（文件落盘、Mineskin 上传、远程取图）均由外壳主进程执行，
 *       界面只负责选择、预览与投递指令；在线查询与内置数据的纹理统一经外壳转 data URL，
 *       外壳不可用时退回原始地址，保证浏览器预览下仍可渲染
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  ImagePlus,
  Library,
  Loader2,
  Search,
  Shirt,
  Trash2,
  User,
  WandSparkles,
} from "lucide-react";
import {
  iGM_LauncherV2_RequestTexture as IGM_LauncherV2_RequestTexture,
  iGM_LauncherV2_UseMsa as IGM_LauncherV2_UseMsa,
  iGM_LauncherV2_UseOffline as IGM_LauncherV2_UseOffline,
  iGM_LauncherV2_UseSkinLibrary as IGM_LauncherV2_UseSkinLibrary,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_SkinViewer as IGM_LauncherV2_SkinViewer,
} from "@/components/iGM_LauncherV2_SkinViewer/iGM_LauncherV2_SkinViewer";
import {
  IGM_LAUNCHERV2_MINOTAR_HELM,
  IGM_LAUNCHERV2_MINOTAR_SKIN,
  IGM_LAUNCHERV2_SKIN_FEATURED_COUNT,
  IGM_LAUNCHERV2_SKIN_LIST_THUMB_SIZE,
  IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX,
  IGM_LAUNCHERV2_SKIN_PAGE_DEBOUNCE,
  IGM_LAUNCHERV2_SKIN_PAGE_SIZE,
} from "@/lib/iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_SkinEntry,
  iGM_LauncherV2_SkinsDatum,
} from "@/lib/iGM_LauncherV2_Constants";
import { IGM_LAUNCHERV2_SKINS_DATA } from "@/lib/iGM_LauncherV2_SkinsData";
import styles from "./iGM_LauncherV2_SkinLibrary.module.css";

// 类型定义 //

/** 左侧分类 */
type iGM_LauncherV2_SkinCategory = "library" | "online" | "mine";

/** 中部标签（仅「皮肤库」分类下出现） */
type iGM_LauncherV2_SkinTab = "all" | "featured";

/** 分类展示信息 */
interface iGM_LauncherV2_SkinCategoryMeta {
  id: iGM_LauncherV2_SkinCategory;
  label: string;
  desc: string;
  icon: typeof Library;
}

/** 标签展示信息 */
interface iGM_LauncherV2_SkinTabMeta {
  id: iGM_LauncherV2_SkinTab;
  label: string;
}

/** 卡片视图模型：内置数据条目与用户条目的统一展示形态 */
interface iGM_LauncherV2_SkinCard {
  key: string;
  name: string;
  meta: string;
  /** 卡片缩略图地址；为空时直接显示占位图标 */
  imageUrl: string;
  datum?: iGM_LauncherV2_SkinsDatum;
  entry?: iGM_LauncherV2_SkinEntry;
}

/** 当前选中的皮肤（3D 预览与操作对象） */
interface iGM_LauncherV2_SkinSelection {
  /** 3D 预览用皮肤纹理地址（data URL 或原始地址） */
  skinUrl: string;
  /** 展示名称 */
  label: string;
  /** 来源说明 */
  sourceLabel: string;
  model: "classic" | "slim";
  /** 用户条目标识；内置数据与在线查询结果为 undefined */
  entryId?: string;
  /** 内置数据条目标识 */
  datumId?: string;
  /** 远程皮肤地址（应用时由外壳下载写盘） */
  remoteSkinUrl?: string;
  /** 作者（内置数据条目） */
  author?: string;
  /** 下载量（内置数据条目） */
  downloads?: number;
}

// 常量与文案 //

/** 左侧三大分类（label / desc 为 i18n 键，渲染处经 useTranslations 解析） */
const IGM_SKIN_CATEGORIES: iGM_LauncherV2_SkinCategoryMeta[] = [
  {
    id: "library",
    label: "skin.category.library.label",
    desc: "skin.category.library.desc",
    icon: Library,
  },
  {
    id: "online",
    label: "skin.category.online.label",
    desc: "skin.category.online.desc",
    icon: Globe,
  },
  {
    id: "mine",
    label: "skin.category.mine.label",
    desc: "skin.category.mine.desc",
    icon: Shirt,
  },
];

/** 中部标签（label 为 i18n 键） */
const IGM_SKIN_TABS: iGM_LauncherV2_SkinTabMeta[] = [
  { id: "all", label: "skin.tab.all" },
  { id: "featured", label: "skin.tab.featured" },
];

/** 模型展示文案（值为 i18n 键） */
const IGM_SKIN_MODEL_LABEL: Record<"classic" | "slim", string> = {
  classic: "skin.model.classic",
  slim: "skin.model.slim",
};

// 核心逻辑 //

/**
 * 取回纹理：优先经外壳转 data URL，外壳不可用（浏览器预览）时退回原始地址。
 * 在线查询与内置数据的皮肤地址较长，data URL 形式可规避 WebView 内的跨域取图限制。
 */
async function iGM_LauncherV2_SkinTextureOf(url: string): Promise<string> {
  if (!url) return "";
  const result = await IGM_LauncherV2_RequestTexture(url);
  return result.dataUrl || url;
}

/** 组装 Minotar 头像端点（卡片缩略图使用） */
function iGM_LauncherV2_MinotarHelm(name: string, size: number): string {
  return IGM_LAUNCHERV2_MINOTAR_HELM.replace("{query}", encodeURIComponent(name)).replace(
    "{size}",
    String(size),
  );
}

/** 组装 Minotar 原始皮肤端点（应用与 3D 预览使用） */
function iGM_LauncherV2_MinotarSkin(name: string): string {
  return IGM_LAUNCHERV2_MINOTAR_SKIN.replace("{query}", encodeURIComponent(name));
}

/** 皮肤库页：分类、Tab、卡片网格与分页、右侧 3D 预览与应用操作 */
export function iGM_LauncherV2_SkinLibrary() {
  const t = useTranslations();
  const skin = IGM_LauncherV2_UseSkinLibrary();
  const offline = IGM_LauncherV2_UseOffline();
  const msa = IGM_LauncherV2_UseMsa();

  const fileRef = useRef<HTMLInputElement | null>(null);
  /** 选择请求令牌：快速连续切换时只保留最后一次结果 */
  const tokenRef = useRef(0);
  /** 换页 / 切换分类与标签的防抖计时器 */
  const pageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 首次进入是否已完成默认选中 */
  const bootRef = useRef(false);

  const [category, setCategory] = useState<iGM_LauncherV2_SkinCategory>("library");
  const [tab, setTab] = useState<iGM_LauncherV2_SkinTab>("all");
  const [page, setPage] = useState(1);
  /** 换页 / 切换分类与标签的 Loading 状态（先骨架屏，后渲染新一页） */
  const [pending, setPending] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [probing, setProbing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<iGM_LauncherV2_SkinSelection | null>(null);

  const currentOffline = offline.items.find((item) => item.id === offline.currentId) ?? null;
  const premium = msa.state === "logged-in" ? msa.account : null;

  /** 「全部」：内置 100 款按名称 A-Z 升序 */
  const allDatums = useMemo(
    () => [...IGM_LAUNCHERV2_SKINS_DATA].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [],
  );

  /** 「精选」：按下载量降序取前 50 款 */
  const featuredDatums = useMemo(
    () =>
      [...IGM_LAUNCHERV2_SKINS_DATA]
        .sort((a, b) => b.downloads - a.downloads)
        .slice(0, IGM_LAUNCHERV2_SKIN_FEATURED_COUNT),
    [],
  );

  /** 已托管到 Mineskin 的用户条目 */
  const hostedEntries = useMemo(
    () => skin.items.filter((item) => item.source === "mineskin"),
    [skin.items],
  );

  /** 内置数据条目 -> 卡片 */
  const toDatumCards = (datums: iGM_LauncherV2_SkinsDatum[]): iGM_LauncherV2_SkinCard[] =>
    datums.map((datum) => ({
      key: `datum:${datum.id}`,
      name: datum.name,
      meta: `${datum.author} · ${t("common.download")} ${datum.downloads}`,
      imageUrl: iGM_LauncherV2_MinotarHelm(datum.name, IGM_LAUNCHERV2_SKIN_LIST_THUMB_SIZE),
      datum,
    }));

  /** 用户条目 -> 卡片 */
  const toEntryCards = (entries: iGM_LauncherV2_SkinEntry[]): iGM_LauncherV2_SkinCard[] =>
    entries.map((entry) => ({
      key: `entry:${entry.id}`,
      name: entry.name,
      meta: `${entry.source === "mineskin" ? "Mineskin" : t("skin.source.local")} · ${t(IGM_SKIN_MODEL_LABEL[entry.model])}`,
      imageUrl: entry.remoteUrl,
      entry,
    }));

  /**
   * 当前分类对应的卡片集合。
   * 皮肤库 = 内置合辑（按标签排序） + 已托管 Mineskin 的皮肤；
   * 我的皮肤 = 用户导入的全部条目；在线查询无网格。
   */
  const cards = useMemo<iGM_LauncherV2_SkinCard[]>(() => {
    if (category === "library") {
      const datums = tab === "featured" ? featuredDatums : allDatums;
      return [...toDatumCards(datums), ...toEntryCards(hostedEntries)];
    }
    if (category === "mine") return toEntryCards(skin.items);
    return [];
    // toDatumCards / toEntryCards 为纯映射函数，依赖项已完整列出
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, tab, allDatums, featuredDatums, hostedEntries, skin.items]);

  const totalPages = Math.max(1, Math.ceil(cards.length / IGM_LAUNCHERV2_SKIN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageCards = cards.slice(
    (safePage - 1) * IGM_LAUNCHERV2_SKIN_PAGE_SIZE,
    safePage * IGM_LAUNCHERV2_SKIN_PAGE_SIZE,
  );
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const onlineCategory = category === "online";

  /** 生效一次换页 / 切换分类与标签：先置 Loading，再于防抖时长后渲染新内容 */
  const scheduleChange = (apply: () => void) => {
    setPending(true);
    if (pageTimerRef.current) clearTimeout(pageTimerRef.current);
    pageTimerRef.current = setTimeout(() => {
      pageTimerRef.current = null;
      apply();
      setPending(false);
    }, IGM_LAUNCHERV2_SKIN_PAGE_DEBOUNCE);
  };

  /** 切换左侧分类：重置到第一页 */
  const switchCategory = (next: iGM_LauncherV2_SkinCategory) => {
    if (next === category) return;
    setNotice("");
    scheduleChange(() => {
      setCategory(next);
      setPage(1);
    });
  };

  /** 切换中部标签：重置到第一页 */
  const switchTab = (next: iGM_LauncherV2_SkinTab) => {
    if (next === tab) return;
    scheduleChange(() => {
      setTab(next);
      setPage(1);
    });
  };

  /** 换页 */
  const goPage = (next: number) => {
    if (next < 1 || next > totalPages || next === safePage) return;
    scheduleChange(() => setPage(next));
  };

  // 卸载时清理未触发的防抖计时器
  useEffect(
    () => () => {
      if (pageTimerRef.current) clearTimeout(pageTimerRef.current);
    },
    [],
  );

  /** 选中内置数据条目：读取纹理后填入预览 */
  const selectDatum = async (datum: iGM_LauncherV2_SkinsDatum) => {
    const token = ++tokenRef.current;
    const texture = await iGM_LauncherV2_SkinTextureOf(datum.skinUrl);
    if (token !== tokenRef.current) return;
    setNotice(texture ? "" : t("skin.notice.datumTextureFailed"));
    setSelected({
      skinUrl: texture,
      label: datum.name,
      sourceLabel: t("skin.source.minotarBuiltin"),
      model: datum.type,
      datumId: datum.id,
      remoteSkinUrl: datum.skinUrl,
      author: datum.author,
      downloads: datum.downloads,
    });
  };

  /** 选中用户条目：读取纹理后填入预览 */
  const selectEntry = async (entry: iGM_LauncherV2_SkinEntry) => {
    const token = ++tokenRef.current;
    const textureUrl = entry.remoteUrl || `${IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX}${entry.id}`;
    const texture = await iGM_LauncherV2_SkinTextureOf(textureUrl);
    if (token !== tokenRef.current) return;
    setNotice(texture ? "" : t("skin.notice.entryTextureFailed"));
    setSelected({
      skinUrl: texture,
      label: entry.name,
      sourceLabel: entry.source === "mineskin" ? t("skin.source.mineskin") : t("skin.source.localImport"),
      model: entry.model,
      entryId: entry.id,
    });
  };

  /** 卡片点击：按卡片类型分派到对应选中逻辑 */
  const selectCard = async (card: iGM_LauncherV2_SkinCard) => {
    if (card.datum) await selectDatum(card.datum);
    else if (card.entry) await selectEntry(card.entry);
  };

  /** 在线查询：按正版用户名向 Minotar 取原始皮肤纹理 */
  const runProbe = async () => {
    const value = query.trim();
    if (!value) return;

    const skinUrl = iGM_LauncherV2_MinotarSkin(value);

    const token = ++tokenRef.current;
    setProbing(true);
    const texture = await iGM_LauncherV2_SkinTextureOf(skinUrl);
    if (token !== tokenRef.current) return;

    setProbing(false);
    setNotice(texture ? "" : t("skin.notice.probeFailed"));
    setSelected({
      skinUrl: texture,
      label: value,
      sourceLabel: t("skin.source.minotarOnline"),
      model: "classic",
      remoteSkinUrl: skinUrl,
    });
  };

  /** 本地导入：先以本地图片渲染预览，再交由外壳上传 Mineskin 换取永久地址 */
  const handleFile = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

    if (!dataUrl || !dataUrl.includes(",")) {
      setNotice(t("skin.notice.fileReadFailed"));
      return;
    }

    const label = file.name.replace(/\.png$/i, "").trim() || t("skin.localSkinName");
    tokenRef.current += 1;
    setNotice("");
    setSelected({
      skinUrl: dataUrl,
      label,
      sourceLabel: t("skin.source.localPreviewUploading"),
      model: "classic",
    });
    skin.import(label, dataUrl.slice(dataUrl.indexOf(",") + 1));
  };

  /** 一键应用：仅离线账号可用；正版账号由官网更换，不作本地应用 */
  const handleApply = () => {
    if (!selected || premium) return;
    if (selected.entryId) {
      skin.apply({ id: selected.entryId });
      return;
    }
    if (selected.remoteSkinUrl) skin.apply({ skinUrl: selected.remoteSkinUrl });
  };

  /** 应用能力判定：需存在选中皮肤与当前离线账号 */
  const canApply = Boolean(selected && (selected.entryId || selected.remoteSkinUrl) && currentOffline);

  // 进入页面默认选中「全部」首张卡片，右侧自动加载 3D 模型
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const first = allDatums[0];
    if (first) void selectDatum(first);
    // 仅在首次挂载执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCategoryLabel =
    IGM_SKIN_CATEGORIES.find((item) => item.id === category)?.label ?? "";

  return (
    <section className={styles.screen}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t("skin.library.title")}</h1>
          <p className={styles.desc}>{t("skin.library.desc")}</p>
        </div>
        <button type="button" className={styles.actionButton} onClick={() => fileRef.current?.click()}>
          <ImagePlus size={14} strokeWidth={2.2} />
          <span>{t("skin.library.pickLocalImage")}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 立即清空，保证同一文件重复选择也能触发变更事件
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </header>

      {notice || skin.message ? (
        <p className={styles.notice}>{notice || skin.message}</p>
      ) : null}

      <div className={styles.layout}>
        {/* 左栏：三大分类 */}
        <IGM_LauncherV2_Card className={styles.sideCard}>
          <div className={styles.categoryList}>
            {IGM_SKIN_CATEGORIES.map((item) => {
              const Icon = item.icon;
              const on = item.id === category;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.category} ${on ? styles.categoryOn : ""}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => switchCategory(item.id)}
                >
                  <Icon size={15} strokeWidth={2.2} />
                  <span className={styles.categoryText}>
                    <span className={styles.categoryLabel}>{t(item.label)}</span>
                    <span className={styles.categoryDesc}>{t(item.desc)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </IGM_LauncherV2_Card>

        {/* 中栏：标签、卡片网格与分页 */}
        <IGM_LauncherV2_Card className={styles.gridCard}>
          {category === "library" ? (
            <div className={styles.tabs} role="tablist">
              {IGM_SKIN_TABS.map((item) => {
                const on = item.id === tab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={`${styles.tab} ${on ? styles.tabOn : ""}`}
                    onClick={() => switchTab(item.id)}
                  >
                    {t(item.label)}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.gridHead}>
            <span className={styles.gridTitle}>
              {category === "library"
                ? `${t(activeCategoryLabel)} · ${t(tab === "featured" ? "skin.tab.featured" : "skin.tab.all")}`
                : t(activeCategoryLabel)}
            </span>
            <span className={styles.gridCount}>
              {onlineCategory
                ? t("skin.gridCount.online")
                : t("skin.gridCount.pages", { count: cards.length, page: safePage, totalPages })}
            </span>
          </div>

          {category === "mine" && !pending && cards.length === 0 ? (
            <p className={styles.empty}>
              {t("skin.empty.mine")}
            </p>
          ) : null}

          {!onlineCategory && (pending || cards.length > 0) ? (
            <>
              <div className={styles.grid}>
                {pending
                  ? Array.from({ length: IGM_LAUNCHERV2_SKIN_PAGE_SIZE }, (_, index) => (
                      <span key={`skeleton-${index}`} className={styles.skeleton} />
                    ))
                  : pageCards.map((card) => {
                      const on = card.entry
                        ? selected?.entryId === card.entry.id
                        : selected?.datumId === card.datum?.id;
                      const failed = broken[card.key] || !card.imageUrl;
                      return (
                        <div key={card.key} className={`${styles.card} ${on ? styles.cardOn : ""}`}>
                          <button
                            type="button"
                            className={styles.cardMain}
                            onClick={() => void selectCard(card)}
                          >
                            <span className={styles.cardThumb}>
                              {failed ? (
                                card.entry ? (
                                  <Shirt size={20} strokeWidth={1.9} aria-label={t("skin.aria.localOnlySkin")} />
                                ) : (
                                  <User size={20} strokeWidth={1.9} aria-label={t("skin.aria.previewUnavailable")} />
                                )
                              ) : (
                                <Image
                                  src={card.imageUrl}
                                  alt={t("skin.aria.cardPreview", { name: card.name })}
                                  width={IGM_LAUNCHERV2_SKIN_LIST_THUMB_SIZE}
                                  height={IGM_LAUNCHERV2_SKIN_LIST_THUMB_SIZE}
                                  unoptimized
                                  loading="lazy"
                                  className={styles.cardThumbImage}
                                  onError={() =>
                                    setBroken((prev) => ({ ...prev, [card.key]: true }))
                                  }
                                />
                              )}
                            </span>
                            <span className={styles.cardName}>{card.name}</span>
                            <span className={styles.cardMeta}>{card.meta}</span>
                          </button>
                          {card.entry ? (
                            <button
                              type="button"
                              className={styles.cardRemove}
                              aria-label={t("skin.aria.removeSkin", { name: card.name })}
                              onClick={() => skin.remove(card.entry!.id)}
                            >
                              <Trash2 size={13} strokeWidth={2.2} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
              </div>

              {totalPages > 1 ? (
                <div className={styles.pager}>
                  <button
                    type="button"
                    className={styles.pageButton}
                    disabled={pending || safePage <= 1}
                    onClick={() => goPage(safePage - 1)}
                  >
                    <ChevronLeft size={14} strokeWidth={2.2} />
                    <span>{t("skin.pager.prev")}</span>
                  </button>
                  {pageNumbers.map((number) => (
                    <button
                      key={number}
                      type="button"
                      className={`${styles.pageNumber} ${number === safePage ? styles.pageOn : ""}`}
                      disabled={pending}
                      aria-current={number === safePage ? "page" : undefined}
                      onClick={() => goPage(number)}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.pageButton}
                    disabled={pending || safePage >= totalPages}
                    onClick={() => goPage(safePage + 1)}
                  >
                    <span>{t("skin.pager.next")}</span>
                    <ChevronRight size={14} strokeWidth={2.2} />
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {onlineCategory ? (
            <div className={styles.probeBox}>
              <div className={styles.probeRow}>
                <input
                  className={styles.input}
                  value={query}
                  placeholder={t("skin.probe.placeholder")}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runProbe();
                  }}
                />
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={probing || !query.trim()}
                  onClick={() => void runProbe()}
                >
                  {probing ? (
                    <Loader2 size={14} strokeWidth={2.2} className={styles.spin} />
                  ) : (
                    <Search size={14} strokeWidth={2.2} />
                  )}
                  <span>{probing ? t("skin.probe.loading") : t("skin.probe.action")}</span>
                </button>
              </div>
              <p className={styles.probeHint}>
                {t("skin.probe.hint")}
              </p>
            </div>
          ) : null}
        </IGM_LauncherV2_Card>

        {/* 右栏：3D 预览与操作 */}
        <IGM_LauncherV2_Card className={styles.previewCard}>
          <div className={styles.previewStage}>
            <IGM_LauncherV2_SkinViewer
              skinUrl={selected?.skinUrl ?? ""}
              model={selected?.model ?? "classic"}
              autoRotate
              emptyHint={
                onlineCategory ? t("skin.viewerEmpty.online") : t("skin.viewerEmpty.library")
              }
            />
          </div>

          <div className={styles.detail}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("skin.detail.name")}</span>
              <span className={styles.detailValue}>{selected?.label ?? "-"}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("skin.detail.model")}</span>
              <span className={styles.detailValue}>
                {selected ? t(IGM_SKIN_MODEL_LABEL[selected.model]) : "-"}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("skin.detail.source")}</span>
              <span className={styles.detailValue}>{selected?.sourceLabel ?? "-"}</span>
            </div>
            {selected?.author ? (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("skin.detail.author")}</span>
                <span className={styles.detailValue}>{selected.author}</span>
              </div>
            ) : null}
            {selected?.downloads !== undefined ? (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("skin.detail.downloads")}</span>
                <span className={styles.detailValue}>{selected.downloads}</span>
              </div>
            ) : null}
          </div>

          <div className={styles.applyBox}>
            {premium ? (
              <>
                <p className={styles.applyHint}>
                  {t("skin.apply.premiumHint", { name: premium.name })}
                </p>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => msa.openOfficial()}
                >
                  <ExternalLink size={14} strokeWidth={2.2} />
                  <span>{t("skin.apply.openOfficial")}</span>
                </button>
              </>
            ) : (
              <>
                <p className={styles.applyHint}>
                  {currentOffline
                    ? t("skin.apply.offlineHint", { name: currentOffline.name })
                    : t("skin.apply.noOfflineHint")}
                </p>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  <WandSparkles size={14} strokeWidth={2.2} />
                  <span>{t("skin.apply.action")}</span>
                </button>
              </>
            )}
          </div>
        </IGM_LauncherV2_Card>
      </div>
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_SkinLibrary;
