import { useEffect, useState } from "react";
import { Card, Input, Table, Button, Popconfirm, message, Space, Modal, Typography } from "antd";
import type { TableProps } from "antd";
import { DeleteOutlined, EditOutlined, HistoryOutlined } from "@ant-design/icons";
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
  onEditRecord: (record: PackingListRecord) => void;
}

export default function HistoryList({ onEditRecord }: HistoryListProps) {
  const [data, setData] = useState<HistorySummary[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotKeyword, setSnapshotKeyword] = useState("");
  const [snapshots, setSnapshots] = useState<FormSnapshotSummary[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<number | null>(null);

  const load = async (searchKeyword = "") => {
    setLoading(true);
    try {
      const list = await invoke<HistorySummary[]>("list_history", {
        keyword: searchKeyword,
      });
      setData(list);
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
      await load(keyword);
    } catch (error) {
      message.error(`删除失败: ${error}`);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const record = await invoke<PackingListRecord>("load_packing_list", { id });
      onEditRecord(record);
      message.success(`已载入装箱单 #${id}`);
    } catch (error) {
      message.error(`加载记录失败: ${error}`);
    }
  };

  const handleRestoreSnapshot = async (id: number) => {
    setRestoringSnapshotId(id);
    try {
      const record = await invoke<PackingListRecord>("load_form_snapshot", { id });
      onEditRecord(record);
      setSnapshotModalOpen(false);
      message.success("已恢复到所选时间点");
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
            icon={<EditOutlined />}
            onClick={() => void handleEdit(record.id)}
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
      title="历史记录"
      extra={
        <Button
          icon={<HistoryOutlined />}
          onClick={() => {
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
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />
    </Card>
    <Modal
      title="回溯记录"
      open={snapshotModalOpen}
      onCancel={() => setSnapshotModalOpen(false)}
      footer={null}
      width={860}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
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
        <Table
          rowKey="id"
          size="small"
          loading={loadingSnapshots}
          dataSource={snapshots}
          columns={snapshotColumns}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          scroll={{ y: 360 }}
        />
      </Space>
    </Modal>
    </>
  );
}
