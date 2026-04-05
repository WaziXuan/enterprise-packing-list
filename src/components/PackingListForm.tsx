import { useEffect, useMemo, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";

const { Text } = Typography;

interface Company {
  id: number;
  name: string;
  address: string;
  contact_person: string;
  phone: string;
  logo_path: string;
  stamp_path: string;
}

interface Customer {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
}

interface Product {
  category: string;
  part_no: string;
  name: string;
  spec: string;
  brand: string;
  coo: string;
  net_weight: number;
  dimension: string;
}

export interface PackingListItem {
  box_number: number;
  part_no: string;
  description: string;
  qty: number;
  net_weight: number;
  gross_weight: number;
  dimension: string;
  brand: string;
  coo: string;
}

export interface PackingListRecord {
  id: number | null;
  company_id: number;
  invoice_number: string;
  warehouse_number: string;
  consignee_company: string;
  consignee_address: string;
  consignee_contact: string;
  consignee_phone: string;
  consignee_mobile: string;
  delivery_company: string;
  delivery_address: string;
  delivery_contact: string;
  delivery_phone: string;
  pdf_path: string;
  items: PackingListItem[];
  created_at: string | null;
}

interface ItemRow extends PackingListItem {
  key: string;
}

interface SourcePaths {
  customerPath: string;
  inventoryPath: string;
  exportDir: string;
  customerImportedAt: string;
  inventoryImportedAt: string;
}

interface PackingListFormProps {
  initialRecord?: PackingListRecord | null;
  onSaved?: (id: number) => void;
  onCancelEdit?: () => void;
}

interface ResizableHeaderCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  width?: number;
  minWidth?: number;
  onResize?: (nextWidth: number) => void;
}

const defaultSourcePaths: SourcePaths = {
  customerPath: "",
  inventoryPath: "",
  exportDir: "",
  customerImportedAt: "",
  inventoryImportedAt: "",
};

const defaultEmptyRecord = (): PackingListRecord => ({
  id: null,
  company_id: 0,
  invoice_number: "",
  warehouse_number: "",
  consignee_company: "",
  consignee_address: "",
  consignee_contact: "",
  consignee_phone: "",
  consignee_mobile: "",
  delivery_company: "",
  delivery_address: "",
  delivery_contact: "",
  delivery_phone: "",
  pdf_path: "",
  items: [],
  created_at: null,
});

let rowKeyCounter = 0;
const createRow = (
  boxNumber: number,
  item?: Partial<PackingListItem>,
): ItemRow => ({
  key: `row_${++rowKeyCounter}`,
  box_number: boxNumber,
  part_no: item?.part_no ?? "",
  description: item?.description ?? "",
  qty: item?.qty ?? 0,
  net_weight: item?.net_weight ?? 0,
  gross_weight: item?.gross_weight ?? 0,
  dimension: item?.dimension ?? "",
  brand: item?.brand ?? "",
  coo: item?.coo ?? "",
});

function ResizableHeaderCell({
  width,
  minWidth = 80,
  onResize,
  children,
  style,
  ...restProps
}: ResizableHeaderCellProps) {
  const handlePointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!width || !onResize) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(minWidth, startWidth + (moveEvent.clientX - startX));
      onResize(nextWidth);
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <th
      {...restProps}
      style={{
        ...style,
        position: "relative",
        width,
        userSelect: "none",
      }}
    >
      {children}
      {onResize && (
        <span
          onPointerDown={handlePointerDown}
          style={{
            position: "absolute",
            top: 0,
            right: -4,
            width: 8,
            height: "100%",
            cursor: "col-resize",
            zIndex: 2,
          }}
        />
      )}
    </th>
  );
}

export default function PackingListForm({
  initialRecord,
  onSaved,
  onCancelEdit,
}: PackingListFormProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<PackingListRecord>();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<ItemRow[]>([createRow(1)]);
  const [consigneeCustomerSearch, setConsigneeCustomerSearch] = useState("");
  const [deliveryCustomerSearch, setDeliveryCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sameAsConsignee, setSameAsConsignee] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sourcePaths, setSourcePaths] = useState<SourcePaths>(defaultSourcePaths);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [consigneeSearchPickerOpen, setConsigneeSearchPickerOpen] = useState(false);
  const [deliverySearchPickerOpen, setDeliverySearchPickerOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const autoSnapshotTimerRef = useRef<number | null>(null);
  const suspendAutoSnapshotRef = useRef(0);
  const lastAutoSnapshotHashRef = useRef("");
  const feedbackTimerRef = useRef<number | null>(null);
  const [columnWidths, setColumnWidths] = useState({
    box_number: 70,
    part_no: 220,
    description: 320,
    qty: 100,
    net_weight: 120,
    gross_weight: 120,
    dimension: 140,
    brand: 120,
    coo: 120,
    actions: 56,
  });
  const [contentRefreshTick, setContentRefreshTick] = useState(0);
  const [feedbackPulseActive, setFeedbackPulseActive] = useState(false);
  const [aiModalStyle, setAiModalStyle] = useState<React.CSSProperties>({});

  const isEditing = Boolean(initialRecord?.id);

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
      setAiModalStyle({});
      return;
    }

    const rect = element.getBoundingClientRect();
    setAiModalStyle({
      "--ui-origin-x": `${rect.left + rect.width / 2}px`,
      "--ui-origin-y": `${rect.top + rect.height / 2}px`,
    } as React.CSSProperties);
  };

  const loadCompanies = async () => {
    const list = await invoke<Company[]>("list_companies");
    setCompanies(list);
  };

  const loadSettings = async () => {
    const settings = await invoke<SourcePaths>("load_settings");
    setSourcePaths(settings);
    return settings;
  };

  const withSuspendedAutoSnapshot = (action: () => void) => {
    suspendAutoSnapshotRef.current += 1;
    try {
      action();
    } finally {
      window.setTimeout(() => {
        suspendAutoSnapshotRef.current = Math.max(0, suspendAutoSnapshotRef.current - 1);
      }, 0);
    }
  };

  const buildDraftRecord = (): PackingListRecord => {
    const values = form.getFieldsValue(true) as Partial<PackingListRecord>;
    return {
      ...defaultEmptyRecord(),
      ...values,
      id: initialRecord?.id ?? values.id ?? null,
      company_id: Number(values.company_id ?? initialRecord?.company_id ?? 0),
      pdf_path: initialRecord?.pdf_path ?? values.pdf_path ?? "",
      created_at: initialRecord?.created_at ?? values.created_at ?? null,
      items: items.map(({ key: _key, ...item }) => item),
    };
  };

  const isMeaningfulDraft = (record: PackingListRecord) => {
    const textFields = [
      record.invoice_number,
      record.warehouse_number,
      record.consignee_company,
      record.consignee_address,
      record.consignee_contact,
      record.consignee_phone,
      record.consignee_mobile,
      record.delivery_company,
      record.delivery_address,
      record.delivery_contact,
      record.delivery_phone,
    ];

    const hasText = textFields.some((value) => value.trim().length > 0);
    const hasSelectedCompany = record.company_id > 0;
    const hasMeaningfulItems = record.items.some(
      (item) =>
        item.part_no.trim() ||
        item.description.trim() ||
        item.qty > 0 ||
        item.net_weight > 0 ||
        item.gross_weight > 0 ||
        item.dimension.trim() ||
        item.brand.trim() ||
        item.coo.trim(),
    );

    return hasText || hasSelectedCompany || hasMeaningfulItems;
  };

  const saveSnapshot = async (actionLabel: string, record?: PackingListRecord) => {
    const draft = record ?? buildDraftRecord();
    if (!isMeaningfulDraft(draft)) {
      return;
    }

    await invoke<number>("save_form_snapshot", {
      record: draft,
      actionLabel,
    });
  };

  const applyRecordToForm = (record: PackingListRecord) => {
    withSuspendedAutoSnapshot(() => {
      form.setFieldsValue(record);
      const nextItems =
        record.items.length > 0
          ? record.items.map((item, index) => createRow(index + 1, item))
          : [createRow(1)];
      setItems(nextItems);
      setSameAsConsignee(
        record.consignee_company === record.delivery_company &&
          record.consignee_address === record.delivery_address &&
          record.consignee_contact === record.delivery_contact &&
          record.consignee_phone === record.delivery_phone,
      );
      const matchedCompany =
        companies.find((company) => company.id === record.company_id) ?? null;
      setSelectedCompany(matchedCompany);
      lastAutoSnapshotHashRef.current = JSON.stringify({
        ...record,
        items: nextItems.map(({ key: _key, ...item }) => item),
      });
    });
  };

  const watchedValues = Form.useWatch([], form);

  useEffect(() => {
    void loadCompanies();
    void (async () => {
      const settings = await loadSettings();
      if (settings.customerPath) {
        await loadCustomersFromPath(settings.customerPath, true);
      }
      if (settings.inventoryPath) {
        await loadProductsFromPath(settings.inventoryPath, true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!initialRecord) {
      withSuspendedAutoSnapshot(() => {
        form.resetFields();
        setItems([createRow(1)]);
        setSelectedCompany(null);
        setSameAsConsignee(true);
      });
      return;
    }

    applyRecordToForm(initialRecord);
  }, [companies, form, initialRecord]);

  const loadCustomersFromPath = async (path: string, silent = false) => {
    const list = await invoke<Customer[]>("read_customers", { path });
    setCustomers(list);
    if (!silent) {
      message.success(`已加载 ${list.length} 个客户`);
    }
    return list;
  };

  const handleLoadCustomers = async () => {
    try {
      await loadCustomersFromPath(sourcePaths.customerPath);
    } catch (error) {
      message.error(`加载客户失败: ${error}`);
    }
  };

  const loadProductsFromPath = async (path: string, silent = false) => {
    const list = await invoke<Product[]>("read_inventory", { path });
    setProducts(list);
    if (!silent) {
      message.success(`已加载 ${list.length} 个商品`);
    }
    return list;
  };

  const handleLoadProducts = async () => {
    try {
      await loadProductsFromPath(sourcePaths.inventoryPath);
    } catch (error) {
      message.error(`加载商品失败: ${error}`);
    }
  };

  const persistSourcePaths = async (nextPaths: SourcePaths) => {
    const settings = await invoke<SourcePaths>("save_settings", {
      settings: nextPaths,
    });
    setSourcePaths(settings);
    return settings;
  };

  const handleChooseCustomerFile = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{ name: "Excel 文件", extensions: ["xls", "xlsx"] }],
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }

      const nextPaths = {
        ...sourcePaths,
        customerPath: selected,
        customerImportedAt: new Date().toISOString(),
      };
      await persistSourcePaths(nextPaths);
      const list = await loadCustomersFromPath(selected, true);
      setSourcePaths(nextPaths);
      message.success(`已导入 ${list.length} 个客户`);
    } catch (error) {
      message.error(`导入客户文件失败: ${error}`);
    }
  };

  const handleChooseInventoryFile = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{ name: "Excel 文件", extensions: ["xls", "xlsx"] }],
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }

      const nextPaths = {
        ...sourcePaths,
        inventoryPath: selected,
        inventoryImportedAt: new Date().toISOString(),
      };
      await persistSourcePaths(nextPaths);
      const list = await loadProductsFromPath(selected, true);
      setSourcePaths(nextPaths);
      message.success(`已导入 ${list.length} 个商品`);
    } catch (error) {
      message.error(`导入商品文件失败: ${error}`);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await persistSourcePaths(sourcePaths);
      message.success("路径设置已保存");
    } catch (error) {
      message.error(`保存路径设置失败: ${error}`);
    }
  };

  const handleSelectConsigneeCustomer = (customerId: string) => {
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) {
      return;
    }

    form.setFieldsValue({
      consignee_company: customer.name,
      consignee_address: customer.address,
      consignee_contact: customer.contact,
      consignee_phone: customer.phone,
    });

    if (sameAsConsignee) {
      form.setFieldsValue({
        delivery_company: customer.name,
        delivery_address: customer.address,
        delivery_contact: customer.contact,
        delivery_phone: customer.phone,
      });
    }

    setConsigneeSearchPickerOpen(false);
  };

  const handleSelectDeliveryCustomer = (customerId: string) => {
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) {
      return;
    }

    form.setFieldsValue({
      delivery_company: customer.name,
      delivery_address: customer.address,
      delivery_contact: customer.contact,
      delivery_phone: customer.phone,
    });

    setDeliverySearchPickerOpen(false);
  };

  const handleCompanyChange = (companyId: number) => {
    const company = companies.find((entry) => entry.id === companyId) ?? null;
    setSelectedCompany(company);
  };

  const updateItem = <K extends keyof PackingListItem>(
    key: string,
    field: K,
    value: PackingListItem[K],
  ) => {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
  };

  const addRow = () => {
    setItems((previous) => [...previous, createRow(previous.length + 1)]);
  };

  const removeRow = (key: string) => {
    setItems((previous) => {
      const next = previous.filter((item) => item.key !== key);
      return next.length > 0
        ? next.map((item, index) => ({ ...item, box_number: index + 1 }))
        : [createRow(1)];
    });
  };

  const selectProduct = (key: string, partNo: string) => {
    const product = products.find((entry) => entry.part_no === partNo);
    if (!product) {
      return;
    }

    setItems((previous) =>
      previous.map((item) =>
        item.key === key
          ? {
              ...item,
              part_no: product.part_no,
              description: [product.name, product.spec].filter(Boolean).join(" ").trim(),
              net_weight: product.net_weight || 0,
              gross_weight: (product.net_weight || 0) + 1,
              dimension: product.dimension,
              brand: product.brand,
              coo: product.coo,
            }
          : item,
      ),
    );
  };

  const handleToggleSameAddress = (checked: boolean) => {
    setSameAsConsignee(checked);

    if (checked) {
      form.setFieldsValue({
        delivery_company: form.getFieldValue("consignee_company"),
        delivery_address: form.getFieldValue("consignee_address"),
        delivery_contact: form.getFieldValue("consignee_contact"),
        delivery_phone: form.getFieldValue("consignee_phone"),
      });
    }
  };

  const resetFormState = () => {
    withSuspendedAutoSnapshot(() => {
      form.resetFields();
      setItems([createRow(1)]);
      setSelectedCompany(null);
      setSameAsConsignee(true);
      lastAutoSnapshotHashRef.current = "";
      onCancelEdit?.();
    });
  };

  const handleNewRecord = async () => {
    await saveSnapshot("清空表单前");
    resetFormState();
    setContentRefreshTick((previous) => previous + 1);
    triggerFeedbackPulse();
    message.success("表单已清空，可在回溯记录里恢复");
  };

  const handleLoadPreset = async () => {
    await saveSnapshot("加载预设前");
    withSuspendedAutoSnapshot(() => {
      form.setFieldsValue({
        company_id: companies[0]?.id ?? undefined,
        invoice_number: "INV-DEMO-0001",
        warehouse_number: "WH-DEMO-0001",
        consignee_company: "Jobs Trading Co., Ltd.",
        consignee_address: "100 Example Avenue, Demo District, Sample City",
        consignee_contact: "Steve Jobs",
        consignee_phone: "+1-202-555-0101",
        consignee_mobile: "+1-202-555-0102",
        delivery_company: "Banana Depot LLC",
        delivery_address: "88 Sample Road, Suite 420, Example Harbor",
        delivery_contact: "Elon Mask",
        delivery_phone: "+1-202-555-0199",
      });
      if (companies[0]) {
        setSelectedCompany(companies[0]);
      }
      setSameAsConsignee(false);
      setItems([
        createRow(1, { part_no: "SK-BT-001", description: "Bluetooth Keyboard", qty: 50, net_weight: 12.5, gross_weight: 15.0, dimension: "38*31*8", brand: "SmartKey", coo: "China" }),
        createRow(2, { part_no: "SK-MS-002", description: "Wireless Mouse", qty: 100, net_weight: 8.0, gross_weight: 10.5, dimension: "22*12*8", brand: "SmartKey", coo: "China" }),
        createRow(3, { part_no: "SK-HB-003", description: "USB-C Hub 7-in-1", qty: 30, net_weight: 6.0, gross_weight: 8.0, dimension: "20*10*5", brand: "SmartKey", coo: "China" }),
        createRow(4, { part_no: "SK-CB-004", description: "USB-C Cable 1m", qty: 200, net_weight: 5.0, gross_weight: 6.5, dimension: "18*12*4", brand: "SmartKey", coo: "China" }),
        createRow(5, { part_no: "SK-PD-005", description: "65W GaN Charger", qty: 60, net_weight: 9.0, gross_weight: 11.5, dimension: "15*10*6", brand: "SmartKey", coo: "China" }),
      ]);
    });
    setContentRefreshTick((previous) => previous + 1);
    triggerFeedbackPulse();
    message.success("已加载预设数据，可直接点击打印预览效果");
  };

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      const record = await collectRecord();
      if (!record) return;

      const invoice = record.invoice_number.trim() || "packing-list";
      const savePath = await dialogSave({
        defaultPath: `${invoice}.xlsx`,
        filters: [{ name: "Excel 文件", extensions: ["xlsx"] }],
      });
      if (!savePath) return;

      await invoke("export_packing_list_xlsx", { record, savePath });
      message.success("XLSX 已保存");
    } catch (error) {
      message.error(`导出 XLSX 失败: ${error}`);
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleAiImport = () => {
    try {
      // Strip markdown code fences if AI wrapped it in ```json ... ```
      const cleaned = aiInput.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
      const data = JSON.parse(cleaned) as Partial<PackingListRecord>;
      void (async () => {
        await saveSnapshot("AI 导入前");
        withSuspendedAutoSnapshot(() => {
          form.setFieldsValue({
            invoice_number: data.invoice_number ?? "",
            warehouse_number: data.warehouse_number ?? "",
            consignee_company: data.consignee_company ?? "",
            consignee_address: data.consignee_address ?? "",
            consignee_contact: data.consignee_contact ?? "",
            consignee_phone: data.consignee_phone ?? "",
            consignee_mobile: data.consignee_mobile ?? "",
            delivery_company: data.delivery_company ?? "",
            delivery_address: data.delivery_address ?? "",
            delivery_contact: data.delivery_contact ?? "",
            delivery_phone: data.delivery_phone ?? "",
          });

          if (data.items && data.items.length > 0) {
            setItems(
              data.items.map((item, index) =>
                createRow(index + 1, {
                  part_no: item.part_no ?? "",
                  description: item.description ?? "",
                  qty: item.qty ?? 0,
                  net_weight: item.net_weight ?? 0,
                  gross_weight: item.gross_weight ?? 0,
                  dimension: item.dimension ?? "",
                  brand: item.brand ?? "",
                  coo: item.coo ?? "",
                }),
              ),
            );
          }

          const sameAddr =
            data.consignee_company === data.delivery_company &&
            data.consignee_address === data.delivery_address;
          setSameAsConsignee(sameAddr);
        });

        setAiModalOpen(false);
        setAiInput("");
        setContentRefreshTick((previous) => previous + 1);
        triggerFeedbackPulse();
        message.success("导入成功，请检查并补充缺失字段");
      })().catch((error) => {
        message.error(`AI 导入前保存快照失败: ${error}`);
      });
    } catch {
      message.error("JSON 解析失败，请确认格式正确");
    }
  };

  const collectRecord = async (): Promise<PackingListRecord | null> => {
    const values = await form.validateFields();
    if (!values.company_id) {
      message.error("请选择发货公司");
      return null;
    }

    return {
      id: initialRecord?.id ?? null,
      company_id: values.company_id,
      invoice_number: values.invoice_number || "",
      warehouse_number: values.warehouse_number || "",
      consignee_company: values.consignee_company || "",
      consignee_address: values.consignee_address || "",
      consignee_contact: values.consignee_contact || "",
      consignee_phone: values.consignee_phone || "",
      consignee_mobile: values.consignee_mobile || "",
      delivery_company: values.delivery_company || "",
      delivery_address: values.delivery_address || "",
      delivery_contact: values.delivery_contact || "",
      delivery_phone: values.delivery_phone || "",
      pdf_path: initialRecord?.pdf_path ?? "",
      items: items.map(({ key: _key, ...item }) => item),
      created_at: initialRecord?.created_at ?? null,
    };
  };

  const formatImportedAt = (value: string) => {
    if (!value) {
      return "未导入";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const shouldCollapseCustomerSearch = !screens.md;

  const totals = useMemo(
    () => ({
      qty: items.reduce((sum, item) => sum + (item.qty || 0), 0),
      netWeight: items.reduce((sum, item) => sum + (item.net_weight || 0), 0),
      grossWeight: items.reduce((sum, item) => sum + (item.gross_weight || 0), 0),
    }),
    [items],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          !productSearch ||
          product.part_no.toLowerCase().includes(productSearch.toLowerCase()) ||
          product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          product.brand.toLowerCase().includes(productSearch.toLowerCase()),
      ),
    [productSearch, products],
  );

  const filteredConsigneeCustomers = useMemo(
    () =>
      customers.filter(
        (customer) =>
          !consigneeCustomerSearch ||
          customer.name.toLowerCase().includes(consigneeCustomerSearch.toLowerCase()) ||
          customer.id.toLowerCase().includes(consigneeCustomerSearch.toLowerCase()),
      ),
    [consigneeCustomerSearch, customers],
  );

  const filteredDeliveryCustomers = useMemo(
    () =>
      customers.filter(
        (customer) =>
          !deliveryCustomerSearch ||
          customer.name.toLowerCase().includes(deliveryCustomerSearch.toLowerCase()) ||
          customer.id.toLowerCase().includes(deliveryCustomerSearch.toLowerCase()),
      ),
    [deliveryCustomerSearch, customers],
  );

  useEffect(() => {
    if (suspendAutoSnapshotRef.current > 0) {
      return;
    }

    const draft = buildDraftRecord();
    if (!isMeaningfulDraft(draft)) {
      lastAutoSnapshotHashRef.current = "";
      return;
    }

    const draftHash = JSON.stringify(draft);
    if (draftHash === lastAutoSnapshotHashRef.current) {
      return;
    }

    if (autoSnapshotTimerRef.current) {
      window.clearTimeout(autoSnapshotTimerRef.current);
    }

    autoSnapshotTimerRef.current = window.setTimeout(() => {
      void saveSnapshot("自动保存", draft)
        .then(() => {
          lastAutoSnapshotHashRef.current = draftHash;
        })
        .catch((error) => {
          console.error("自动保存快照失败", error);
        });
    }, 1200);

    return () => {
      if (autoSnapshotTimerRef.current) {
        window.clearTimeout(autoSnapshotTimerRef.current);
      }
    };
  }, [items, watchedValues]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const record = await collectRecord();
      if (!record) {
        return;
      }

      const id = await invoke<number>("save_packing_list", { record });
      await saveSnapshot("保存记录", { ...record, id });
      triggerFeedbackPulse();
      message.success(`装箱单已保存，记录 ID: ${id}`);
      onSaved?.(id);
    } catch (error) {
      message.error(`保存失败: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setExporting(true);
    try {
      const record = await collectRecord();
      if (!record) {
        return;
      }

      // Export HTML to file, then open in system default browser for printing
      const result = await invoke<{ file_path: string }>("export_packing_list_html", { record });
      await invoke("open_file", { path: result.file_path });
      message.success("已在浏览器中打开，请按 Ctrl+P 打印 / 导出 PDF");
    } catch (error) {
      message.error(`生成打印页面失败: ${error}`);
    } finally {
      setExporting(false);
    }
  };

  const columns: TableProps<ItemRow>["columns"] = [
    {
      title: "箱号",
      dataIndex: "box_number",
      width: columnWidths.box_number,
      render: (_, record) => record.box_number,
    },
    {
      title: "Part No.",
      dataIndex: "part_no",
      width: columnWidths.part_no,
      render: (_, record) => (
        <Select
          showSearch
          value={record.part_no || undefined}
          placeholder="搜索商品"
          filterOption={(input, option) =>
            String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
          options={filteredProducts.slice(0, 80).map((product) => ({
            value: product.part_no,
            label: `${product.part_no} - ${product.name}`,
          }))}
          onChange={(value) => selectProduct(record.key, value)}
          onSearch={setProductSearch}
          style={{ width: "100%" }}
          size="small"
        />
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      width: columnWidths.description,
      render: (_, record) => (
        <Input
          size="small"
          value={record.description}
          onChange={(event) => updateItem(record.key, "description", event.target.value)}
        />
      ),
    },
    {
      title: "QTY",
      dataIndex: "qty",
      width: columnWidths.qty,
      render: (_, record) => (
        <InputNumber
          size="small"
          value={record.qty}
          min={0}
          onChange={(value) => updateItem(record.key, "qty", value ?? 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "N.W./kg",
      dataIndex: "net_weight",
      width: columnWidths.net_weight,
      render: (_, record) => (
        <InputNumber
          size="small"
          value={record.net_weight}
          min={0}
          step={0.01}
          onChange={(value) => updateItem(record.key, "net_weight", value ?? 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "G.W./kg",
      dataIndex: "gross_weight",
      width: columnWidths.gross_weight,
      render: (_, record) => (
        <InputNumber
          size="small"
          value={record.gross_weight}
          min={0}
          step={0.01}
          onChange={(value) => updateItem(record.key, "gross_weight", value ?? 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "尺寸/cm",
      dataIndex: "dimension",
      width: columnWidths.dimension,
      render: (_, record) => (
        <Input
          size="small"
          value={record.dimension}
          placeholder="38*31*8"
          onChange={(event) => updateItem(record.key, "dimension", event.target.value)}
        />
      ),
    },
    {
      title: "品牌",
      dataIndex: "brand",
      width: columnWidths.brand,
      render: (_, record) => (
        <Input
          size="small"
          value={record.brand}
          onChange={(event) => updateItem(record.key, "brand", event.target.value)}
        />
      ),
    },
    {
      title: "产地",
      dataIndex: "coo",
      width: columnWidths.coo,
      render: (_, record) => (
        <Input
          size="small"
          value={record.coo}
          onChange={(event) => updateItem(record.key, "coo", event.target.value)}
        />
      ),
    },
    {
      title: "",
      width: columnWidths.actions,
      render: (_, record) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeRow(record.key)}
        />
      ),
    },
  ];

  const minColumnWidths: Record<string, number> = {
    box_number: 60,
    part_no: 160,
    description: 220,
    qty: 80,
    net_weight: 100,
    gross_weight: 100,
    dimension: 110,
    brand: 90,
    coo: 90,
    actions: 56,
  };

  const totalTableWidth =
    columnWidths.box_number +
    columnWidths.part_no +
    columnWidths.description +
    columnWidths.qty +
    columnWidths.net_weight +
    columnWidths.gross_weight +
    columnWidths.dimension +
    columnWidths.brand +
    columnWidths.coo +
    columnWidths.actions;

  const tableRightPadding = 240;

  const resizableColumns = columns.map((column, index) => {
    const dataIndex =
      "dataIndex" in column && typeof column.dataIndex === "string"
        ? column.dataIndex
        : undefined;
    const key = dataIndex ?? (index === columns.length - 1 ? "actions" : `col_${index}`);

    return {
      ...column,
      onHeaderCell: () => ({
        width: typeof column.width === "number" ? column.width : undefined,
        minWidth: minColumnWidths[key] ?? 80,
        onResize:
          key in columnWidths
            ? (nextWidth: number) =>
                setColumnWidths((previous) => ({
                  ...previous,
                  [key]: nextWidth,
                }))
            : undefined,
      }),
    };
  });

  return (
    <div>
      <Card
        size="small"
        title={isEditing ? "编辑装箱单" : "新建装箱单"}
        extra={
          <Space>
            {isEditing && <Button onClick={resetFormState}>退出编辑</Button>}
            <Button
              type="dashed"
              onClick={(event) => {
                captureModalOrigin(event.currentTarget);
                setAiModalOpen(true);
              }}
            >
              AI 导入
            </Button>
            <Button onClick={() => void handleLoadPreset()}>加载预设</Button>
            <Popconfirm
              title="清空当前表单？"
              description="清空前会自动存一份快照，可在回溯记录里恢复。"
              okText="清空"
              cancelText="取消"
              onConfirm={() => void handleNewRecord()}
            >
              <Button type="default">清空表单</Button>
            </Popconfirm>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <div className="form-path-input">
              <div className="form-path-input__label">客户 Excel</div>
              <Input
                value={sourcePaths.customerPath}
                placeholder={"例如：data/customer.xls 或 /path/to/customer.xls"}
                onChange={(event) =>
                  setSourcePaths((previous) => ({
                    ...previous,
                    customerPath: event.target.value,
                  }))
                }
              />
            </div>
          </Col>
          <Col span={4}>
            <Space orientation="vertical" size={4} style={{ width: "100%" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                上次导入: {formatImportedAt(sourcePaths.customerImportedAt)}
              </Text>
              <Button block onClick={() => void handleLoadCustomers()}>
                加载客户
              </Button>
            </Space>
          </Col>
          <Col span={12} style={{ marginTop: 12 }}>
            <div className="form-path-input">
              <div className="form-path-input__label">商品 Excel</div>
              <Input
                value={sourcePaths.inventoryPath}
                placeholder={"例如：data/inventory.xlsx 或 /path/to/inventory.xlsx"}
                onChange={(event) =>
                  setSourcePaths((previous) => ({
                    ...previous,
                    inventoryPath: event.target.value,
                  }))
                }
              />
            </div>
          </Col>
          <Col span={4} style={{ marginTop: 12 }}>
            <Space orientation="vertical" size={4} style={{ width: "100%" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                上次导入: {formatImportedAt(sourcePaths.inventoryImportedAt)}
              </Text>
              <Button block onClick={() => void handleLoadProducts()}>
                加载商品
              </Button>
            </Space>
          </Col>
          <Col span={12} style={{ marginTop: 12 }}>
            <div className="form-path-input">
              <div className="form-path-input__label">导出目录</div>
              <Input
                value={sourcePaths.exportDir}
                placeholder="留空则导出到应用数据目录下的 exports 文件夹"
                onChange={(event) =>
                  setSourcePaths((previous) => ({
                    ...previous,
                    exportDir: event.target.value,
                  }))
                }
              />
            </div>
          </Col>
          <Col span={4} style={{ marginTop: 12 }}>
            <Button block onClick={() => void handleSaveSettings()}>
              保存路径
            </Button>
          </Col>
        </Row>
      </Card>

      <div key={`form-refresh-${contentRefreshTick}`} className="ui-fade-through">
      <Form form={form} layout="vertical">
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="发货公司" name="company_id">
                <Select
                  placeholder="选择发货公司"
                  options={companies.map((company) => ({
                    value: company.id,
                    label: company.name,
                  }))}
                  onChange={handleCompanyChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Invoice Number" name="invoice_number">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="入仓号" name="warehouse_number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          {selectedCompany && (
            <div style={{ color: "#666", fontSize: 13 }}>
              {selectedCompany.address} | ATTN: {selectedCompany.contact_person} | TEL:{" "}
              {selectedCompany.phone}
            </div>
          )}
        </Card>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Card
              size="small"
              title="收货方 / Consignee"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  marginBottom: 12,
                }}
              >
                <Button size="small" onClick={() => void handleChooseCustomerFile()}>
                  导入客户文件
                </Button>
                {customers.length > 0 &&
                  (shouldCollapseCustomerSearch ? (
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => setConsigneeSearchPickerOpen(true)}
                    />
                  ) : (
                    <Select
                      showSearch
                      placeholder="搜索客户"
                      filterOption={(input, option) =>
                        String(option?.label ?? "")
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                      options={filteredConsigneeCustomers.slice(0, 80).map((customer) => ({
                        value: customer.id,
                        label: `${customer.name} (${customer.id})`,
                      }))}
                      onChange={handleSelectConsigneeCustomer}
                      onSearch={setConsigneeCustomerSearch}
                      style={{ flex: 1, minWidth: 0, width: "100%", maxWidth: 280 }}
                      size="small"
                    />
                  ))}
              </div>
              <Form.Item name="consignee_company" label="公司名称">
                <Input />
              </Form.Item>
              <Form.Item name="consignee_address" label="地址">
                <Input />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="consignee_contact" label="联系人">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="consignee_phone" label="电话">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="consignee_mobile" label="手机号码">
                <Input />
              </Form.Item>
            </Card>
          </Col>

          <Col span={12}>
            <Card
              size="small"
              title="交货方 / Delivery"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                {customers.length > 0 &&
                  (shouldCollapseCustomerSearch ? (
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => setDeliverySearchPickerOpen(true)}
                    />
                  ) : (
                    <Select
                      showSearch
                      placeholder="搜索客户"
                      filterOption={(input, option) =>
                        String(option?.label ?? "")
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                      options={filteredDeliveryCustomers.slice(0, 80).map((customer) => ({
                        value: customer.id,
                        label: `${customer.name} (${customer.id})`,
                      }))}
                      onChange={handleSelectDeliveryCustomer}
                      onSearch={setDeliveryCustomerSearch}
                      style={{ flex: 1, minWidth: 160, width: "100%", maxWidth: 280 }}
                      size="small"
                    />
                  ))}
                <Checkbox
                  checked={sameAsConsignee}
                  onChange={(event) => handleToggleSameAddress(event.target.checked)}
                >
                  与收货方相同
                </Checkbox>
              </div>
              <Form.Item name="delivery_company" label="公司名称">
                <Input />
              </Form.Item>
              <Form.Item name="delivery_address" label="地址">
                <Input />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="delivery_contact" label="联系人">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="delivery_phone" label="电话">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Form>

      <Card
        size="small"
        title="商品明细"
        extra={
          <Space>
            <Button size="small" onClick={() => void handleChooseInventoryFile()}>
              导入商品文件
            </Button>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addRow}>
              添加行
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={items}
          columns={resizableColumns}
          components={{
            header: {
              cell: ResizableHeaderCell,
            },
          }}
          tableLayout="fixed"
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: totalTableWidth + tableRightPadding }}
        />
        <Divider />
        <Row gutter={16}>
          <Col span={6}>
            <Text strong>Total QTY: {totals.qty.toLocaleString()}</Text>
          </Col>
          <Col span={6}>
            <Text strong>Total N.W.: {totals.netWeight.toFixed(2)} kg</Text>
          </Col>
          <Col span={6}>
            <Text strong>Total G.W.: {totals.grossWeight.toFixed(2)} kg</Text>
          </Col>
          <Col span={6}>
            <Text strong>Cartons: {items.length}</Text>
          </Col>
        </Row>
      </Card>

      <div style={{ marginTop: 16, textAlign: "right" }}>
        <Space className={feedbackPulseActive ? "ui-feedback-pulse" : undefined}>
          <Button
            type="default"
            size="large"
            loading={exportingXlsx}
            onClick={() => void handleExportXlsx()}
          >
            导出 XLSX
          </Button>
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            size="large"
            loading={exporting}
            onClick={() => void handlePrint()}
          >
            打印 / 导出 PDF
          </Button>
          <Button
            type="default"
            size="large"
            loading={saving}
            onClick={() => void handleSave()}
          >
            保存记录
          </Button>
        </Space>
      </div>
      </div>

      <Modal
        rootClassName="ui-transform-modal"
        title="AI 导入"
        open={aiModalOpen}
        onOk={handleAiImport}
        onCancel={() => { setAiModalOpen(false); setAiInput(""); }}
        okText="导入"
        cancelText="取消"
        width={640}
        style={aiModalStyle}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#666" }}>让 AI 按以下格式输出 JSON，粘贴到下方即可自动填表（支持带 ```json 代码块）：</span>
          <Button size="small" onClick={() => {
            void navigator.clipboard.writeText(`{
  "invoice_number": "INV-2026-xxxx",
  "warehouse_number": "WH-xxxxx",
  "consignee_company": "公司名",
  "consignee_address": "地址",
  "consignee_contact": "联系人",
  "consignee_phone": "电话",
  "consignee_mobile": "手机",
  "delivery_company": "交货公司",
  "delivery_address": "交货地址",
  "delivery_contact": "联系人",
  "delivery_phone": "电话",
  "items": [
    { "part_no": "SK-BT-001", "description": "产品名", "qty": 50,
      "net_weight": 12.5, "gross_weight": 15.0,
      "dimension": "38*31*8", "brand": "SmartKey", "coo": "China" }
  ]
}`).then(() => message.success("已复制"));
          }}>一键复制</Button>
        </div>
        <pre className="company-manager__json-preview" style={{ padding: 8, borderRadius: 4, fontSize: 11, marginBottom: 12, overflowX: "auto" }}>{`{
  "invoice_number": "INV-2026-xxxx",
  "warehouse_number": "WH-xxxxx",
  "consignee_company": "公司名",
  "consignee_address": "地址",
  "consignee_contact": "联系人",
  "consignee_phone": "电话",
  "consignee_mobile": "手机",
  "delivery_company": "交货公司",
  "delivery_address": "交货地址",
  "delivery_contact": "联系人",
  "delivery_phone": "电话",
  "items": [
    { "part_no": "SK-BT-001", "description": "产品名", "qty": 50,
      "net_weight": 12.5, "gross_weight": 15.0,
      "dimension": "38*31*8", "brand": "SmartKey", "coo": "China" }
  ]
}`}</pre>
        <Input.TextArea
          rows={8}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="粘贴 AI 输出的 JSON..."
        />
      </Modal>

      <Modal
        title="选择收货方客户"
        open={consigneeSearchPickerOpen}
        onCancel={() => setConsigneeSearchPickerOpen(false)}
        footer={null}
        width={640}
      >
        <Select
          showSearch
          placeholder="搜索客户"
          filterOption={(input, option) =>
            String(option?.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          options={filteredConsigneeCustomers.map((customer) => ({
            value: customer.id,
            label: `${customer.name} (${customer.id})`,
          }))}
          onChange={handleSelectConsigneeCustomer}
          onSearch={setConsigneeCustomerSearch}
          style={{ width: "100%" }}
          size="large"
        />
      </Modal>

      <Modal
        title="选择交货方客户"
        open={deliverySearchPickerOpen}
        onCancel={() => setDeliverySearchPickerOpen(false)}
        footer={null}
        width={640}
      >
        <Select
          showSearch
          placeholder="搜索客户"
          filterOption={(input, option) =>
            String(option?.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          options={filteredDeliveryCustomers.map((customer) => ({
            value: customer.id,
            label: `${customer.name} (${customer.id})`,
          }))}
          onChange={handleSelectDeliveryCustomer}
          onSearch={setDeliveryCustomerSearch}
          style={{ width: "100%" }}
          size="large"
        />
      </Modal>
    </div>
  );
}
