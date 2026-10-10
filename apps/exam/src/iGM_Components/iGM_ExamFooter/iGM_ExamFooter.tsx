/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamFooter/iGM_ExamFooter.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_ExamFooter
 * 作用：页脚，模拟学术期刊版权栏（机构名、卷期、版权、返回主站）
 * 内容：机构名、版权年份、版本号、返回 iGCraftLit 主站链接、装饰双线
 */

// 导入依赖 //
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import styles from "./iGM_ExamFooter.module.css";

// 类型定义 //
// （本组件无入参，版本号取自构建期环境变量）

// 核心逻辑 //
/** 页脚 */
export function iGM_ExamFooter() {
  const version = process.env.NEXT_PUBLIC_IGM_EXAM_VERSION ?? "0.1.0";
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <GraduationCap size={16} strokeWidth={1.6} className={styles.mark} />
          <span className={`igm-serif ${styles.name}`}>
            iG&amp;M Educational Examination Institute
          </span>
        </div>

        <div className={styles.metaRow}>
          <span className={`igm-mono ${styles.meta}`}>
            © {year} iGCraftLit Community
          </span>
          <span className={`igm-mono ${styles.meta}`}>V{version}</span>
          <Link href="https://igcraftlit.com" className={`igm-mono ${styles.link}`}>
            igcraftlit.com
          </Link>
        </div>
      </div>
    </footer>
  );
}

// 导出 //
export default iGM_ExamFooter;
