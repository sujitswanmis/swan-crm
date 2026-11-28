'use client';

import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import { CRMTabs } from '@/components/common/CRMDesignSystem';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { saasDateKey, saasInvoiceTotals, calculateSaasPrice, SAAS_CYCLE_MONTHS, SAAS_INTERNAL_KEYS } from '@/lib/saasBilling';
import {
  ShieldCheck,
  DollarSign,
  Building,
  Users,
  Calendar,
  Save,
  RefreshCw,
  PlusCircle,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Award,
  X,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Printer,
  Sliders,
  Sparkles,
  Trash2,
  RotateCcw,
  Edit3,
  FolderClock,
  Share2,
  MessageCircle,
  CreditCard,
  Send,
  Search,
  Receipt,
  ArrowDownCircle,
  UserCheck,
  UserX,
  Activity,
  Workflow,
  Compass,
  LogIn,
  Key,
  User,
  Phone,
  Bell,
  BarChart3,
  Mail
} from 'lucide-react';
import {
  getSaasMasterSnapshot,
  getProcessCatalog,
  getCycleDiscounts,
  updateProcessRate,
  updateCycleDiscount,
  getAllTenantsWithSubscriptions,
  extendTenantSubscription,
  updateTenantSeats,
  updateTenantCustomRate,
  createTenantWorkspace,
  updateTenantEntitlements,
  updateTenantSmtpLimit,
  getTenantTelephonyConfig,
  updateTenantTelephonyConfig,
  extendTenantSubscriptionTrial,
  recordPaymentAndGenerateInvoice,
  updateTenantValidityAndStatus,
  softDeleteTenantWorkspace,
  restoreTenantWorkspace,
  permanentDeleteTenantWorkspace,
  addNewProcessModule,
  processAddonSeatsAndInvoice,
  getTenantBillingHistory,
  getTenantActiveUsers,
  reduceTenantSeatsAndHoldUsers,
  getAllMasterInvoices,
  createRenewalProformaInvoice,
  cancelPendingSaasProforma
} from '@/app/actions/saasSubscription';
import PlanPricingCalculator from './PlanPricingCalculator';


export function SaasDataTable({ id, children, paginate = true, view, hideToggle = false }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try { const size = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize; return size === 'All' ? 100000 : (Number(size) || 25); } catch { return 25; }
  });
  const table = React.Children.only(children);
  const sections = React.Children.toArray(table.props.children);
  const head = sections.find(section => section.type === 'thead');
  const headerRow = React.Children.toArray(head?.props.children)[0];
  const headers = React.Children.toArray(headerRow?.props.children);
  const defaults = Object.fromEntries(headers.map((header, index) => [String(index), Number(header.props.style?.width) || (paginate ? 180 : 120)]));
  const { colWidths, resizingCol, handleResizeStart, resetColWidth } = useTableColumnResize('saas-columns:' + id, defaults);
  const body = sections.find(section => section.type === 'tbody');
  const rows = React.Children.toArray(body?.props.children);
  const empty = rows.length === 1 && React.Children.toArray(rows[0]?.props.children).some(cell => cell.props?.colSpan > 1);
  const total = empty ? 0 : rows.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const changeSize = useCallback(size => { setPageSize(size); setPage(1); }, []);
  const rendered = React.cloneElement(table, { style: { ...table.props.style, tableLayout: 'fixed', minWidth: paginate ? Object.values(colWidths).reduce((a,b) => a+b,0) : '100%' } }, sections.map(section => {
    if (section.type === 'thead') return React.cloneElement(section, { style: { ...section.props.style, position:'sticky', top:0, zIndex:10 } }, React.cloneElement(headerRow, {}, headers.map((header,index) => React.cloneElement(header, { key:index, style:{...header.props.style, width:colWidths[String(index)], minWidth:70, position:'sticky', top:0, zIndex:10, backgroundColor:'var(--bg-surface)', boxShadow:'inset 0 -1px 0 var(--border-light)' } }, header.props.children, <ColumnResizer colKey={String(index)} isResizing={resizingCol===String(index)} onResizeStart={handleResizeStart} onReset={resetColWidth} />))));
    if (section.type === 'tbody' && paginate && !empty) return React.cloneElement(section, {}, rows.slice((currentPage-1)*pageSize,currentPage*pageSize));
    return section;
  }));
  return <div data-saas-table={id}>
    <div style={{overflow:'auto',maxHeight:'calc(100vh - 310px)',minHeight:paginate?'380px':undefined}}>
      <MobileTableView id={'SaaS/'+id} view={view} hideToggle={hideToggle}>{rendered}</MobileTableView>
    </div>
    {paginate && <StandardTablePagination currentPage={currentPage} totalRecords={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={changeSize} />}
  </div>;
}

export default function SuperAdminSaasPanel({ initialTab = 'pricing', activeSubTab, onSubTabChange }) {
  const router = useRouter();
  const [localTab, setActiveTab] = useState(initialTab || 'pricing');
  const activeTab = activeSubTab || localTab;
  const operationRequests = useRef(new Map());
  const operationBusy = useRef(new Set());
  const requestFor = (operation, details) => {
    const fingerprint = operation + ':' + JSON.stringify(details);
    if (!operationRequests.current.has(fingerprint)) {
      let key;
      try { key = sessionStorage.getItem('saas-request:' + fingerprint); } catch { /* Storage is optional. */ }
      key = key || crypto.randomUUID();
      operationRequests.current.set(fingerprint,key);
      try { sessionStorage.setItem('saas-request:' + fingerprint,key); } catch { /* The in-memory key still protects retries. */ }
    }
    return operationRequests.current.get(fingerprint);
  }; // 'pricing' | 'tenants'

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'billing' || tab === 'requests' || tab === 'trials') {
      loadMasterInvoices();
    }
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/saas-master/${tab}`);
    }
  };

  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [tenantsView, setTenantsView] = useTableViewPreference('SaaS/tenants');
  const [pricingView, setPricingView] = useTableViewPreference('SaaS/pricing');
  const [billingView, setBillingView] = useTableViewPreference('SaaS/billing');

  // Pricing & Discounts State
  const [catalog, setCatalog] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [customRates, setCustomRates] = useState({});
  const [discountInputs, setDiscountInputs] = useState({});

  // Tenants State
  const [tenants, setTenants] = useState([]);
  const [extendingId, setExtendingId] = useState(null);
  const [seatModalTenant, setSeatModalTenant] = useState(null);
  const [newSeatValue, setNewSeatValue] = useState(5);
  const [seatBillingMode, setSeatBillingMode] = useState('SAME_EXPIRY'); // 'SAME_EXPIRY' | 'EXTEND_VALIDITY'
  const [seatExtendMonths, setSeatExtendMonths] = useState(12);
  const [seatDealPrice, setSeatDealPrice] = useState('');
  const [seatPaymentMode, setSeatPaymentMode] = useState('UPI');
  const [seatTransactionId, setSeatTransactionId] = useState('');
  const [seatGstType, setSeatGstType] = useState('IGST'); // 'IGST' | 'CGST_SGST'
  const [processingSeats, setProcessingSeats] = useState(false);

  // Telephony & Calling Seats Config Modal State
  const [telephonyModalTenant, setTelephonyModalTenant] = useState(null);
  const [telephonyLoading, setTelephonyLoading] = useState(false);
  const [telephonySaving, setTelephonySaving] = useState(false);
  const [telephonyMode, setTelephonyMode] = useState('managed'); // 'managed' | 'byoc'
  const [telephonyAuthId, setTelephonyAuthId] = useState('');
  const [telephonyAuthToken, setTelephonyAuthToken] = useState('');
  const [telephonyShowToken, setTelephonyShowToken] = useState(false);
  const [telephonyFromNumber, setTelephonyFromNumber] = useState('+918035340622');
  const [telephonySeatLimit, setTelephonySeatLimit] = useState(5);

  // Billing History Ledger Modal State
  const [historyModalTenant, setHistoryModalTenant] = useState(null);
  const [billingHistoryList, setBillingHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Active Invoice View State (for Add-on or Ledger Invoices)
  const [activeInvoiceData, setActiveInvoiceData] = useState(null);
  const [invoiceGstMode, setInvoiceGstMode] = useState('IGST'); // 'IGST' | 'CGST_SGST' | 'NON_GST'

  // Seat Downgrade & Excess Employee Hold State
  const [tenantActiveUsers, setTenantActiveUsers] = useState([]);
  const [loadingTenantUsers, setLoadingTenantUsers] = useState(false);
  const [selectedHoldUserIds, setSelectedHoldUserIds] = useState([]);
  const [downgradeReason, setDowngradeReason] = useState('');
  const [processingDowngrade, setProcessingDowngrade] = useState(false);

  // Master Invoices Sub-Page State
  const [masterInvoices, setMasterInvoices] = useState([]);
  const [loadingMasterInvoices, setLoadingMasterInvoices] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL');
  const [pendingReqFilter, setPendingReqFilter] = useState('ALL');
  const [trialAuditSearch, setTrialAuditSearch] = useState('');

  // Create Client Tenant Modal State (Master Admin Exclusive)
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminMobile, setNewAdminMobile] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [createTrialDays, setCreateTrialDays] = useState(0);

  // Manage Modules Modal State
  const [modulesModalTenant, setModulesModalTenant] = useState(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState(new Set());
  const [moduleSeatOverrides, setModuleSeatOverrides] = useState({});
  const [smtpLimitInput, setSmtpLimitInput] = useState(1);
  const [savingModules, setSavingModules] = useState(false);
  const [modulesModalError, setModulesModalError] = useState(null);

  // Free Trial Modal State
  const [trialModalTenant, setTrialModalTenant] = useState(null);
  const [trialDaysInput, setTrialDaysInput] = useState(7);
  const [customTrialInput, setCustomTrialInput] = useState('');
  const [grantingTrial, setGrantingTrial] = useState(false);

  // Invoice / Proforma Modal State
  const [invoiceTenant, setInvoiceTenant] = useState(null);
  const [invoiceType, setInvoiceType] = useState('proforma'); // 'proforma' | 'tax_invoice'
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('UPI');
  const [payUtr, setPayUtr] = useState('');
  const [payMonths, setPayMonths] = useState(12);
  const [recordingPay, setRecordingPay] = useState(false);
  const [issuingProforma, setIssuingProforma] = useState(false);

  // Workspace Tabs & Lifecycle States
  const [workspaceSubTab, setWorkspaceSubTab] = useState('active'); // 'active' | 'draft' | 'deleted'
  const [deleteConfirmTenant, setDeleteConfirmTenant] = useState(null);
  const [permanentDeleteConfirmTenant, setPermanentDeleteConfirmTenant] = useState(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  // Custom Expiry Date Picker & Status Editor Modal State
  const [editValidityTenant, setEditValidityTenant] = useState(null);
  const [inputValidityDate, setInputValidityDate] = useState('');
  const [inputValidityStatus, setInputValidityStatus] = useState('ACTIVE');
  const [savingValidity, setSavingValidity] = useState(false);
  const [validityError, setValidityError] = useState(null);

  // Add New Module Modal State
  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [newModCode, setNewModCode] = useState('');
  const [newModName, setNewModName] = useState('');
  const [newModCategory, setNewModCategory] = useState('OPERATIONS');
  const [newModDesc, setNewModDesc] = useState('');
  const [newModRate, setNewModRate] = useState(99);
  const [addingModule, setAddingModule] = useState(false);
  const [addModuleError, setAddModuleError] = useState(null);

  // Impersonate Workspace User Modal State (Master Admin)
  const [impersonateTenant, setImpersonateTenant] = useState(null);
  const [impersonateUsers, setImpersonateUsers] = useState([]);
  const [loadingImpersonateUsers, setLoadingImpersonateUsers] = useState(false);
  const [impersonateSearch, setImpersonateSearch] = useState('');
  const [launchingUserId, setLaunchingUserId] = useState(null);

  const handleOpenImpersonateWorkspace = async (tenant) => {
    setImpersonateTenant(tenant);
    setImpersonateUsers([]);
    setImpersonateSearch('');
    setLoadingImpersonateUsers(true);
    try {
      const res = await getTenantActiveUsers(tenant.id);
      if (res.success) {
        const all = [...(res.activeUsers || []), ...(res.heldUsers || [])];
        setImpersonateUsers(all);
      } else {
        showNotification(res.error || 'Failed to load users for this workspace.', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoadingImpersonateUsers(false);
    }
  };

  const handleLaunchImpersonation = (targetUser) => {
    if (!targetUser?.user_id) {
      showNotification('Target user ID is missing.', true);
      return;
    }
    setLaunchingUserId(targetUser.user_id);
    const impersonateUrl = `/?view_as=${encodeURIComponent(targetUser.user_id)}`;
    const newTab = window.open(impersonateUrl, '_blank');
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      router.push(impersonateUrl);
    }
    setTimeout(() => {
      setLaunchingUserId(null);
    }, 1200);
  };

  const loadMasterInvoices = async () => {
    setLoadingMasterInvoices(true);
    try {
      const res = await getAllMasterInvoices();
      if (res.success) {
        setMasterInvoices(res.invoices || []);
      }
    } catch (err) {
      console.error('loadMasterInvoices error:', err);
    } finally {
      setLoadingMasterInvoices(false);
    }
  };

  const loadTenantActiveUsersList = async (tId) => {
    setLoadingTenantUsers(true);
    try {
      const res = await getTenantActiveUsers(tId);
      if (res.success) {
        setTenantActiveUsers(res.activeUsers || []);
      } else {
        setTenantActiveUsers([]);
      }
    } catch (err) {
      console.error('loadTenantActiveUsersList error:', err);
      setTenantActiveUsers([]);
    } finally {
      setLoadingTenantUsers(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const snapshot = await getSaasMasterSnapshot();
      if (!snapshot.success) throw new Error(snapshot.error);
      const [catRes, cycleRes, tenantsRes, masterInvRes] = snapshot.data;

      if (catRes.success) {
        setCatalog(catRes.catalog || []);
        const ratesMap = {};
        (catRes.catalog || []).forEach(c => {
          ratesMap[c.process_code] = c.monthly_rate_per_user;
        });
        setCustomRates(ratesMap);
      }

      if (cycleRes.success) {
        setCycles(cycleRes.cycles || []);
        const discMap = {};
        (cycleRes.cycles || []).forEach(cy => {
          discMap[cy.cycle_code] = cy.discount_percent;
        });
        setDiscountInputs(discMap);
      }

      if (tenantsRes.success) {
        setTenants(tenantsRes.tenants || []);
      }

      if (masterInvRes.success) {
        setMasterInvoices(masterInvRes.invoices || []);
      }
    } catch (err) {
      console.error('Failed to load SaaS admin data:', err);
      setStatusMessage({text:err.message||'SaaS data could not be loaded. Please retry.',isError:true});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      try {
        const snapshot = await getSaasMasterSnapshot();
      if (!snapshot.success) throw new Error(snapshot.error);
      const [catRes, cycleRes, tenantsRes, masterInvRes] = snapshot.data;

        if (!isMounted) return;

        if (catRes.success) {
          setCatalog(catRes.catalog || []);
          const ratesMap = {};
          (catRes.catalog || []).forEach(c => {
            ratesMap[c.process_code] = c.monthly_rate_per_user;
          });
          setCustomRates(ratesMap);
        }

        if (cycleRes.success) {
          setCycles(cycleRes.cycles || []);
          const discMap = {};
          (cycleRes.cycles || []).forEach(cy => {
            discMap[cy.cycle_code] = cy.discount_percent;
          });
          setDiscountInputs(discMap);
        }

        if (tenantsRes.success) {
          setTenants(tenantsRes.tenants || []);
        }

        if (masterInvRes.success) {
          setMasterInvoices(masterInvRes.invoices || []);
        }
      } catch (err) {
        console.error('Failed to load SaaS admin data:', err);
      setStatusMessage({text:err.message||'SaaS data could not be loaded. Please retry.',isError:true});
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initData();
    return () => { isMounted = false; };
  }, []);

  const showNotification = (msg, isError = false) => {
    setStatusMessage({ text: msg, isError });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleSavePrice = async (processCode) => {
    const rate = customRates[processCode];
    if (isNaN(rate) || rate < 0) {
      showNotification('Please enter a valid rate amount', true);
      return;
    }
    setSavingCode(processCode);
    try {
      const res = await updateProcessRate(processCode, rate);
      if (res.success) {
        showNotification(res.message);
        setCatalog(current => current.map(item => item.process_code === processCode ? {...item,monthly_rate_per_user:rate} : item));
      } else {
        showNotification(res.error || 'Failed to update process rate', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setSavingCode(null);
    }
  };

  const handleSaveDiscount = async (cycleCode) => {
    const disc = discountInputs[cycleCode];
    if (isNaN(disc) || disc < 0 || disc > 100) {
      showNotification('Please enter a discount percentage between 0 and 100', true);
      return;
    }
    setSavingCode(cycleCode);
    try {
      const res = await updateCycleDiscount(cycleCode, disc);
      if (res.success) {
        showNotification(res.message);
        setCycles(current => current.map(cycle => cycle.cycle_code === cycleCode ? {...cycle,discount_percent:disc} : cycle));
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setSavingCode(null);
    }
  };

  const handleExtend = async (tenantId, months) => {
    setExtendingId(tenantId);
    try {
      const res = await extendTenantSubscription(tenantId, months);
      if (res.success) {
        showNotification(res.message);
        await loadData();
      } else {
        showNotification(res.error || 'Failed to extend subscription validity', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setExtendingId(null);
    }
  };

  const calculateSuggestedSeatPrice = (tenant, targetSeats, mode, months) => {
    if (!tenant) return 0;
    const currSeats = tenant.user_seat_limit || 5;
    const addSeats = Math.max(0, targetSeats - currSeats);
    const sub = tenant.subscription;
    const daysRemaining = Math.max(0, Number(sub?.days_remaining) || 0);

    let monthlyRatePerUser = 0;
    (tenant.entitlements || []).forEach(m => {
      const mod = catalog.find(c => c.process_code === m);
      monthlyRatePerUser += (tenant.module_rates?.[m] ?? mod?.monthly_rate_per_user ?? 0);
    });


    if (mode === 'SAME_EXPIRY') {
      return Math.round(addSeats * monthlyRatePerUser * (daysRemaining / 30));
    } else {
      return Math.round(targetSeats * monthlyRatePerUser * Number(months || 12));
    }
  };

  const handleOpenEditSeats = (t) => {
    setSeatModalTenant(t);
    const curr = t.user_seat_limit || 5;
    setNewSeatValue(curr);
    setSeatBillingMode('SAME_EXPIRY');
    setSeatExtendMonths(12);
    setSeatGstType('IGST');
    setSeatPaymentMode('UPI');
    setSeatTransactionId('');
    setSelectedHoldUserIds([]);
    setDowngradeReason('');
    const suggested = calculateSuggestedSeatPrice(t, curr, 'SAME_EXPIRY', 12);
    setSeatDealPrice(suggested);
    loadTenantActiveUsersList(t.id);
  };

  const handleSeatSeatsChange = (val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setNewSeatValue(num);
    const curr = seatModalTenant?.user_seat_limit || 5;
    if (num >= curr) {
      const suggested = calculateSuggestedSeatPrice(seatModalTenant, num, seatBillingMode, seatExtendMonths);
      setSeatDealPrice(suggested);
    }
  };

  const handleSeatModeChange = (mode) => {
    setSeatBillingMode(mode);
    const suggested = calculateSuggestedSeatPrice(seatModalTenant, newSeatValue, mode, seatExtendMonths);
    setSeatDealPrice(suggested);
  };

  const handleSeatMonthsChange = (months) => {
    setSeatExtendMonths(months);
    const suggested = calculateSuggestedSeatPrice(seatModalTenant, newSeatValue, 'EXTEND_VALIDITY', months);
    setSeatDealPrice(suggested);
  };

  const handleUpdateSeats = async () => {
  if (!seatModalTenant || operationBusy.current.has('seats')) return;
  operationBusy.current.add('seats');
  setProcessingSeats(true);
  try {
    const res = await updateTenantSeats(seatModalTenant.id, newSeatValue, requestFor('quick-seats', [seatModalTenant.id, newSeatValue, seatModalTenant.user_seat_limit]));
    if (!res.success) throw new Error(res.error);
    showNotification(res.message);
    setSeatModalTenant(null);
    await loadData();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    operationBusy.current.delete('seats');
    setProcessingSeats(false);
  }
};

  const handleProcessDowngradeSeats = async () => {
  if (!seatModalTenant || operationBusy.current.has('seats')) return;
  const excess = Math.max(0, tenantActiveUsers.length - Number(newSeatValue));
  if (selectedHoldUserIds.length < excess) {
    showNotification('Select enough eligible users for HOLD.', true);
    return;
  }
  operationBusy.current.add('seats');
  setProcessingDowngrade(true);
  try {
    const details = {
      tenantId: seatModalTenant.id,
      currentSeats: seatModalTenant.user_seat_limit,
      newSeats: Number(newSeatValue),
      holdUserIds: [...selectedHoldUserIds].sort(),
      reason: downgradeReason
    };
    const res = await reduceTenantSeatsAndHoldUsers({
      ...details,
      requestId: requestFor('downgrade', details)
    });
    if (!res.success) throw new Error(res.error);
    showNotification(res.message);
    setSeatModalTenant(null);
    setSelectedHoldUserIds([]);
    await loadData();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    operationBusy.current.delete('seats');
    setProcessingDowngrade(false);
  }
};

  const handleProcessAddonSeats = async invType => {
  if (!seatModalTenant || operationBusy.current.has('seats')) return;
  operationBusy.current.add('seats');
  setProcessingSeats(true);
  try {
    const details = {
      tenantId: seatModalTenant.id,
      currentSeats: seatModalTenant.user_seat_limit,
      newSeats: Number(newSeatValue),
      billingMode: seatBillingMode,
      monthsToAdd: seatExtendMonths,
      dealPrice: seatDealPrice,
      invoiceType: invType,
      paymentMode: seatPaymentMode,
      transactionId: seatTransactionId,
      gstType: seatGstType
    };
    const res = await processAddonSeatsAndInvoice({
      ...details,
      requestId: requestFor('addon', details)
    });
    if (!res.success) throw new Error(res.error);
    showNotification(res.message);
    setSeatModalTenant(null);
    await loadData();
    setActiveInvoiceData(res.invoice);
    setInvoiceTenant({
      ...seatModalTenant,
      user_seat_limit: res.newSeatLimit
    });
    setInvoiceType(invType);
    setInvoiceGstMode(res.invoice.gst_type);
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    operationBusy.current.delete('seats');
    setProcessingSeats(false);
  }
};

  const handleOpenBillingHistory = async (t) => {
    setHistoryModalTenant(t);
    setLoadingHistory(true);
    try {
      const res = await getTenantBillingHistory(t.id);
      if (res.success) {
        setBillingHistoryList(res.invoices || []);
      } else {
        setBillingHistoryList([]);
        showNotification(res.error, true);
      }
    } catch (err) {
      console.error('Error fetching billing history:', err);
      setBillingHistoryList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleViewHistoricalInvoice = (inv) => {
    if (!historyModalTenant) return;
    setActiveInvoiceData(inv);
    setInvoiceTenant(historyModalTenant);
    setInvoiceType(inv.invoice_type || (inv.status === 'PAID' ? 'tax_invoice' : 'proforma'));
    setInvoiceGstMode(inv.gst_type || (inv.tax_amount === 0 ? 'NON_GST' : 'IGST'));
    setPayAmount(inv.amount ?? 0);
  };

  const handleShareWhatsApp = (inv, tenant) => {
    const isNonGst = (inv?.gst_type === 'NON_GST') || (invoiceGstMode === 'NON_GST');
    const subtotal = inv?.amount ?? (Number(payAmount) || tenant?.subscription?.amount || 0);
    const tax = isNonGst ? 0 : (inv?.tax_amount != null ? inv.tax_amount : Math.round(Number(subtotal) * 0.18));
    const total = isNonGst ? Number(subtotal) : (inv?.total_payable != null ? inv.total_payable : Math.round(Number(subtotal) * 1.18));
    const invNo = inv?.invoice_number || (invoiceType === 'tax_invoice' ? `INV-${tenant?.tenant_code || 'WS'}-PAID` : `PI-${tenant?.tenant_code || 'EST'}-01`);

    let typeLabel = invoiceType === 'tax_invoice' ? 'TAX INVOICE (PAID)' : 'PROFORMA INVOICE (ESTIMATE)';
    if (isNonGst) {
      typeLabel = invoiceType === 'tax_invoice' ? 'COMMERCIAL INVOICE (NON-GST / PAID)' : 'PROFORMA BILL (NON-GST / ESTIMATE)';
    }
    const seatsDesc = inv?.category === 'ADDON_MODULE' && inv?.requested_users
      ? `${inv.requested_users} Module Users`
      : inv?.additional_seats
        ? `+${inv.additional_seats} Additional Seats (Total Limit: ${inv.total_seats || tenant?.user_seat_limit} Users)`
        : `${tenant?.user_seat_limit || 5} User Seats`;

    const text = `*NEW SWAN CRM - ${typeLabel}*
━━━━━━━━━━━━━━━━━━━━━━
🏢 *Client:* ${tenant?.name || ''}
📄 *Invoice #:* ${invNo}
👥 *Seats:* ${seatsDesc}
💰 *Subtotal:* ₹${Number(subtotal).toLocaleString('en-IN')}
🏛️ *GST:* ${isNonGst ? 'NIL (Non-GST Commercial Bill)' : `₹${Number(tax).toLocaleString('en-IN')} (18%)`}
💵 *Total Payable:* ₹${Number(total).toLocaleString('en-IN')}
📌 *Status:* ${invoiceType === 'tax_invoice' ? '✅ PAID & ACTIVE' : '⏳ PENDING PAYMENT'}
━━━━━━━━━━━━━━━━━━━━━━
🏦 *Bank / UPI Details:*
A/c Name: New Swan Multitech Limited
Bank: HDFC Bank Ltd | A/c: 50200039281746
IFSC: HDFC0000259 | UPI: newswan@okhdfcbank
━━━━━━━━━━━━━━━━━━━━━━
Thank you for choosing New Swan CRM!`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCreateClientWorkspace = async (planData, isDraft = false) => {
    if (operationBusy.current.has('create')) return;
    operationBusy.current.add('create');
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await createTenantWorkspace({
        requestId: requestFor('create', [newCompanyName,newAdminName,newAdminEmail,newAdminMobile,planData,createTrialDays,isDraft]),
        companyName: newCompanyName,
        adminEmail: newAdminEmail,
        adminPassword: newAdminPassword,
        adminName: newAdminName,
        adminMobile: newAdminMobile,
        processCodes: planData?.processCodes || ['LEADS_WITH_CALLING'],
        userSeats: planData?.seats || 5,
        cycleCode: planData?.cycleCode || 'YEARLY',
        trialDays: createTrialDays,
        isDraft,
        dealPrice: planData?.dealPrice,
        discountPercent: planData?.discountPercent,
        planPrice: planData?.planPrice,
        dealNotes: planData?.dealNotes
      });

      if (res.success) {
        setCreateSuccess(res.message);
        showNotification(res.message);
        await loadData();
        setTimeout(() => {
          setShowCreateTenantModal(false);
          setCreateStep(1);
          setNewCompanyName('');
          setNewAdminName('');
          setNewAdminEmail('');
          setNewAdminMobile('');
          setNewAdminPassword('');
          setCreateTrialDays(0);
          setCreateSuccess(null);
        }, 1500);
      } else {
        setCreateError(res.error || 'Failed to create workspace.');
      }
    } catch (err) {
      setCreateError(err.message || 'An error occurred.');
    } finally {
      operationBusy.current.delete('create');
      setCreateLoading(false);
    }
  };

  const handleOpenModulesModal = (t) => {
    setModulesModalTenant(t);
    setModulesModalError(null);
    setSelectedModuleKeys(new Set((t.entitlements || []).filter(key => !SAAS_INTERNAL_KEYS.has(key) && catalog.some(p => p.process_code === key))));
    const seatMap = {};
    for (const det of t.entitlement_details || []) {
      seatMap[det.module_key] = det.has_custom_seats ? det.licensed_seats : '';
    }
    setModuleSeatOverrides(seatMap);
    setSmtpLimitInput(t.smtp_accounts_limit || 1);
  };

  const handleToggleModuleKey = (code) => {
    const next = new Set(selectedModuleKeys);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setSelectedModuleKeys(next);
  };

  const handleSaveModules = async () => {
    if (!modulesModalTenant) return;
    setSavingModules(true);
    setModulesModalError(null);
    try {
      const [resEntitlements, resSmtp] = await Promise.all([
        updateTenantEntitlements(modulesModalTenant.id, Array.from(selectedModuleKeys), moduleSeatOverrides),
        updateTenantSmtpLimit(modulesModalTenant.id, smtpLimitInput)
      ]);
      if (resEntitlements.success && resSmtp.success) {
        await loadData();
        setModulesModalTenant(null);
        showNotification(`${resEntitlements.message} | SMTP quota updated to ${smtpLimitInput} account(s)!`);
        window.dispatchEvent(new CustomEvent('saas-billing-updated'));
      } else {
        const errMsg = resEntitlements.error || resSmtp.error || 'Failed to update modules & SMTP quota';
        setModulesModalError(errMsg);
        showNotification(errMsg, true);
      }
    } catch (err) {
      const errMsg = err?.message || 'Failed to save module settings.';
      setModulesModalError(errMsg);
      showNotification(errMsg, true);
    } finally {
      setSavingModules(false);
    }
  };

  const handleGrantTrial = async () => {
    if (!trialModalTenant) return;
    setGrantingTrial(true);
    try {
      const days = trialDaysInput === 'custom' ? parseInt(customTrialInput, 10) || 7 : parseInt(trialDaysInput, 10);
      const res = await extendTenantSubscriptionTrial(trialModalTenant.id, days);
      if (res.success) {
        showNotification(res.message);
        setTrialModalTenant(null);
        await loadData();
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setGrantingTrial(false);
    }
  };

  const handleOpenTelephonyModal = async (t) => {
    setTelephonyModalTenant(t);
    setTelephonyLoading(true);
    setTelephonyShowToken(false);
    try {
      const res = await getTenantTelephonyConfig(t.id, t.name);
      if (res?.success && res.config) {
        setTelephonyMode(res.config.mode || 'managed');
        setTelephonyAuthId(res.config.auth_id || '');
        setTelephonyAuthToken(res.config.auth_token || '');
        setTelephonyFromNumber(res.config.from_number || '+918035340622');
        setTelephonySeatLimit(res.config.calling_seat_limit || 5);
      } else {
        setTelephonyMode(t.calling_mode || 'managed');
        setTelephonyAuthId('');
        setTelephonyAuthToken('');
        setTelephonyFromNumber('+918035340622');
        setTelephonySeatLimit(t.calling_seats_limit || 5);
      }
    } catch (err) {
      console.error('Failed to load tenant telephony config:', err);
    } finally {
      setTelephonyLoading(false);
    }
  };

  const handleSaveTelephonyConfig = async () => {
    if (!telephonyModalTenant) return;
    setTelephonySaving(true);
    try {
      const res = await updateTenantTelephonyConfig(
        telephonyModalTenant.id,
        telephonyModalTenant.name,
        {
          mode: telephonyMode,
          authId: telephonyAuthId,
          authToken: telephonyAuthToken,
          fromNumber: telephonyFromNumber,
          callingSeatLimit: telephonySeatLimit
        }
      );
      if (res?.success) {
        showNotification(res.message);
        setTelephonyModalTenant(null);
        await loadData();
      } else {
        showNotification(res?.error || 'Failed to update telephony configuration.', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setTelephonySaving(false);
    }
  };

  const estimateTenantRenewalAmount = (tenant, months = 12) => {
    if (!tenant) return 0;
    const defaultMonths = SAAS_CYCLE_MONTHS[tenant.subscription?.billing_cycle] || 12;
    if (Number(tenant.subscription?.amount) > 0 && months === defaultMonths) {
      return Number(tenant.subscription.amount);
    }
    const enabledKeys = new Set(tenant.entitlements || []);
    const hasComboLeadCalling = enabledKeys.has('LEADS_WITH_CALLING');
    const detailMap = new Map((tenant.entitlement_details || []).map(d => [d.module_key, d]));
    const items = (catalog || [])
      .filter(p =>
        enabledKeys.has(p.process_code) &&
        p.is_active !== false &&
        !SAAS_INTERNAL_KEYS.has(p.process_code) &&
        !(hasComboLeadCalling && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE'))
      );
    if (items.length === 0) return 0;
    const matchedCycle = (cycles || []).find(c => (c.months_count ?? c.months) === months);
    const disc = Number(matchedCycle?.discount_percent || 0);
    const defaultSeats = Math.max(1, Number(tenant.user_seat_limit) || 5);
    const total = items.reduce((sum, p) => {
      const rate = Number(tenant.module_rates?.[p.process_code] ?? p.monthly_rate_per_user ?? 0);
      const seats = detailMap.get(p.process_code)?.licensed_seats || defaultSeats;
      const gross = Math.round(rate * seats * months * 100) / 100;
      const net = Math.round(gross * (1 - disc / 100) * 100) / 100;
      return sum + net;
    }, 0);
    return Math.round(total * 100) / 100;
  };

  const handleOpenInvoice = (tenant, type = 'proforma') => {
  const defaultMonths = SAAS_CYCLE_MONTHS[tenant.subscription?.billing_cycle] || 12;
  const estimated = estimateTenantRenewalAmount(tenant, defaultMonths);
  setActiveInvoiceData(null);
  setInvoiceGstMode('IGST');
  setInvoiceTenant(tenant);
  setInvoiceType(type === 'tax_invoice' ? 'proforma' : type);
  setPayMonths(defaultMonths);
  setPayAmount(estimated);
  setPayMode('UPI');
  setPayUtr('');
};

  const handleIssueRenewalProforma = async () => {
    if (!invoiceTenant || issuingProforma) return;
    const baseAmt = Number(payAmount === '' ? estimateTenantRenewalAmount(invoiceTenant, payMonths) : payAmount);
    if (!(baseAmt > 0)) {
      showNotification('Proforma amount must be greater than ₹0.', true);
      return;
    }
    setIssuingProforma(true);
    try {
      const res = await createRenewalProformaInvoice({
        tenantId: invoiceTenant.id,
        months: payMonths,
        amount: baseAmt,
        gstType: invoiceGstMode,
        requestId: requestFor('renewal_proforma', [invoiceTenant.id, payMonths, baseAmt, invoiceGstMode])
      });
      if (!res.success) throw new Error(res.error);
      showNotification(res.message);
      setActiveInvoiceData(res.invoice);
      setInvoiceGstMode(res.invoice.gst_type);
      setInvoiceType('proforma');
      setPayAmount(res.invoice.amount ?? baseAmt);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('saas-billing-updated'));
      }
      await Promise.all([loadData(), loadMasterInvoices()]);
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setIssuingProforma(false);
    }
  };

  const handleCancelMasterProforma = async (targetTenantId, invoiceNumber) => {
    if (!targetTenantId || !invoiceNumber) return;
    try {
      const res = await cancelPendingSaasProforma(targetTenantId, invoiceNumber, 'Cancelled by Master Admin');
      if (!res?.success) throw new Error(res?.error || 'Could not cancel proforma.');
      showNotification(res.message);
      if (historyModalTenant?.id === targetTenantId) {
        const histRes = await getTenantBillingHistory(targetTenantId);
        if (histRes?.success) setBillingHistoryList(histRes.invoices || []);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('saas-billing-updated'));
      }
      await Promise.all([loadData(), loadMasterInvoices()]);
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  const handleRecordPayment = async () => {
  if (!invoiceTenant || operationBusy.current.has('payment')) return;
  const resolvedAmount = Number(payAmount === '' ? 0 : payAmount);
  const cleanUtr = String(payUtr || '').trim();
  if (!(resolvedAmount > 0)) {
    showNotification('Paid Amount (₹) must be greater than 0 before generating a Tax Invoice.', true);
    return;
  }
  if (!cleanUtr) {
    showNotification('Enter a valid UTR / Transaction Reference ID before confirming payment.', true);
    return;
  }
  operationBusy.current.add('payment');
  setRecordingPay(true);
  try {
    const details = {
      tenantId: invoiceTenant.id,
      amount: resolvedAmount,
      paymentMode: payMode,
      transactionId: cleanUtr,
      months: payMonths,
      gstType: invoiceGstMode,
      sourceInvoiceNumber: activeInvoiceData?.invoice_type === 'proforma' ? activeInvoiceData.invoice_number : null
    };
    const res = await recordPaymentAndGenerateInvoice({
      ...details,
      requestId: requestFor('payment', [details, invoiceTenant.subscription?.valid_until])
    });
    if (!res.success) throw new Error(res.error);
    showNotification(res.message);
    setActiveInvoiceData(res.invoice);
    setInvoiceGstMode(res.invoice.gst_type);
    setInvoiceTenant({
      ...invoiceTenant,
      subscription: {
        ...invoiceTenant.subscription,
        valid_until: res.newExpiry,
        amount: res.invoice.amount
      }
    });
    setInvoiceType('tax_invoice');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('saas-billing-updated'));
    }
    await Promise.all([loadData(), loadMasterInvoices()]);
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    operationBusy.current.delete('payment');
    setRecordingPay(false);
  }
};

  const handleSoftDelete = async () => {
    if (!deleteConfirmTenant) return;
    setDeletingWorkspace(true);
    try {
      const res = await softDeleteTenantWorkspace(deleteConfirmTenant.id);
      if (res.success) {
        showNotification(res.message);
        setDeleteConfirmTenant(null);
        await loadData();
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const handleRestore = async (t) => {
    try {
      const res = await restoreTenantWorkspace(t.id);
      if (res.success) {
        showNotification(res.message);
        await loadData();
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteConfirmTenant) return;
    setDeletingWorkspace(true);
    try {
      const res = await permanentDeleteTenantWorkspace(permanentDeleteConfirmTenant.id);
      if (res.success) {
        showNotification(res.message);
        setPermanentDeleteConfirmTenant(null);
        await loadData();
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const handleOpenEditValidity = tenant => {
  setEditValidityTenant(tenant);
  setValidityError(null);
  const expiry = tenant.subscription?.valid_until || new Date(Date.now() + 7 * 86400000);
  setInputValidityDate(saasDateKey(expiry));
  setInputValidityStatus(tenant.raw_status === 'SUSPENDED' ? 'SUSPENDED' : tenant.subscription?.status === 'EXPIRING_SOON' ? 'ACTIVE' : tenant.status || 'ACTIVE');
};

  const handleSaveValidity = async () => {
    if (!editValidityTenant) return;
    setSavingValidity(true);
    setValidityError(null);
    try {
      const res = await updateTenantValidityAndStatus({
        tenantId: editValidityTenant.id,
        validUntil: inputValidityDate,
        status: inputValidityStatus
      });
      if (res.success) {
        showNotification(res.message);
        setEditValidityTenant(null);
        await loadData();
      } else {
        setValidityError(res.error || 'Failed to update validity');
        showNotification(res.error, true);
      }
    } catch (err) {
      setValidityError(err.message);
      showNotification(err.message, true);
    } finally {
      setSavingValidity(false);
    }
  };

  const handleAddNewModule = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newModCode.trim() || !newModName.trim()) {
      setAddModuleError('Module Code aur Display Name required hain!');
      return;
    }
    setAddingModule(true);
    setAddModuleError(null);
    try {
      const res = await addNewProcessModule({
        processCode: newModCode,
        displayName: newModName,
        category: newModCategory,
        description: newModDesc,
        monthlyRate: newModRate
      });
      if (res.success) {
        showNotification(res.message);
        setShowAddModuleModal(false);
        setNewModCode('');
        setNewModName('');
        setNewModDesc('');
        setNewModRate(99);
        await loadData();
      } else {
        setAddModuleError(res.error || 'Failed to add module');
      }
    } catch (err) {
      setAddModuleError(err.message);
    } finally {
      setAddingModule(false);
    }
  };

  const invoiceBase = Number(activeInvoiceData?.amount ?? (payAmount === '' ? invoiceTenant?.subscription?.amount : payAmount)) || 0;
  const invoiceTotals = saasInvoiceTotals(Math.max(0,invoiceBase),activeInvoiceData?.gst_type || invoiceGstMode,activeInvoiceData);

  const activeTenants = tenants.filter(t => t.status !== 'DRAFT' && t.status !== 'DELETED');
  const draftTenants = tenants.filter(t => t.status === 'DRAFT');
  const deletedTenants = tenants.filter(t => t.status === 'DELETED');

  const displayedTenants = workspaceSubTab === 'draft'
    ? draftTenants
    : workspaceSubTab === 'deleted'
      ? deletedTenants
      : activeTenants;

  return (
    <div style={{ width: '100%', color: 'var(--text-primary)' }}>
      {/* Top Segmented Tabs Bar */}
      {(() => {
        const pendingCnt = masterInvoices.filter(i => String(i.status || '').toUpperCase() === 'PENDING').length;
        const expiringCnt = tenants.filter(t => !t.is_master_hq && t.status !== 'DELETED' && t.status !== 'DRAFT' && (t.subscription?.is_expired || t.subscription?.is_expiring_soon || (t.subscription?.days_remaining != null && t.subscription.days_remaining <= 15))).length;
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <CRMTabs
              id="saas-master"
              label="SaaS Master views"
              value={activeTab}
              onChange={handleTabSwitch}
              items={[
                { id: 'pricing', label: 'Pricing & Catalog', icon: DollarSign },
                { id: 'tenants', label: 'Client Workspaces', icon: Building, count: tenants.length },
                { id: 'billing', label: 'Master Invoices', icon: Receipt, count: masterInvoices.length },
                { id: 'requests', label: 'Pending Requests', icon: Bell, count: pendingCnt },
                { id: 'trials', label: 'Trials & Expiry Audit', icon: Clock, count: expiringCnt },
                { id: 'analytics', label: 'Usage & Module Matrix', icon: BarChart3 }
              ]}
            />
          </div>
        );
      })()}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>SaaS Master Control & Pricing Studio</h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#dbeafe', color: '#1d4ed8' }}>
              Master Admin
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.3rem 0 0 0' }}>
            Product pricing, module catalog, discount rules, and client workspace management
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status Toast */}
      {statusMessage && (
        <div style={{
          backgroundColor: statusMessage.isError ? '#fee2e2' : '#ecfdf5',
          color: statusMessage.isError ? '#991b1b' : '#065f46',
          border: `1px solid ${statusMessage.isError ? '#fecaca' : '#a7f3d0'}`,
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.25rem',
          fontSize: '0.9rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {statusMessage.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {statusMessage.text}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>Total Tenants (Workspaces)</span>
            <Building size={18} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{tenants.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>1 Master + {Math.max(0, tenants.length - 1)} SaaS Workspaces</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>Active Business Modules</span>
            <Award size={18} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{catalog.filter(p => p.is_active !== false).length || 16} Modules</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>100% Decoupled À la Carte</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>Primary Client Workspace</span>
            <ShieldCheck size={18} style={{ color: '#10b981' }} />
          </div>
          {(() => {
            const primaryClient = tenants.find(t => !t.is_master_hq && t.tenant_code === 'TNT00002') || tenants.find(t => !t.is_master_hq);
            return (
              <>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>{primaryClient?.name || 'New Swan Group'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {primaryClient?.branches?.length || 8} Branches • {primaryClient?.user_seat_limit || 300} Seats
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* TAB 1: PRICING & DISCOUNTS */}
      {activeTab === 'pricing' && (
        <div>
          {/* Process Catalog Table */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
                  {catalog.length} Business Modules — Monthly Rate Editor (₹ / User / Mo)
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                  Any price adjustments made here will immediately reflect in the pricing calculator and client invoices.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModuleModal(true);
                    setAddModuleError(null);
                    setNewModCode('');
                    setNewModName('');
                    setNewModCategory('OPERATIONS');
                    setNewModDesc('');
                    setNewModRate(99);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(67, 56, 202, 0.25)'
                  }}
                >
                  <PlusCircle size={16} /> + Add New Business Module
                </button>
                <TableViewToggle view={pricingView} onChange={setPricingView} style={{ marginLeft: 0 }} />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <SaasDataTable id="pricing" view={pricingView} hideToggle={true}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Module Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                    <th style={{ padding: '0.75rem 1rem', width: '200px' }}>Rate (₹ / User / Mo)</th>
                    <th style={{ padding: '0.75rem 1rem', width: '120px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map(item => (
                    <tr key={item.process_code} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.82rem' }}>
                        {item.process_code}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        {item.display_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'var(--bg-muted)' }}>
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {item.description}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600 }}>₹</span>
                          <input
                            type="number"
                            value={customRates[item.process_code] ?? item.monthly_rate_per_user}
                            onChange={(e) => setCustomRates({ ...customRates, [item.process_code]: Number(e.target.value) })}
                            style={{
                              width: '100px',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-surface)',
                              fontSize: '0.9rem',
                              fontWeight: 600
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => handleSavePrice(item.process_code)}
                          disabled={savingCode === item.process_code}
                          style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#fff',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Save size={13} /> {savingCode === item.process_code ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></SaasDataTable>
            </div>
          </div>

          {/* Billing Cycle Discounts */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Billing Cycles & Discount Percentage (%)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Tenants selecting longer billing commitments automatically receive these cycle discounts.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {cycles.map(cycle => (
                <div key={cycle.cycle_code} style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{cycle.display_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        value={discountInputs[cycle.cycle_code] ?? cycle.discount_percent}
                        onChange={(e) => setDiscountInputs({ ...discountInputs, [cycle.cycle_code]: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '0.45rem 2rem 0.45rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-surface)',
                          fontWeight: 600
                        }}
                      />
                      <Percent size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    </div>
                    <button
                      onClick={() => handleSaveDiscount(cycle.cycle_code)}
                      disabled={savingCode === cycle.cycle_code}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#10b981',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {savingCode === cycle.cycle_code ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TENANTS & WORKSPACES */}
      {activeTab === 'tenants' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Client Workspaces & Active Plans</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Manage client workspaces, extend subscription validity, and configure seat limits.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateTenantModal(true);
                  setCreateStep(1);
                  setCreateError(null);
                  setCreateSuccess(null);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  backgroundColor: '#4338ca',
                  color: '#ffffff',
                  padding: '0.6rem 1.15rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(67, 56, 202, 0.25)'
                }}
              >
                <PlusCircle size={16} /> + Create Client Workspace
              </button>
              <TableViewToggle view={tenantsView} onChange={setTenantsView} style={{ marginLeft: 0 }} />
            </div>
          </div>

          {/* Sub-tab switcher */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setWorkspaceSubTab('active')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: workspaceSubTab === 'active' ? '#2563eb' : 'var(--bg-muted)',
                color: workspaceSubTab === 'active' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              <Building size={15} /> Active Workspaces ({activeTenants.length})
            </button>

            <button
              type="button"
              onClick={() => setWorkspaceSubTab('draft')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: workspaceSubTab === 'draft' ? '#4b5563' : 'var(--bg-muted)',
                color: workspaceSubTab === 'draft' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              <FolderClock size={15} /> 📝 Drafts ({draftTenants.length})
            </button>

            <button
              type="button"
              onClick={() => setWorkspaceSubTab('deleted')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: workspaceSubTab === 'deleted' ? '#b91c1c' : 'var(--bg-muted)',
                color: workspaceSubTab === 'deleted' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              <Trash2 size={15} /> 🗑️ Deleted Archive (90-Day Retention) ({deletedTenants.length})
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <SaasDataTable id="tenants" key={workspaceSubTab} view={tenantsView} hideToggle={true}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Company / Workspace</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Seats (Active / Limit)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Active Modules</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Expiry Date (IST)</th>
                  <th style={{ padding: '0.75rem 1rem', width: '380px' }}>
                    {workspaceSubTab === 'deleted' ? 'Archive Management' : 'Quick Actions'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedTenants.map(t => {
                  const isDefault = t.id === '00000000-0000-0000-0000-000000000001';
                  const sub = t.subscription;
                  const expiryFormatted = sub?.valid_until
                    ? new Date(sub.valid_until).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'N/A';

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t.name}</span>
                          <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.5px', border: '1px solid #c7d2fe' }}>
                            {t.tenant_code || 'TNT00001'}
                          </span>
                        </div>
                        {t.primary_contact_email && (
                          <div style={{ fontSize: '0.74rem', color: '#4f46e5', marginTop: '0.2rem', fontWeight: 500 }}>
                            Admin: {t.primary_contact_email}
                          </div>
                        )}
                        {t.branches && t.branches.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                            {t.branches.map(b => (
                              <span key={b} style={{ fontSize: '0.68rem', background: '#f8fafc', color: '#1e293b', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                                🏢 {b}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        {(() => {
                          const status = t.status || (sub?.is_expired ? 'EXPIRED' : (sub?.is_expiring_soon ? 'EXPIRING SOON' : 'ACTIVE'));
                          let bg = '#dbeafe';
                          let color = '#1e40af';
                          let label = status;

                          if (status === 'TRIAL') {
                            bg = '#fef3c7';
                            color = '#b45309';
                            label = '🎁 FREE TRIAL';
                          } else if (status === 'DRAFT') {
                            bg = '#f3f4f6';
                            color = '#4b5563';
                            label = '📝 DRAFT';
                          } else if (status === 'DELETED') {
                            bg = '#fee2e2';
                            color = '#991b1b';
                            label = '🗑️ DELETED (ARCHIVE)';
                          } else if (status === 'EXPIRED' || sub?.is_expired) {
                            bg = '#fee2e2';
                            color = '#991b1b';
                            label = 'EXPIRED';
                          } else if (status === 'EXPIRING SOON' || sub?.is_expiring_soon) {
                            bg = '#fef3c7';
                            color = '#92400e';
                            label = 'EXPIRING SOON';
                          } else {
                            bg = '#dcfce7';
                            color = '#15803d';
                            label = 'ACTIVE';
                          }

                          return (
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.25rem 0.65rem',
                              borderRadius: '12px',
                              background: bg,
                              color: color,
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <strong>{t.active_users_count}</strong> / {t.user_seat_limit}
                        <button
                          onClick={() => handleOpenEditSeats(t)}
                          style={{
                            marginLeft: '0.5rem',
                            border: 'none',
                            background: 'none',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            textDecoration: 'underline'
                          }}
                        >
                          Edit
                        </button>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {(t.entitlement_details && t.entitlement_details.length > 0) ? (
                            t.entitlement_details.map(det => {
                              const usedSeats = Number(det.used_seats ?? 0);
                              const licensedSeats = Number(det.licensed_seats || 0);
                              const isOverLimit = !det.included_in_combo && licensedSeats > 0 && usedSeats > licensedSeats;
                              return (
                                <span
                                  key={det.module_key}
                                  title={det.included_in_combo
                                    ? `Included inside Lead + Direct Calling Combo (${usedSeats} active users)`
                                    : `Used: ${usedSeats} / Licensed: ${licensedSeats} users (${det.staff_used_seats ?? 0} staff + ${det.admin_used_seats ?? 0} admin) @ ₹${det.monthly_rate_per_user}/user/mo`}
                                  style={{
                                    fontSize: '0.71rem',
                                    background: det.included_in_combo ? '#f8fafc' : isOverLimit ? '#fef2f2' : det.has_custom_seats ? '#eef2ff' : '#ecfdf5',
                                    color: det.included_in_combo ? '#64748b' : isOverLimit ? '#b91c1c' : det.has_custom_seats ? '#3730a3' : '#047857',
                                    padding: '0.16rem 0.45rem',
                                    borderRadius: '4px',
                                    border: `1px solid ${det.included_in_combo ? '#e2e8f0' : isOverLimit ? '#fecaca' : det.has_custom_seats ? '#c7d2fe' : '#a7f3d0'}`,
                                    fontWeight: 600
                                  }}
                                >
                                  {det.display_name} • {det.included_in_combo ? `Combo (${usedSeats}u)` : `${usedSeats}/${det.licensed_seats}u (₹${det.monthly_rate_per_user})`}
                                </span>
                              );
                            })
                          ) : (
                            (t.entitlements || []).map(mod => (
                              <span key={mod} style={{ fontSize: '0.72rem', background: 'var(--bg-muted)', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                {mod}
                              </span>
                            ))
                          )}
                          <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fde68a', fontWeight: 600 }} title="Allowed SMTP server account connections">
                            📧 SMTP: {t.smtp_accounts_limit || 1}
                          </span>
                          <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 600 }} title="Calling Seats Limit and Telephony Mode">
                            📞 Calling: {t.calling_seats_limit || 5} Seats ({t.calling_mode === 'byoc' ? 'BYOC' : 'Managed'})
                          </span>
                          <button
                            onClick={() => handleOpenModulesModal(t)}
                            style={{
                              padding: '2px 8px',
                              border: '1px solid #93c5fd',
                              borderRadius: '4px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title="Edit active business modules and SMTP quota for this company"
                          >
                            ⚙️ Edit
                          </button>
                        </div>
                        {Array.isArray(t.pending_requests) && t.pending_requests.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                            {t.pending_requests.map(req => (
                              <span
                                key={req.invoice_number}
                                title={req.description}
                                style={{
                                  fontSize: '0.69rem',
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  padding: '0.14rem 0.45rem',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}
                              >
                                ⏳ {req.category === 'ADDON_MODULE'
                                  ? `Req: ${req.module_name || req.module_key || 'Module'} (${req.requested_users || t.user_seat_limit}u)`
                                  : req.category === 'ADDON_SEATS'
                                    ? `Req: +${req.additional_seats} Seats`
                                    : 'Renewal PI'} • ₹{Number(req.total_payable || req.amount || 0).toLocaleString('en-IN')}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        {t.is_master_hq || sub?.never_expires ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ fontWeight: 700, color: '#059669' }}>Lifetime (Master HQ)</span>
                            <span style={{ fontSize: '0.73rem', color: '#047857', fontWeight: 600 }}>Never Expires</span>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600 }}>{expiryFormatted}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditValidity(t)}
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #c7d2fe',
                                  background: '#eff6ff',
                                  color: '#3730a3',
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                                title="Edit exact validity date or revert accidental +1M/+6M/+1Y clicks"
                              >
                                <Edit3 size={11} /> Edit Date
                              </button>
                            </div>
                            {sub && sub.days_remaining != null && (
                              <div style={{ fontSize: '0.75rem', color: sub.days_remaining <= 7 ? '#dc2626' : 'var(--text-secondary)', marginTop: '2px' }}>
                                {sub.days_remaining > 0 ? `(${sub.days_remaining} days left)` : '(Expired)'}
                              </div>
                            )}
                            {sub?.billing_cycle && (
                              <div style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 600, marginTop: '2px' }}>
                                {sub.billing_cycle}
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {workspaceSubTab === 'deleted' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRestore(t)}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid #10b981',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Restore this workspace back to Active"
                              >
                                <RotateCcw size={13} /> Restore
                              </button>

                              <button
                                type="button"
                                onClick={() => setPermanentDeleteConfirmTenant(t)}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid #dc2626',
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Permanently remove this workspace from database"
                              >
                                <Trash2 size={13} /> Permanent Delete
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Login as User / Impersonate Workspace */}
                              <button
                                type="button"
                                onClick={() => handleOpenImpersonateWorkspace(t)}
                                style={{
                                  padding: '0.3rem 0.65rem',
                                  borderRadius: '6px',
                                  border: '1px solid #10b981',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 2px rgba(16, 185, 129, 0.1)'
                                }}
                                title={`Login directly as Admin or User of ${t.name}`}
                              >
                                <LogIn size={12} /> Login as User
                              </button>

                              {/* Invoice Button */}
                              <button
                                onClick={() => handleOpenInvoice(t, sub?.status === 'ACTIVE' ? 'tax_invoice' : 'proforma')}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  border: '1px solid #8b5cf6',
                                  background: '#f5f3ff',
                                  color: '#6d28d9',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="Generate Proforma or Paid Tax Invoice"
                              >
                                <FileText size={12} /> Invoice
                              </button>

                              {/* Billing History Ledger Button */}
                              <button
                                onClick={() => handleOpenBillingHistory(t)}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  border: '1px solid #0284c7',
                                  background: '#f0f9ff',
                                  color: '#0369a1',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="View complete billing ledger and all past invoices"
                              >
                                <FolderClock size={12} /> Ledger
                              </button>

                              {/* Telephony & Calling Seats Config Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenTelephonyModal(t)}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  border: '1px solid #0284c7',
                                  background: '#f0f9ff',
                                  color: '#0369a1',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="Configure Telephony mode (Managed/BYOC), Auth ID & Token, and Calling Seat Quota"
                              >
                                <Phone size={12} /> Telephony
                              </button>

                              {/* Free Trial Button */}
                              <button
                                onClick={() => {
                                  setTrialModalTenant(t);
                                  setTrialDaysInput(7);
                                  setCustomTrialInput('');
                                }}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  border: '1px solid #f59e0b',
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                                title="Assign 1, 3, 7, 10 or custom days trial"
                              >
                                🎁 Trial
                              </button>

                              {/* Extend Buttons */}
                              <button
                                onClick={() => handleExtend(t.id, 1)}
                                disabled={extendingId === t.id}
                                style={{
                                  padding: '0.3rem 0.55rem',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                  background: '#fff',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Add 1 Month"
                              >
                                +1M
                              </button>

                              <button
                                onClick={() => handleExtend(t.id, 6)}
                                disabled={extendingId === t.id}
                                style={{
                                  padding: '0.3rem 0.55rem',
                                  borderRadius: '6px',
                                  border: '1px solid #2563eb',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Add 6 Months"
                              >
                                +6M
                              </button>

                              <button
                                onClick={() => handleExtend(t.id, 12)}
                                disabled={extendingId === t.id}
                                style={{
                                  padding: '0.3rem 0.55rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#10b981',
                                  color: '#fff',
                                  fontSize: '0.76rem',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Add 1 Year"
                              >
                                +1Y
                              </button>

                              {/* Soft Delete Button (Protected for Master Default Tenant) */}
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmTenant(t)}
                                  style={{
                                    padding: '0.3rem 0.55rem',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title="Move to Deleted Archive (90-Day Safe Retention)"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {displayedTenants.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {workspaceSubTab === 'deleted'
                        ? 'No workspaces in Deleted Archive.'
                        : workspaceSubTab === 'draft'
                          ? 'No draft workspaces found. Save client onboarding as draft to see them here.'
                          : 'No active client workspaces found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table></SaasDataTable>
          </div>
        </div>
      )}

      {/* TAB 3: MASTER BILLING & INVOICES */}
      {activeTab === 'billing' && (
        <div>
          {/* Header & Refresh */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Receipt size={22} color="#4338ca" />
                Master Invoices & Centralized Billing Ledger
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                All generated Tax Invoices, Proforma Invoices, Seat Expansions, and Downgrades across all {tenants.length} client workspaces in real-time.
              </p>
            </div>

            <button
              onClick={loadMasterInvoices}
              disabled={loadingMasterInvoices}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#4338ca'
              }}
            >
              <RefreshCw size={15} className={loadingMasterInvoices ? 'spin' : ''} />
              {loadingMasterInvoices ? 'Refreshing...' : 'Refresh Invoices'}
            </button>
          </div>

          {/* Master Billing KPI Stats Cards */}
          {(() => {
            const paidInvoices = masterInvoices.filter(i => i.status === 'PAID');
            const pendingInvoices = masterInvoices.filter(i => i.status === 'PENDING');
            const totalPaidRevenue = paidInvoices.reduce((acc, i) => acc + (Number(i.total_payable) || Number(i.amount) || 0), 0);
            const totalGstCollected = paidInvoices.reduce((acc, i) => acc + (Number(i.tax_amount) || 0), 0);
            const totalPendingValue = pendingInvoices.reduce((acc, i) => acc + (Number(i.total_payable) || Number(i.amount) || 0), 0);

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #16a34a' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Paid Revenue</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                    ₹{totalPaidRevenue.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    {paidInvoices.length} Paid Invoices
                  </div>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #2563eb' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total GST Collected</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
                    ₹{totalGstCollected.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    18% IGST / CGST+SGST
                  </div>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #d97706' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pending Proforma Pipeline</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
                    ₹{totalPendingValue.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    {pendingInvoices.length} Unpaid Estimates
                  </div>
                </div>

                <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #7c3aed' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Ledger Records</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.25rem' }}>
                    {masterInvoices.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Across {tenants.length} Workspaces
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Search & Filter Bar */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search by Client Name, Invoice #, or Reference..."
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Status Filter Pills & View Toggle */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { id: 'ALL', label: 'All Invoices' },
                  { id: 'PAID', label: 'Paid Tax Invoices' },
                  { id: 'PENDING', label: 'Pending Proforma' },
                  { id: 'TRIAL_LOGS', label: 'Trial & Expiry Logs' },
                  { id: 'ADDON_SEATS', label: 'Seat Expansions' },
                  { id: 'SEAT_REDUCTION', label: 'Downgrades' },
                  { id: 'NON_GST', label: 'Non-GST Bills' },
                  { id: 'VOID_CANCELLED', label: 'Void / Cancelled' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setInvoiceStatusFilter(f.id)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '20px',
                      border: '1px solid',
                      borderColor: invoiceStatusFilter === f.id ? '#4338ca' : '#cbd5e1',
                      background: invoiceStatusFilter === f.id ? '#eef2ff' : '#fff',
                      color: invoiceStatusFilter === f.id ? '#4338ca' : '#475569',
                      fontSize: '0.78rem',
                      fontWeight: invoiceStatusFilter === f.id ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
                <TableViewToggle view={billingView} onChange={setBillingView} style={{ marginLeft: '0.25rem' }} />
              </div>
            </div>

            {/* Invoices Table */}
            {(() => {
              const q = (invoiceSearchQuery || '').toLowerCase().trim();
              const filteredInvoices = masterInvoices.filter(inv => {
                if (invoiceStatusFilter === 'PAID' && inv.status !== 'PAID') return false;
                if (invoiceStatusFilter === 'PENDING' && inv.status !== 'PENDING') return false;
                if (invoiceStatusFilter === 'TRIAL_LOGS' && !['TRIAL_GRANT', 'MANUAL_EXTENSION', 'VALIDITY_ADJUSTMENT'].includes(inv.category || inv.operation)) return false;
                if (invoiceStatusFilter === 'ADDON_SEATS' && inv.category !== 'ADDON_SEATS') return false;
                if (invoiceStatusFilter === 'SEAT_REDUCTION' && inv.category !== 'SEAT_REDUCTION') return false;
                if (invoiceStatusFilter === 'NON_GST' && inv.gst_type !== 'NON_GST') return false;
                if (invoiceStatusFilter === 'VOID_CANCELLED' && !['VOID', 'CANCELLED'].includes(String(inv.status || '').toUpperCase())) return false;

                if (!q) return true;
                const matchName = (inv.tenant_name || '').toLowerCase().includes(q);
                const matchCode = (inv.tenant_code || '').toLowerCase().includes(q);
                const matchInv = (inv.invoice_number || '').toLowerCase().includes(q);
                const matchDesc = (inv.description || '').toLowerCase().includes(q);
                const matchUtr = (inv.transaction_id || '').toLowerCase().includes(q);
                return matchName || matchCode || matchInv || matchDesc || matchUtr;
              });

              return (
                <div style={{ overflowX: 'auto' }}>
                  <SaasDataTable id="billing" key={invoiceSearchQuery+":"+invoiceStatusFilter} view={billingView} hideToggle={true}><table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Invoice # & Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Client Workspace</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Category & Details</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right' }}>Taxable Amount</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right' }}>GST Tax</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Payable</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                            {loadingMasterInvoices ? 'Loading master invoices...' : 'No invoices match the selected filter or search.'}
                          </td>
                        </tr>
                      ) : (
                        filteredInvoices.map((inv, idx) => {
                          const statusUpper = String(inv.status || '').toUpperCase();
                          const isPaid = statusUpper === 'PAID';
                          const isVoid = statusUpper === 'VOID' || statusUpper === 'CANCELLED';
                          const isTrialOrLog = ['TRIAL_LOG', 'LOGGED', 'COMPLETED'].includes(statusUpper);
                          const isReduction = inv.category === 'SEAT_REDUCTION';
                          const tenantObj = tenants.find(t => t.id === inv.tenant_id) || { id: inv.tenant_id, name: inv.tenant_name, tenant_code: inv.tenant_code };

                          return (
                            <tr key={inv.id || idx} style={{ borderBottom: '1px solid #f1f5f9', opacity: isVoid ? 0.65 : 1 }}>
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ fontWeight: 700, color: '#1e1b4b', fontFamily: 'monospace' }}>
                                  {inv.invoice_number}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                                  {inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.tenant_name}</div>
                                <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                                  <code>{inv.tenant_code}</code>
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem' }}>
                                {(() => {
                                  const rawDesc = String(inv.description || '');
                                  const modCode = inv.module_key || (rawDesc.startsWith('Module add-on request:') ? rawDesc.replace('Module add-on request:', '').trim() : '');
                                  const matchedMod = modCode ? catalog.find(c => c.process_code === modCode) : null;
                                  const displayDesc = matchedMod && rawDesc.startsWith('Module add-on request:')
                                    ? `${matchedMod.display_name} (${inv.requested_users || inv.total_seats || 'Workspace'} Users)`
                                    : (rawDesc || inv.category);
                                  return (
                                    <>
                                      <div style={{ fontWeight: 600, color: isReduction ? '#dc2626' : '#334155', fontSize: '0.82rem' }}>
                                        {displayDesc}
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        {inv.gst_type === 'NON_GST' ? '🏷️ Non-GST Commercial Bill' : (inv.gst_type || 'IGST 18%')}
                                      </div>
                                      {isVoid && inv.void_reason && (
                                        <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px' }}>{inv.void_reason}</div>
                                      )}
                                    </>
                                  );
                                })()}
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                                {isReduction ? '₹0' : `₹${Number(inv.amount || 0).toLocaleString('en-IN')}`}
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b' }}>
                                {inv.gst_type === 'NON_GST' || isReduction ? '₹0' : `₹${Number(inv.tax_amount || 0).toLocaleString('en-IN')}`}
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: isPaid ? '#15803d' : '#0f172a' }}>
                                {isReduction ? '₹0' : `₹${Number(inv.total_payable || inv.amount || 0).toLocaleString('en-IN')}`}
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  background: isVoid ? '#fef2f2' : isPaid ? '#dcfce7' : (isReduction || isTrialOrLog) ? '#f1f5f9' : '#fef3c7',
                                  color: isVoid ? '#dc2626' : isPaid ? '#15803d' : (isReduction || isTrialOrLog) ? '#475569' : '#b45309'
                                }}>
                                  {statusUpper === 'CANCELLED' ? 'CANCELLED' : isVoid ? 'VOID / REVERSED' : isPaid ? 'PAID' : isReduction ? 'ADJUSTMENT' : statusUpper === 'TRIAL_LOG' ? 'TRIAL LOG' : isTrialOrLog ? 'LOGGED' : 'PENDING'}
                                </span>
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                  {!isReduction && !isTrialOrLog && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveInvoiceData(inv);
                                          setInvoiceTenant(tenantObj);
                                          setInvoiceType(inv.invoice_type || (isPaid ? 'tax_invoice' : 'proforma'));
                                          setInvoiceGstMode(inv.gst_type || (inv.tax_amount === 0 ? 'NON_GST' : 'IGST'));
                                          setPayAmount(inv.amount ?? 0);
                                          setPayMonths(inv.months_added || 12);
                                          setPayUtr('');
                                        }}
                                        style={{
                                          padding: '0.3rem 0.6rem',
                                          borderRadius: '6px',
                                          border: '1px solid #cbd5e1',
                                          background: '#fff',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          color: '#4338ca',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px'
                                        }}
                                        title="View, Print or Download Invoice"
                                      >
                                        <Eye size={13} /> View
                                      </button>

                                      {!isVoid && (
                                        <button
                                          type="button"
                                          onClick={() => handleShareWhatsApp(inv, tenantObj)}
                                          style={{
                                            padding: '0.3rem 0.55rem',
                                            borderRadius: '6px',
                                            border: '1px solid #86efac',
                                            background: '#f0fdf4',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            color: '#16a34a',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                          }}
                                          title="Share on WhatsApp"
                                        >
                                          <MessageCircle size={13} />
                                        </button>
                                      )}

                                      {statusUpper === 'PENDING' && (
                                        <button
                                          type="button"
                                          onClick={() => handleCancelMasterProforma(inv.tenant_id, inv.invoice_number)}
                                          style={{
                                            padding: '0.3rem 0.55rem',
                                            borderRadius: '6px',
                                            border: '1px solid #fecaca',
                                            background: '#fef2f2',
                                            fontSize: '0.73rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            color: '#dc2626',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                          }}
                                          title="Cancel pending proforma request"
                                        >
                                          <X size={12} /> Cancel
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table></SaasDataTable>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 4: PENDING APPROVALS & REQUESTS QUEUE */}
      {activeTab === 'requests' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={20} style={{ color: '#d97706' }} /> Pending Approvals &amp; Client Requests
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Actionable queue of unpaid Add-on Module requests, Extra Seat expansions, and Renewal Proformas awaiting payment confirmation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => Promise.all([loadData(), loadMasterInvoices()])}
              disabled={loadingMasterInvoices}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} className={loadingMasterInvoices ? 'spin' : ''} /> Refresh Queue
            </button>
          </div>

          {(() => {
            const allPending = masterInvoices.filter(inv => String(inv.status || '').toUpperCase() === 'PENDING');
            const moduleReqs = allPending.filter(inv => inv.category === 'ADDON_MODULE');
            const seatReqs = allPending.filter(inv => inv.category === 'ADDON_SEATS');
            const renewalReqs = allPending.filter(inv => inv.category === 'RENEWAL_PROFORMA');
            const totalPendingSum = allPending.reduce((acc, i) => acc + (Number(i.total_payable) || Number(i.amount) || 0), 0);

            const filteredReqs = allPending.filter(inv => {
              if (pendingReqFilter !== 'ALL' && inv.category !== pendingReqFilter) return false;
              const q = (invoiceSearchQuery || '').trim().toLowerCase();
              if (!q) return true;
              return (
                (inv.tenant_name || '').toLowerCase().includes(q) ||
                (inv.tenant_code || '').toLowerCase().includes(q) ||
                (inv.invoice_number || '').toLowerCase().includes(q) ||
                (inv.description || '').toLowerCase().includes(q)
              );
            });

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #d97706' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Pending Queue</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>{allPending.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Pipeline: ₹{totalPendingSum.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #4f46e5' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Module Add-on Requests</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.2rem' }}>{moduleReqs.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Per-user module activations</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0284c7' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Extra Seat Requests</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7', marginTop: '0.2rem' }}>{seatReqs.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Workspace capacity expansions</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #059669' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Renewal Proformas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>{renewalReqs.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Auto &amp; manual renewal PIs</div>
                  </div>
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                      <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Search pending PI #, tenant name, module..."
                        value={invoiceSearchQuery}
                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2.1rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        { id: 'ALL', label: `All Pending (${allPending.length})` },
                        { id: 'ADDON_MODULE', label: `Modules (${moduleReqs.length})` },
                        { id: 'ADDON_SEATS', label: `Extra Seats (${seatReqs.length})` },
                        { id: 'RENEWAL_PROFORMA', label: `Renewals (${renewalReqs.length})` }
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setPendingReqFilter(f.id)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '20px',
                            border: '1px solid',
                            borderColor: pendingReqFilter === f.id ? '#4338ca' : '#cbd5e1',
                            background: pendingReqFilter === f.id ? '#eef2ff' : '#fff',
                            color: pendingReqFilter === f.id ? '#4338ca' : '#475569',
                            fontSize: '0.76rem',
                            fontWeight: pendingReqFilter === f.id ? 700 : 500,
                            cursor: 'pointer'
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                      <TableViewToggle view={billingView} onChange={setBillingView} />
                    </div>
                  </div>

                  <SaasDataTable id="requests" key={`req:${pendingReqFilter}:${invoiceSearchQuery}`} view={billingView} hideToggle={true}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', width: 185 }}>Proforma # &amp; Date (IST)</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', width: 175 }}>Client Workspace</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', width: 120 }}>Request Type</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', width: 250 }}>Details &amp; Calculation Basis</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', width: 125 }}>Total Payable</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', width: 220 }}>Quick Approval</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReqs.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                              🎉 No pending approval requests in this queue!
                            </td>
                          </tr>
                        ) : (
                          filteredReqs.map(inv => {
                            const tenantObj = tenants.find(t => t.id === inv.tenant_id) || { id: inv.tenant_id, name: inv.tenant_name, tenant_code: inv.tenant_code };
                            return (
                              <tr key={inv.invoice_number} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.75rem' }}>
                                  <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#3730a3' }}>{inv.invoice_number}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    {inv.created_at ? new Date(inv.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                                  </div>
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{inv.tenant_name}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}><code>{inv.tenant_code}</code></div>
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    background: inv.category === 'ADDON_MODULE' ? '#eef2ff' : inv.category === 'ADDON_SEATS' ? '#e0f2fe' : '#ecfdf5',
                                    color: inv.category === 'ADDON_MODULE' ? '#4338ca' : inv.category === 'ADDON_SEATS' ? '#0369a1' : '#047857'
                                  }}>
                                    {inv.category === 'ADDON_MODULE' ? 'Module Add-on' : inv.category === 'ADDON_SEATS' ? 'Extra Seats' : 'Renewal PI'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{inv.description}</div>
                                  {inv.pricing_basis && (
                                    <div style={{ fontSize: '0.71rem', color: '#4338ca', marginTop: '2px' }}>{inv.pricing_basis}</div>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>₹{Number(inv.total_payable || inv.amount || 0).toLocaleString('en-IN')}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Base: ₹{Number(inv.amount || 0).toLocaleString('en-IN')}</div>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveInvoiceData(inv);
                                        setInvoiceTenant(tenantObj);
                                        setInvoiceType('proforma');
                                        setInvoiceGstMode(inv.gst_type || 'IGST');
                                        setPayAmount(inv.amount ?? 0);
                                        setPayMonths(inv.months_added || 12);
                                        setPayUtr('');
                                      }}
                                      style={{
                                        padding: '0.35rem 0.65rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#059669',
                                        color: '#fff',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                      title="Open Invoice & Record UTR Payment to Activate"
                                    >
                                      <CheckCircle2 size={13} /> Confirm Paid
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelMasterProforma(inv.tenant_id, inv.invoice_number)}
                                      style={{
                                        padding: '0.35rem 0.6rem',
                                        borderRadius: '6px',
                                        border: '1px solid #fecaca',
                                        background: '#fef2f2',
                                        color: '#dc2626',
                                        fontSize: '0.74rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </SaasDataTable>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 5: TRIALS, RENEWALS & EXPIRY AUDIT */}
      {activeTab === 'trials' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={20} style={{ color: '#b45309' }} /> Trials, Renewals &amp; Expiry Audit
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Track expiring/expired workspaces and inspect the complete platform history of Free Trials, Manual Extensions, and Validity Edits (IST).
              </p>
            </div>
            <button
              type="button"
              onClick={() => Promise.all([loadData(), loadMasterInvoices()])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <RefreshCw size={15} /> Refresh Audit
            </button>
          </div>

          {(() => {
            const clientTenants = tenants.filter(t => !t.is_master_hq && t.status !== 'DELETED' && t.status !== 'DRAFT');
            const expiringSoon = clientTenants.filter(t => t.subscription?.is_expiring_soon || (t.subscription?.days_remaining != null && t.subscription.days_remaining <= 15 && !t.subscription.is_expired));
            const expired = clientTenants.filter(t => t.subscription?.is_expired || t.status === 'EXPIRED');
            const onTrial = clientTenants.filter(t => t.status === 'TRIAL' || t.subscription?.status === 'TRIAL');
            const auditEvents = masterInvoices.filter(inv =>
              ['TRIAL_GRANT', 'MANUAL_EXTENSION', 'VALIDITY_ADJUSTMENT'].includes(inv.category || inv.operation) &&
              (!trialAuditSearch.trim() ||
                (inv.tenant_name || '').toLowerCase().includes(trialAuditSearch.trim().toLowerCase()) ||
                (inv.tenant_code || '').toLowerCase().includes(trialAuditSearch.trim().toLowerCase()) ||
                (inv.invoice_number || '').toLowerCase().includes(trialAuditSearch.trim().toLowerCase()) ||
                (inv.description || '').toLowerCase().includes(trialAuditSearch.trim().toLowerCase()))
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #d97706' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expiring Within 15 Days</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>{expiringSoon.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Workspaces needing renewal</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #dc2626' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expired Workspaces</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.2rem' }}>{expired.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Locked pending payment/trial</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #2563eb' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Trial Accounts</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>{onTrial.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Currently evaluating CRM</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #7c3aed' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Trial &amp; Extension Logs</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.2rem' }}>{auditEvents.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Recorded non-payment grants</div>
                  </div>
                </div>

                {/* Expiry & Renewal Radar */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1rem', fontWeight: 700 }}>
                    Client Expiry &amp; Renewal Radar ({clientTenants.length})
                  </h3>
                  <SaasDataTable id="trials-radar" hideToggle={true}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 200 }}>Client Workspace</th>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 120 }}>Status</th>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 150 }}>Expiry Date (IST)</th>
                          <th style={{ padding: '0.7rem', textAlign: 'right', width: 145 }}>Est. Renewal Base</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 260 }}>Quick Lifecycle Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientTenants.length === 0 ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No client workspaces found.</td></tr>
                        ) : (
                          clientTenants.map(t => {
                            const sub = t.subscription;
                            const dLeft = sub?.days_remaining;
                            const estRenewal = estimateTenantRenewalAmount(t, SAAS_CYCLE_MONTHS[sub?.billing_cycle] || 12);
                            const expiryText = sub?.valid_until ? new Date(sub.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                            return (
                              <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.7rem' }}>
                                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}><code>{t.tenant_code}</code> • {t.user_seat_limit} Seats</div>
                                </td>
                                <td style={{ padding: '0.7rem' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    background: sub?.is_expired ? '#fee2e2' : sub?.is_expiring_soon ? '#fef3c7' : t.status === 'TRIAL' ? '#eff6ff' : '#dcfce7',
                                    color: sub?.is_expired ? '#dc2626' : sub?.is_expiring_soon ? '#b45309' : t.status === 'TRIAL' ? '#1d4ed8' : '#15803d'
                                  }}>
                                    {sub?.is_expired ? 'EXPIRED' : sub?.is_expiring_soon ? 'EXPIRING SOON' : t.status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.7rem' }}>
                                  <div style={{ fontWeight: 600 }}>{expiryText}</div>
                                  <div style={{ fontSize: '0.72rem', color: dLeft != null && dLeft <= 7 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                    {dLeft == null ? '—' : dLeft <= 0 ? 'Expired' : `${dLeft} Day${dLeft === 1 ? '' : 's'} Left`}
                                  </div>
                                </td>
                                <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700 }}>
                                  ₹{estRenewal.toLocaleString('en-IN')}
                                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>{sub?.billing_cycle || 'YEARLY'}</div>
                                </td>
                                <td style={{ padding: '0.7rem', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => { setTrialModalTenant(t); setTrialDaysInput(7); setCustomTrialInput(''); }}
                                      style={{ padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #f59e0b', background: '#fffbeb', color: '#b45309', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      🎁 Trial
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleExtend(t.id, 1)}
                                      disabled={extendingId === t.id}
                                      style={{ padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      +1M
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenInvoice(t, 'proforma')}
                                      style={{ padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #8b5cf6', background: '#f5f3ff', color: '#6d28d9', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      Invoice / PI
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenBillingHistory(t)}
                                      style={{ padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      Ledger
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </SaasDataTable>
                </div>

                {/* Full Platform Trial & Manual Extension Log */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                      Trial Grants &amp; Manual Validity Audit Log ({auditEvents.length})
                    </h3>
                    <div style={{ position: 'relative', width: '260px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        value={trialAuditSearch}
                        onChange={(e) => setTrialAuditSearch(e.target.value)}
                        placeholder="Search workspace, TRL #..."
                        style={{ width: '100%', padding: '0.4rem 0.75rem 0.4rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                  <SaasDataTable id="trials-audit" key={`audit:${trialAuditSearch}`} hideToggle={true}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.83rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 170 }}>Ref # &amp; Date (IST)</th>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 170 }}>Workspace</th>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 250 }}>Action Description</th>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 140 }}>New Expiry (IST)</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 110 }}>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEvents.length === 0 ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No trial grant or manual validity adjustment logs recorded yet. Grants made going forward appear here automatically.</td></tr>
                        ) : (
                          auditEvents.map(ev => (
                            <tr key={ev.invoice_number} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.65rem 0.7rem' }}>
                                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#334155' }}>{ev.invoice_number}</div>
                                <div style={{ fontSize: '0.71rem', color: '#64748b' }}>
                                  {ev.created_at ? new Date(ev.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                                </div>
                              </td>
                              <td style={{ padding: '0.65rem 0.7rem' }}>
                                <div style={{ fontWeight: 600 }}>{ev.tenant_name}</div>
                                <div style={{ fontSize: '0.71rem', color: '#64748b' }}><code>{ev.tenant_code}</code></div>
                              </td>
                              <td style={{ padding: '0.65rem 0.7rem', color: '#1e293b', fontWeight: 500 }}>{ev.description}</td>
                              <td style={{ padding: '0.65rem 0.7rem', fontWeight: 600 }}>
                                {ev.valid_until ? new Date(ev.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td style={{ padding: '0.65rem 0.7rem', textAlign: 'center' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                  background: ev.category === 'TRIAL_GRANT' ? '#fef3c7' : '#f1f5f9',
                                  color: ev.category === 'TRIAL_GRANT' ? '#b45309' : '#475569'
                                }}>
                                  {ev.category === 'TRIAL_GRANT' ? 'TRIAL GRANT' : ev.category === 'MANUAL_EXTENSION' ? 'MANUAL EXT' : 'VALIDITY EDIT'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </SaasDataTable>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 6: USAGE QUOTAS & CLIENT MODULE MATRIX */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={20} style={{ color: '#4338ca' }} /> Usage Quotas &amp; Client Module Matrix
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Compare active seats, calling quotas, SMTP accounts, estimated recurring revenue, and per-module licensed user counts across all workspaces.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <RefreshCw size={15} /> Refresh Matrix
            </button>
          </div>

          {(() => {
            const clientTenants = tenants.filter(t => !t.is_master_hq && t.status !== 'DELETED' && t.status !== 'DRAFT');
            const totalActiveUsers = clientTenants.reduce((s, t) => s + (Number(t.active_users_count) || 0), 0);
            const totalSeatLimit = clientTenants.reduce((s, t) => s + (Number(t.user_seat_limit) || 0), 0);
            const totalCallingSeats = clientTenants.reduce((s, t) => s + (Number(t.calling_seats_limit) || 0), 0);
            const totalSmtpAccounts = clientTenants.reduce((s, t) => s + (Number(t.smtp_accounts_limit) || 0), 0);
            const estArr = clientTenants.reduce((s, t) => {
              const months = SAAS_CYCLE_MONTHS[t.subscription?.billing_cycle] || 12;
              const cycleVal = estimateTenantRenewalAmount(t, months);
              return s + Math.round((cycleVal / months) * 12);
            }, 0);
            const estMrr = Math.round(estArr / 12);
            const matrixMods = (catalog || []).filter(p => p.is_active !== false && !SAAS_INTERNAL_KEYS.has(p.process_code));

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #16a34a' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Est. Monthly Run Rate (MRR)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.2rem' }}>₹{estMrr.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Est. ARR: ₹{estArr.toLocaleString('en-IN')} / yr</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #2563eb' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>User Seat Utilization</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>{totalActiveUsers} / {totalSeatLimit}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{totalSeatLimit > 0 ? Math.round((totalActiveUsers / totalSeatLimit) * 100) : 0}% active across {clientTenants.length} clients</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0284c7' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Calling Quotas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7', marginTop: '0.2rem' }}>{totalCallingSeats} Seats</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Managed + BYOC client agents</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #7c3aed' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>SMTP Server Quotas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.2rem' }}>{totalSmtpAccounts}</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Outbound client email limits</div>
                  </div>
                </div>

                {/* Workspace Quotas & Utilization */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1rem', fontWeight: 700 }}>Workspace Seat, Calling &amp; Revenue Summary</h3>
                  <SaasDataTable id="usage-quotas" hideToggle={true}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '0.7rem', textAlign: 'left', width: 200 }}>Client Workspace</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 150 }}>Active / Limit Seats</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 160 }}>Calling Quota</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 95 }}>SMTP Limit</th>
                          <th style={{ padding: '0.7rem', textAlign: 'center', width: 115 }}>Active Modules</th>
                          <th style={{ padding: '0.7rem', textAlign: 'right', width: 150 }}>Est. Yearly Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientTenants.map(t => {
                          const pct = t.user_seat_limit > 0 ? Math.min(100, Math.round((t.active_users_count / t.user_seat_limit) * 100)) : 0;
                          const nonRedundantCount = (t.entitlement_details || []).filter(d => !d.included_in_combo).length;
                          const yearlyVal = estimateTenantRenewalAmount(t, 12);
                          return (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.7rem' }}>
                                <div style={{ fontWeight: 700 }}>{t.name}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}><code>{t.tenant_code}</code> • {t.branches?.length || 1} Branches</div>
                              </td>
                              <td style={{ padding: '0.7rem', textAlign: 'center' }}>
                                <div style={{ fontWeight: 700 }}>{t.active_users_count} / {t.user_seat_limit} ({pct}%)</div>
                                <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden', marginTop: '4px' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? '#dc2626' : '#2563eb' }} />
                                </div>
                              </td>
                              <td style={{ padding: '0.7rem', textAlign: 'center' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#0369a1' }}>
                                  <Phone size={12} /> {t.calling_seats_limit || 5} ({t.calling_mode === 'byoc' ? 'BYOC' : 'Managed'})
                                </span>
                              </td>
                              <td style={{ padding: '0.7rem', textAlign: 'center', fontWeight: 700 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#92400e' }}>
                                  <Mail size={12} /> {t.smtp_accounts_limit || 1}
                                </span>
                              </td>
                              <td style={{ padding: '0.7rem', textAlign: 'center', fontWeight: 700, color: '#4338ca' }}>
                                {nonRedundantCount || (t.entitlements || []).length}
                              </td>
                              <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 800, color: '#15803d' }}>
                                ₹{yearlyVal.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </SaasDataTable>
                </div>

                {/* Module Licensing Matrix */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1rem', fontWeight: 700 }}>Client × Business Module Licensing Matrix</h3>
                  <SaasDataTable id="module-matrix" hideToggle={true}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '0.65rem', textAlign: 'left', width: 185 }}>Client Workspace</th>
                          {matrixMods.map(m => (
                            <th key={m.process_code} style={{ padding: '0.55rem', textAlign: 'center', width: 115 }} title={m.display_name}>
                              <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{m.display_name}</div>
                              <div style={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 500 }}>₹{m.monthly_rate_per_user}/u</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clientTenants.map(t => {
                          const detailMap = new Map((t.entitlement_details || []).map(d => [d.module_key, d]));
                          const pendMap = new Map((t.pending_requests || []).filter(r => r.category === 'ADDON_MODULE' && r.module_key).map(r => [r.module_key, r]));
                          return (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.65rem' }}>
                                <div style={{ fontWeight: 700 }}>{t.name}</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b' }}><code>{t.tenant_code}</code></div>
                              </td>
                              {matrixMods.map(m => {
                                const det = detailMap.get(m.process_code);
                                const pend = pendMap.get(m.process_code);
                                return (
                                  <td key={m.process_code} style={{ padding: '0.55rem', textAlign: 'center' }}>
                                    {det ? (() => {
                                      const used = Number(det.used_seats ?? 0);
                                      const licensed = Number(det.licensed_seats || 0);
                                      const isOver = !det.included_in_combo && licensed > 0 && used > licensed;
                                      return (
                                        <span
                                          title={det.included_in_combo
                                            ? `Included in Combo (${used} active users)`
                                            : `${det.display_name}: ${used} / ${licensed} users used (${det.staff_used_seats ?? 0} staff + ${det.admin_used_seats ?? 0} admin)`}
                                          style={{
                                            display: 'inline-block',
                                            padding: '2px 7px',
                                            borderRadius: '6px',
                                            fontSize: '0.71rem',
                                            fontWeight: 700,
                                            background: det.included_in_combo ? '#f1f5f9' : isOver ? '#fef2f2' : det.has_custom_seats ? '#eef2ff' : '#dcfce7',
                                            color: det.included_in_combo ? '#64748b' : isOver ? '#b91c1c' : det.has_custom_seats ? '#3730a3' : '#15803d',
                                            border: isOver ? '1px solid #fecaca' : 'none'
                                          }}
                                        >
                                          {det.included_in_combo ? `Combo (${used}u)` : `${used}/${det.licensed_seats}u`}
                                        </span>
                                      );
                                    })() : pend ? (
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '2px 7px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        background: '#fef3c7',
                                        color: '#b45309'
                                      }} title={`Pending ${pend.invoice_number}`}>
                                        ⏳ {pend.requested_users || t.user_seat_limit}u
                                      </span>
                                    ) : (
                                      <span style={{ color: '#cbd5e1', fontWeight: 700 }}>—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </SaasDataTable>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Telephony & Calling Seats Configuration Modal */}
      {telephonyModalTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '12px' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Phone size={22} color="#0284c7" />
                  Telephony & Calling Seats Configuration
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Workspace: <strong>{telephonyModalTenant.name}</strong> ({telephonyModalTenant.tenant_code})
                </p>
              </div>
              <button
                onClick={() => setTelephonyModalTenant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {telephonyLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto' }} />
                <div>Loading telephony credentials & seat settings...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Section 1: Calling Mode Selector */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.5rem' }}>
                    Telephony Infrastructure & Calling Mode
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div
                      onClick={() => setTelephonyMode('managed')}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '8px',
                        border: `2px solid ${telephonyMode === 'managed' ? '#0284c7' : '#e2e8f0'}`,
                        background: telephonyMode === 'managed' ? '#f0f9ff' : '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: telephonyMode === 'managed' ? '#0369a1' : '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ShieldCheck size={16} color={telephonyMode === 'managed' ? '#0284c7' : '#64748b'} />
                        Managed by Platform
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', lineHeight: 1.35 }}>
                        Platform SuperAdmin Plivo account trunk. No client Plivo credentials needed.
                      </div>
                    </div>

                    <div
                      onClick={() => setTelephonyMode('byoc')}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '8px',
                        border: `2px solid ${telephonyMode === 'byoc' ? '#7c3aed' : '#e2e8f0'}`,
                        background: telephonyMode === 'byoc' ? '#faf5ff' : '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: telephonyMode === 'byoc' ? '#6d28d9' : '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Key size={16} color={telephonyMode === 'byoc' ? '#7c3aed' : '#64748b'} />
                        BYOC (Client Plivo)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', lineHeight: 1.35 }}>
                        Bring Your Own Carrier. Client connects their own Plivo Auth ID & Auth Token.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: BYOC Credentials (If BYOC or override) */}
                {telephonyMode === 'byoc' ? (
                  <div style={{ padding: '1rem', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#6d28d9' }}>
                      🔑 Client Plivo Carrier Credentials
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#4b5563', display: 'block', marginBottom: '0.25rem' }}>
                        Plivo Auth ID (API ID)
                      </label>
                      <input
                        type="text"
                        value={telephonyAuthId}
                        onChange={e => setTelephonyAuthId(e.target.value)}
                        placeholder="e.g. MAMZXXXXXXXXXXXXXXXX"
                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #d8b4fe', fontSize: '0.85rem', fontFamily: 'monospace' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#4b5563', display: 'block', marginBottom: '0.25rem' }}>
                        Plivo Auth Token (API Secret)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={telephonyShowToken ? 'text' : 'password'}
                          value={telephonyAuthToken}
                          onChange={e => setTelephonyAuthToken(e.target.value)}
                          placeholder="Enter Plivo Auth Token..."
                          style={{ width: '100%', padding: '0.55rem 2.25rem 0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #d8b4fe', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        />
                        <button
                          type="button"
                          onClick={() => setTelephonyShowToken(!telephonyShowToken)}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed' }}
                        >
                          {telephonyShowToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#16a34a" />
                    <span>Platform Plivo credentials are automatically assigned and safely encrypted.</span>
                  </div>
                )}

                {/* Section 3: Outbound Caller ID */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.35rem' }}>
                    Outbound Caller ID (Virtual Number)
                  </label>
                  <input
                    type="text"
                    value={telephonyFromNumber}
                    onChange={e => setTelephonyFromNumber(e.target.value)}
                    placeholder="+918035340622"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                    Customers see this number when agents call them from this workspace.
                  </span>
                </div>

                {/* Section 4: Calling Seat Quota Limit */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.35rem' }}>
                    Calling Seat Quota (HQ + Branches Total)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {[5, 10, 20, 50, 100].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTelephonySeatLimit(s)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: `1px solid ${telephonySeatLimit === s ? '#0284c7' : '#cbd5e1'}`,
                          background: telephonySeatLimit === s ? '#0284c7' : '#fff',
                          color: telephonySeatLimit === s ? '#fff' : '#334155',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {s} Seats
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={telephonySeatLimit}
                      onChange={e => setTelephonySeatLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{ width: '120px', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Maximum active calling agents allowed across Headquarter & all Branches.
                    </span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setTelephonyModalTenant(null)}
                    disabled={telephonySaving}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: '#475569'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTelephonyConfig}
                    disabled={telephonySaving}
                    style={{
                      padding: '0.6rem 1.5rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: '0.85rem',
                      cursor: telephonySaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
                    }}
                  >
                    {telephonySaving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
                    {telephonySaving ? 'Saving...' : 'Save Telephony Configuration'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Seats Expansion & Downgrade Modal */}
      {seatModalTenant && (() => {
        const currSeats = seatModalTenant.user_seat_limit || 5;
        const targetSeats = Math.max(1, parseInt(newSeatValue, 10) || 1);
        const isDowngrade = targetSeats < currSeats;
        const excessUsers = Math.max(0, tenantActiveUsers.length - targetSeats);

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '1rem'
          }}>
            <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '12px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    margin: 0,
                    color: isDowngrade ? '#991b1b' : '#1e1b4b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    {isDowngrade ? (
                      <>
                        <ArrowDownCircle size={22} color="#dc2626" />
                        User Seats Downgrade & License Hold Workflow
                      </>
                    ) : (
                      <>
                        <Users size={22} color="#2563eb" />
                        User Seats Expansion & Add-on Invoice
                      </>
                    )}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>
                    Workspace: <strong>{seatModalTenant.name}</strong> (<code>{seatModalTenant.tenant_code}</code>) | Current: <strong>{currSeats} Users</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSeatModalTenant(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Step 1: Seat Counter / Limit Selector */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                  1. SELECT NEW TOTAL SEAT LIMIT:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.45rem 0.85rem', fontSize: '0.88rem', color: '#64748b' }}>
                    Current: <strong>{currSeats}</strong> Seats
                  </div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#94a3b8' }}>➜</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={newSeatValue}
                    onChange={(e) => handleSeatSeatsChange(e.target.value)}
                    style={{
                      width: '120px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: `2px solid ${isDowngrade ? '#dc2626' : '#2563eb'}`,
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: isDowngrade ? '#991b1b' : '#1e3a8a',
                      outline: 'none'
                    }}
                  />
                  <span style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '16px',
                    background: isDowngrade ? '#fee2e2' : targetSeats > currSeats ? '#dcfce7' : '#f1f5f9',
                    color: isDowngrade ? '#b91c1c' : targetSeats > currSeats ? '#15803d' : '#64748b',
                    fontSize: '0.82rem',
                    fontWeight: 800
                  }}>
                    {isDowngrade
                      ? `-${currSeats - targetSeats} Seats (Downgrade)`
                      : targetSeats > currSeats
                      ? `+${targetSeats - currSeats} Additional Seats (Expansion)`
                      : 'No Change in Seats'}
                  </span>
                </div>
              </div>

              {/* DOWNSCALE / DOWNGRADE BRANCH */}
              {isDowngrade ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                  {/* Quota Audit Box */}
                  <div style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    background: excessUsers > 0 ? '#fffbeb' : '#f0fdf4',
                    border: `1px solid ${excessUsers > 0 ? '#fde68a' : '#bbf7d0'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.88rem', color: excessUsers > 0 ? '#b45309' : '#15803d' }}>
                        {excessUsers > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                        {excessUsers > 0 ? 'Excess Active Employees Detected' : 'Quota Clean: Ready to Downgrade'}
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        Active: <strong>{tenantActiveUsers.length}</strong> | Target Limit: <strong>{targetSeats}</strong>
                      </span>
                    </div>

                    {excessUsers > 0 ? (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.45 }}>
                        Workspace currently has <strong>{tenantActiveUsers.length} active users</strong>, which exceeds the new limit of <strong>{targetSeats} seats</strong>.
                        Please select at least <strong>{excessUsers} user(s) to put on HOLD</strong> (deactivated) to fulfill the new seat quota.
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', lineHeight: 1.45 }}>
                        Workspace has only <strong>{tenantActiveUsers.length} active users</strong>, which is already within the target limit of <strong>{targetSeats} seats</strong>.
                        No employees need to be held. You can proceed with the downgrade immediately!
                      </p>
                    )}
                  </div>

                  {/* Employee Hold Selection Checklist */}
                  {excessUsers > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <UserX size={15} color="#dc2626" />
                          SELECT EMPLOYEES TO PUT ON HOLD ({selectedHoldUserIds.length} / {excessUsers} selected):
                        </label>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: selectedHoldUserIds.length >= excessUsers ? '#dcfce7' : '#fee2e2',
                          color: selectedHoldUserIds.length >= excessUsers ? '#15803d' : '#b91c1c'
                        }}>
                          {selectedHoldUserIds.length >= excessUsers ? '✓ Quota Met' : `Need ${excessUsers - selectedHoldUserIds.length} more`}
                        </span>
                      </div>

                      <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        {tenantActiveUsers.length === 0 ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                            No active users found.
                          </div>
                        ) : (
                          tenantActiveUsers.map((u) => {
                            const isSelected = selectedHoldUserIds.includes(u.user_id);
                            return (
                              <div
                                key={u.user_id}
                                onClick={() => {
                                  if (!u.can_hold) return;
                                  if (isSelected) {
                                    setSelectedHoldUserIds(selectedHoldUserIds.filter(id => id !== u.user_id));
                                  } else {
                                    setSelectedHoldUserIds([...selectedHoldUserIds, u.user_id]);
                                  }
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.65rem 0.85rem',
                                  borderBottom: '1px solid #f1f5f9',
                                  cursor: 'pointer',
                                  background: isSelected ? '#fef2f2' : 'transparent',
                                  transition: 'background 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={!u.can_hold}
                                    onChange={() => {}}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                  <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: isSelected ? '#991b1b' : '#1e293b' }}>
                                      {u.emp_name || u.emp_id || 'Employee'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                      {u.email || u.emp_official_mail_id} {!u.can_hold ? '• Protected administrator' : ''}
                                    </div>
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  background: isSelected ? '#fee2e2' : '#f1f5f9',
                                  color: isSelected ? '#b91c1c' : '#475569'
                                }}>
                                  {isSelected ? 'PUT ON HOLD' : (u.role || 'USER')}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Downgrade Reason */}
                  <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      DOWNGRADE REASON / AUDIT NOTE (OPTIONAL):
                    </label>
                    <input
                      type="text"
                      value={downgradeReason}
                      onChange={(e) => setDowngradeReason(e.target.value)}
                      placeholder="e.g. Client requested downsizing team / Cost optimization"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem'
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Step 2: Dual Billing Modes */}
                  <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                      2. BILLING & EXPANSION CONTRACT MODE:
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      {/* Mode A */}
                      <div
                        onClick={() => handleSeatModeChange('SAME_EXPIRY')}
                        style={{
                          border: `2px solid ${seatBillingMode === 'SAME_EXPIRY' ? '#2563eb' : '#e2e8f0'}`,
                          background: seatBillingMode === 'SAME_EXPIRY' ? '#eff6ff' : '#fff',
                          borderRadius: '8px',
                          padding: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e3a8a', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="seat_billing_mode"
                            checked={seatBillingMode === 'SAME_EXPIRY'}
                            onChange={() => handleSeatModeChange('SAME_EXPIRY')}
                          />
                          Mode A: Coterminous (Same Expiry)
                        </label>
                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.74rem', color: '#475569', lineHeight: 1.4 }}>
                          New seats expire on current contract validity date (<strong>{seatModalTenant.subscription?.valid_until ? new Date(seatModalTenant.subscription.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Existing Expiry'}</strong>). Prorated for remaining days.
                        </p>
                      </div>

                      {/* Mode B */}
                      <div
                        onClick={() => handleSeatModeChange('EXTEND_VALIDITY')}
                        style={{
                          border: `2px solid ${seatBillingMode === 'EXTEND_VALIDITY' ? '#2563eb' : '#e2e8f0'}`,
                          background: seatBillingMode === 'EXTEND_VALIDITY' ? '#eff6ff' : '#fff',
                          borderRadius: '8px',
                          padding: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e3a8a', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="seat_billing_mode"
                            checked={seatBillingMode === 'EXTEND_VALIDITY'}
                            onChange={() => handleSeatModeChange('EXTEND_VALIDITY')}
                          />
                          Mode B: Add Seats + Extend Validity
                        </label>
                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.74rem', color: '#475569', lineHeight: 1.4 }}>
                          Increase seats AND extend the workspace subscription contract validity for another billing cycle.
                        </p>
                        {seatBillingMode === 'EXTEND_VALIDITY' && (
                          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                            {[1, 3, 6, 12].map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSeatMonthsChange(m); }}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  border: `1px solid ${seatExtendMonths === m ? '#2563eb' : '#cbd5e1'}`,
                                  background: seatExtendMonths === m ? '#2563eb' : '#fff',
                                  color: seatExtendMonths === m ? '#fff' : '#334155',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                +{m}M
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Agreed Deal Price (Kitna me deal hua tha) & GST Mode */}
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1rem', alignItems: 'flex-start' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          3. AGREED DEAL PRICE (₹):
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="number"
                            value={seatDealPrice}
                            onChange={(e) => setSeatDealPrice(e.target.value)}
                            placeholder="Agreed Base Price (₹)"
                            style={{
                              width: '100%',
                              padding: '0.55rem 0.75rem',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: '#0f172a'
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.35rem' }}>
                          Negotiated amount. Automatically computed, but fully editable to match your custom deal.
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          GST INVOICE BILLING:
                        </label>
                        <select
                          value={seatGstType}
                          onChange={(e) => setSeatGstType(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.82rem',
                            fontWeight: 600
                          }}
                        >
                          <option value="IGST">18% IGST (Inter-state / Default)</option>
                          <option value="CGST_SGST">9% CGST + 9% SGST (Intra-state)</option>
                          <option value="NON_GST">NON-GST (0% Tax / Commercial Bill)</option>
                        </select>

                        <div style={{ marginTop: '0.5rem', fontSize: '0.76rem', color: '#334155', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Subtotal:</span>
                            <strong>₹{Number(seatDealPrice || 0).toLocaleString('en-IN')}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>GST:</span>
                            <strong>
                              {seatGstType === 'NON_GST'
                                ? 'NIL (0% / Non-GST)'
                                : `₹${Math.round(Number(seatDealPrice || 0) * 0.18).toLocaleString('en-IN')} (18%)`}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '3px', paddingTop: '3px', color: '#1e3a8a', fontWeight: 800 }}>
                            <span>Total Payable:</span>
                            <span>
                              ₹{(seatGstType === 'NON_GST'
                                ? Number(seatDealPrice || 0)
                                : Math.round(Number(seatDealPrice || 0) * 1.18)
                              ).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Payment Details (For Paid Tax Invoice) */}
                  <div style={{ background: '#f0fdf4', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#166534', marginBottom: '0.4rem' }}>
                      4. PAYMENT MODE & TRANSACTION ID (IF RECORDING PAYMENT):
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                      <select
                        value={seatPaymentMode}
                        onChange={(e) => setSeatPaymentMode(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        <option value="UPI">UPI Transfer</option>
                        <option value="NEFT">Bank NEFT / RTGS</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Cash">Cash</option>
                      </select>
                      <input
                        type="text"
                        value={seatTransactionId}
                        onChange={(e) => setSeatTransactionId(e.target.value)}
                        placeholder="UTR / Transaction Ref (e.g. UPI/62019482)"
                        style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setSeatModalTenant(null)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>

                {isDowngrade ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleProcessDowngradeSeats}
                      disabled={processingDowngrade || (excessUsers > 0 && selectedHoldUserIds.length < excessUsers)}
                      style={{
                        padding: '0.55rem 1.25rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: (excessUsers > 0 && selectedHoldUserIds.length < excessUsers) ? '#cbd5e1' : '#dc2626',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: (excessUsers > 0 && selectedHoldUserIds.length < excessUsers) ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <ArrowDownCircle size={15} />
                      {processingDowngrade
                        ? 'Processing Downgrade...'
                        : `Confirm Downgrade to ${targetSeats} Seats${selectedHoldUserIds.length > 0 ? ` & Hold ${selectedHoldUserIds.length} Users` : ''}`}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Quick Save */}
                    <button
                      type="button"
                      onClick={handleUpdateSeats}
                      disabled={processingSeats || processingDowngrade}
                      style={{
                        padding: '0.5rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#334155',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                      title="Update seat count only without generating an invoice"
                    >
                      ⚡ Quick Seats Only
                    </button>

                    {/* Generate Proforma Invoice */}
                    <button
                      type="button"
                      onClick={() => handleProcessAddonSeats('proforma')}
                      disabled={processingSeats}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#4338ca',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <FileText size={14} />
                      {processingSeats ? 'Processing...' : 'Generate Add-on Proforma (PI)'}
                    </button>

                    {/* Record Payment & Tax Invoice */}
                    <button
                      type="button"
                      onClick={() => handleProcessAddonSeats('tax_invoice')}
                      disabled={processingSeats}
                      style={{
                        padding: '0.5rem 1.15rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#059669',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <CreditCard size={14} />
                      {processingSeats ? 'Processing...' : 'Record Payment & Paid Tax Invoice'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CREATE NEW CLIENT TENANT WORKSPACE (MASTER ADMIN EXCLUSIVE) */}
      {showCreateTenantModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !createLoading) setShowCreateTenantModal(false);
          }}
        >
          <div
            className="card"
            style={{
              padding: '2rem',
              width: '100%',
              maxWidth: createStep === 2 ? '900px' : '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '16px',
              transition: 'max-width 0.25s ease',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building size={22} style={{ color: '#4338ca' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Client Workspace Onboarding
                  </h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>
                  {createStep === 1
                    ? 'Step 1 of 2: Company & Primary Administrator Details'
                    : 'Step 2 of 2: Configure Modules, Seats & Billing Terms'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!createLoading) setShowCreateTenantModal(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error / Success Notifications */}
            {createError && (
              <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={16} />
                <span>{createError}</span>
              </div>
            )}
            {createSuccess && (
              <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} />
                <span>{createSuccess}</span>
              </div>
            )}

            {createStep === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Client Company / Organization Name *
                  </label>
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corporation Pvt Ltd"
                    style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Primary Administrator Full Name *
                    </label>
                    <input
                      type="text"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="e.g. John Doe"
                      style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Admin Mobile Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={newAdminMobile}
                      onChange={(e) => setNewAdminMobile(e.target.value)}
                      placeholder="9876543210"
                      style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Work Email (Login Username) *
                  </label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@acmecorp.com"
                    style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Initial Password *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      style={{ width: '100%', padding: '0.65rem 2.5rem 0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowNewPassword(prev => !prev)}
                      style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateTenantModal(false)}
                    style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!newCompanyName.trim() || !newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword) {
                        setCreateError('Please enter company name, administrator name, work email and password.');
                        return;
                      }
                      if (newAdminPassword.length < 6) {
                        setCreateError('Password must be at least 6 characters long.');
                        return;
                      }
                      setCreateError(null);
                      setCreateStep(2);
                    }}
                    style={{
                      padding: '0.65rem 1.5rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#4338ca',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    Next: Select Plan & Modules <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <PlanPricingCalculator catalogOverride={catalog} cyclesOverride={cycles}
                  initialProcessCodes={['LEADS_WITH_CALLING']}
                  initialSeats={5}
                  initialCycle="YEARLY"
                  showHeading={true}
                  onProceed={(planData) => handleCreateClientWorkspace(planData, false)}
                  proceedButtonText={createLoading ? "Provisioning Workspace..." : "Activate Client Workspace 🚀"}
                  onSaveDraft={(planData) => handleCreateClientWorkspace(planData, true)}
                  draftButtonText={createLoading ? "Saving Draft..." : "Save as Draft 📝"}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setCreateStep(1)}
                    disabled={createLoading}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <ArrowLeft size={16} /> ← Edit Company Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Manage Modules Modal */}
      {modulesModalTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: 0, width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* ── Sticky Header ── */}
            <div style={{ flexShrink: 0, padding: '1.25rem 1.75rem 1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sliders size={20} color="#4338ca" /> Manage Active Modules
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                    Company: <strong>{modulesModalTenant.name}</strong> ({modulesModalTenant.tenant_code})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModulesModalTenant(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={20} />
                </button>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#6366f1', background: '#eef2ff', padding: '0.5rem 0.75rem', borderRadius: '6px', margin: 0, lineHeight: 1.4 }}>
                💡 <strong>Instant Access Control:</strong> Uncheck any module that this company does not require. The tab will immediately vanish from their navigation bar, and it will be excluded from their invoices.
              </p>
              {modulesModalError && (
                <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: '6px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
                  ⚠️ {modulesModalError}
                </div>
              )}
            </div>

            {/* ── Scrollable Body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {catalog.map(mod => {
                const isChecked = selectedModuleKeys.has(mod.process_code);
                const maxSeats = Math.max(1, Number(modulesModalTenant?.user_seat_limit) || 5);
                const customSeatsVal = moduleSeatOverrides[mod.process_code] ?? '';
                return (
                  <div
                    key={mod.process_code}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: `1.5px solid ${isChecked ? '#4338ca' : 'var(--border-light)'}`,
                      backgroundColor: isChecked ? '#f5f3ff' : 'var(--bg-surface)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleModuleKey(mod.process_code)}
                        style={{ marginTop: '0.2rem', width: '16px', height: '16px', accentColor: '#4338ca', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isChecked ? '#312e81' : 'var(--text-primary)' }}>
                            {mod.display_name}
                          </span>
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--bg-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            ₹{mod.monthly_rate_per_user}/user/mo
                          </span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', lineHeight: 1.3 }}>
                          {mod.description}
                        </p>
                      </div>
                    </label>
                    {isChecked && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingLeft: '1.75rem', fontSize: '0.76rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#4338ca', fontWeight: 600 }}>
                          Licensed Users (leave blank = All {maxSeats} workspace users):
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <input
                            type="number"
                            min={1}
                            max={maxSeats}
                            value={customSeatsVal}
                            placeholder={`All (${maxSeats})`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setModuleSeatOverrides(prev => ({ ...prev, [mod.process_code]: raw }));
                            }}
                            style={{ width: '96px', padding: '0.25rem 0.45rem', borderRadius: '6px', border: '1px solid #a5b4fc', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', background: '#fff' }}
                          />
                          {customSeatsVal !== '' && (
                            <button
                              type="button"
                              onClick={() => setModuleSeatOverrides(prev => ({ ...prev, [mod.process_code]: '' }))}
                              style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.7rem', cursor: 'pointer', color: '#475569' }}
                            >
                              Reset All
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outbound SMTP Server Addon Quota */}
            <div style={{
              marginTop: '0.5rem',
              marginBottom: '1.5rem',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>📧 Outbound SMTP Server Addon Quota</span>
                    {modulesModalTenant?.id === 'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4' && (
                      <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>HQ Unlimited</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Total simultaneous outbound SMTP server connections purchased & allowed for this company
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => setSmtpLimitInput(prev => Math.max(1, prev - 1))}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={smtpLimitInput}
                    onChange={(e) => setSmtpLimitInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: '54px',
                      textAlign: 'center',
                      padding: '0.3rem',
                      borderRadius: '6px',
                      border: '1.5px solid #6366f1',
                      fontWeight: 700,
                      fontSize: '0.92rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSmtpLimitInput(prev => prev + 1)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Quick Presets:</span>
                {[1, 2, 3, 5, 10].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setSmtpLimitInput(cnt)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: smtpLimitInput === cnt ? 700 : 500,
                      background: smtpLimitInput === cnt ? '#4338ca' : '#fff',
                      color: smtpLimitInput === cnt ? '#fff' : '#475569',
                      border: `1px solid ${smtpLimitInput === cnt ? '#4338ca' : '#cbd5e1'}`,
                      cursor: 'pointer'
                    }}
                  >
                    {cnt} {cnt === 1 ? 'Server (Default)' : 'Servers'}
                  </button>
                ))}
              </div>
            </div>

            </div>{/* ── End Scrollable Body ── */}

            {/* ── Sticky Footer ── */}
            <div style={{ flexShrink: 0, padding: '1rem 1.75rem', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {selectedModuleKeys.size} of {catalog.length} Modules Active
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setModulesModalTenant(null)}
                  style={{ padding: '0.55rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModules}
                  disabled={savingModules}
                  style={{
                    padding: '0.55rem 1.4rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#4338ca',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {savingModules ? 'Saving...' : 'Save Module Access'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Free Trial Modal */}
      {trialModalTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🎁 Assign Free Trial
              </h3>
              <button
                type="button"
                onClick={() => setTrialModalTenant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Company: <strong>{trialModalTenant.name}</strong>
            </p>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Select Trial Duration:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {[1, 3, 7, 10].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTrialDaysInput(days)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: trialDaysInput === days ? '2px solid #f59e0b' : '1px solid var(--border-light)',
                    background: trialDaysInput === days ? '#fef3c7' : 'var(--bg-surface)',
                    color: trialDaysInput === days ? '#92400e' : 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {days} {days === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>
                Or enter custom days:
              </label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 15, 30"
                value={customTrialInput}
                onChange={(e) => {
                  setCustomTrialInput(e.target.value);
                  setTrialDaysInput('custom');
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '6px',
                  border: trialDaysInput === 'custom' ? '2px solid #f59e0b' : '1px solid var(--border-light)',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setTrialModalTenant(null)}
                style={{ padding: '0.55rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantTrial}
                disabled={grantingTrial}
                style={{
                  padding: '0.55rem 1.4rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#f59e0b',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {grantingTrial ? 'Activating...' : 'Activate Free Trial 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice / Proforma Modal */}
      {invoiceTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '750px', maxHeight: '92vh', overflowY: 'auto', background: '#fff' }}>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setInvoiceType('proforma')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: invoiceType === 'proforma' ? '#4338ca' : '#f3f4f6',
                    color: invoiceType === 'proforma' ? '#fff' : '#4b5563'
                  }}
                >
                  Proforma Invoice (PI)
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceType('tax_invoice')}
                  disabled={!activeInvoiceData || activeInvoiceData.status !== 'PAID'}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: invoiceType === 'tax_invoice' ? '#059669' : '#f3f4f6',
                    color: invoiceType === 'tax_invoice' ? '#fff' : '#4b5563'
                  }}
                >
                  Tax Invoice (Paid)
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(activeInvoiceData, invoiceTenant)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    border: '1px solid #16a34a',
                    background: '#f0fdf4',
                    color: '#15803d',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Share this invoice directly to Client on WhatsApp"
                >
                  <MessageCircle size={14} /> WhatsApp Share
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sheet = typeof document !== 'undefined' ? document.getElementById('saas-invoice-sheet') : null;
                    const printWin = sheet && typeof window !== 'undefined' ? window.open('', '_blank', 'width=920,height=1050') : null;
                    if (printWin && sheet) {
                      const clone = sheet.cloneNode(true);
                      clone.querySelectorAll('select').forEach(sel => {
                        const span = document.createElement('span');
                        span.textContent = sel.options[sel.selectedIndex]?.text || sel.value || '';
                        span.style.fontWeight = '700';
                        sel.replaceWith(span);
                      });
                      const invTitle = activeInvoiceData?.invoice_number || `${invoiceTenant?.tenant_code || 'WS'}-Invoice`;
                      printWin.document.open();
                      printWin.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${String(invTitle).replace(/</g, '&lt;')}</title><style>@page{size:A4 portrait;margin:12mm;}*{box-sizing:border-box;max-height:none !important;}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;background:#fff;}table{width:100% !important;border-collapse:collapse;}thead{display:table-header-group;}tr{page-break-inside:avoid;break-inside:avoid;}div{overflow:visible !important;}</style></head><body>${clone.outerHTML}</body></html>`);
                      printWin.document.close();
                      printWin.focus();
                      setTimeout(() => { try { printWin.print(); } catch { /* ignore */ } }, 250);
                    } else {
                      window.print();
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceTenant(null);
                    setActiveInvoiceData(null);

                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Invoice Sheet */}
            <div id="saas-invoice-sheet" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.75rem', background: '#fafafa', position: 'relative' }}>
              {/* Paid Watermark Stamp */}
              {invoiceType === 'tax_invoice' && (
                <div style={{
                  position: 'absolute',
                  top: '40%',
                  right: '15%',
                  transform: 'rotate(-20deg)',
                  border: '4px solid #059669',
                  color: '#059669',
                  padding: '0.4rem 1.5rem',
                  fontSize: '2rem',
                  fontWeight: 900,
                  borderRadius: '12px',
                  letterSpacing: '4px',
                  opacity: 0.35,
                  pointerEvents: 'none',
                  textTransform: 'uppercase'
                }}>
                  PAID
                </div>
              )}

              {/* Company Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #4338ca', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e1b4b', margin: 0 }}>NEW SWAN MULTITECH LIMITED</h2>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>
                    SaaS Cloud Solutions & Enterprise Software Division
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#4b5563', marginTop: '0.1rem' }}>
                    CIN: L29222PB2014PLC038891 | GSTIN: 03AABCN5123K1Z4
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#4b5563' }}>
                    Registered Office: C-222, Phase VIII, Focal Point, Ludhiana - 141010, Punjab, India
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.35rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    background: invoiceGstMode === 'NON_GST'
                      ? (invoiceType === 'tax_invoice' ? '#e0f2fe' : '#f1f5f9')
                      : (invoiceType === 'tax_invoice' ? '#d1fae5' : '#fef3c7'),
                    color: invoiceGstMode === 'NON_GST'
                      ? (invoiceType === 'tax_invoice' ? '#0369a1' : '#334155')
                      : (invoiceType === 'tax_invoice' ? '#065f46' : '#92400e'),
                    border: `1px solid ${invoiceGstMode === 'NON_GST'
                      ? (invoiceType === 'tax_invoice' ? '#7dd3fc' : '#cbd5e1')
                      : (invoiceType === 'tax_invoice' ? '#6ee7b7' : '#fde68a')}`
                  }}>
                    {invoiceGstMode === 'NON_GST'
                      ? (invoiceType === 'tax_invoice' ? 'COMMERCIAL INVOICE (NON-GST)' : 'PROFORMA BILL (NON-GST)')
                      : (invoiceType === 'tax_invoice' ? 'TAX INVOICE' : 'PROFORMA INVOICE')}
                  </span>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: '0.4rem', color: '#111827' }}>
                    {activeInvoiceData?.invoice_number
                      ? `#${activeInvoiceData.invoice_number}`
                      : (invoiceType === 'tax_invoice' ? `DRAFT INV (${invoiceTenant.tenant_code || 'WS'})` : `DRAFT PROFORMA (${invoiceTenant.tenant_code || 'WS'})`)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Date: {activeInvoiceData?.created_at
                      ? new Date(activeInvoiceData.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
                      : new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Billed To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 700, color: '#374151', textTransform: 'uppercase', fontSize: '0.72rem', marginBottom: '0.3rem' }}>
                    BILLED TO (CLIENT):
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{invoiceTenant.name}</div>
                  <div style={{ color: '#4b5563' }}>Workspace Code: <code>{invoiceTenant.tenant_code}</code></div>
                  <div style={{ color: '#4b5563' }}>Admin Email: {invoiceTenant.primary_contact_email}</div>
                  <div style={{ color: '#4b5563' }}>
                    User Seats Allowed: {activeInvoiceData ? (
                      <span><strong>{activeInvoiceData.total_seats || invoiceTenant.user_seat_limit} Users</strong> {activeInvoiceData.additional_seats > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>(+{activeInvoiceData.additional_seats} Users Added)</span>}</span>
                    ) : (
                      <span><strong>{invoiceTenant.user_seat_limit} Users</strong></span>
                    )}
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 700, color: '#374151', textTransform: 'uppercase', fontSize: '0.72rem', marginBottom: '0.3rem' }}>
                    SUBSCRIPTION PERIOD & STATUS:
                  </div>
                  <div style={{ color: '#111827' }}>
                    Cycle: <strong>{invoiceTenant.subscription?.billing_cycle || 'YEARLY'}</strong>
                  </div>
                  <div style={{ color: '#4b5563' }}>
                    Valid Till: {activeInvoiceData?.valid_until
                      ? new Date(activeInvoiceData.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
                      : invoiceTenant.subscription?.valid_until
                        ? new Date(invoiceTenant.subscription.valid_until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
                        : 'N/A'}
                  </div>
                  <div style={{ marginTop: '0.3rem' }}>
                    Status: <span style={{ fontWeight: 700, color: invoiceType === 'tax_invoice' ? '#059669' : '#d97706' }}>
                      {invoiceType === 'tax_invoice' ? 'PAID & ACTIVE' : (invoiceTenant.subscription?.status || 'TRIAL / UNPAID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <SaasDataTable id="invoice-v2" paginate={false} hideToggle={true}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '1.25rem', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db', textAlign: 'left' }}>
                    <th style={{ padding: '0.65rem 0.7rem', width: 235 }}>Item / Module Description</th>
                    <th style={{ padding: '0.65rem 0.55rem', width: 75, textAlign: 'center', whiteSpace: 'nowrap' }}>Seats</th>
                    <th style={{ padding: '0.65rem 0.65rem', width: 135, textAlign: 'right', whiteSpace: 'nowrap' }}>Agreed Amount</th>
                    <th style={{ padding: '0.65rem 0.65rem', width: 110, textAlign: 'right', whiteSpace: 'nowrap' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvoiceData ? (
                    Array.isArray(activeInvoiceData.line_items) && activeInvoiceData.line_items.length > 0 ? (
                      <>
                        {activeInvoiceData.line_items.map((li, idx) => (
                          <tr key={li.module_key || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.55rem 0.7rem' }}>
                              <div style={{ fontWeight: 700, color: '#1e1b4b' }}>{li.display_name || li.module_key}</div>
                              <div style={{ fontSize: '0.71rem', color: '#6b7280' }}>
                                {li.days_remaining
                                  ? `${li.seats} users × ₹${Number(li.rate_per_user || 0)}/mo × ${li.days_remaining}/30 days`
                                  : `${li.seats} users × ₹${Number(li.rate_per_user || 0)}/mo × ${li.months || 12} mo${li.discount_percent ? ` (-${li.discount_percent}% disc)` : ''}`}
                              </div>
                            </td>
                            <td style={{ padding: '0.55rem 0.55rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>
                              {li.seats}
                            </td>
                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right' }}>
                              ₹{Number(li.rate_per_user || 0).toLocaleString('en-IN')}/u/mo
                            </td>
                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 700 }}>
                              ₹{Number(li.net_amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                        {activeInvoiceData.pricing_basis && (
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={4} style={{ padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: '#4338ca', fontWeight: 600 }}>
                              Calculation Basis: {activeInvoiceData.pricing_basis}
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <div style={{ fontWeight: 700, color: '#1e1b4b' }}>
                            {activeInvoiceData.description || 'Add-on User Seats Expansion'}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: '2px' }}>
                            {activeInvoiceData.category === 'RENEWAL_PAYMENT' || activeInvoiceData.category === 'RENEWAL_PROFORMA'
                              ? (() => {
                                  const tenantMatch = tenants.find(t => t.id === (activeInvoiceData.tenant_id || invoiceTenant?.id)) || invoiceTenant;
                                  const entList = tenantMatch?.entitlements || [];
                                  const hasCombo = entList.includes('LEADS_WITH_CALLING');
                                  const modNames = entList
                                    .filter(k => !(hasCombo && (k === 'LEADS_ONLY' || k === 'CALLING_STANDALONE')))
                                    .map(k => catalog.find(p => p.process_code === k)?.display_name)
                                    .filter(Boolean);
                                  return `Subscription renewal for ${activeInvoiceData.months_added || 12} months${modNames.length ? ` • Modules: ${modNames.join(', ')}` : ''}`;
                                })()
                              : activeInvoiceData.category === 'ADDON_MODULE'
                                ? `Add-on module license for ${activeInvoiceData.requested_users || activeInvoiceData.total_seats || invoiceTenant.user_seat_limit} user(s)`
                                : activeInvoiceData.billing_mode === 'EXTEND_VALIDITY'
                                  ? `Seat limit expansion (+${activeInvoiceData.additional_seats} seats) with ${activeInvoiceData.months_added || 12} months validity extension`
                                  : `Coterminous prorated seat expansion (+${activeInvoiceData.additional_seats} seats, valid till current contract expiry)`}
                          </div>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>
                          {activeInvoiceData.category === 'RENEWAL_PAYMENT' || activeInvoiceData.category === 'RENEWAL_PROFORMA'
                            ? `${activeInvoiceData.total_seats || invoiceTenant.user_seat_limit} Seats`
                            : activeInvoiceData.category === 'ADDON_MODULE'
                              ? `${activeInvoiceData.requested_users || activeInvoiceData.total_seats || invoiceTenant.user_seat_limit} Users`
                              : `${(activeInvoiceData.additional_seats > 0 ? '+' : '') + (activeInvoiceData.additional_seats || 0)} Seats`}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                          ₹{Number(activeInvoiceData.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>
                          ₹{Number(activeInvoiceData.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    )
                  ) : (() => {
                    const enabledKeys = new Set(invoiceTenant.entitlements || []);
                    const hasCombo = enabledKeys.has('LEADS_WITH_CALLING');
                    const matchedCycle = (cycles || []).find(c => (c.months_count ?? c.months) === payMonths);
                    const discPct = Number(matchedCycle?.discount_percent || 0);
                    const detailMap = new Map((invoiceTenant.entitlement_details || []).map(d => [d.module_key, d]));
                    const previewMods = (catalog || []).filter(p =>
                      enabledKeys.has(p.process_code) &&
                      p.is_active !== false &&
                      !SAAS_INTERNAL_KEYS.has(p.process_code) &&
                      !(hasCombo && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE'))
                    );
                    if (previewMods.length === 0) {
                      return (
                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.65rem 0.75rem' }}>Subscription renewal ({payMonths} months)</td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>{invoiceTenant.user_seat_limit || 5}</td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>₹{invoiceTotals.amount.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>₹{invoiceTotals.amount.toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {previewMods.map(p => {
                          const rate = Number(invoiceTenant.module_rates?.[p.process_code] ?? p.monthly_rate_per_user ?? 0);
                          const seats = detailMap.get(p.process_code)?.licensed_seats || invoiceTenant.user_seat_limit || 5;
                          const net = Math.round(rate * seats * payMonths * (1 - discPct / 100) * 100) / 100;
                          return (
                            <tr key={p.process_code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '0.55rem 0.7rem' }}>
                                <div style={{ fontWeight: 700, color: '#1e1b4b' }}>{p.display_name}</div>
                                <div style={{ fontSize: '0.71rem', color: '#6b7280' }}>
                                  {seats} users × ₹{rate}/mo × {payMonths} mo{discPct ? ` (-${discPct}% disc)` : ''}
                                </div>
                              </td>
                              <td style={{ padding: '0.55rem 0.55rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{seats}</td>
                              <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right' }}>₹{rate.toLocaleString('en-IN')}/u/mo</td>
                              <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 700 }}>₹{net.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={4} style={{ padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: '#4338ca', fontWeight: 600 }}>
                            Calculation Basis: {previewMods.length} Active Modules • {payMonths} Month{payMonths > 1 ? 's' : ''}{discPct > 0 ? ` • ${discPct}% Cycle Discount` : ''}
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table></SaasDataTable>

              {/* Totals & Bank Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem', fontSize: '0.8rem' }}>
                <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem', fontSize: '0.78rem' }}>
                    🏦 BANK TRANSFER / UPI DETAILS FOR PAYMENT:
                  </div>
                  <div>Account Name: <strong>New Swan Multitech Limited</strong></div>
                  <div>Bank Name: <strong>HDFC Bank Ltd</strong></div>
                  <div>Account No: <strong>50200039281746</strong></div>
                  <div>IFSC Code: <strong>HDFC0000259</strong></div>
                  <div>UPI VPA: <strong>newswan@okhdfcbank</strong></div>
                </div>

                <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e5e7eb', textAlign: 'right' }}>
                  {/* Tax Mode Selector */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#475569' }}>Billing Mode:</span>
                    <select
                      value={invoiceGstMode}
                      disabled={!!activeInvoiceData}
                      onChange={(e) => setInvoiceGstMode(e.target.value)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: invoiceGstMode === 'NON_GST' ? '#0369a1' : '#1e293b',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="IGST">18% IGST (Inter-state)</option>
                      <option value="CGST_SGST">9% CGST + 9% SGST (Intra-state)</option>
                      <option value="NON_GST">NON-GST (0% Commercial Bill)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#6b7280' }}>Subtotal:</span>
                    <span>₹{invoiceTotals.amount.toLocaleString('en-IN')}</span>
                  </div>

                  {invoiceGstMode === 'NON_GST' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem', color: '#0284c7' }}>
                      <span style={{ fontWeight: 600 }}>GST (Non-GST / Commercial):</span>
                      <span style={{ fontWeight: 700 }}>NIL (₹0)</span>
                    </div>
                  ) : invoiceGstMode === 'CGST_SGST' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem' }}>
                        <span style={{ color: '#6b7280' }}>CGST (9% Intra-state):</span>
                        <span>₹{invoiceTotals.cgst.toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem' }}>
                        <span style={{ color: '#6b7280' }}>SGST (9% Intra-state):</span>
                        <span>₹{invoiceTotals.sgst.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#6b7280' }}>IGST (18% Inter-state):</span>
                      <span>₹{(invoiceTotals.tax_amount).toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #111827', marginTop: '4px', fontWeight: 800, fontSize: '0.95rem', color: '#1e1b4b' }}>
                    <span>Grand Total:</span>
                    <span>
                      ₹{(invoiceTotals.total_payable
                      ).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Issue Saved Proforma OR Record Payment Confirmation Form for Super Admin */}
            {invoiceType === 'proforma' && (!activeInvoiceData || activeInvoiceData.status === 'PENDING') && (
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {!activeInvoiceData && (
                  <div style={{ padding: '0.9rem 1rem', background: '#eef2ff', borderRadius: '8px', border: '1px solid #c7d2fe', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3730a3' }}>Renewal Duration</label>
                        <select
                          value={payMonths}
                          onChange={(e) => {
                            const nextMonths = Number(e.target.value) || 12;
                            setPayMonths(nextMonths);
                            setPayAmount(estimateTenantRenewalAmount(invoiceTenant, nextMonths));
                          }}
                          style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #a5b4fc', fontSize: '0.82rem', background: '#fff', fontWeight: 600 }}
                        >
                          <option value={1}>1 Month (Monthly)</option>
                          <option value={3}>3 Months (Quarterly)</option>
                          <option value={6}>6 Months (Half-Yearly)</option>
                          <option value={12}>12 Months (Yearly)</option>
                        </select>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#4338ca' }}>
                        Save official <strong>Pending Proforma Invoice (PI)</strong> to client&apos;s billing ledger without extending validity yet.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleIssueRenewalProforma}
                      disabled={issuingProforma || !(Number(payAmount) > 0)}
                      style={{
                        padding: '0.45rem 0.95rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: !(Number(payAmount) > 0) ? '#94a3b8' : '#4338ca',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: !(Number(payAmount) > 0) ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {issuingProforma ? 'Saving PI...' : 'Save & Issue Proforma Invoice (PI)'}
                    </button>
                  </div>
                )}

                <div style={{ padding: '1rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#065f46', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={16} /> Mark Payment Received & Generate Official Tax Invoice
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#047857' }}>Paid Amount (₹) *</label>
                      <input
                        type="number"
                        min="1"
                        value={payAmount}
                        disabled={!!activeInvoiceData}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Amount (> 0)"
                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#047857' }}>Payment Mode</label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '0.85rem' }}
                      >
                        <option value="UPI">UPI Transfer</option>
                        <option value="NEFT">Bank NEFT / RTGS</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#047857' }}>UTR / Transaction ID *</label>
                      <input
                        type="text"
                        value={payUtr}
                        onChange={(e) => setPayUtr(e.target.value)}
                        placeholder="e.g. UPI/6284910294"
                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '0.85rem' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRecordPayment}
                      disabled={recordingPay || !(Number(payAmount) > 0) || !payUtr.trim()}
                      style={{
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: (!(Number(payAmount) > 0) || !payUtr.trim()) ? '#94a3b8' : '#059669',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: (!(Number(payAmount) > 0) || !payUtr.trim()) ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                      title={!(Number(payAmount) > 0) || !payUtr.trim() ? 'Paid Amount > ₹0 and UTR / Reference are mandatory' : 'Record payment and extend validity'}
                    >
                      {recordingPay ? 'Processing...' : 'Confirm & Generate Tax Invoice'}
                    </button>
                  </div>
                  {(!(Number(payAmount) > 0) || !payUtr.trim()) && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.73rem', color: '#047857' }}>
                      Safety lock: Both <strong>Paid Amount (&gt; ₹0)</strong> and a valid <strong>UTR / Transaction ID</strong> are required to mark paid and extend validity.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Tenant Billing History Ledger */}
      {historyModalTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FolderClock size={20} color="#0284c7" />
                  Subscription & Invoicing Billing Ledger
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Company: <strong>{historyModalTenant.name}</strong> (<code>{historyModalTenant.tenant_code}</code>) | Seats Limit: <strong>{historyModalTenant.user_seat_limit} Users</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalTenant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                Loading billing history...
              </div>
            ) : billingHistoryList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                No invoices generated yet for this workspace.
              </div>
            ) : (
              <SaasDataTable id="history"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem 0.75rem' }}>Date</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>Invoice #</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>Description & Scope</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistoryList.map(inv => {
                    const statusUpper = String(inv.status || '').toUpperCase();
                    const isPaid = statusUpper === 'PAID';
                    const isVoid = statusUpper === 'VOID' || statusUpper === 'CANCELLED';
                    const isLog = ['TRIAL_LOG', 'LOGGED', 'COMPLETED'].includes(statusUpper);
                    const isAddon = inv.category === 'ADDON_SEATS';
                    const dStr = inv.created_at ? new Date(inv.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                    return (
                      <tr key={inv.id || inv.invoice_number} style={{ borderBottom: '1px solid #f1f5f9', opacity: isVoid ? 0.65 : 1 }}>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{dStr}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: isVoid ? '#991b1b' : '#0f172a' }}>
                          <code>{inv.invoice_number}</code>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{inv.description || (isAddon ? 'Add-on Seats Expansion' : 'Workspace Subscription')}</div>
                          {inv.days_added > 0 && (
                            <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, marginRight: '4px' }}>
                              +{inv.days_added} Days Trial
                            </span>
                          )}
                          {isAddon && (
                            <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              +{inv.additional_seats} Seats (Total: {inv.total_seats})
                            </span>
                          )}
                          {isVoid && inv.void_reason && (
                            <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px' }}>{inv.void_reason}</div>
                          )}
                          {inv.gst_type === 'NON_GST' && !isLog && (
                            <span style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, marginLeft: '4px' }}>
                              Non-GST
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(inv.gst_type === 'NON_GST' ? (inv.amount || 0) : (inv.total_payable || Math.round((inv.amount || 0) * 1.18))).toLocaleString('en-IN')}
                          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                            (Base: ₹{Number(inv.amount || 0).toLocaleString('en-IN')})
                          </div>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: isVoid ? '#fef2f2' : isPaid ? '#dcfce7' : isLog ? '#f1f5f9' : '#fef3c7',
                            color: isVoid ? '#dc2626' : isPaid ? '#15803d' : isLog ? '#475569' : '#b45309'
                          }}>
                            {statusUpper === 'CANCELLED' ? 'CANCELLED' : isVoid ? 'VOID' : isPaid ? 'PAID' : statusUpper === 'TRIAL_LOG' ? 'TRIAL LOG' : isLog ? 'LOGGED' : 'PENDING'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleViewHistoricalInvoice(inv)}
                              style={{
                                padding: '3px 10px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#334155',
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="View printable invoice"
                            >
                              <Eye size={12} /> View
                            </button>
                            {statusUpper === 'PENDING' && (
                              <button
                                type="button"
                                onClick={() => handleCancelMasterProforma(historyModalTenant?.id, inv.invoice_number)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #fecaca',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                                title="Cancel pending proforma"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></SaasDataTable>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setHistoryModalTenant(null)}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Soft Delete Confirmation Modal */}
      {deleteConfirmTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '480px', borderRadius: '14px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                  Move to Deleted Archive?
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Workspace: <strong>{deleteConfirmTenant.name}</strong> ({deleteConfirmTenant.tenant_code})
                </p>
              </div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.83rem', color: '#92400e', lineHeight: 1.5 }}>
              📦 <strong>90-Day Safe Retention:</strong> This workspace will be deactivated and moved to the <strong>Deleted Archive</strong> tab for 1 to 3 months. No data will be lost, and you can restore it anytime with a single click.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmTenant(null)}
                disabled={deletingWorkspace}
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSoftDelete}
                disabled={deletingWorkspace}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {deletingWorkspace ? 'Archiving...' : 'Move to Deleted Archive 🗑️'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Permanent Delete Confirmation Modal */}
      {permanentDeleteConfirmTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '480px', borderRadius: '14px', border: '1.5px solid #fecaca', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c', flexShrink: 0 }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#991b1b' }}>
                  Permanent Deletion Warning
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Workspace: <strong>{permanentDeleteConfirmTenant.name}</strong> ({permanentDeleteConfirmTenant.tenant_code})
                </p>
              </div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.83rem', color: '#991b1b', lineHeight: 1.5 }}>
              ⚠️ <strong>Irreversible Action:</strong> This workspace, its subscriptions, and entitlements will be <strong>permanently deleted</strong> from the database. This cannot be undone.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setPermanentDeleteConfirmTenant(null)}
                disabled={deletingWorkspace}
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={deletingWorkspace}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#991b1b',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {deletingWorkspace ? 'Deleting...' : 'Delete Permanently ❌'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Validity & Status Editor Modal (Revert Accidental Extensions / Fix Expiry) */}
      {editValidityTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '460px', borderRadius: '14px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#111827' }}>
                  <Edit3 size={18} color="#4338ca" /> Expiry Date & Status Editor
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Company: <strong>{editValidityTenant.name}</strong> ({editValidityTenant.tenant_code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditValidityTenant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {validityError && (
              <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} />
                <span>{validityError}</span>
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Exact Expiry Date (YYYY-MM-DD):
              </label>
              <input
                type="date"
                value={inputValidityDate}
                onChange={(e) => setInputValidityDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            {/* Quick Presets to easily revert or advance */}
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Quick Presets (Click to set):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Today', days: 0 },
                { label: '7 Days (Trial)', days: 7 },
                { label: '14 Days', days: 14 },
                { label: '1 Month', days: 30 },
                { label: '6 Months', days: 180 },
                { label: '1 Year', days: 365 }
              ].map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + preset.days);
                    setInputValidityDate(saasDateKey(d));
                  }}
                  style={{
                    padding: '0.4rem 0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Workspace Status:
              </label>
              <select
                value={inputValidityStatus}
                onChange={(e) => setInputValidityStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  fontWeight: 600
                }}
              >
                <option value="ACTIVE">ACTIVE (Paid)</option>
                <option value="TRIAL">TRIAL (Free Trial)</option>
                <option value="EXPIRING_SOON">EXPIRING SOON</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="DRAFT">DRAFT</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setEditValidityTenant(null)}
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveValidity}
                disabled={savingValidity}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#4338ca',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {savingValidity ? 'Saving...' : 'Save Expiry & Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Business Module */}
      {showAddModuleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '500px', borderRadius: '14px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <PlusCircle size={18} color="#4338ca" /> + Add New Business Module
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Will automatically appear in Onboarding, Pricing Calculator & Client Subscriptions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModuleModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {addModuleError && (
              <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.65rem 0.85rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} />
                <span>{addModuleError}</span>
              </div>
            )}

            <form onSubmit={handleAddNewModule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Module Unique Code * (Uppercase, e.g. INVENTORY_MANAGEMENT)
                </label>
                <input
                  type="text"
                  placeholder="e.g. INVENTORY_MANAGEMENT"
                  value={newModCode}
                  onChange={(e) => setNewModCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.9rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Module Display Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Smart Inventory & Warehouse Tracking"
                  value={newModName}
                  onChange={(e) => setNewModName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Category
                  </label>
                  <select
                    value={newModCategory}
                    onChange={(e) => setNewModCategory(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                  >
                    <option value="OPERATIONS">OPERATIONS</option>
                    <option value="SALES">SALES</option>
                    <option value="TELEPHONY">TELEPHONY</option>
                    <option value="HR">HR</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="COMBO">COMBO</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Monthly Rate (₹/User/Mo) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="99"
                    value={newModRate}
                    onChange={(e) => setNewModRate(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem', fontWeight: 700 }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Short description of what features this module unlocks..."
                  value={newModDesc}
                  onChange={(e) => setNewModDesc(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModuleModal(false)}
                  style={{ padding: '0.6rem 1.15rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingModule}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {addingModule ? 'Saving...' : 'Add to Process Catalog 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Impersonate Workspace User Modal */}
      {impersonateTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem'
        }}>
          <div className="card" style={{
            padding: '1.75rem',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid var(--border-light)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
                }}>
                  <LogIn size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Login as Workspace User
                  </h3>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Switch into <strong>{impersonateTenant.name}</strong> or any employee account in a tab-isolated view.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImpersonateTenant(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Workspace Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-muted, #f8fafc)',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              marginBottom: '1rem',
              fontSize: '0.82rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Workspace: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{impersonateTenant.name}</strong>
                <span style={{ marginLeft: '0.4rem', fontFamily: 'monospace', fontSize: '0.75rem', padding: '1px 6px', background: '#e2e8f0', borderRadius: '4px' }}>
                  {impersonateTenant.tenant_code}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Admin: </span>
                <strong style={{ color: '#4f46e5' }}>{impersonateTenant.primary_contact_email || 'Not specified'}</strong>
              </div>
              <div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#dcfce7',
                  color: '#166534',
                  fontWeight: 700,
                  fontSize: '0.72rem'
                }}>
                  {impersonateUsers.length} Employee(s)
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search user by name, email, employee ID, or role..."
                value={impersonateSearch}
                onChange={e => setImpersonateSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-surface)'
                }}
              />
            </div>

            {/* Users List Container */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
              {loadingImpersonateUsers ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#10b981' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading workspace users & credentials...</p>
                </div>
              ) : (() => {
                const q = impersonateSearch.toLowerCase().trim();
                const filtered = impersonateUsers.filter(u => {
                  if (!q) return true;
                  const name = (u.emp_name || '').toLowerCase();
                  const email = (u.email || u.emp_official_mail_id || '').toLowerCase();
                  const empId = (u.emp_id || '').toLowerCase();
                  const role = (u.role || '').toLowerCase();
                  return name.includes(q) || email.includes(q) || empId.includes(q) || role.includes(q);
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Users size={32} style={{ opacity: 0.3, margin: '0 auto 0.5rem auto' }} />
                      <p style={{ fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
                        {impersonateUsers.length === 0 ? 'No registered users found in this workspace' : 'No matching users found'}
                      </p>
                      <p style={{ fontSize: '0.8rem', margin: 0 }}>
                        {impersonateUsers.length === 0 
                          ? 'This client workspace may be newly created and the administrator has not completed their first login yet.'
                          : 'Try adjusting your search query.'}
                      </p>
                    </div>
                  );
                }

                return (
                  <SaasDataTable id="impersonation"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead style={{ backgroundColor: 'var(--th-bg, #f8fafc)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Employee / User</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(user => {
                        const email = user.email || user.emp_official_mail_id || 'No email';
                        const isPrimaryAdmin = impersonateTenant.primary_contact_email && 
                          email.toLowerCase() === impersonateTenant.primary_contact_email.toLowerCase();
                        const isLaunching = launchingUserId === user.user_id;

                        return (
                          <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: isPrimaryAdmin ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ padding: '0.75rem 0.85rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  backgroundColor: isPrimaryAdmin ? '#dcfce7' : '#e0e7ff',
                                  color: isPrimaryAdmin ? '#15803d' : '#4338ca',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  flexShrink: 0
                                }}>
                                  {(user.emp_name || email || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>{user.emp_name || 'Unnamed Employee'}</strong>
                                    {isPrimaryAdmin && (
                                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontWeight: 700 }}>
                                        👑 Workspace Admin
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                                    {email} {user.emp_id ? `• ID: ${user.emp_id}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 0.85rem' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: user.role === 'admin' || user.role === 'Admin' ? '#fef3c7' : '#f1f5f9',
                                color: user.role === 'admin' || user.role === 'Admin' ? '#92400e' : '#334155'
                              }}>
                                {user.role || 'agent'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 0.85rem' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: user.is_approved !== false ? '#dcfce7' : '#fee2e2',
                                color: user.is_approved !== false ? '#15803d' : '#b91c1c'
                              }}>
                                {user.is_approved !== false ? 'Active' : 'On Hold'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => handleLaunchImpersonation(user)}
                                disabled={isLaunching}
                                style={{
                                  padding: '0.4rem 0.85rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: isPrimaryAdmin ? '#059669' : '#2563eb',
                                  color: '#fff',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: isLaunching ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                                title="Open this user's personalized workspace in a new tab"
                              >
                                {isLaunching ? <RefreshCw size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                                <span>{isLaunching ? 'Opening...' : 'Login in New Tab'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></SaasDataTable>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ShieldCheck size={14} style={{ color: '#10b981' }} />
                <span>Zero Cookie Mutation • Tab-isolated session keeps your Master Admin tab 100% active.</span>
              </div>
              <button
                type="button"
                onClick={() => setImpersonateTenant(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
