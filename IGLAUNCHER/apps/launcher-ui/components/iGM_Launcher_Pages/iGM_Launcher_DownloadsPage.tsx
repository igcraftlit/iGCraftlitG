/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_DownloadsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Downloads（SPA 页 id：downloads）
 * 模块：iGM_Launcher_DownloadsPage
 * 作用：下载中心，展示搜索框、分类筛选与热门资源占位
 * 内容：输入与筛选均为静态占位，不发起网络请求，不执行下载
 */

// 导入依赖 //
"use client";

import { Download, Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import styles from "./iGM_Launcher_DownloadsPage.module.css";

// 类型定义 //
interface iGM_Launcher_ResourceSample {
  nameKey: "itemNameA" | "itemNameB" | "itemNameC" | "itemNameD";
  descKey: "itemDescA" | "itemDescB" | "itemDescC" | "itemDescD";
}

const IGM_RESOURCE_SAMPLES: readonly iGM_Launcher_ResourceSample[] = [
  { nameKey: "itemNameA", descKey: "itemDescA" },
  { nameKey: "itemNameB", descKey: "itemDescB" },
  { nameKey: "itemNameC", descKey: "itemDescC" },
  { nameKey: "itemNameD", descKey: "itemDescD" },
];

// 核心逻辑 //
export function iGM_Launcher_DownloadsPage() {
  const t = useTranslations("downloads");

  const categories: string[] = [
    t("categoryAll"),
    t("categoryMods"),
    t("categoryModpacks"),
    t("categoryResourcePacks"),
    t("categoryShaders"),
    t("categoryMaps"),
  ];

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

      {/* 搜索框占位 */}
      <div className={styles.searchBox}>
        <Search size={15} strokeWidth={1.8} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("searchPlaceholder")}
          readOnly
        />
      </div>

      {/* 分类筛选占位 */}
      <div className={styles.categoryRow}>
        {categories.map((category, index) => (
          <button
            type="button"
            key={category}
            className={`${styles.chip} ${index === 0 ? styles.chipActive : ""}`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* 热门资源占位 */}
      <h3 className={styles.sectionTitle}>{t("popular")}</h3>
      <div className={styles.grid}>
        {IGM_RESOURCE_SAMPLES.map((resource) => (
          <IGM_Launcher_Card key={resource.nameKey} className={styles.resourceCard}>
            <div className={styles.resourceIcon}>
              <Package size={20} strokeWidth={1.6} />
            </div>
            <div className={styles.resourceBody}>
              <h4 className={styles.resourceName}>{t(resource.nameKey)}</h4>
              <p className={styles.resourceDesc}>{t(resource.descKey)}</p>
            </div>
            <IGM_Launcher_Button variant="secondary" className={styles.downloadButton}>
              <Download size={14} strokeWidth={1.8} />
              {t("download")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        ))}
      </div>

      <IGM_Launcher_PlaceholderNote>{t("placeholderHint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_DownloadsPage;