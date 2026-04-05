import { useEffect, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import type { PackingListRecord } from "./PackingListForm";

const { Text } = Typography;

interface HistorySummary {
  id: number;
  company_id: number;
  invoice_number: string;
  consignee_company: string;
  created_at: string;
  updated_at: string;
}

interface FormSnapshotSummary {
  id: number;
  packingListId: number | null;
  actionLabel: string;
  invoiceNumber: string;
  consigneeCompany: string;
  createdAt: string;
}

interface HistoryListProps {
  onEditRecord: (
    record: PackingListRecord,
    origin?: { x: number; y: number },
  ) => void;
}

export default function HistoryList({ onEditRecord }: HistoryListProps) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<HistorySummary[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotKeyword, setSnapshotKeyword] = useState("");
  const [snapshots, setSnapshots] = useState<FormSnapshotSummary[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<number | null>(null);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [snapshotRefreshTick, setSnapshotRefreshTick] = useState(0);
  const [feedbackPulseActive, setFeedbackPulseActive] = useState(false);
  const [snapshotModalStyle, setSnapshotModalStyle] = useState<React.CSSProperties>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<PackingListRecord | null>(null);
  const [previewSummary, setPreviewSummary] = useState<HistorySummary | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const triggerFeedbackPulse = () => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }

    setFeedbackPulseActive(false);
    window.requestAnimationFrame(() => {
      setFeedbackPulseActive(true);
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedbackPulseActive(false);
        feedbackTimerRef.current = null;
      }, 180);
    });
  };

  const captureModalOrigin = (element: HTMLElement | null) => {
    if (!element) {
      setSnapshotModalStyle({});
      return;
    }

    const rect = element.getBoundingClientRect();
    setSnapshotModalStyle({
      "--ui-origin-x": `${rect.left + rect.width / 2}px`,
      "--ui-origin-y": `${rect.top + rect.height / 2}px`,
    } as React.CSSProperties);
  };

  const getOriginFromElement = (element: HTMLElement | null) => {
    if (!element) {
      return undefined;
    }

    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const load = async (searchKeyword = "") => {
    setLoading(true);
    try {
      const list = await invoke<HistorySummary[]>("list_history", {
        keyword: searchKeyword,
      });
      setData(list);
      setHistoryRefreshTick((previous) => previous + 1);
    } catch (error) {
      message.error(`加载历史记录失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!snapshotModalOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadSnapshots(snapshotKeyword);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [snapshotKeyword, snapshotModalOpen]);

  const loadSnapshots = async (searchKeyword = "") => {
    setLoadingSnapshots(true);
    try {
      const list = await invoke<FormSnapshotSummary[]>("list_form_snapshots", {
        keyword: searchKeyword,
      });
      setSnapshots(list);
      setSnapshotRefreshTick((previous) => previous + 1);
    } catch (error) {
      message.error(`加载回溯记录失败: ${error}`);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const formatSnapshotAt = (value: string) => {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  };

  const handleDelete = async (id: number) => {
    try {
      await invoke("delete_packing_list", { id });
      message.success("记录已删除");
      triggerFeedbackPulse();
      await load(keyword);
    } catch (error) {
      message.error(`删除失败: ${error}`);
    }
  };

  const handlePreview = async (record: HistorySummary) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewSummary(record);

    try {
      const detail = await invoke<PackingListRecord>("load_packing_list", {
        id: record.id,
      });
      setPreviewRecord(detail);
    } catch (error) {
      message.error(`加载预览失败: ${error}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleEditWithOrigin = async (record: HistorySummary, element?: HTMLElement | null) => {
    try {
      const detail = await invoke<PackingListRecord>("load_packing_list", {
        id: record.id,
      });
      onEditRecord(detail, getOriginFromElement(element ?? null));
      message.success(`已载入装箱单 #${record.id}`);
      triggerFeedbackPulse();
    } catch (error) {
      message.error(`加载记录失败: ${error}`);
    }
  };

  const previewTotals = previewRecord?.items.reduce(
    (accumulator, item) => ({
      qty: accumulator.qty + item.qty,
      netWeight: accumulator.netWeight + item.net_weight,
      grossWeight: accumulator.grossWeight + item.gross_weight,
    }),
    { qty: 0, netWeight: 0, grossWeight: 0 },
  ) ?? { qty: 0, netWeight: 0, grossWeight: 0 };

  const handleRestoreSnapshot = async (id: number) => {
    setRestoringSnapshotId(id);
    try {
      const record = await invoke<PackingListRecord>("load_form_snapshot", { id });
      onEditRecord(record);
      setSnapshotModalOpen(false);
      message.success("已恢复到所选时间点");
      triggerFeedbackPulse();
    } catch (error) {
      message.error(`恢复失败: ${error}`);
    } finally {
      setRestoringSnapshotId(null);
    }
  };

  const columns: TableProps<HistorySummary>["columns"] = [
    { title: "Invoice Number", dataIndex: "invoice_number", key: "invoice" },
    { title: "客户公司", dataIndex: "consignee_company", key: "consignee" },
    { title: "创建时间", dataIndex: "created_at", key: "created_at" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at" },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => void handlePreview(record)}
          >
            预览
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(event) =>
              void handleEditWithOrigin(
                record,
                event.currentTarget.closest("tr") as HTMLElement | null,
              )}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除这条记录吗？"
            onConfirm={() => void handleDelete(record.id)}
          >
            <Button size="small" icon={<DeleteOutlined />} danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const snapshotColumns: TableProps<FormSnapshotSummary>["columns"] = [
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => formatSnapshotAt(value),
    },
    {
      title: "动作",
      dataIndex: "actionLabel",
      width: 120,
    },
    {
      title: "Invoice",
      dataIndex: "invoiceNumber",
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "客户",
      dataIndex: "consigneeCompany",
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          type="link"
          loading={restoringSnapshotId === record.id}
          onClick={() => void handleRestoreSnapshot(record.id)}
        >
          恢复
        </Button>
      ),
    },
  ];

  return (
    <>
    <Card
      className={feedbackPulseActive ? "ui-feedback-pulse" : undefined}
      title="历史记录"
      extra={
        <Button
          icon={<HistoryOutlined />}
          onClick={(event) => {
            captureModalOrigin(event.currentTarget);
            setSnapshotModalOpen(true);
            void loadSnapshots("");
          }}
        >
          回溯记录
        </Button>
      }
    >
      <Input.Search
        placeholder="搜索 Invoice Number 或客户名称"
        allowClear
        onSearch={(value) => {
          setKeyword(value);
          void load(value);
        }}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />
      <div key={`history-${historyRefreshTick}`} className="ui-fade-through">
        <Table
          className="ui-stagger-table"
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
          onRow={(record, index) => ({
            className: "history-list__row",
            style: {
              "--stagger-index": String(Math.min(index ?? 0, 8)),
            } as React.CSSProperties,
            onDoubleClick: () => {
              void handleEditWithOrigin(record);
            },
          })}
        />
      </div>
    </Card>
    <Modal
      rootClassName="ui-transform-modal"
      title="回溯记录"
      open={snapshotModalOpen}
      onCancel={() => setSnapshotModalOpen(false)}
      footer={null}
      width={860}
      style={snapshotModalStyle}
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary">
          自动保留最近 7 天的表单快照。可以搜索时间、Invoice、客户名或动作后恢复。
        </Text>
        <Input.Search
          allowClear
          placeholder="搜索时间 / Invoice / 客户 / 动作"
          value={snapshotKeyword}
          onChange={(event) => setSnapshotKeyword(event.target.value)}
          onSearch={(value) => void loadSnapshots(value)}
        />
        <div key={`snapshot-${snapshotRefreshTick}`} className="ui-fade-through">
          <Table
            rowKey="id"
            size="small"
            loading={loadingSnapshots}
            dataSource={snapshots}
            columns={snapshotColumns}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            scroll={{ y: 360 }}
          />
        </div>
      </Space>
    </Modal>
    <Drawer
      title="装箱单预览"
      placement="right"
      width={520}
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      extra={
        previewSummary && (
          <Button
            type="primary"
            onClick={() => void handleEditWithOrigin(previewSummary)}
          >
            进入编辑
          </Button>
        )
      }
    >
      {previewLoading && <div className="ui-fade-through">正在加载预览...</div>}
      {!previewLoading && !previewRecord && <Empty description="暂无可预览内容" />}
      {!previewLoading && previewRecord && (
        <div className="ui-fade-through">
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Invoice">
                {previewRecord.invoice_number || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="入仓号">
                {previewRecord.warehouse_number || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="收货方">
                {previewRecord.consignee_company || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="交货方">
                {previewRecord.delivery_company || "-"}
              </Descriptions.Item>
            </Descriptions>
            <Space wrap>
              <Tag color="blue">箱数 {previewRecord.items.length}</Tag>
              <Tag color="cyan">总数量 {previewTotals.qty}</Tag>
              <Tag color="geekblue">
                N.W. {previewTotals.netWeight.toFixed(2)} kg
              </Tag>
              <Tag color="purple">
                G.W. {previewTotals.grossWeight.toFixed(2)} kg
              </Tag>
            </Space>
            <div>
              <Text strong>货物摘要</Text>
              <div
                key={`preview-items-${previewRecord.id ?? "draft"}`}
                className="ui-fade-through"
                style={{ marginTop: 12, display: "grid", gap: 8 }}
              >
                {previewRecord.items.slice(0, 8).map((item, index) => (
                  <div className="history-preview__item" key={`${item.part_no}-${index}`}>
                    <div className="history-preview__item-header">
                      <Text strong>{item.part_no || `第 ${index + 1} 项`}</Text>
                      <Text type="secondary">QTY {item.qty}</Text>
                    </div>
                    <div className="history-preview__item-body">
                      {item.description || "未填写描述"}
                    </div>
                  </div>
                ))}
                {previewRecord.items.length > 8 && (
                  <Text type="secondary">
                    还有 {previewRecord.items.length - 8} 项，进入编辑页后可查看完整明细。
                  </Text>
                )}
              </div>
            </div>
          </Space>
        </div>
      )}
    </Drawer>
    </>
  );
}
