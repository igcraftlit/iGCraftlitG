/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_InstanceEditPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Instances_Edit（SPA 页 id：instancesEdit）
 * 模块：iGM_Launcher_InstanceEditPage
 * 作用：新建与编辑实例的表单页，覆盖基础信息、版本加载器、共享根目录与启动参数
 * 内容：由路由参数 instanceId 决定编辑既有实例还是新建；
 *       游戏版本与加载器只能从共享根目录已安装的列表中选取，未安装项灰显并提供
 *       「前往下载 / 前往安装」入口；根目录优先使用已存在者且可更换，更换后重新扫描；
 *       实例名按 <版本>-<加载器> 自动建议，并即时校验非空、字符合法与重名；
 *       实例 gameDir 自动生成为 <根目录>/instances/<实例名> 并实时预览；
 *       模块二十一新增「已安装资源」面板：编辑既有实例时展示该实例下玩家
 *       已放入的模组、光影、材质包与数据包（仅启动器端可见）；
 *       保存经状态中心写入本地实例数据文件，取消返回实例列表
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Download, FolderOpen, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_INSTANCE_ICONS,
  IGM_LAUNCHER_INSTANCE_VERSION_OPTION_LIMIT,
  IGM_LAUNCHER_LOADER_OPTIONS,
  iGM_Launcher_BuildGameDir,
  iGM_Launcher_McParentOfRoot,
  iGM_Launcher_McRootOfParent,
  iGM_Launcher_SuggestInstanceName,
  type iGM_Launcher_InstanceIconId,
  type iGM_Launcher_InstanceInput,
  type iGM_Launcher_LoaderType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Field as IGM_Launcher_Field,
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
  iGM_Launcher_Textarea as IGM_Launcher_Textarea,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_InstanceIcon } from "@/components/iGM_Launcher_Instance/iGM_Launcher_InstanceIcons";
import { iGM_Launcher_InstanceResourcesPanel as IGM_Launcher_InstanceResourcesPanel } from "@/components/iGM_Launcher_Instance/iGM_Launcher_InstanceResourcesPanel";
import {
  iGM_Launcher_NewInstanceInput,
  iGM_Launcher_UseStore,
} from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_InstanceEditPage.module.css";

// 类型定义 //
interface iGM_Launcher_EditSectionProps {
  title: string;
  children: React.ReactNode;
}

// 核心逻辑 //
/** 表单分组卡片 */
function IGM_Launcher_EditSection({ title, children }: iGM_Launcher_EditSectionProps) {
  return (
    <IGM_Launcher_Card className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </IGM_Launcher_Card>
  );
}

export function iGM_Launcher_InstanceEditPage({ params }: iGM_Launcher_PageProps) {
  const t = useTranslations("instanceEdit");
  const tCommon = useTranslations("common");
  // 已安装资源面板文案（模组 / 光影 / 材质包 / 数据包分组）
  const tRes = useTranslations("instanceRes");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    instances,
    createInstance,
    updateInstance,
    javas,
    defaultJavaId,
    versionLibrary,
    rootDir,
    installedVersions,
    installedLoaders,
    scanningInstalled,
    applyRootDir,
    pickDir,
    validateInstanceName,
  } = iGM_Launcher_UseStore();

  const instanceId = params?.instanceId;
  const editing = useMemo(
    () => (instanceId ? instances.find((item) => item.id === instanceId) : undefined),
    [instanceId, instances],
  );

  const [form, setForm] = useState<iGM_Launcher_InstanceInput>(iGM_Launcher_NewInstanceInput());
  // 根目录输入草稿：默认取生效根目录，用户可更换
  const [draftRoot, setDraftRoot] = useState("");
  // 实例名是否被用户手动编辑过：未编辑时跟随版本 / 加载器的建议名称
  const nameTouched = useRef(false);

  // 进入页面或目标实例变化时同步表单初值
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        icon: editing.icon,
        note: editing.note,
        minecraftVersion: editing.minecraftVersion,
        loader: editing.loader,
        loaderVersion: editing.loaderVersion,
        directory: editing.directory,
        javaId: editing.javaId,
        maxMemoryMb: editing.maxMemoryMb,
        minMemoryMb: editing.minMemoryMb,
        windowWidth: editing.windowWidth,
        windowHeight: editing.windowHeight,
        jvmArgs: editing.jvmArgs,
        gameArgs: editing.gameArgs,
      });
      nameTouched.current = true;
    } else {
      setForm(iGM_Launcher_NewInstanceInput());
      nameTouched.current = false;
    }
  }, [editing]);

  // 生效根目录反推为前置目录回填，用户看到的是可编辑的上层目录而非固定的 .minecraft
  useEffect(() => {
    setDraftRoot(iGM_Launcher_McParentOfRoot(rootDir?.path ?? ""));
  }, [rootDir?.path]);

  const patch = (next: Partial<iGM_Launcher_InstanceInput>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  /* ---------- 版本与加载器：只从已安装列表中选择 ---------- */

  /** 已安装版本号（去重，按版本号倒序） */
  const installedVersionValues = useMemo(() => {
    const unique = new Set(installedVersions.map((item) => item.version));
    return Array.from(unique).sort((a, b) => b.localeCompare(a, "en"));
  }, [installedVersions]);

  const installedVersionSet = useMemo(
    () => new Set(installedVersionValues.map((item) => item.toLowerCase())),
    [installedVersionValues],
  );

  /** 未安装版本（来自版本库，灰显禁用，限制条数避免下拉过长） */
  const pendingVersions = useMemo(() => {
    const pending = versionLibrary.entries
      .filter((item) => !installedVersionSet.has(item.version.toLowerCase()))
      .sort((a, b) => b.version.localeCompare(a.version, "en"));
    return pending.slice(0, IGM_LAUNCHER_INSTANCE_VERSION_OPTION_LIMIT);
  }, [versionLibrary.entries, installedVersionSet]);

  /** 编辑既有实例时，其版本可能已不在扫描结果中，单独保留为可选项避免丢值 */
  const currentVersionMissing =
    form.minecraftVersion.length > 0 && !installedVersionSet.has(form.minecraftVersion.toLowerCase());

  const installedLoaderSet = useMemo(
    () => new Set(installedLoaders.map((item) => item.loader)),
    [installedLoaders],
  );

  const loaderInstalled = (loader: iGM_Launcher_LoaderType): boolean =>
    loader === "vanilla" || installedLoaderSet.has(loader) || loader === form.loader;

  const currentLoaderOption = IGM_LAUNCHER_LOADER_OPTIONS.find(
    (option) => option.value === form.loader,
  );

  /** 加载器版本候选：取该加载器已安装的加载器版本，并保留编辑中的既有值 */
  const loaderVersions = useMemo(() => {
    if (form.loader === "vanilla") return [];
    const installed = installedLoaders.find((item) => item.loader === form.loader);
    const values = installed ? [...installed.loaderVersions] : [];
    if (form.loaderVersion && !values.includes(form.loaderVersion)) {
      values.unshift(form.loaderVersion);
    }
    return values;
  }, [form.loader, form.loaderVersion, installedLoaders]);

  const suggestions = iGM_Launcher_SuggestInstanceName(form.minecraftVersion, form.loader);

  const handleLoaderChange = (loader: iGM_Launcher_LoaderType) => {
    // 切换加载器时重置加载器版本，避免残留不匹配的版本号
    const installed = installedLoaders.find((item) => item.loader === loader);
    const nextLoaderVersion = installed?.loaderVersions[0] ?? "";
    patch({ loader, loaderVersion: nextLoaderVersion });
    if (!nameTouched.current) {
      patch({ name: iGM_Launcher_SuggestInstanceName(form.minecraftVersion, loader) });
    }
  };

  const handleVersionChange = (version: string) => {
    patch({ minecraftVersion: version });
    if (!nameTouched.current) {
      patch({ name: iGM_Launcher_SuggestInstanceName(version, form.loader) });
    }
  };

  /* ---------- 共享根目录与实例目录 ---------- */

  // 输入框填写「前置目录」：按目录规则解析后即共享 .minecraft 根，预览与桥接层保持一致
  const previewRoot = draftRoot.trim() ? iGM_Launcher_McRootOfParent(draftRoot) : "";
  const effectiveRoot = previewRoot || rootDir?.path || "";
  const effectiveName = form.name.trim();

  /** 实例 gameDir 预览：与桥接层的生成规则一致 */
  const gameDirPreview =
    effectiveRoot && effectiveName
      ? iGM_Launcher_BuildGameDir(effectiveRoot, effectiveName)
      : t("gameDirPending");

  const rootChanged = previewRoot.length > 0 && previewRoot !== (rootDir?.path ?? "");

  /* ---------- 校验与保存 ---------- */

  const nameCheck = validateInstanceName(form.name, editing?.name);
  const nameMessage = nameCheck.valid
    ? ""
    : nameCheck.reason === "empty"
      ? t("nameRequired")
      : nameCheck.reason === "duplicate"
        ? t("nameDuplicate")
        : t("nameInvalid");

  const handleSave = async () => {
    if (!nameCheck.valid) return;
    const payload: iGM_Launcher_InstanceInput = { ...form, name: form.name.trim() };
    if (editing) {
      const ok = await updateInstance(editing.id, payload);
      if (ok) navigate("instances");
      return;
    }
    const created = await createInstance(payload, effectiveRoot || undefined);
    if (created) navigate("instances");
  };

  // 编辑模式下实例已被删除
  if (instanceId && !editing) {
    return (
      <div className={styles.page}>
        <IGM_Launcher_PageHeader title={t("titleEdit")} description={t("notFound")} />
        <IGM_Launcher_Button variant="secondary" onClick={() => navigate("instances")}>
          <ArrowLeft size={15} strokeWidth={1.8} />
          {t("back")}
        </IGM_Launcher_Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={editing ? t("titleEdit") : t("titleNew")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("instances")}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("back")}
          </IGM_Launcher_Button>
        }
      />

      {/* 基础信息 */}
      <IGM_Launcher_EditSection title={t("groupBasic")}>
        <IGM_Launcher_Field
          label={t("name")}
          hint={suggestions ? t("nameSuggest", { name: suggestions }) : undefined}
          htmlFor="iGM_Launcher_InstanceName"
        >
          <IGM_Launcher_Input
            id="iGM_Launcher_InstanceName"
            value={form.name}
            placeholder={t("namePlaceholder")}
            onChange={(event) => {
              nameTouched.current = true;
              patch({ name: event.target.value });
            }}
          />
        </IGM_Launcher_Field>

        <IGM_Launcher_Field label={t("icon")}>
          <div className={styles.iconPicker}>
            {IGM_LAUNCHER_INSTANCE_ICONS.map((iconId: iGM_Launcher_InstanceIconId) => {
              const Icon = iGM_Launcher_InstanceIcon(iconId);
              return (
                <button
                  type="button"
                  key={iconId}
                  className={`${styles.iconOption} ${
                    form.icon === iconId ? styles.iconOptionActive : ""
                  }`}
                  aria-pressed={form.icon === iconId}
                  title={iconId}
                  onClick={() => patch({ icon: iconId })}
                >
                  <Icon size={18} strokeWidth={1.6} />
                </button>
              );
            })}
          </div>
        </IGM_Launcher_Field>

        <IGM_Launcher_Field label={t("note")} htmlFor="iGM_Launcher_InstanceNote">
          <IGM_Launcher_Textarea
            id="iGM_Launcher_InstanceNote"
            rows={2}
            value={form.note}
            placeholder={t("notePlaceholder")}
            onChange={(event) => patch({ note: event.target.value })}
          />
        </IGM_Launcher_Field>
      </IGM_Launcher_EditSection>

      {/* 版本与加载器：仅已安装项可选 */}
      <IGM_Launcher_EditSection title={t("groupVersion")}>
        <div className={styles.grid2}>
          <IGM_Launcher_Field label={t("minecraftVersion")} hint={t("versionHint")}>
            <IGM_Launcher_Select
              value={form.minecraftVersion}
              onChange={(event) => handleVersionChange(event.target.value)}
            >
              {currentVersionMissing ? (
                <option value={form.minecraftVersion}>
                  {form.minecraftVersion} · {t("notInstalled")}
                </option>
              ) : null}
              <optgroup label={t("versionInstalledGroup")}>
                {installedVersionValues.length === 0 ? (
                  <option value="">{t("versionEmpty")}</option>
                ) : (
                  installedVersionValues.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))
                )}
              </optgroup>
              {pendingVersions.length > 0 ? (
                <optgroup label={t("versionPendingGroup")}>
                  {pendingVersions.map((entry) => (
                    <option key={entry.id} value={entry.version} disabled>
                      {entry.version} · {t("notInstalled")}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </IGM_Launcher_Select>
          </IGM_Launcher_Field>

          <IGM_Launcher_Field label={t("loader")} hint={t("loaderHint")}>
            <IGM_Launcher_Select
              value={form.loader}
              onChange={(event) =>
                handleLoaderChange(event.target.value as iGM_Launcher_LoaderType)
              }
            >
              {IGM_LAUNCHER_LOADER_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={!loaderInstalled(option.value)}
                >
                  {option.label}
                  {loaderInstalled(option.value) ? "" : ` · ${t("notInstalled")}`}
                </option>
              ))}
            </IGM_Launcher_Select>
          </IGM_Launcher_Field>

          <IGM_Launcher_Field
            label={t("loaderVersion")}
            hint={
              form.loader === "vanilla"
                ? t("loaderVersionEmpty")
                : loaderVersions.length === 0
                  ? t("loaderVersionMissing")
                  : t("loaderVersionHint")
            }
          >
            <IGM_Launcher_Select
              value={form.loaderVersion}
              disabled={loaderVersions.length === 0}
              onChange={(event) => patch({ loaderVersion: event.target.value })}
            >
              {loaderVersions.length === 0 ? <option value="">—</option> : null}
              {loaderVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </IGM_Launcher_Select>
          </IGM_Launcher_Field>
        </div>

        {currentVersionMissing || !loaderInstalled(form.loader) || !currentLoaderOption ? (
          <div className={styles.warnRow}>
            <CircleAlert size={14} strokeWidth={1.8} />
            <span>
              {currentVersionMissing ? t("versionMissingHint") : t("loaderMissingHint")}
            </span>
            <IGM_Launcher_Button variant="secondary" onClick={() => navigate("resourceCenter")}>
              <Download size={14} strokeWidth={1.8} />
              {t("gotoLibrary")}
            </IGM_Launcher_Button>
          </div>
        ) : null}
      </IGM_Launcher_EditSection>

      {/* 共享根目录 */}
      <IGM_Launcher_EditSection title={t("groupDirectory")}>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>{t("rootDirFinal")}</span>
          <span className={styles.pathText} title={rootDir?.path ?? ""}>
            {rootDir?.path || t("rootDirUnknown")}
          </span>
          {rootDir ? (
            <>
              <IGM_Launcher_Badge tone={rootDir.exists ? "success" : "muted"}>
                {rootDir.exists ? t("rootDirExists") : t("rootDirMissing")}
              </IGM_Launcher_Badge>
              {rootDir.isDefault ? (
                <IGM_Launcher_Badge tone="accent">{t("rootDirDefault")}</IGM_Launcher_Badge>
              ) : null}
            </>
          ) : null}
        </div>

        <IGM_Launcher_Field
          label={t("rootDir")}
          hint={t("rootDirHint")}
          htmlFor="iGM_Launcher_InstanceRootDir"
        >
          <div className={styles.rootDirRow}>
            <IGM_Launcher_Input
              id="iGM_Launcher_InstanceRootDir"
              value={draftRoot}
              placeholder={t("rootDirPlaceholder")}
              onChange={(event) => setDraftRoot(event.target.value)}
            />
            <IGM_Launcher_Button
              variant="secondary"
              disabled={scanningInstalled}
              onClick={() => {
                void pickDir(draftRoot.trim() || undefined).then((path) => {
                  if (path) setDraftRoot(path);
                });
              }}
            >
              <FolderOpen size={15} strokeWidth={1.8} />
              {tCommon("browse")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Field>

        <div className={styles.actions}>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={scanningInstalled}
            onClick={() => void applyRootDir(draftRoot.trim() || undefined)}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            {scanningInstalled ? t("rootDirScanning") : t("rootDirApply")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="ghost"
            disabled={scanningInstalled}
            onClick={() => void applyRootDir()}
          >
            {t("rootDirUseDefault")}
          </IGM_Launcher_Button>
          {rootChanged ? <span className={styles.metaText}>{t("rootDirChanged")}</span> : null}
        </div>

        <IGM_Launcher_Field label={t("gameDir")} hint={t("gameDirHint")}>
          <div className={styles.gameDirBox}>
            <FolderOpen size={14} strokeWidth={1.8} />
            <span className={styles.pathText}>{gameDirPreview}</span>
          </div>
        </IGM_Launcher_Field>
      </IGM_Launcher_EditSection>

      {/* 启动配置 */}
      <IGM_Launcher_EditSection title={t("groupLaunch")}>
        <div className={styles.grid2}>
          <IGM_Launcher_Field label={t("javaRuntime")} hint={t("javaHint")}>
            <IGM_Launcher_Select
              value={form.javaId ?? ""}
              onChange={(event) => patch({ javaId: event.target.value || null })}
            >
              <option value="">
                {t("javaAuto")}
                {defaultJavaId
                  ? ` · ${
                      javas.find((item) => item.id === defaultJavaId)?.name ?? ""
                    }`
                  : ""}
              </option>
              {javas.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {runtime.name} · Java {runtime.version}
                </option>
              ))}
            </IGM_Launcher_Select>
          </IGM_Launcher_Field>

          <div className={styles.grid3}>
            <IGM_Launcher_Field label={t("maxMemory")}>
              <IGM_Launcher_Input
                type="number"
                min={512}
                step={512}
                value={form.maxMemoryMb}
                onChange={(event) => patch({ maxMemoryMb: Number(event.target.value) })}
              />
            </IGM_Launcher_Field>

            <IGM_Launcher_Field label={t("minMemory")}>
              <IGM_Launcher_Input
                type="number"
                min={512}
                step={512}
                value={form.minMemoryMb}
                onChange={(event) => patch({ minMemoryMb: Number(event.target.value) })}
              />
            </IGM_Launcher_Field>

            <IGM_Launcher_Field label={t("windowWidth")}>
              <IGM_Launcher_Input
                type="number"
                min={320}
                step={2}
                value={form.windowWidth}
                onChange={(event) => patch({ windowWidth: Number(event.target.value) })}
              />
            </IGM_Launcher_Field>

            <IGM_Launcher_Field label={t("windowHeight")}>
              <IGM_Launcher_Input
                type="number"
                min={240}
                step={2}
                value={form.windowHeight}
                onChange={(event) => patch({ windowHeight: Number(event.target.value) })}
              />
            </IGM_Launcher_Field>
          </div>

          <IGM_Launcher_Field label={t("jvmArgs")}>
            <IGM_Launcher_Input
              value={form.jvmArgs}
              onChange={(event) => patch({ jvmArgs: event.target.value })}
            />
          </IGM_Launcher_Field>

          <IGM_Launcher_Field label={t("gameArgs")}>
            <IGM_Launcher_Input
              value={form.gameArgs}
              placeholder={t("gameArgsPlaceholder")}
              onChange={(event) => patch({ gameArgs: event.target.value })}
            />
          </IGM_Launcher_Field>
        </div>
      </IGM_Launcher_EditSection>

      {/*
        已安装资源：仅编辑既有实例时展示，
        让玩家在该实例下直接看到已放入的模组、光影、材质包与数据包；
        新建实例还没有目录，故不渲染。仅启动器端可见，网站不暴露该能力。
      */}
      {editing ? (
        <IGM_Launcher_InstanceResourcesPanel
          dir={editing.directory}
          instanceName={editing.name}
          title={tRes("title")}
        />
      ) : null}

      {/* 保存 / 取消 */}
      <div className={styles.footer}>
        {nameMessage ? (
          <span className={styles.errorLine}>
            <CircleAlert size={14} strokeWidth={1.8} />
            {nameMessage}
          </span>
        ) : null}
        <IGM_Launcher_Button variant="secondary" onClick={() => navigate("instances")}>
          {tCommon("cancel")}
        </IGM_Launcher_Button>
        <IGM_Launcher_Button
          variant="primary"
          disabled={!nameCheck.valid}
          onClick={() => void handleSave()}
        >
          <Check size={15} strokeWidth={2} />
          {tCommon("save")}
        </IGM_Launcher_Button>
      </div>

      <IGM_Launcher_PlaceholderNote>{t("hint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_InstanceEditPage;