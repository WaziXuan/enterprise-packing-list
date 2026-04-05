import { App as AntApp, Card, Radio, Space, Typography } from "antd";
import { useState } from "react";

type ThemeMode = "light" | "dark" | "system";

interface AppearanceSettingsProps {
  themeMode: ThemeMode;
  onThemeModeChange: (nextMode: ThemeMode) => Promise<void> | void;
}

const { Text } = Typography;

export default function AppearanceSettings({
  themeMode,
  onThemeModeChange,
}: AppearanceSettingsProps) {
  const { message } = AntApp.useApp();
  const [savingTheme, setSavingTheme] = useState(false);

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

  return (
    <Card title="界面设置">
      <Space orientation="vertical" size={14} style={{ width: "100%" }}>
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
  );
}
