import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp, ConfigProvider, Layout, Menu, theme } from "antd";
import {
  FileTextOutlined,
  HistoryOutlined,
  ShopOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";
import { invoke } from "@tauri-apps/api/core";
import PackingListForm, {
  type PackingListRecord,
} from "./components/PackingListForm";
import HistoryList from "./components/HistoryList";
import CompanyManager from "./components/CompanyManager";
import AppearanceSettings from "./components/AppearanceSettings";

const { Sider, Content } = Layout;

type Page = "form" | "history" | "companies" | "settings";
type ThemeMode = "light" | "dark" | "system";
type PageDirection = "forward" | "backward";
type PageTransitionKind = "default" | "history-edit";

interface PageTransitionOrigin {
  x: number;
  y: number;
}

const pageOrder: Page[] = ["form", "history", "companies", "settings"];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("form");
  const [outgoingPage, setOutgoingPage] = useState<Page | null>(null);
  const [editingRecord, setEditingRecord] = useState<PackingListRecord | null>(
    null,
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [pageDirection, setPageDirection] = useState<PageDirection>("forward");
  const [pageTransitionKind, setPageTransitionKind] =
    useState<PageTransitionKind>("default");
  const [pageTransitionStyle, setPageTransitionStyle] =
    useState<React.CSSProperties>({});
  const pageTransitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void invoke<string>("load_theme_mode")
      .then((savedMode) => {
        if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
          setThemeMode(savedMode);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncPreference = () => setSystemPrefersDark(mediaQuery.matches);
    syncPreference();

    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncPreference();

    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  const resolvedTheme = themeMode === "system"
    ? (systemPrefersDark ? "dark" : "light")
    : themeMode;

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

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.motion = prefersReducedMotion
      ? "reduced"
      : "full";
  }, [prefersReducedMotion]);

  useEffect(() => () => {
    if (pageTransitionTimerRef.current) {
      window.clearTimeout(pageTransitionTimerRef.current);
    }
  }, []);

  const menuItems = useMemo(
    () => [
      { key: "form", icon: <FileTextOutlined />, label: "新建装箱单" },
      { key: "history", icon: <HistoryOutlined />, label: "历史记录" },
      { key: "companies", icon: <ShopOutlined />, label: "发货公司管理" },
      { key: "settings", icon: <SettingOutlined />, label: "设置" },
    ],
    [],
  );

  const themeConfig = useMemo(
    () => ({
      algorithm:
        resolvedTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: "#2962ff",
        colorSuccess: "#2e7d5b",
        colorWarning: "#b7791f",
        colorBgBase: resolvedTheme === "dark" ? "#0f1724" : "#f4f6fb",
        colorTextBase: resolvedTheme === "dark" ? "#edf2ff" : "#162033",
        borderRadius: 14,
        borderRadiusLG: 18,
        fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        boxShadow:
          resolvedTheme === "dark"
            ? "0 18px 34px rgba(2, 6, 23, 0.34), 0 2px 10px rgba(2, 6, 23, 0.22)"
            : "0 8px 24px rgba(24, 39, 75, 0.08), 0 2px 8px rgba(24, 39, 75, 0.05)",
      },
      components: {
        Layout: {
          bodyBg: resolvedTheme === "dark" ? "#0b1220" : "#eef3f8",
          siderBg: resolvedTheme === "dark" ? "rgba(15,23,36,0.82)" : "rgba(255,255,255,0.65)",
          headerBg: resolvedTheme === "dark" ? "rgba(15,23,36,0.42)" : "rgba(255,255,255,0.35)",
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
          itemSelectedBg:
            resolvedTheme === "dark" ? "rgba(74, 144, 226, 0.18)" : "rgba(31, 111, 235, 0.12)",
          itemSelectedColor: resolvedTheme === "dark" ? "#8ab4ff" : "#1f6feb",
          itemColor: resolvedTheme === "dark" ? "#cbd5e1" : "#334155",
        },
      },
    }),
    [resolvedTheme],
  );

  const handleThemeModeChange = async (nextMode: ThemeMode) => {
    const savedMode = await invoke<ThemeMode>("save_theme_mode", {
      themeMode: nextMode,
    });
    setThemeMode(savedMode);
  };

  const getPageDirection = (from: Page, to: Page): PageDirection =>
    pageOrder.indexOf(to) >= pageOrder.indexOf(from) ? "forward" : "backward";

  const navigateTo = (
    nextPage: Page,
    options?: {
      resetEditing?: boolean;
      transitionKind?: PageTransitionKind;
      origin?: PageTransitionOrigin;
    },
  ) => {
    if (options?.resetEditing) {
      setEditingRecord(null);
    }

    if (nextPage === currentPage) {
      return;
    }

    if (pageTransitionTimerRef.current) {
      window.clearTimeout(pageTransitionTimerRef.current);
    }

    setPageDirection(getPageDirection(currentPage, nextPage));
    setPageTransitionKind(options?.transitionKind ?? "default");
    setPageTransitionStyle(
      options?.origin
        ? {
            "--ui-page-origin-x": `${options.origin.x}px`,
            "--ui-page-origin-y": `${options.origin.y}px`,
          } as React.CSSProperties
        : {},
    );

    if (prefersReducedMotion) {
      setOutgoingPage(null);
      setCurrentPage(nextPage);
      setPageTransitionKind("default");
      setPageTransitionStyle({});
      return;
    }

    setOutgoingPage(currentPage);
    setCurrentPage(nextPage);
    pageTransitionTimerRef.current = window.setTimeout(() => {
      setOutgoingPage(null);
      setPageTransitionKind("default");
      setPageTransitionStyle({});
      pageTransitionTimerRef.current = null;
    }, 220);
  };

  const handleEditFromHistory = (
    record: PackingListRecord,
    origin?: PageTransitionOrigin,
  ) => {
    setEditingRecord(record);
    navigateTo("form", {
      transitionKind: "history-edit",
      origin,
    });
  };

  const handleSaved = () => {
    setEditingRecord(null);
    navigateTo("history");
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
  };

  const renderPage = (page: Page) => {
    if (page === "form") {
      return (
        <PackingListForm
          initialRecord={editingRecord}
          onSaved={handleSaved}
          onCancelEdit={handleCancelEdit}
        />
      );
    }

    if (page === "history") {
      return <HistoryList onEditRecord={handleEditFromHistory} />;
    }

    if (page === "companies") {
      return <CompanyManager />;
    }

    return (
      <AppearanceSettings
        themeMode={themeMode}
        onThemeModeChange={(nextMode) => void handleThemeModeChange(nextMode)}
      />
    );
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={themeConfig}
    >
      <AntApp>
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
                navigateTo(key as Page, {
                  resetEditing: key === "form" && currentPage !== "form",
                });
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
                  {currentPage === "companies" && "发货公司管理"}
                  {currentPage === "settings" && "设置"}
                </div>
              </div>
              <div className="app-shell__status">
                <span className="app-shell__status-dot" />
                {themeMode === "system"
                  ? `跟随系统 · ${resolvedTheme === "dark" ? "深色" : "浅色"}`
                  : themeMode === "dark"
                    ? "深色模式"
                    : "浅色模式"}
              </div>
            </div>
            <Content className="app-shell__content">
              <div
                className="app-shell__content-inner app-page-stack"
                data-direction={pageDirection}
                data-motion={prefersReducedMotion ? "reduced" : "full"}
                data-transition={pageTransitionKind}
                style={pageTransitionStyle}
              >
                {outgoingPage && (
                  <div
                    key={`out-${outgoingPage}-${currentPage}`}
                    className="app-page app-page--out"
                  >
                    {renderPage(outgoingPage)}
                  </div>
                )}
                <div
                  key={`in-${currentPage}`}
                  className="app-page app-page--in"
                >
                  {renderPage(currentPage)}
                </div>
              </div>
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
