import { useEffect, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

interface Company {
  id: number | null;
  name: string;
  address: string;
  contact_person: string;
  phone: string;
  logo_path: string;
  stamp_path: string;
}

const emptyCompany: Company = {
  id: null,
  name: "",
  address: "",
  contact_person: "",
  phone: "",
  logo_path: "",
  stamp_path: "",
};

export default function CompanyManager() {
  const { message } = AntApp.useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<Company | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [form] = Form.useForm<Company>();
  const [listRefreshTick, setListRefreshTick] = useState(0);
  const [feedbackPulseActive, setFeedbackPulseActive] = useState(false);
  const [editModalStyle, setEditModalStyle] = useState<React.CSSProperties>({});
  const [aiModalStyle, setAiModalStyle] = useState<React.CSSProperties>({});
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
      return {};
    }

    const rect = element.getBoundingClientRect();
    return {
      "--ui-origin-x": `${rect.left + rect.width / 2}px`,
      "--ui-origin-y": `${rect.top + rect.height / 2}px`,
    } as React.CSSProperties;
  };

  const load = async () => {
    const list = await invoke<Company[]>("list_companies");
    setCompanies(list);
    setListRefreshTick((previous) => previous + 1);
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = (trigger?: HTMLElement | null) => {
    setEditing(emptyCompany);
    form.setFieldsValue(emptyCompany);
    setEditModalStyle(captureModalOrigin(trigger ?? null));
    setModalOpen(true);
  };

  const openEdit = (company: Company, trigger?: HTMLElement | null) => {
    setEditing(company);
    form.setFieldsValue(company);
    setEditModalStyle(captureModalOrigin(trigger ?? null));
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await invoke("save_company", {
        company: { ...values, id: editing?.id ?? null },
      });
      message.success("公司信息已保存");
      triggerFeedbackPulse();
      setModalOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(`保存失败: ${error}`);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await invoke("delete_company", { id });
      message.success("公司已删除");
      triggerFeedbackPulse();
      await load();
    } catch (error) {
      message.error(`删除失败: ${error}`);
    }
  };

  const handleAiImport = () => {
    try {
      const cleaned = aiInput.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
      const data = JSON.parse(cleaned) as Partial<Company>;
      const nextCompany: Company = {
        id: editing?.id ?? null,
        name: data.name ?? "",
        address: data.address ?? "",
        contact_person: data.contact_person ?? "",
        phone: data.phone ?? "",
        logo_path: data.logo_path ?? "",
        stamp_path: data.stamp_path ?? "",
      };

      setEditing(nextCompany);
      form.setFieldsValue(nextCompany);
      setAiModalOpen(false);
      setAiInput("");
      if (!modalOpen) {
        setModalOpen(true);
      }
      message.success("AI 导入成功，请确认后保存");
      triggerFeedbackPulse();
    } catch {
      message.error("JSON 解析失败，请确认格式正确");
    }
  };

  return (
    <Card
      className={feedbackPulseActive ? "ui-feedback-pulse" : undefined}
      title="发货公司管理"
      extra={
        <Space>
          <Button
            type="dashed"
            onClick={(event) => {
              setAiModalStyle(captureModalOrigin(event.currentTarget));
              setAiModalOpen(true);
            }}
          >
            AI 导入
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={(event) => openNew(event.currentTarget)}
          >
            新增公司
          </Button>
        </Space>
      }
    >
      <div key={`companies-${listRefreshTick}`} className="ui-fade-through">
        {companies.length === 0 && (
          <div className="company-manager__empty">暂无公司信息</div>
        )}
        {companies.map((company) => (
          <div key={company.id ?? company.name} className="company-manager__row">
            <div className="company-manager__meta">
              <div className="company-manager__name">{company.name}</div>
              <div className="company-manager__desc">
                {`${company.address} | ${company.contact_person} | ${company.phone}`}
              </div>
            </div>
            <Space>
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={(event) => openEdit(company, event.currentTarget)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定删除这家公司吗？"
                onConfirm={() => handleDelete(company.id!)}
              >
                <Button icon={<DeleteOutlined />} size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </div>
        ))}
      </div>

        <Modal
        rootClassName="ui-transform-modal"
        title={editing?.id ? "编辑公司" : "新增公司"}
        open={modalOpen}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        width={680}
        style={editModalStyle}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="公司名称"
            rules={[{ required: true, message: "请输入公司名称" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space style={{ width: "100%" }} size={16}>
            <Form.Item name="contact_person" label="联系人" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="电话" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="logo_path" label="Logo 文件路径">
            <Input placeholder={"例如：assets/logo.png 或 /path/to/logo.png"} />
          </Form.Item>
          <Form.Item name="stamp_path" label="电子章文件路径">
            <Input placeholder={"例如：assets/stamp.png 或 /path/to/stamp.png"} />
          </Form.Item>
        </Form>
        </Modal>

        <Modal
        rootClassName="ui-transform-modal"
        title="AI 导入公司"
        open={aiModalOpen}
        onOk={handleAiImport}
        onCancel={() => {
          setAiModalOpen(false);
          setAiInput("");
        }}
        okText="导入"
        cancelText="取消"
        width={640}
        style={aiModalStyle}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ color: "#666" }}>
            让 AI 按以下 JSON 输出公司信息，粘贴后会自动回填到编辑表单。
          </span>
          <Button
            size="small"
            onClick={() => {
              void navigator.clipboard
                .writeText(`{
  "name": "Sample Company Ltd.",
  "address": "Sample Address Line 1, Sample City, Sample Country",
  "contact_person": "Sample Contact",
  "phone": "+000 1234 5678",
  "logo_path": "assets/sample-logo.png",
  "stamp_path": "assets/sample-stamp.png"
}`)
                .then(() => message.success("已复制"));
            }}
          >
            一键复制
          </Button>
        </div>
        <pre
          className="company-manager__json-preview"
          style={{
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            marginBottom: 12,
            overflowX: "auto",
          }}
        >{`{
  "name": "Sample Company Ltd.",
  "address": "Sample Address Line 1, Sample City, Sample Country",
  "contact_person": "Sample Contact",
  "phone": "+000 1234 5678",
  "logo_path": "assets/sample-logo.png",
  "stamp_path": "assets/sample-stamp.png"
}`}</pre>
        <Input.TextArea
          rows={8}
          value={aiInput}
          onChange={(event) => setAiInput(event.target.value)}
          placeholder="粘贴 AI 输出的公司 JSON..."
        />
        </Modal>
    </Card>
  );
}
