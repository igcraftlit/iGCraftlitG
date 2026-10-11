/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Examiner_Apply.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Examiner_Apply（/apply）
 * 模块：iGM_ExaminerApplyPage
 * 作用：命题创作者申请页，展示页头文案并挂载可复用的申请表单
 * 内容：页头（眉题 / 标题 / 导语）与 iGM_ExaminerApplyForm 组件
 * 说明：纯静态导出，提交由表单组件客户端完成；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useRouter } from "next/navigation";
import { iGM_ExaminerApplyForm as IGM_ExaminerApplyForm } from "../iGM_Components/iGM_ExaminerApplyForm/iGM_ExaminerApplyForm";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import styles from "./E_Examiner_Apply.module.css";

// 核心逻辑 //
/** 命题创作者申请页 */
export function E_ExaminerApply() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>
          {t("examinerApplyEyebrow")}
        </p>
        <h1 className={`igm-serif ${styles.headTitle}`}>
          {t("examinerApplyTitle")}
        </h1>
        <p className={styles.headLead}>{t("examinerApplyLead")}</p>
      </header>

      {/* 申请表单 */}
      <IGM_ExaminerApplyForm onSubmitted={() => router.push("/status")} />
    </main>
  );
}

// 导出 //
export default E_ExaminerApply;
