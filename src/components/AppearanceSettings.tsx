import {
  App as AntApp,
  Button,
  Card,
  Radio,
  Space,
  Tag,
  Typography,
} from "antd";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
type StorageLocationKind = "user" | "portable" | "custom";

interface AppearanceSettingsProps {
  themeMode: ThemeMode;
  onThemeModeChange: (nextMode: ThemeMode) => Promise<void> | void;
}

interface StorageLocationInfo {
  kind: StorageLocationKind;
  effectivePath: string;
  userDefaultPath: string;
  portableDefaultPath: string;
  customPath: string;
  configExists: boolean;
}

interface SaveStorageLocationResult {
  location: StorageLocationInfo;
  migrated: boolean;
}

const { Paragraph, Text } = Typography;

const normalizeStorageKind = (value: string): StorageLocationKind =>
  value === "portable" || value === "custom" ? value : "user";

export default function AppearanceSettings({
  themeMode,
  onThemeModeChange,
}: AppearanceSettingsProps) {
  const { message, modal } = AntApp.useApp();
  const [savingTheme, setSavingTheme] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageLocationInfo | null>(null);
  const [storageKind, setStorageKind] = useState<StorageLocationKind>("user");
  const [customPath, setCustomPath] = useState("");
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [savingStorage, setSavingStorage] = useState(false);

  const loadStorageLocation = async () => {
    setLoadingStorage(true);
    try {
      const info = await invoke<StorageLocationInfo>("load_storage_location");
      setStorageInfo(info);
      setStorageKind(info.kind);
      setCustomPath(info.customPath);
    } finally {
      setLoadingStorage(false);
    }
  };

  useEffect(() => {
    void loadStorageLocation().catch((error) => {
      message.error(`读取数据存储位置失败: ${error}`);
    });
  }, [message]);

  const handleThemeChange = async (nextMode: ThemeMode) => {
    try {
      setSavingTheme(true);
      await onThemeModeChange(nextMode);
      message.success("主题模式已更新");
    } catch (error) {
      message.error(`主题切换失败: ${error}`);
    } finally {
      setSavingTheme(false);
    }
  };

  const handlePickCustomFolder = async () => {
    try {
      const selected = await dialogOpen({
        directory: true,
        multiple: false,
        defaultPath: customPath || storageInfo?.userDefaultPath || undefined,
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      setStorageKind("custom");
      setCustomPath(selected);
    } catch (error) {
      message.error(`选择自定义目录失败: ${error}`);
    }
  };

  const handleSaveStorageLocation = async () => {
    if (!storageInfo) {
      return;
    }

    const nextEffectivePath =
      storageKind === "user"
        ? storageInfo.userDefaultPath
        : storageKind === "portable"
          ? storageInfo.portableDefaultPath
          : customPath;

    if (!nextEffectivePath) {
      message.error("请先选择目标目录");
      return;
    }

    const performSave = async () => {
      setSavingStorage(true);
      try {
        const result = await invoke<SaveStorageLocationResult>("save_storage_location", {
          kind: storageKind,
          customPath: storageKind === "custom" ? customPath : null,
        });
        setStorageInfo(result.location);
        setStorageKind(result.location.kind);
        setCustomPath(result.location.customPath);
        message.success(
          result.migrated
            ? "数据已迁移并切换到新目录"
            : "数据存储位置已保存",
        );
      } catch (error) {
        message.error(`保存数据存储位置失败: ${error}`);
      } finally {
        setSavingStorage(false);
      }
    };

    const currentPath = storageInfo.effectivePath;
    if (currentPath === nextEffectivePath) {
      await performSave();
      return;
    }

    try {
      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: "确认迁移数据目录",
          content: (
            <Space direction="vertical" size={8}>
              <Text>
                当前目录已有数据库和导出文件时，软件会把它们移动到新的目录。
              </Text>
              <Text type="secondary">当前目录：{currentPath}</Text>
              <Text type="secondary">目标目录：{nextEffectivePath}</Text>
            </Space>
          ),
          okText: "确认迁移",
          cancelText: "取消",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (confirmed) {
        await performSave();
      }
    } catch {
      return;
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="界面设置">
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              主题模式
            </div>
            <Text type="secondary">
              支持浅色、深色，以及跟随系统外观自动切换。
            </Text>
          </div>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            value={themeMode}
            onChange={(event) =>
              void handleThemeChange(event.target.value as ThemeMode)}
            disabled={savingTheme}
          >
            <Radio.Button value="light">浅色</Radio.Button>
            <Radio.Button value="dark">深色</Radio.Button>
            <Radio.Button value="system">跟随系统</Radio.Button>
          </Radio.Group>
        </Space>
      </Card>

      <Card title="数据存储位置">
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              当前生效目录
            </div>
            {storageInfo ? (
              <>
                <Paragraph copyable style={{ marginBottom: 8 }}>
                  {storageInfo.effectivePath}
                </Paragraph>
                <Tag color="blue">
                  {storageInfo.kind === "user"
                    ? "用户目录"
                    : storageInfo.kind === "portable"
                      ? "EXE 同目录"
                      : "自定义目录"}
                </Tag>
              </>
            ) : (
              <Text type="secondary">
                {loadingStorage ? "正在读取..." : "暂时无法读取当前目录"}
              </Text>
            )}
          </div>

          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              下次启动使用
            </div>
            <Text type="secondary">
              如果用户目录下还没有配置，软件首次启动时会先询问一次存储位置。以后你也可以在这里修改。
            </Text>
          </div>

          <Radio.Group
            value={storageKind}
            onChange={(event) =>
              setStorageKind(normalizeStorageKind(event.target.value))}
            disabled={loadingStorage || savingStorage}
          >
            <Space direction="vertical" size={10}>
              <Radio value="user">
                用户目录
                {storageInfo && (
                  <Text type="secondary">：{storageInfo.userDefaultPath}</Text>
                )}
              </Radio>
              <Radio value="portable">
                EXE 同目录
                {storageInfo && (
                  <Text type="secondary">：{storageInfo.portableDefaultPath}</Text>
                )}
              </Radio>
              <Radio value="custom">自定义目录</Radio>
            </Space>
          </Radio.Group>

          {storageKind === "custom" && (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Paragraph copyable style={{ marginBottom: 0 }}>
                {customPath || "尚未选择自定义目录"}
              </Paragraph>
              <Button onClick={() => void handlePickCustomFolder()}>
                选择自定义目录
              </Button>
            </Space>
          )}

          <Text type="secondary">
            修改目录时会先弹确认框；确认后，如果当前目录里已有数据库和导出文件，会一起迁移到新目录。
          </Text>

          <Button
            type="primary"
            onClick={() => void handleSaveStorageLocation()}
            disabled={loadingStorage || savingStorage || (storageKind === "custom" && !customPath)}
            loading={savingStorage}
          >
            保存数据存储位置
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
