/**
 * 文件：apps/web/src/components/iGM_/iGM_LanguageSwitcher.tsx
 * 所属层：前端（客户端组件 / TopBar 控件）
 * 路由：全局
 * 模块：iGM_LanguageSwitcher
 * 作用：语言切换器，支持 zh-CN / zh-TW / en / ja / ru 即时切换
 * 内容：Languages 图标 + 原生 select，写入 NEXT_LOCALE cookie 并由中间件持久化
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { startTransition, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Languages, ChevronDown } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/iGM_Navigation';
import { iGM_Locales, type iGM_Locale } from '@/i18n/iGM_Routing';
import styles from './iGM_LanguageSwitcher.module.css';

// ==================== 区块：核心逻辑 ====================
export function iGM_LanguageSwitcher() {
  const t = useTranslations('iGM_Language');
  const locale = useLocale() as iGM_Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startLocalTransition] = useTransition();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = event.target.value as iGM_Locale;
    if (nextLocale === locale) {
      return;
    }

    // cookie 持久化语言偏好（与 next-intl 中间件使用的 NEXT_LOCALE 同名，有效期 1 年）
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;

    startTransition(() => {
      startLocalTransition(() => {
        // 仅替换当前路径的语言段，保持用户所在页面
        router.replace(pathname, { locale: nextLocale });
      });
    });
  };

  return (
    <div className={styles.switcher}>
      <Languages size={18} strokeWidth={1.75} aria-hidden="true" className={styles.icon} />
      <select
        className={styles.select}
        value={locale}
        onChange={handleChange}
        disabled={isPending}
        aria-label={t('label')}
      >
        {iGM_Locales.map((item) => (
          <option key={item} value={item}>
            {t(item)}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className={styles.caret} />
    </div>
  );
}

// ==================== 区块：导出 ====================
export default iGM_LanguageSwitcher;
