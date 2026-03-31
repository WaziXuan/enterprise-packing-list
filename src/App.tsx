import { useEffect, useMemo, useState } from "react";
import { ConfigProvider, Layout, Menu, theme } from "antd";
import {
  FileTextOutlined,
  HistoryOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";
import PackingListForm, {
  type PackingListRecord,
} from "./components/PackingListForm";
import HistoryList from "./components/HistoryList";
import CompanyManager from "./components/CompanyManager";

const { Sider, Content } = Layout;

type Page = "form" | "history" | "settings";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("form");
  const [editingRecord, setEditingRecord] = useState<PackingListRecord | null>(
    null,
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const rippleHost = target.closest(
        ".ant-btn, .ant-menu-item, .app-shell__status",
      );
      if (!(rippleHost instanceof HTMLElement)) {
        return;
      }

      const rect = rippleHost.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 1.15;

      ripple.className = "ui-ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

      rippleHost.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 520);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const menuItems = useMemo(
    () => [
      { key: "form", icon: <FileTextOutlined />, label: "新建装箱单" },
      { key: "history", icon: <HistoryOutlined />, label: "历史记录" },
      { key: "settings", icon: <SettingOutlined />, label: "公司管理" },
    ],
    [],
  );

  const themeConfig = useMemo(
    () => ({
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: "#2962ff",
        colorSuccess: "#2e7d5b",
        colorWarning: "#b7791f",
        colorBgBase: "#f4f6fb",
        colorTextBase: "#162033",
        borderRadius: 14,
        borderRadiusLG: 18,
        fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        boxShadow:
          "0 8px 24px rgba(24, 39, 75, 0.08), 0 2px 8px rgba(24, 39, 75, 0.05)",
      },
      components: {
        Layout: {
          bodyBg: "#eef3f8",
          siderBg: "rgba(255,255,255,0.65)",
          headerBg: "rgba(255,255,255,0.35)",
        },
        Card: {
          borderRadiusLG: 20,
          headerFontSize: 18,
        },
        Button: {
          borderRadius: 12,
          controlHeight: 40,
        },
        Input: {
          borderRadius: 12,
          controlHeight: 42,
        },
        InputNumber: {
          borderRadius: 12,
          controlHeight: 42,
        },
        Select: {
          borderRadius: 12,
          controlHeight: 42,
        },
        Table: {
          borderColor: "rgba(25, 38, 62, 0.08)",
          headerBg: "rgba(245, 248, 252, 0.92)",
        },
        Menu: {
          itemBorderRadius: 16,
          itemHeight: 46,
          itemSelectedBg: "rgba(31, 111, 235, 0.12)",
          itemSelectedColor: "#1f6feb",
          itemColor: "#334155",
        },
      },
    }),
    [],
  );

  const handleEditFromHistory = (record: PackingListRecord) => {
    setEditingRecord(record);
    setCurrentPage("form");
  };

  const handleSaved = () => {
    setEditingRecord(null);
    setCurrentPage("history");
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={themeConfig}
    >
      <Layout className="app-shell">
        <div className="app-shell__background" />
        <Sider width={228} theme="light" className="app-shell__sider">
          <div className="app-brand">
            <div className="app-brand__badge">
              <ThunderboltOutlined />
            </div>
            <div>
              <div className="app-brand__title">装箱单系统</div>
              <div className="app-brand__subtitle">Packing Desktop Suite</div>
            </div>
          </div>
          <Menu
            className="app-shell__menu"
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={({ key }) => {
              if (key === "form" && currentPage !== "form") {
                setEditingRecord(null);
              }
              setCurrentPage(key as Page);
            }}
          />
        </Sider>
        <Layout className="app-shell__main">
          <div className="app-shell__header">
            <div>
              <div className="app-shell__eyebrow">Desktop Workspace</div>
              <div className="app-shell__headline">
                {currentPage === "form" && "装箱单编辑台"}
                {currentPage === "history" && "历史记录中心"}
                {currentPage === "settings" && "发货公司与资源配置"}
              </div>
            </div>
            <div className="app-shell__status">
              <span className="app-shell__status-dot" />
              本地模式
            </div>
          </div>
          <Content className="app-shell__content">
            <div className="app-shell__content-inner">
              <div
                style={{ display: currentPage === "form" ? "block" : "none" }}
              >
                <PackingListForm
                  initialRecord={editingRecord}
                  onSaved={handleSaved}
                  onCancelEdit={handleCancelEdit}
                />
              </div>
              <div
                style={{ display: currentPage === "history" ? "block" : "none" }}
              >
                <HistoryList onEditRecord={handleEditFromHistory} />
              </div>
              <div
                style={{ display: currentPage === "settings" ? "block" : "none" }}
              >
                <CompanyManager />
              </div>
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
