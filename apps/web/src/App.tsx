import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Droplets,
  Fish,
  Package,
  Plus,
  Send,
  Sprout,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { hasPermission } from './lib/permissions';
import { AuthShell } from './components/AuthShell';

type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'WORKER';
};

type ApiState = {
  farms: any[];
  ponds: any[];
  feedings: any[];
  waterLogs: any[];
  mortalityLogs: any[];
  harvests: any[];
  inventoryItems: any[];
  tasks: any[];
  notifications: any[];
  finance: any | null;
  financeRecords: any[];
};

const emptyState: ApiState = {
  farms: [],
  ponds: [],
  feedings: [],
  waterLogs: [],
  mortalityLogs: [],
  harvests: [],
  inventoryItems: [],
  tasks: [],
  notifications: [],
  finance: null,
  financeRecords: [],
};

const ownerNav = [
  { id: 'command', label: 'Admin Dashboard', icon: Activity },
  { id: 'ponds', label: 'Ponds', icon: Fish },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'workers', label: 'Workers', icon: Users },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'inventory', label: 'Inventory', icon: Package },
];

const workerNav = [
  { id: 'command', label: "Today's Work", icon: ClipboardList },
  { id: 'ponds', label: 'My Ponds', icon: Fish },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
];

const viewerNav = [
  { id: 'command', label: 'Dashboard', icon: Activity },
  { id: 'ponds', label: 'Pond Reports', icon: Fish },
  { id: 'finance', label: 'Finance Reports', icon: Wallet },
];

function formatDalasi(value: number) {
  return `D${Math.round(value || 0).toLocaleString()}`;
}

function titleCase(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

const financeTypeLabels: Record<string, string> = {
  INCOME: 'Sales',
  EXPENSE: 'Running Cost',
  BUDGET: 'Fixed Cost',
};

const financeUnitOptions = ['kg', 'bags', 'batches', 'weekly', 'monthly', 'litres', 'tons', 'units', 'boxes', 'items'];
const inventoryUnitByCategory: Record<string, string> = {
  FEED: 'kg',
  MEDICINE: 'bottles',
  CHEMICAL: 'litres',
  EQUIPMENT: 'units',
  SUPPLIES: 'bags',
};

function formatFinanceType(value: string) {
  return financeTypeLabels[value] || titleCase(value);
}

function getInventoryUnitForCategory(category: string) {
  return inventoryUnitByCategory[category] || 'units';
}

function getRecommendedFeedSize(avgWeightGrams?: number | null) {
  if (!avgWeightGrams || avgWeightGrams <= 0) return '4mm';
  if (avgWeightGrams < 50) return '1mm';
  if (avgWeightGrams < 100) return '1.5mm';
  if (avgWeightGrams < 200) return '2mm';
  if (avgWeightGrams < 350) return '2.5mm';
  if (avgWeightGrams < 500) return '3mm';
  if (avgWeightGrams < 700) return '3.5mm';
  if (avgWeightGrams < 900) return '4mm';
  return '4.5mm';
}


function App() {
  const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aquaculture-token'));
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const stored = localStorage.getItem('aquaculture-user');
    return stored ? JSON.parse(stored) : null;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [workerForm, setWorkerForm] = useState({ fullName: '', email: '', password: '' });
  const [activeNav, setActiveNav] = useState('command');
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 1120));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiState>(emptyState);
  const [fieldNote, setFieldNote] = useState('Fed Pond 3. Fish appetite was strong. No dead fish. Water level normal.');
  const [selectedPondId, setSelectedPondId] = useState<string | null>(null);
  const [selectedPond, setSelectedPond] = useState<any | null>(null);
  const [selectedPondSummary, setSelectedPondSummary] = useState<any | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<any | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [syncQueueOpen, setSyncQueueOpen] = useState(false);
  const [workerRoster, setWorkerRoster] = useState<any[]>([]);
  const [workerAccessModal, setWorkerAccessModal] = useState<{ open: boolean; worker?: any; action?: 'block' | 'unblock' } | null>(null);
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [showWorkerCreateModal, setShowWorkerCreateModal] = useState(false);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [workerPasswords, setWorkerPasswords] = useState<Record<string, string>>({});

  // Owner harvest recording UI state
  const [showHarvestForm, setShowHarvestForm] = useState(false);
  const [harvestForm, setHarvestForm] = useState({ numberHarvested: '', avgWeightGrams: '', biomassKg: '', method: '', destination: '' });
  const [lastCreatedHarvest, setLastCreatedHarvest] = useState<{ id: string; pondId: string; numberHarvested: number } | null>(null);
  const defaultPondLogForm = {
    feedKg: '',
    feedSize: '4mm',
    feedGrams: '',
    inventoryItemId: '',
    appetite: '5',
    behavior: 'Normal',
    ph: '',
    dissolvedO2: '',
    ammonia: '',
    waterAddedPercent: '',
    waterRemovedPercent: '',
    waterComment: '',
    mortality: '0',
    mortalityCause: '',
    avgWeightGrams: '',
    growthComment: '',
    harvestQuantity: '',
    harvestAvgWeight: '',
    harvestBiomassKg: '',
    harvestMethod: '',
    harvestDestination: '',
  };

  const [pondLogForm, setPondLogForm] = useState(defaultPondLogForm);

  const resetPondLogForm = () => {
    setPondLogForm({ ...defaultPondLogForm });
  };

  const buildWorkerEmailFromName = useCallback((fullName: string) => {
    const clean = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!clean) return '';
    return `${clean}@gmail.com`;
  }, []);

  const isStrongPassword = useCallback((value: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value.trim()), []);

  const getRecommendedFeedSize = useCallback((avgWeightGrams?: number | null) => {
    if (!avgWeightGrams || avgWeightGrams <= 0) return '4mm';
    if (avgWeightGrams < 50) return '1mm';
    if (avgWeightGrams < 100) return '1.5mm';
    if (avgWeightGrams < 200) return '2mm';
    if (avgWeightGrams < 350) return '2.5mm';
    if (avgWeightGrams < 500) return '3mm';
    if (avgWeightGrams < 700) return '3.5mm';
    if (avgWeightGrams < 900) return '4mm';
    return '4.5mm';
  }, []);

  useEffect(() => {
    if (!selectedPondSummary || !selectedPond) return;
    const latestAverage = selectedPondSummary.growthHistory?.[0]?.avgWeightGrams ?? selectedPond.initialAvgWeightG ?? null;
    const recommended = getRecommendedFeedSize(latestAverage);
    if (!pondLogForm.feedSize || pondLogForm.feedSize === '4mm' && !pondLogForm.feedGrams && !pondLogForm.feedKg) {
      setPondLogForm((current) => ({ ...current, feedSize: recommended }));
    }
  }, [selectedPond, selectedPondSummary, getRecommendedFeedSize, pondLogForm.feedGrams, pondLogForm.feedKg, pondLogForm.feedSize]);

  // lightweight modal helper for harvest confirmation (awaitable)
  const [harvestModal, setHarvestModal] = useState<{ open: boolean; details?: any; resolver?: ((v: boolean) => void) | null }>({ open: false, details: undefined, resolver: null });
  function showHarvestConfirmation(details: any) {
    return new Promise<boolean>((resolve) => {
      setHarvestModal({ open: true, details, resolver: resolve });
    });
  }
  function resolveHarvestModal(result: boolean) {
    if (harvestModal.resolver) {
      try {
        harvestModal.resolver(result);
      } catch {
        // ignore
      }
    }
    setHarvestModal({ open: false, details: undefined, resolver: null });
  }
  const [newPond, setNewPond] = useState({
    siteName: '',
    number: '',
    species: 'TILAPIA',
    capacity: '',
    initialPopulation: '',
    stockedAt: '',
    initialAvgWeightG: '',
    targetHarvestKg: '',
    targetHarvestUnit: 'g' as 'g' | 'kg',
    assignedUserId: 'all',
  });
  const [adminActionModal, setAdminActionModal] = useState<{ type: 'targetHarvest' | 'recommendFeed' | 'mortality' } | null>(null);
  const [targetHarvestAction, setTargetHarvestAction] = useState({ pondId: '', date: '', time: '09:00' });
  const [recommendFeedAction, setRecommendFeedAction] = useState({ pondId: '', inventoryItemId: '', feedSize: '1mm', quantityKg: '1' });
  const [mortalityAction, setMortalityAction] = useState({ pondId: '', count: '', cause: '', observedAt: '' });
  const [showPondCreateModal, setShowPondCreateModal] = useState(false);
  const [financeForm, setFinanceForm] = useState({
    type: 'EXPENSE',
    category: '',
    quantity: '',
    unit: 'kg',
    unitPrice: '',
    amount: '',
    pondId: '',
  });
  const [showFinanceForm, setShowFinanceForm] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    priority: 'HIGH',
    dueAt: '',
  });
  const [inventoryForm, setInventoryForm] = useState({
    category: '',
    unit: 'kg',
    currentStock: '',
    minStock: '',
    feedSize: '4mm',
  });
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [restockItemId, setRestockItemId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [inventoryAdjustment, setInventoryAdjustment] = useState({
    itemId: '',
    type: 'ADD',
    quantity: '',
    reason: 'Restock',
  });

  const isOwner = currentUser?.role === 'OWNER';
  const canViewFinance = hasPermission(currentUser?.role, 'FINANCE_VIEW');
  const canViewInventory = hasPermission(currentUser?.role, 'INVENTORY_VIEW');
  const navItems = isOwner ? ownerNav : workerNav;

  const readQueuedSyncEntries = useCallback(() => {
    if (typeof window === 'undefined') return [] as Array<Record<string, any>>;
    try {
      return JSON.parse(localStorage.getItem('aquaculture-sync-queue') || '[]');
    } catch {
      return [] as Array<Record<string, any>>;
    }
  }, []);

  // auto-dismiss toasts after a short delay so messages don't stick
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMessage) return;
    const id = setTimeout(() => setToastMessage(null), 6000);
    return () => clearTimeout(id);
  }, [toastMessage]);

  const queueOfflineSyncEntry = useCallback((action: string, payload: Record<string, any>, tableName: string, recordId?: string) => {
    if (typeof window === 'undefined') return;
    const entries = readQueuedSyncEntries();
    const nextEntry = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      tableName,
      recordId,
      payload,
      deviceId: 'browser-web',
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('aquaculture-sync-queue', JSON.stringify([...entries, nextEntry]));
    setPendingSyncCount([...entries, nextEntry].length);
  }, [readQueuedSyncEntries]);


  const loadData = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: token ? 'Bearer ' + token : '' };
    const [farmsRes, pondsRes, feedingsRes, waterRes, mortalityRes, harvestsRes, inventoryRes, tasksRes, financeRes, notificationsRes] = await Promise.all([
      fetch(`${apiBaseUrl}/farms`, { headers }),
      fetch(`${apiBaseUrl}/ponds`, { headers }),
      fetch(`${apiBaseUrl}/feedings`, { headers }),
      fetch(`${apiBaseUrl}/water-quality`, { headers }),
      fetch(`${apiBaseUrl}/mortality`, { headers }),
      fetch(`${apiBaseUrl}/harvests`, { headers }),
      fetch(`${apiBaseUrl}/inventory`, { headers }),
      fetch(`${apiBaseUrl}/tasks`, { headers }),
      fetch(`${apiBaseUrl}/finance`, { headers }),
      fetch(`${apiBaseUrl}/notifications`, { headers }),
    ]);

    const next = { ...emptyState };
    if (farmsRes.ok) next.farms = (await farmsRes.json()).farms || [];
    if (pondsRes.ok) next.ponds = (await pondsRes.json()).ponds || [];
    if (feedingsRes.ok) next.feedings = (await feedingsRes.json()).feedings || [];
    if (waterRes.ok) next.waterLogs = (await waterRes.json()).waterLogs || [];
    if (mortalityRes.ok) next.mortalityLogs = (await mortalityRes.json()).mortalityLogs || [];
    if (harvestsRes.ok) {
      const body = await harvestsRes.json().catch(() => ({}));
      next.harvests = body.harvests || [];
    }
    if (inventoryRes.ok) next.inventoryItems = (await inventoryRes.json()).items || [];
    if (tasksRes.ok) next.tasks = (await tasksRes.json()).tasks || [];
    if (financeRes.ok) {
      const finance = await financeRes.json();
      next.finance = finance.dashboard || null;
      next.financeRecords = finance.records || [];
    }
    if (notificationsRes.ok) next.notifications = (await notificationsRes.json()).notifications || [];
    setData(next);
  }, [apiBaseUrl, token]);

  const loadWorkerRoster = useCallback(async () => {
    if (!token || !isOwner) {
      setWorkerRoster([]);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/workers`, {
        headers: { Authorization: token ? 'Bearer ' + token : '' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn('Failed to load worker roster', body.error || response.statusText);
        return;
      }
      setWorkerRoster(body.workers || []);
    } catch (error) {
      console.warn('Worker roster unavailable', error);
    }
  }, [apiBaseUrl, isOwner, token]);

  const flushOfflineSyncQueue = useCallback(async () => {
    if (!token || !navigator.onLine) return;
    const entries = readQueuedSyncEntries();
    if (!entries.length) {
      setPendingSyncCount(0);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/sync/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
          Authorization: token ? 'Bearer ' + token : '',
      },
      body: JSON.stringify({
        items: entries.map((entry: Record<string, any>) => ({
          action: entry.action,
          tableName: entry.tableName,
          recordId: entry.recordId,
          payload: entry.payload,
          deviceId: entry.deviceId,
        })),
      }),
    });

    if (response.ok) {
      const flushResponse = await fetch(`${apiBaseUrl}/sync/flush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? 'Bearer ' + token : '',
        },
      });
      if (flushResponse.ok) {
        localStorage.removeItem('aquaculture-sync-queue');
        setPendingSyncCount(0);
        await loadData();
      }
    }
  }, [apiBaseUrl, loadData, readQueuedSyncEntries, token]);

  useEffect(() => {
    loadData().catch((err) => console.error('Failed to load AquaCulture data', err));
  }, [loadData]);

  useEffect(() => {
    if (token && isOwner) {
      void loadWorkerRoster();
    } else {
      setWorkerRoster([]);
    }
  }, [isOwner, loadWorkerRoster, token]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1120) {
        setSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const syncPendingQueue = async () => {
      if (!token) return;
      setPendingSyncCount(readQueuedSyncEntries().length);
      if (navigator.onLine) {
        await flushOfflineSyncQueue();
      }
    };

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      void syncPendingQueue();
    };

    setIsOnline(navigator.onLine);
    setPendingSyncCount(readQueuedSyncEntries().length);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    void syncPendingQueue();

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, [flushOfflineSyncQueue, readQueuedSyncEntries, token]);

  // Enhanced worker pond update: attempt immediate POSTs; if any fail, queue a consolidated pond_update
  async function handleWorkerPondLogEnhanced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedPondId) return;

    const feedGrams = Number(pondLogForm.feedGrams) || Number(pondLogForm.feedKg) || 0;
    const feedKgValue = feedGrams > 0 ? Number((feedGrams / 1000).toFixed(3)) : Number(pondLogForm.feedKg) || 0;
    const payload = {
      pondId: selectedPondId,
      feedKg: feedKgValue,
      feedGrams,
      feedSize: pondLogForm.feedSize || '4mm',
      inventoryItemId: pondLogForm.inventoryItemId || undefined,
      appetite: pondLogForm.appetite,
      behavior: pondLogForm.behavior,
      ph: pondLogForm.ph,
      dissolvedO2: pondLogForm.dissolvedO2,
      ammonia: pondLogForm.ammonia,
      waterAddedPercent: pondLogForm.waterAddedPercent,
      waterRemovedPercent: pondLogForm.waterRemovedPercent,
      waterComment: pondLogForm.waterComment,
      mortality: pondLogForm.mortality,
      mortalityCause: pondLogForm.mortalityCause,
      avgWeightGrams: pondLogForm.avgWeightGrams,
      growthComment: pondLogForm.growthComment,
      harvestQuantity: pondLogForm.harvestQuantity,
      harvestAvgWeight: pondLogForm.harvestAvgWeight,
      harvestBiomassKg: pondLogForm.harvestBiomassKg,
      harvestMethod: pondLogForm.harvestMethod,
      harvestDestination: pondLogForm.harvestDestination,
    };

    if (!navigator.onLine) {
      queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      resetPondLogForm();
      return;
    }

    const headers = { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' };
    const calls: Promise<Response>[] = [];

    if (feedKgValue > 0) {
      calls.push(fetch(`${apiBaseUrl}/feedings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          quantityKg: feedKgValue,
          feedSize: pondLogForm.feedSize || '4mm',
          feedType: data.inventoryItems.find((item) => item.id === pondLogForm.inventoryItemId)?.name || 'Pellet',
          inventoryItemId: pondLogForm.inventoryItemId || undefined,
          appetite: Number(pondLogForm.appetite),
          observation: pondLogForm.behavior,
        }),
      }));
    }

    calls.push(fetch(`${apiBaseUrl}/water-quality`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pondId: selectedPondId,
        ph: Number(pondLogForm.ph) || undefined,
        dissolvedO2: Number(pondLogForm.dissolvedO2) || undefined,
        ammonia: Number(pondLogForm.ammonia) || undefined,
        waterAddedPercent: Number(pondLogForm.waterAddedPercent) || 0,
        waterRemovedPercent: Number(pondLogForm.waterRemovedPercent) || 0,
        comment: pondLogForm.waterComment || 'Worker pond update',
      }),
    }));

    if (Number(pondLogForm.mortality) > 0) {
      calls.push(fetch(`${apiBaseUrl}/mortality`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          numberDead: Number(pondLogForm.mortality),
          possibleCause: pondLogForm.mortalityCause || 'Unspecified',
        }),
      }));
    }

    // immediate harvest creation when provided — only owners may record harvests
    if (isOwner && Number(pondLogForm.harvestQuantity) > 0) {
      const harvestQtyNum = Number(pondLogForm.harvestQuantity);
      // integrity checks: integer positive
      if (!Number.isInteger(harvestQtyNum) || harvestQtyNum <= 0) {
        alert('Harvest quantity must be a positive whole number (no fractional fish).');
      } else {
        const currentLive = (selectedPondSummary && selectedPondSummary.currentLive) ?? (selectedPond && (selectedPond.initial_population ?? selectedPond.current_population)) ?? 0;
        if (harvestQtyNum > currentLive) {
          alert('Harvest quantity cannot exceed current live fish. Please correct the value.');
        } else {
          // auto-calc biomass if avg weight provided and biomass empty
          let biomassVal = pondLogForm.harvestBiomassKg && Number(pondLogForm.harvestBiomassKg) > 0 ? Number(pondLogForm.harvestBiomassKg) : undefined;
          const avgW = pondLogForm.harvestAvgWeight ? Number(pondLogForm.harvestAvgWeight) : undefined;
          if (!biomassVal && avgW && harvestQtyNum > 0) {
            biomassVal = Number(((avgW * harvestQtyNum) / 1000).toFixed(2));
          }

          const confirmDetails = { harvestQty: harvestQtyNum, biomassKg: biomassVal, currentLive };
          const confirmed = await showHarvestConfirmation(confirmDetails);
          if (!confirmed) {
            // cancelled
          } else {
            calls.push(fetch(`${apiBaseUrl}/harvests`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                pondId: selectedPondId,
                numberHarvested: harvestQtyNum,
                avgWeightGrams: avgW ?? undefined,
                biomassKg: biomassVal ?? undefined,
                method: pondLogForm.harvestMethod || undefined,
                destination: pondLogForm.harvestDestination || undefined,
              }),
            }));
          }
        }
      }
    } else if (Number(pondLogForm.harvestQuantity) > 0) {
      // worker attempted to create harvest — disallow and inform
      setToastMessage('Only owners may record harvests. Contact your manager.');
    }

    try {
      const settled = await Promise.allSettled(calls);
      const failures = settled.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        console.error('Some pond update calls failed, queuing for sync', failures);
        queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      } else {
        if (Number(pondLogForm.avgWeightGrams) > 0) {
          try {
            const qRes = await fetch(`${apiBaseUrl}/sync/queue`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ items: [{ action: 'pond_update', payload: { pondId: selectedPondId, avgWeightGrams: Number(pondLogForm.avgWeightGrams), growthComment: pondLogForm.growthComment || undefined } }] }),
            });
            if (qRes.ok) {
              const fRes = await fetch(`${apiBaseUrl}/sync/flush`, { method: 'POST', headers });
              if (!fRes.ok) {
                queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
                resetPondLogForm();
                return;
              }
            } else {
              queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
              resetPondLogForm();
              return;
            }
          } catch (err) {
            console.error('Failed to apply growth immediately, queuing', err);
            queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
            resetPondLogForm();
            return;
          }
        }

        resetPondLogForm();
        await loadData();
        await openPond(selectedPondId);
      }
    } catch (err) {
      console.error('Pond update failed, queued for later sync', err);
      queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
    }
  }

  const workers = useMemo(() => {
    const rosterWorkers = Array.isArray(workerRoster) ? workerRoster : [];
    const members = data.farms.flatMap((farm) => farm.members || []);
    const farmWorkers = members.filter((member) => member.role?.name === 'WORKER');
    const merged = [...rosterWorkers, ...farmWorkers];
    const uniqueByKey = new Map<string, any>();

    merged.forEach((worker) => {
      const key = String(worker.id || worker.email || '').toLowerCase();
      if (!key) return;
      const candidate = uniqueByKey.get(key);
      if (!candidate || (candidate.createdAt ?? 0) < (worker.createdAt ?? 0)) {
        uniqueByKey.set(key, worker);
      }
    });

    const deduped = Array.from(uniqueByKey.values()).map((worker) => ({
      ...worker,
      password: worker.password || workerPasswords[worker.id || worker.email] || 'Assigned password',
    }));
    return deduped.length > 0 ? deduped : [
      { id: 'worker-dev', email: 'worker@aquaculture.localapp', name: 'Field Worker', role: { name: 'WORKER' }, blocked: false, createdAt: new Date().toISOString(), password: 'Assigned password' },
    ];
  }, [data.farms, workerPasswords, workerRoster]);

  const filteredWorkers = useMemo(() => {
    const term = workerSearchTerm.trim().toLowerCase();
    return workers.filter((worker) => {
      const matchesText = !term || [worker.name, worker.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
      const matchesStatus = workerStatusFilter === 'all'
        || (workerStatusFilter === 'active' && !worker.blocked)
        || (workerStatusFilter === 'blocked' && Boolean(worker.blocked));
      return matchesText && matchesStatus;
    });
  }, [workerSearchTerm, workerStatusFilter, workers]);

  const selectedTask = useMemo(() => {
    if (!data.tasks.length) return null;
    return data.tasks.find((task) => task.id === selectedTaskId) || data.tasks[0];
  }, [data.tasks, selectedTaskId]);

  const overview = useMemo(() => {
    const totalFeed = data.feedings.reduce((sum, item) => sum + Number(item.quantityKg || 0), 0);
    const totalMortality = data.mortalityLogs.reduce((sum, item) => sum + Number(item.numberDead || 0), 0);
    const latestFeedSize = [...data.feedings].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]?.feedSize || 'Not recorded';
    const lowStock = data.inventoryItems.filter((item) => Number(item.currentStock || 0) <= Number(item.minStock || 0)).length;
    const finance = data.finance || { income: 0, expenses: 0, budget: 0, profit: 0, status: 'PROFIT', profitMargin: 0, budgetUsedPercent: 0 };
    return { totalFeed, totalMortality, lowStock, finance, healthScore: totalMortality > 10 ? 82 : 96, latestFeedSize };
  }, [data]);


  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) throw new Error(body.error || 'Unable to sign in');
      localStorage.setItem('aquaculture-token', body.token);
      localStorage.setItem('aquaculture-user', JSON.stringify(body.user));
      setToken(body.token);
      setCurrentUser(body.user);
      setActiveNav('command');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  async function handleOwnerRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    if (!registerName.trim() || !registerEmail.trim() || !registerPassword.trim() || !registerCode.trim()) {
      setError('Name, email, password, and admin code are required.');
      setLoading(false);
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerName.trim(),
          email: registerEmail.trim().toLowerCase(),
          password: registerPassword,
          code: registerCode.trim().toUpperCase(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) {
        throw new Error(body.error || 'Admin registration failed');
      }
      localStorage.setItem('aquaculture-token', body.token);
      localStorage.setItem('aquaculture-user', JSON.stringify(body.user));
      setToken(body.token);
      setCurrentUser(body.user);
      setShowRegisterForm(false);
      setActiveNav('command');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function openPond(pondId: string) {
    if (!token) return;
    setSelectedPondId(pondId);
    const response = await fetch(`${apiBaseUrl}/ponds/${pondId}`, { headers: { Authorization: token ? 'Bearer ' + token : '' } });
    if (!response.ok) return;
    const body = await response.json();
    setSelectedPond(body.pond);
    setSelectedPondSummary(body.summary);
  }

  const applyRecommendedFeedSize = useCallback(async (pondId: string, recommendedSize: string) => {
    setPondLogForm((current) => ({ ...current, feedSize: recommendedSize }));
    setActiveNav('ponds');
    if (pondId) {
      setSelectedPondId(pondId);
      await openPond(pondId);
    }
  }, [openPond]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (!token) return;
    const response = await fetch(`${apiBaseUrl}/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: token ? 'Bearer ' + token : '' },
    });

    if (!response.ok) return;
    setData((current) => ({
      ...current,
      notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item),
    }));
  }, [apiBaseUrl, token]);

  const markAllNotificationsRead = useCallback(async () => {
    if (!token || !data.notifications.some((item) => !item.read)) return;

    await Promise.all(
      data.notifications.filter((item) => !item.read).map((item) => markNotificationRead(item.id))
    );
  }, [data.notifications, markNotificationRead, token]);

  async function handleTargetHarvestActionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const pondId = targetHarvestAction.pondId || selectedPondId || '';
    if (!pondId || !targetHarvestAction.date) {
      setToastMessage('Select a pond and choose a harvest date.');
      return;
    }

    const timestamp = new Date(`${targetHarvestAction.date}T${targetHarvestAction.time || '09:00'}`);
    const response = await fetch(`${apiBaseUrl}/ponds/${pondId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({ targetHarvestDate: timestamp.toISOString() }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
      return;
    }

    setAdminActionModal(null);
    setTargetHarvestAction({ pondId: '', date: '', time: '09:00' });
    setToastMessage('Target harvest date saved.');
    await loadData();
    if (selectedPondId === pondId) await openPond(pondId);
  }

  async function handleRecommendFeedActionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const pondId = recommendFeedAction.pondId || selectedPondId || '';
    if (!pondId) {
      setToastMessage('Select a pond before recommending feed.');
      return;
    }

    const item = data.inventoryItems.find((entry) => entry.id === recommendFeedAction.inventoryItemId);
    const quantityKg = Number(recommendFeedAction.quantityKg) || 1;
    const response = await fetch(`${apiBaseUrl}/feedings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        pondId,
        quantityKg,
        feedSize: recommendFeedAction.feedSize || '1mm',
        feedType: item?.name || 'Pellet',
        inventoryItemId: recommendFeedAction.inventoryItemId || undefined,
        appetite: 5,
        observation: 'Admin recommended feed adjustment',
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
      return;
    }

    setAdminActionModal(null);
    setRecommendFeedAction({ pondId: '', inventoryItemId: '', feedSize: '1mm', quantityKg: '1' });
    setToastMessage('Feed recommendation recorded.');
    await loadData();
    if (selectedPondId === pondId) await openPond(pondId);
  }

  async function handleMortalityActionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const pondId = mortalityAction.pondId || selectedPondId || '';
    const count = Number(mortalityAction.count) || 0;
    if (!pondId || count <= 0) {
      setToastMessage('Select a pond and enter a valid mortality count.');
      return;
    }

    const response = await fetch(`${apiBaseUrl}/mortality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        pondId,
        numberDead: count,
        possibleCause: mortalityAction.cause || 'Unspecified',
        observedAt: mortalityAction.observedAt || new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
      return;
    }

    setAdminActionModal(null);
    setMortalityAction({ pondId: '', count: '', cause: '', observedAt: '' });
    setToastMessage('Mortality record saved.');
    await loadData();
    if (selectedPondId === pondId) await openPond(pondId);
  }

  async function handleCreatePond(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const siteName = newPond.siteName.trim();
    const pondNumber = Number(newPond.number);
    const capacity = Number(newPond.capacity);
    const initialPopulation = Number(newPond.initialPopulation) || undefined;
    const targetHarvestValue = Number(newPond.targetHarvestKg) || undefined;
    const targetHarvestKg = targetHarvestValue !== undefined
      ? Number((newPond.targetHarvestUnit === 'g' ? targetHarvestValue / 1000 : targetHarvestValue).toFixed(6))
      : undefined;
    const assignedUserId = newPond.assignedUserId && newPond.assignedUserId !== 'all' ? newPond.assignedUserId : undefined;

    if (!siteName) {
      setToastMessage('Site name is required.');
      return;
    }
    if (!Number.isInteger(pondNumber) || pondNumber <= 0) {
      setToastMessage('Pond number must be a positive whole number.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setToastMessage('Water volume must be greater than zero.');
      return;
    }
    if (!initialPopulation || !Number.isFinite(initialPopulation) || initialPopulation <= 0) {
      setToastMessage('Initial stock fish is required.');
      return;
    }
    if (!newPond.stockedAt) {
      setToastMessage('Stocked on date is required.');
      return;
    }
    if (!newPond.initialAvgWeightG || Number(newPond.initialAvgWeightG) <= 0) {
      setToastMessage('Initial average weight is required.');
      return;
    }
    if (!newPond.targetHarvestKg || Number(newPond.targetHarvestKg) <= 0) {
      setToastMessage('Target harvest weight is required.');
      return;
    }

    const siteKey = siteName.toLowerCase();
    if (data.ponds.some((pond) => String(pond.site?.name || '').trim().toLowerCase() === siteKey && Number(pond.number) === pondNumber)) {
      setToastMessage('A pond with this number already exists in that site.');
      return;
    }

    if (!navigator.onLine) {
      queueOfflineSyncEntry('pond_create', {
        siteName,
        number: pondNumber,
        species: newPond.species,
        capacity,
        initialPopulation,
        stockedAt: newPond.stockedAt || undefined,
        initialAvgWeightG: Number(newPond.initialAvgWeightG) || undefined,
        targetHarvestKg,
        assignedUserId,
      }, 'pond');
      setNewPond({ siteName: '', number: '', species: 'TILAPIA', capacity: '', initialPopulation: '', stockedAt: '', initialAvgWeightG: '', targetHarvestKg: '', targetHarvestUnit: 'g', assignedUserId: 'all' });
      setShowPondCreateModal(false);
      setToastMessage('Pond queued for sync while offline.');
      return;
    }

    const headers = { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' };
    const allSites = data.farms.flatMap((farm) => farm.sites || []);
    let site = allSites.find((item) => String(item.name || '').trim().toLowerCase() === siteKey);
    if (!site) {
      const siteRes = await fetch(`${apiBaseUrl}/sites`, { method: 'POST', headers, body: JSON.stringify({ name: siteName }) });
      const siteBody = await siteRes.json().catch(() => ({}));
      if (!siteRes.ok) {
        const farmRes = await fetch(`${apiBaseUrl}/farms`, { method: 'POST', headers, body: JSON.stringify({ name: siteName }) });
        const farmBody = await farmRes.json().catch(() => ({}));
        if (!farmRes.ok) {
          setToastMessage(siteBody.error || farmBody.error || 'Unable to create the site for this pond.');
          return;
        }
        site = farmBody.farm?.sites?.[0] || null;
        if (!site) {
          setToastMessage('Unable to create the site for this pond.');
          return;
        }
      } else {
        site = siteBody.site;
      }
    }

    const pondRes = await fetch(`${apiBaseUrl}/ponds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteId: site.id,
        number: pondNumber,
        species: newPond.species,
        capacity,
        initialPopulation,
        stockedAt: newPond.stockedAt || undefined,
        initialAvgWeightG: Number(newPond.initialAvgWeightG) || undefined,
        targetHarvestKg,
        assignedUserId,
      }),
    });
    const pondBody = await pondRes.json().catch(() => ({}));
    if (!pondRes.ok) {
      setToastMessage(pondBody.error || 'Unable to create pond.');
      return;
    }

    setNewPond({ siteName: '', number: '', species: 'TILAPIA', capacity: '', initialPopulation: '', stockedAt: '', initialAvgWeightG: '', targetHarvestKg: '', targetHarvestUnit: 'g', assignedUserId: 'all' });
    setShowPondCreateModal(false);
    setToastMessage(`Pond ${pondNumber} created successfully.`);
    await loadData();
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'pond' | 'finance' | 'inventory' | null; id?: string; label?: string }>({ open: false, type: null });
  const [taskComment, setTaskComment] = useState('');
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ item: any; timeoutId?: number } | null>(null);
  const [pendingFinanceDelete, setPendingFinanceDelete] = useState<{ item: any; timeoutId?: number } | null>(null);

  function showDeleteConfirmation(type: 'pond' | 'finance' | 'inventory', id: string, label: string) {
    setDeleteConfirm({ open: true, type, id, label });
  }

  function cancelDeleteConfirmation() {
    setDeleteConfirm({ open: false, type: null, id: undefined, label: undefined });
  }

  async function deletePond(pondId: string) {
    if (!token || !isOwner) return;
    const response = await fetch(`${apiBaseUrl}/ponds/${pondId}`, {
      method: 'DELETE',
      headers: { Authorization: token ? 'Bearer ' + token : '' },
    });
    if (response.ok) {
      if (selectedPondId === pondId) {
        setSelectedPondId(null);
        setSelectedPond(null);
        setSelectedPondSummary(null);
      }
      await loadData();
    }
    cancelDeleteConfirmation();
  }

  async function deleteFinanceRecord(id: string) {
    if (!token || !isOwner) return;
    const item = data.financeRecords.find((record) => record.id === id);
    if (!item) {
      cancelDeleteConfirmation();
      return;
    }

    if (pendingFinanceDelete && pendingFinanceDelete.item?.id === id) {
      cancelDeleteConfirmation();
      return;
    }

    const deleteResponse = await fetch(`${apiBaseUrl}/finance/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? 'Bearer ' + token : '' },
    });

    if (!deleteResponse.ok) {
      const bodyText = await deleteResponse.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || deleteResponse.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${deleteResponse.status}`);
      cancelDeleteConfirmation();
      setTimeout(() => setToastMessage(null), 2200);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingFinanceDelete(null);
      setToastMessage(null);
    }, 15000);

    setPendingFinanceDelete({ item, timeoutId });
    setToastMessage('Row removed');
    await loadData();
    cancelDeleteConfirmation();
  }

  async function undoFinanceDelete() {
    if (!pendingFinanceDelete || !token || !isOwner) return;
    const item = pendingFinanceDelete.item;
    if (pendingFinanceDelete.timeoutId) window.clearTimeout(pendingFinanceDelete.timeoutId);

    const restoreBody = {
      type: item.type,
      category: item.category,
      description: item.description,
      quantity: Number(item.quantity) || undefined,
      unit: item.unit,
      unitPrice: Number(item.unitPrice) || undefined,
      amount: Number(item.amount) || undefined,
      pondId: item.pondId || undefined,
      recordedAt: item.recordedAt || new Date().toISOString(),
    };

    const restoreResponse = await fetch(`${apiBaseUrl}/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify(restoreBody),
    });

    if (restoreResponse.ok) {
      setToastMessage('Row restored');
      await loadData();
    } else {
      const bodyText = await restoreResponse.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || restoreResponse.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${restoreResponse.status}`);
    }

    setPendingFinanceDelete(null);
    setTimeout(() => setToastMessage(null), 2200);
  }

  async function deleteInventoryItem(id: string) {
    if (!token || !isOwner) return;
    // find item data so we can restore if user undoes
    const item = data.inventoryItems.find((it) => it.id === id);
    if (!item) {
      cancelDeleteConfirmation();
      return;
    }

    const response = await fetch(`${apiBaseUrl}/inventory/${id}`, { method: 'DELETE', headers: { Authorization: token ? 'Bearer ' + token : '' } });
    if (response.ok) {
      // keep backup to allow undo
      const timeoutId = window.setTimeout(() => {
        setRecentlyDeleted(null);
      }, 10000);
      setRecentlyDeleted({ item, timeoutId });
      setToastMessage(`${item.name} deleted — Undo`);
      // optimistically reload list so UI updates immediately
      await loadData();
    } else {
      setToastMessage('Unable to delete item');
    }
    cancelDeleteConfirmation();
  }

  async function undoDeleteInventory() {
    if (!recentlyDeleted || !token || !isOwner) return;
    const { item, timeoutId } = recentlyDeleted;
    if (timeoutId) window.clearTimeout(timeoutId);
    // attempt to recreate item using existing fields
    const body = {
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentStock: item.currentStock || 0,
      minStock: item.minStock || 0,
    };
    const response = await fetch(`${apiBaseUrl}/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' }, body: JSON.stringify(body) });
    if (response.ok) {
      setToastMessage(`${item.name} restored`);
      await loadData();
    } else {
      setToastMessage('Unable to restore item');
    }
    setRecentlyDeleted(null);
  }

  // owner-only: record harvest form handling and undo
  async function handleRecordHarvestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner || !selectedPondId) return;
    const num = Number(harvestForm.numberHarvested);
    if (!Number.isInteger(num) || num <= 0) { setToastMessage('Enter a positive whole number for harvested fish'); return; }
    const body = {
      pondId: selectedPondId,
      numberHarvested: num,
      avgWeightGrams: harvestForm.avgWeightGrams ? Number(harvestForm.avgWeightGrams) : undefined,
      biomassKg: harvestForm.biomassKg ? Number(harvestForm.biomassKg) : undefined,
      method: harvestForm.method || undefined,
      destination: harvestForm.destination || undefined,
    };
    try {
      const r = await fetch(`${apiBaseUrl}/harvests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' }, body: JSON.stringify(body) });
      if (r.ok) {
        const data = await r.json();
        setLastCreatedHarvest({ id: data.harvest.id, pondId: data.harvest.pondId, numberHarvested: data.harvest.numberHarvested });
        setToastMessage(`${data.harvest.numberHarvested} fish recorded — Undo`);
        setShowHarvestForm(false);
        setHarvestForm({ numberHarvested: '', avgWeightGrams: '', biomassKg: '', method: '', destination: '' });
        await loadData();
      } else {
        const bodyText = await r.text().catch(() => '');
        let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || r.statusText }; }
        setToastMessage(parsed.error || parsed.message || `Server error ${r.status}`);
      }
    } catch (e) {
      setToastMessage('Failed to record harvest');
    }
  }

  async function handleUpdateHarvest(harvestId: string, payload: { numberHarvested?: number; avgWeightGrams?: number | null; biomassKg?: number | null; method?: string | null; destination?: string | null }) {
    if (!token || !isOwner) return;
    try {
      const response = await fetch(`${apiBaseUrl}/harvests/${harvestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
        setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
        return;
      }
      setToastMessage('Harvest updated');
      await loadData();
      if (selectedPondId) await openPond(selectedPondId);
    } catch (error) {
      setToastMessage('Failed to update harvest');
    }
  }

  async function handleApplyRecommendedFeed(pondId: string, recommendedSize: string) {
    if (!token || !pondId) return;
    try {
      const response = await fetch(`${apiBaseUrl}/feedings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({
          pondId,
          quantityKg: 5,
          feedSize: recommendedSize,
          feedType: 'Recommended feed',
          appetite: 5,
          observation: `Owner applied recommended feed size ${recommendedSize}.`,
        }),
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
        setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
        return;
      }
      setToastMessage(`Recommended feed ${recommendedSize} applied`);
      await loadData();
      if (selectedPondId) await openPond(selectedPondId);
    } catch (error) {
      setToastMessage('Failed to apply recommended feed');
    }
  }

  async function undoLastHarvest() {
    if (!lastCreatedHarvest || !token || !isOwner) return;
    try {
      const r = await fetch(`${apiBaseUrl}/harvests/${lastCreatedHarvest.id}`, { method: 'DELETE', headers: { Authorization: token ? 'Bearer ' + token : '' } });
      if (r.ok) {
        setToastMessage('Harvest undone');
        setLastCreatedHarvest(null);
        await loadData();
      } else {
        const bodyText = await r.text().catch(() => ''); let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || r.statusText }; }
        setToastMessage(parsed.error || parsed.message || `Server error ${r.status}`);
      }
    } catch (e) {
      setToastMessage('Failed to undo harvest');
    }
  }

  async function handleCreateFinanceRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const quantity = Number(financeForm.quantity);
    const unitPrice = Number(financeForm.unitPrice);
    const amount = Number(financeForm.amount) || (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0);

    if (!financeForm.category.trim()) {
      setToastMessage('Category is required');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setToastMessage('Quantity must be greater than zero');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setToastMessage('Unit price must be valid');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setToastMessage('Amount must be greater than zero');
      return;
    }

    const payload = {
      type: financeForm.type,
      category: financeForm.category.trim(),
      quantity,
      unit: financeForm.unit || 'kg',
      unitPrice,
      amount,
      pondId: financeForm.pondId || undefined,
      recordedAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      queueOfflineSyncEntry('finance_record_create', payload, 'finance_record');
      setFinanceForm({ type: 'EXPENSE', category: '', quantity: '', unit: 'kg', unitPrice: '', amount: '', pondId: '' });
      setShowFinanceForm(false);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setFinanceForm({ type: 'EXPENSE', category: '', quantity: '', unit: 'kg', unitPrice: '', amount: '', pondId: '' });
      setShowFinanceForm(false);
      await loadData();
    } else {
      const bodyText = await response.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
    }
  }

  async function handleCreateInventoryItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;
    const category = inventoryForm.category;
    const generatedName = category === 'FEED'
      ? `Feed ${inventoryForm.feedSize || '4mm'}`
      : titleCase(category.toLowerCase());

    const response = await fetch(`${apiBaseUrl}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        name: generatedName,
        category,
        unit: inventoryForm.unit,
        currentStock: Number(inventoryForm.currentStock) || 0,
        minStock: Number(inventoryForm.minStock) || 0,
      }),
    });
    if (response.ok) {
      setInventoryForm({ category: '', unit: 'kg', currentStock: '', minStock: '', feedSize: '4mm' });
      setShowInventoryForm(false);
      await loadData();
    }
  }

  async function handleInventoryAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner || !inventoryAdjustment.itemId) return;
    const change = Number(inventoryAdjustment.quantity);
    if (!Number.isFinite(change) || change <= 0) {
      alert('Enter a valid positive quantity to adjust stock.');
      return;
    }

    const delta = inventoryAdjustment.type === 'USE' ? -Math.abs(change) : Math.abs(change);
    const response = await fetch(`${apiBaseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        itemId: inventoryAdjustment.itemId,
        change: delta,
        reason: inventoryAdjustment.reason || (delta > 0 ? 'Stock restocked' : 'Stock issued'),
      }),
    });

    if (response.ok) {
      setInventoryAdjustment({ itemId: '', type: 'ADD', quantity: '', reason: 'Restock' });
      await loadData();
    }
  }

  async function handleInventoryRestock(itemId: string, quantityInput: string) {
    if (!token || !isOwner || !itemId) return;
    const quantity = Number(quantityInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setToastMessage('Enter a valid positive quantity');
      return;
    }

    const response = await fetch(`${apiBaseUrl}/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({ itemId, change: quantity, reason: 'Restock' }),
    });

    if (response.ok) {
      setRestockItemId(null);
      setRestockQuantity('');
      setToastMessage('Stock restocked');
      await loadData();
    } else {
      const bodyText = await response.text().catch(() => '');
      let parsed; try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || response.statusText }; }
      setToastMessage(parsed.error || parsed.message || `Server error ${response.status}`);
    }
  }

  async function addTaskComment(taskId: string) {
    if (!token || !taskId) return;
    if (!taskComment || taskComment.trim().length === 0) {
      setToastMessage('Enter a comment');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({ text: taskComment }),
    });

    if (res.ok) {
      setTaskComment('');
      await loadData();
      setToastMessage('Comment added');
    } else {
      setToastMessage('Failed to add comment');
    }
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function handleCreateWorker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;

    const fullName = workerForm.fullName.trim();
    const email = workerForm.email.trim().toLowerCase();
    const password = workerForm.password.trim();

    if (!fullName || !email || !password) {
      setToastMessage('Worker full name, email, and password are required');
      return;
    }

    if (!isStrongPassword(password)) {
      setToastMessage('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
      return;
    }

    const emailTaken = workers.some((worker) => String(worker.email || '').trim().toLowerCase() === email);
    if (emailTaken) {
      setToastMessage('This email is already taken.');
      return;
    }

    const response = await fetch(`${apiBaseUrl}/auth/create-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({ name: fullName, email, password }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setToastMessage(body.error || 'Worker account creation failed');
      return;
    }

    setWorkerForm({ fullName: '', email: '', password: '' });
    setShowWorkerCreateModal(false);
    setWorkerPasswords((current) => ({ ...current, [body.user?.id || email]: password }));
    setToastMessage(`Worker account created for ${email}`);
    await loadData();
    await loadWorkerRoster();
  }

  async function copyWorkerDetail(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToastMessage(`${label} copied`);
    } catch (error) {
      setToastMessage(`Unable to copy ${label.toLowerCase()}`);
    }
  }

  function getWorkerCredentialsText(worker: any) {
    const password = worker.password || workerPasswords[worker.id || worker.email] || 'Assigned password';
    return `${worker.email}\n${password}`;
  }

  async function handleWorkerAccessToggle(workerId: string, shouldBlock: boolean) {
    if (!token || !isOwner || !workerId) return;

    const response = await fetch(`${apiBaseUrl}/auth/workers/${workerId}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({ blocked: shouldBlock }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setToastMessage(body.error || 'Unable to update worker access');
      return;
    }

    setWorkerAccessModal(null);
    setToastMessage(shouldBlock ? 'Worker blocked — access revoked' : 'Worker unblocked — access restored');
    await loadWorkerRoster();
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner || !taskForm.assigneeId) return;
    if (!navigator.onLine) {
      queueOfflineSyncEntry('task_create', {
        title: taskForm.title,
        description: taskForm.description,
        assigneeId: taskForm.assigneeId,
        priority: taskForm.priority,
        dueAt: taskForm.dueAt,
      }, 'task');
      return;
    }
    const response = await fetch(`${apiBaseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        title: taskForm.title,
        description: taskForm.description,
        assigneeIds: [taskForm.assigneeId],
        priority: taskForm.priority,
        dueAt: taskForm.dueAt || undefined,
      }),
    });
    if (response.ok) {
      setTaskForm({ title: '', description: '', assigneeId: '', priority: 'HIGH', dueAt: '' });
      await loadData();
    }
  }

  async function handleWorkerPondLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedPondId) return;

    const feedGrams = Number(pondLogForm.feedGrams) || Number(pondLogForm.feedKg) || 0;
    const feedKgValue = feedGrams > 0 ? Number((feedGrams / 1000).toFixed(3)) : Number(pondLogForm.feedKg) || 0;

    if (!navigator.onLine) {
      const payload = {
        pondId: selectedPondId,
        feedKg: feedKgValue,
        feedGrams,
        feedSize: pondLogForm.feedSize || '4mm',
        appetite: pondLogForm.appetite,
        behavior: pondLogForm.behavior,
        ph: pondLogForm.ph,
        dissolvedO2: pondLogForm.dissolvedO2,
        ammonia: pondLogForm.ammonia,
        waterAddedPercent: pondLogForm.waterAddedPercent,
        waterRemovedPercent: pondLogForm.waterRemovedPercent,
        waterComment: pondLogForm.waterComment,
        mortality: pondLogForm.mortality,
        mortalityCause: pondLogForm.mortalityCause,
        avgWeightGrams: pondLogForm.avgWeightGrams,
        growthComment: pondLogForm.growthComment,
        harvestQuantity: pondLogForm.harvestQuantity,
        harvestAvgWeight: pondLogForm.harvestAvgWeight,
        harvestBiomassKg: pondLogForm.harvestBiomassKg,
        harvestMethod: pondLogForm.harvestMethod,
        harvestDestination: pondLogForm.harvestDestination,
      };
      queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      resetPondLogForm();
      return;
    }

    const headers = { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' };
    const calls: Promise<Response>[] = [];

    if (Number(pondLogForm.feedKg) > 0) {
      calls.push(fetch(`${apiBaseUrl}/feedings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          quantityKg: Number(pondLogForm.feedKg),
          inventoryItemId: pondLogForm.inventoryItemId || undefined,
          feedType: data.inventoryItems.find((item) => item.id === pondLogForm.inventoryItemId)?.name || 'Pellet',
          feedSize: pondLogForm.feedSize || '4mm',
          appetite: Number(pondLogForm.appetite),
          observation: pondLogForm.behavior,
        }),
      }));
    }

    calls.push(fetch(`${apiBaseUrl}/water-quality`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pondId: selectedPondId,
        ph: Number(pondLogForm.ph) || undefined,
        dissolvedO2: Number(pondLogForm.dissolvedO2) || undefined,
        ammonia: Number(pondLogForm.ammonia) || undefined,
        waterAddedPercent: Number(pondLogForm.waterAddedPercent) || 0,
        waterRemovedPercent: Number(pondLogForm.waterRemovedPercent) || 0,
        comment: pondLogForm.waterComment || 'Worker pond update',
      }),
    }));

    if (Number(pondLogForm.mortality) > 0) {
      calls.push(fetch(`${apiBaseUrl}/mortality`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          numberDead: Number(pondLogForm.mortality),
          possibleCause: pondLogForm.mortalityCause || 'Unspecified',
        }),
      }));
    }

    const results = await Promise.all(calls);
    if (results.every((result) => result.ok)) {
      resetPondLogForm();
      await loadData();
      await openPond(selectedPondId);
    }
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-lockup">
            <span className="brand-mark">AS</span>
            <div>
              <p className="eyebrow">Smart Aquaculture. Smarter Decisions.</p>
              <h1>AquaCulture</h1>
            </div>
          </div>

          {showRegisterForm ? (
            <>
              <div className="auth-register-banner">
                <span>Admin code required for registration</span>
              </div>
              <form className="auth-form" onSubmit={handleOwnerRegister}>
                <h2>Create admin account</h2>
                  <label>Full name<input value={registerName} type="text" onChange={(event) => setRegisterName(event.target.value)} required /></label>
                  <label>Email<input value={registerEmail} type="email" onChange={(event) => setRegisterEmail(event.target.value)} required /></label>
                  <label>Password<input value={registerPassword} type="password" onChange={(event) => setRegisterPassword(event.target.value)} required /></label>
                  <label>Confirm password<input value={registerConfirmPassword} type="password" onChange={(event) => setRegisterConfirmPassword(event.target.value)} required /></label>
                  <label>Admin code<input value={registerCode} type="text" onChange={(event) => setRegisterCode(event.target.value.toUpperCase())} placeholder="ADMIN2024" required /></label>
                  {error ? <p className="form-error">{error}</p> : null}
                  <button className="primary-btn" type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Register admin'}</button>
                  <p className="auth-footer-link">
                    <button type="button" className="text-link" onClick={() => { setShowRegisterForm(false); setError(''); }}>Back to login</button>
                  </p>
                </form>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleLogin}>
                <label>Email<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Password<input value={password} type="password" onChange={(event) => setPassword(event.target.value)} /></label>
                {error ? <p className="form-error">{error}</p> : null}
                <button className="primary-btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
                <p className="auth-footer-link">
                  <button type="button" className="text-link" onClick={() => { setShowRegisterForm(true); setError(''); }}>Register as admin</button>
                </p>
            </form>
          )}
        </section>
      </main>
    );
  }

  // Calendar helper component for owner harvests
  function HarvestCalendar() {
    const [viewDate, setViewDate] = useState(() => new Date());
    const [openDay, setOpenDay] = useState<string | null>(null); // yyyy-mm-dd
    const [scheduleModal, setScheduleModal] = useState<{ open: boolean; pondId?: string; datetime?: string } | null>(null);

    const harvests = data.harvests || [];
    // build events from scheduled targetHarvestDate on ponds and actual harvest logs
    const eventsByDate: Record<string, any[]> = {};
    (data.ponds || []).forEach((p: any) => {
      if (p.targetHarvestDate) {
        const d = new Date(p.targetHarvestDate);
        const key = d.toISOString().slice(0,10);
        eventsByDate[key] = eventsByDate[key] || [];
        eventsByDate[key].push({ type: 'scheduled', pond: p, datetime: p.targetHarvestDate });
      }
    });
    harvests.forEach((h: any) => {
      if (!h.recordedAt) return;
      const d = new Date(h.recordedAt);
      const key = d.toISOString().slice(0,10);
      eventsByDate[key] = eventsByDate[key] || [];
      eventsByDate[key].push({ type: 'harvest', harvest: h, datetime: h.recordedAt });
    });

    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0);
    const startDay = startOfMonth.getDay(); // 0-6
    const daysInMonth = endOfMonth.getDate();

    const cells: Array<{date: Date|null}> = [];
    // leading blanks
    for (let i=0;i<startDay;i++) cells.push({date: null});
    for (let d=1; d<=daysInMonth; d++) cells.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), d) });

    function openDayModal(dateKey: string) {
      setOpenDay(dateKey);
      setScheduleModal(null);
    }

    function prevMonth() { setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1)); }
    function nextMonth() { setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1)); }

    return (
      <Panel eyebrow="Harvests" title="Harvest calendar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button className="secondary-btn" type="button" onClick={prevMonth}>&lt;</button>
            <strong style={{ marginLeft: 8, marginRight: 8 }}>{viewDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button className="secondary-btn" type="button" onClick={nextMonth}>&gt;</button>
          </div>
          <div>
            <button className="primary-btn" type="button" onClick={() => { setViewDate(new Date()); }}>Today</button>
          </div>
        </div>

        <div className="calendar-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((h) => <div key={h} className="calendar-head">{h}</div>)}
          {cells.map((cell, idx) => {
            const key = cell.date ? cell.date.toISOString().slice(0,10) : `blank-${idx}`;
            const evs = cell.date ? (eventsByDate[key] || []) : [];
            return (
              <div key={key} className={`calendar-day ${cell.date && key===new Date().toISOString().slice(0,10) ? 'today' : ''}`} onClick={() => cell.date && openDayModal(key)}>
                <div className="calendar-day-num">{cell.date ? cell.date.getDate() : ''}</div>
                <div className="calendar-events">
                  {evs.slice(0,3).map((e:any,i:number) => (
                    <div key={i} className={`calendar-event ${e.type==='scheduled' ? 'scheduled' : 'harvest'}` }>
                      {e.type==='scheduled' ? `Sched: Pond ${e.pond.number}` : `Harvest: ${e.harvest.numberHarvested} (${new Date(e.datetime).toLocaleTimeString()})`}
                    </div>
                  ))}
                  {evs.length>3 ? <div className="more-count">+{evs.length-3} more</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        {openDay ? (
          <div className="modal-backdrop">
            <div className="modal modal-md">
              <h3>Events on {openDay}</h3>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {(eventsByDate[openDay] || []).map((e:any, i:number) => (
                  <div key={i} className="record-row">
                    <div>
                      <strong>{e.type==='scheduled' ? `Scheduled: Pond ${e.pond.number}` : `Harvest: Pond ${e.harvest.pond.number}`}</strong>
                      <span>{e.datetime ? new Date(e.datetime).toLocaleString() : ''}</span>
                    </div>
                    <div className="pond-stats">
                      {e.type==='scheduled' ? (
                        <button type="button" className="secondary-btn" onClick={() => setScheduleModal({ open: true, pondId: e.pond.id, datetime: (new Date(e.pond.targetHarvestDate || openDay)).toISOString().slice(0,16) })}>Edit</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <h4>Schedule a harvest</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  <select id="schedule-pond-select">
                    <option value="">Select pond</option>
                    {(data.ponds || []).map((p:any) => <option key={p.id} value={p.id}>Pond {p.number} ({p.site?.name || ''})</option>)}
                  </select>
                  <input id="schedule-datetime" type="datetime-local" />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="secondary-btn" type="button" onClick={() => setOpenDay(null)}>Close</button>
                    <button className="primary-btn" type="button" onClick={async () => {
                      const sel = (document.getElementById('schedule-pond-select') as HTMLSelectElement).value;
                      const dt = (document.getElementById('schedule-datetime') as HTMLInputElement).value;
                      if (!sel || !dt) { setToastMessage('Choose pond and datetime'); return; }
                      if (!token) { setToastMessage('Not authorized'); return; }
                      const body:any = { targetHarvestDate: new Date(dt).toISOString() };
                      const r = await fetch(`${apiBaseUrl}/ponds/${sel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' }, body: JSON.stringify(body) });
                      if (r.ok) { setToastMessage('Scheduled'); await loadData(); setOpenDay(null); } else { const body = await r.text().catch(() => ''); let parsed; try { parsed = JSON.parse(body || '{}'); } catch { parsed = { error: body || r.statusText }; } setToastMessage(parsed.error || parsed.message || `Server error ${r.status}`); }
                    }}>Schedule</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      </Panel>
    );
  }

  const overlayVisible = notificationsOpen || syncQueueOpen;

  return (
    <>
      {overlayVisible ? (
        <div className="global-veil visible" onClick={() => { setNotificationsOpen(false); setSyncQueueOpen(false); }} />
      ) : (
        <div className="global-veil" />
      )}
      <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'} ${overlayVisible ? 'overlay-open' : ''}`}>
      {harvestModal.open ? (
        <div className="modal-backdrop">
          <div className="modal modal-md">
            <h3>Confirm Harvest</h3>
            <p>Confirm harvest of <strong>{harvestModal.details?.harvestQty}</strong> fish {harvestModal.details?.biomassKg ? ` (estimated ${harvestModal.details?.biomassKg} kg)` : ''}</p>
            <p>Current live: <strong>{harvestModal.details?.currentLive}</strong> → after: <strong>{(harvestModal.details?.currentLive || 0) - (harvestModal.details?.harvestQty || 0)}</strong></p>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => resolveHarvestModal(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={() => resolveHarvestModal(true)}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirm.open ? (
        <div className="modal-backdrop">
          <div className="modal modal-sm">
            <h3>Confirm delete</h3>
            <p>Are you sure you want to delete <strong>{deleteConfirm.label}</strong>?</p>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={cancelDeleteConfirmation}>No</button>
              <button type="button" className="primary-btn danger-btn" onClick={() => {
                if (!deleteConfirm.type || !deleteConfirm.id) return;
                if (deleteConfirm.type === 'pond') {
                  void deletePond(deleteConfirm.id);
                } else if (deleteConfirm.type === 'finance') {
                  void deleteFinanceRecord(deleteConfirm.id);
                              } else if (deleteConfirm.type === 'inventory') {
                                void deleteInventoryItem(deleteConfirm.id);
                              }
              }}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}

      {taskModalOpen && modalTask ? (
        <div className="modal-backdrop">
          <div className="modal modal-md">
            <h3>Task</h3>
            <p><strong>{modalTask.title}</strong></p>
            <p>{modalTask.description}</p>
            <div className="record-row"><strong>Assigned to</strong><span>{modalTask.assignees?.map((a: any) => a.user?.name).join(', ') || 'Unassigned'}</span></div>
            <div className="record-row"><strong>Priority</strong><span>{titleCase(modalTask.priority || 'MEDIUM')}</span></div>
            <div className="record-row"><strong>Status</strong><span>{titleCase(modalTask.status || 'OPEN')}</span></div>

                  <div style={{ marginTop: 8 }}>
                    <textarea placeholder="Add comment (optional)" value={taskComment} onChange={(e) => setTaskComment(e.target.value)} />
                    <div style={{ marginTop: 6 }}>
                      <button type="button" className="secondary-btn" onClick={() => void addTaskComment(modalTask.id)}>Add comment</button>
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="secondary-btn" onClick={() => { setTaskModalOpen(false); setModalTask(null); }}>Close</button>
                    {modalTask.status !== 'COMPLETED' ? (
                      <button type="button" className="primary-btn" onClick={async () => {
                        if (!token || !modalTask?.id) return;
                        const res = await fetch(`${apiBaseUrl}/tasks/${modalTask.id}/status`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
                          body: JSON.stringify({ status: 'COMPLETED' }),
                        });
                        if (res.ok) {
                          setTaskModalOpen(false);
                          setModalTask(null);
                          await loadData();
                          setToastMessage('Task marked done');
                          setTimeout(() => setToastMessage(null), 3000);
                        } else {
                          alert('Failed to mark task complete');
                        }
                      }}>Mark done</button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
      {workerAccessModal?.open && workerAccessModal.worker ? (
        <div className="modal-backdrop">
          <div className="modal modal-sm">
            <h3>{workerAccessModal.action === 'block' ? 'Block worker access' : 'Unblock worker access'}</h3>
            <p>
              {workerAccessModal.action === 'block'
                ? `Block ${workerAccessModal.worker.name || workerAccessModal.worker.email}? They will lose access until you unblock them.`
                : `Restore access for ${workerAccessModal.worker.name || workerAccessModal.worker.email}?`}
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setWorkerAccessModal(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={() => void handleWorkerAccessToggle(workerAccessModal.worker.id, workerAccessModal.action === 'block')}>
                {workerAccessModal.action === 'block' ? 'Block access' : 'Unblock'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="mobile-menu-btn"
        aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
        onClick={() => setSidebarOpen((value) => !value)}
      >
        ☰
      </button>

      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand-lockup">
        <span className="brand-mark">AS</span>
        <div>
          <p className="eyebrow">{isOwner ? 'Admin control' : 'Field work'}</p>
          <h2>AquaCulture</h2>
        </div>
      </div>
      <nav className="nav-list" aria-label="Primary">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeNav === id ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav(id); if (window.innerWidth <= 1120) setSidebarOpen(false); }}>
            <Icon size={18} />{label}
          </button>
        ))}
      </nav>

      <div className="sync-card">
          <CheckCircle2 size={19} />
          <div>
            <strong>{isOwner ? 'Admin permissions' : 'Worker permissions'}</strong>
            <span>{isOwner ? 'Can create ponds, finance records, and tasks' : 'Assigned ponds only. No pond creation.'}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn topbar-menu-btn"
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              ☰
            </button>
            <div>
              <p className="eyebrow">Good evening {currentUser?.name || 'Team Member'}</p>
              <h1>{navItems.find((item) => item.id === activeNav)?.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="sync-status-wrap">
              <button
                type="button"
                className={isOnline ? 'sync-status online' : 'sync-status offline'}
                onClick={() => setSyncQueueOpen((value) => !value)}
                aria-label="Pending sync actions"
              >
                <span className="sync-dot" />
                {isOnline ? 'Online' : 'Offline'} · {pendingSyncCount} pending
              </button>
              {syncQueueOpen ? (
                <div className="sync-panel">
                  <div className="notification-panel-header">
                    <strong>Sync queue</strong>
                    <button type="button" className="secondary-btn" onClick={() => setSyncQueueOpen(false)}>Close</button>
                  </div>
                  <div className="sync-panel-body">
                    {(() => {
                      const entries = readQueuedSyncEntries();
                      if (!entries.length) {
                        return <p className="empty-copy">No pending actions right now.</p>;
                      }
                      return entries.slice(0, 8).map((item: Record<string, any>) => (
                        <div key={item.id} className="sync-item">
                          <strong>{item.action}</strong>
                          <span>{item.tableName}</span>
                          <small>{new Date(item.createdAt).toLocaleString()}</small>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="modal-actions compact-actions">
                    <button type="button" className="secondary-btn" onClick={() => setSyncQueueOpen(false)}>Close</button>
                    <button type="button" className="primary-btn" onClick={async () => { setSyncQueueOpen(false); if (navigator.onLine) { await flushOfflineSyncQueue(); } else { setToastMessage('You are offline. Actions will sync automatically when online again.'); } }}>
                      {isOnline ? 'Sync now' : 'Queue waiting'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="notifications-wrap">
              <button
                type="button"
                className="icon-btn"
                aria-label="Notifications"
                onClick={async () => {
                  const opening = !notificationsOpen;
                  setNotificationsOpen(opening);
                  if (opening) {
                    await loadData();
                  } else {
                    await markAllNotificationsRead();
                  }
                }}
              >
                <Bell size={18} />
                <span>{data.notifications.filter((item) => !item.read).length}</span>
              </button>
              {notificationsOpen ? (
                <div className="notification-panel">
                  <div className="notification-panel-header">
                    <strong>Notifications</strong>
                    <button type="button" className="secondary-btn" onClick={async () => { setNotificationsOpen(false); await markAllNotificationsRead(); }}>Close</button>
                  </div>
                  {data.notifications.length === 0 ? (
                    <p className="empty-copy">No notifications yet.</p>
                  ) : (
                    <div className="notification-list">
                      {data.notifications.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={item.read ? 'notification-item read' : 'notification-item unread'}
                          onClick={async () => {
                            await markNotificationRead(item.id);
                            if (item.meta?.pondId) {
                              setActiveNav('ponds');
                              await openPond(item.meta.pondId);
                            }
                          }}
                        >
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.body || 'No details'}</span>
                          </div>
                          <small>{new Date(item.createdAt).toLocaleString()}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <button className="secondary-btn" onClick={() => {
              localStorage.removeItem('aquaculture-token');
              localStorage.removeItem('aquaculture-user');
              localStorage.removeItem('aquaculture-sync-queue');
              setToken(null);
              setCurrentUser(null);
              setEmail('');
              setPassword('');
              setError('');
              setShowRegisterForm(false);
            }}>Log out</button>
          </div>
        </header>

        {activeNav === 'command' ? (
          <>
            <section className="metrics-grid">
              <Metric label="Farm health" value={`${overview.healthScore}%`} detail="Based on mortality and water risk" icon={Activity} tone="blue" />
              <Metric label="Feed logged" value={`${overview.totalFeed || 0} kg`} detail={overview.latestFeedSize !== 'Not recorded' ? `Size used: ${overview.latestFeedSize}` : 'No feed size logged yet'} icon={Sprout} tone="green" />
              <Metric label="Mortality" value={`${overview.totalMortality || 0} fish`} detail="Stored mortality records" icon={AlertTriangle} tone="orange" />
              {isOwner ? (
                <Metric label="Net position" value={formatDalasi(overview.finance.profit)} detail={overview.finance.status === 'PROFIT' ? 'Running profit' : 'Running loss'} icon={overview.finance.status === 'PROFIT' ? TrendingUp : TrendingDown} tone={overview.finance.status === 'PROFIT' ? 'green' : 'orange'} />
              ) : (
                <Metric label="My ponds" value={String(data.ponds.length)} detail="Assigned to you" icon={Fish} tone="navy" />
              )}
            </section>

            <section className="dashboard-grid">
              <Panel eyebrow={isOwner ? 'Admin oversight' : 'Today'} title={isOwner ? 'Pond activity status' : "Today's checklist"}>
                <RecordList records={isOwner ? data.ponds.slice(0, 6) : data.tasks.slice(0, 6)} emptyTitle={isOwner ? 'No ponds yet' : 'No tasks assigned'} render={(record) => isOwner ? (
                  <><strong>Pond {record.number}</strong><span>{record.assignedUser?.name || 'Unassigned'} | {titleCase(record.status || 'ACTIVE')}</span></>
                ) : (
                  <button type="button" className="record-row task-row" onClick={async () => {
                    setSelectedTaskId(record.id);
                    setTaskModalOpen(true);
                    try {
                      const res = await fetch(`${apiBaseUrl}/tasks/${record.id}`, { headers: { Authorization: token ? 'Bearer ' + token : '' } });
                      if (res.ok) {
                        const body = await res.json();
                        setModalTask(body.task || null);
                      } else {
                        setModalTask(record);
                      }
                    } catch (err) {
                      console.error('Failed to load task', err);
                      setModalTask(record);
                    }
                  }}>
                    <div><strong>{record.title}</strong><span>{titleCase(record.status || 'OPEN')}</span></div>
                  </button>
                )} />
              </Panel>
              <Panel eyebrow="Notifications" title="Recent updates">
                <RecordList records={data.notifications.slice(0, 5)} emptyTitle="No notifications yet" render={(item) => <><strong>{item.title}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></>} />
              </Panel>
            </section>
          </>
        ) : null}

        {activeNav === 'ponds' ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow={isOwner ? 'Admin pond management' : 'Assigned ponds'} title="Pond registry">
              {isOwner ? (
                <>
                  <div className="worker-toolbar" style={{ marginBottom: 16 }}>
                    <button type="button" className="primary-btn" onClick={() => setShowPondCreateModal(true)}>
                      <Plus size={16} />Add pond
                    </button>
                  </div>

                  {showPondCreateModal ? (
                    <div className="modal-backdrop" onClick={() => setShowPondCreateModal(false)}>
                      <div className="modal worker-modal pond-form-compact" onClick={(event) => event.stopPropagation()}>
                        <h3>New pond profile</h3>
                        <form className="worker-create-form" onSubmit={handleCreatePond}>
                          <label className="worker-field full-width">
                            <span>Site name</span>
                            <input value={newPond.siteName} onChange={(event) => setNewPond({ ...newPond, siteName: event.target.value })} placeholder="North Lagoon" required />
                          </label>

                          <label className="worker-field">
                            <span>Pond number</span>
                            <input value={newPond.number} onChange={(event) => setNewPond({ ...newPond, number: event.target.value })} placeholder="1" required />
                          </label>

                          <label className="worker-field">
                            <span>Species</span>
                            <select value={newPond.species} onChange={(event) => setNewPond({ ...newPond, species: event.target.value })} required>
                              <option value="TILAPIA">Tilapia</option>
                              <option value="CATFISH">Catfish</option>
                              <option value="TROUT">Trout</option>
                              <option value="SHRIMP">Shrimp</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </label>

                          <label className="worker-field">
                            <span>Water volume (litres)</span>
                            <input type="number" min="1" step="1" value={newPond.capacity} onChange={(event) => setNewPond({ ...newPond, capacity: event.target.value })} placeholder="5000" required />
                          </label>

                          <label className="worker-field">
                            <span>Initial stock fish</span>
                            <input type="number" min="1" step="1" value={newPond.initialPopulation} onChange={(event) => setNewPond({ ...newPond, initialPopulation: event.target.value })} placeholder="400" required />
                          </label>

                          <label className="worker-field">
                            <span>Stocked on</span>
                            <input type="date" value={newPond.stockedAt} onChange={(event) => setNewPond({ ...newPond, stockedAt: event.target.value })} required />
                          </label>

                          <label className="worker-field">
                            <span>Initial avg weight (g)</span>
                            <input type="number" min="0" step="0.01" value={newPond.initialAvgWeightG} onChange={(event) => setNewPond({ ...newPond, initialAvgWeightG: event.target.value })} placeholder="0.01" required />
                          </label>

                          <div className="inline-fields">
                            <label className="worker-field">
                              <span>Assign worker</span>
                              <select value={newPond.assignedUserId} onChange={(event) => setNewPond({ ...newPond, assignedUserId: event.target.value })}>
                                <option value="all">All workers</option>
                                {workers.filter((worker) => worker.role?.name === 'WORKER' || worker.role === 'WORKER').map((worker) => (
                                  <option key={worker.id} value={worker.id}>{worker.name || worker.email}</option>
                                ))}
                              </select>
                            </label>

                            <label className="worker-field">
                              <span>Target harvest weight</span>
                              <div className="unit-field compact-unit-field">
                                <input type="number" min="1" step="1" value={newPond.targetHarvestKg} onChange={(event) => setNewPond({ ...newPond, targetHarvestKg: event.target.value })} placeholder="200" required />
                                <select value={newPond.targetHarvestUnit} onChange={(event) => setNewPond({ ...newPond, targetHarvestUnit: event.target.value as 'g' | 'kg' })}>
                                  <option value="g">g</option>
                                  <option value="kg">kg</option>
                                </select>
                              </div>
                            </label>
                          </div>

                          <div className="worker-form-footer full-width">
                            <small className="helper-text helper-note">Create a pond and it will appear in the registry immediately.</small>
                            <div className="modal-actions compact-actions">
                              <button type="button" className="secondary-btn" onClick={() => setShowPondCreateModal(false)}>Cancel</button>
                              <button className="primary-btn" type="submit">Create pond</button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="pond-grid">
                {data.ponds.map((pond) => (
                  <button className={`pond-card pond-button ${!isOwner ? 'compact' : ''}`} key={pond.id} onClick={() => openPond(pond.id)}>
                    <div><strong>Pond {pond.number}</strong><span>{pond.site?.name || 'Main site'} | {pond.assignedUser?.name || 'Unassigned'}</span></div>
                    <div className="pond-stats">
                      <span>{titleCase(pond.species || 'Fish')}</span>
                      <span>{pond.current_population || 0} fish</span>
                      <span>Open</span>
                      {isOwner ? (
                        <span
                          className="delete-chip"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            showDeleteConfirmation('pond', pond.id, `Pond ${pond.number}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.stopPropagation();
                              showDeleteConfirmation('pond', pond.id, `Pond ${pond.number}`);
                            }
                          }}
                        >
                          Delete
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
            {isOwner ? (
              <Panel eyebrow="Admin tools" title="Quick actions">
                <div className="admin-action-grid">
                  <button type="button" className="admin-action-card" onClick={() => { setAdminActionModal({ type: 'targetHarvest' }); setTargetHarvestAction((current) => ({ ...current, pondId: current.pondId || selectedPondId || data.ponds[0]?.id || '' })); }}>
                    <span>Set target harvest</span>
                  </button>
                  <button type="button" className="admin-action-card" onClick={() => { setAdminActionModal({ type: 'recommendFeed' }); setRecommendFeedAction((current) => ({ ...current, pondId: current.pondId || selectedPondId || data.ponds[0]?.id || '' })); }}>
                    <span>Recommend feed</span>
                  </button>
                  <button type="button" className="admin-action-card" onClick={() => { setAdminActionModal({ type: 'mortality' }); setMortalityAction((current) => ({ ...current, pondId: current.pondId || selectedPondId || data.ponds[0]?.id || '' })); }}>
                    <span>Record mortality</span>
                  </button>
                </div>
              </Panel>
            ) : null}
            {adminActionModal ? (
              <div className="modal-backdrop" onClick={() => setAdminActionModal(null)}>
                <div className="modal worker-modal admin-action-modal" onClick={(event) => event.stopPropagation()}>
                  <h3>{adminActionModal.type === 'targetHarvest' ? 'Set target harvest' : adminActionModal.type === 'recommendFeed' ? 'Recommend feed' : 'Record mortality'}</h3>
                  {adminActionModal.type === 'targetHarvest' ? (
                    <form className="worker-create-form" onSubmit={handleTargetHarvestActionSubmit}>
                      <label className="worker-field full-width">
                        <span>Available pond</span>
                        <select value={targetHarvestAction.pondId} onChange={(event) => setTargetHarvestAction({ ...targetHarvestAction, pondId: event.target.value })} required>
                          <option value="">Select a pond</option>
                          {data.ponds.map((pond) => (
                            <option key={pond.id} value={pond.id}>Pond {pond.number} · {pond.site?.name || 'Main site'}</option>
                          ))}
                        </select>
                      </label>
                      <div className="inline-fields">
                        <label className="worker-field">
                          <span>Harvest date</span>
                          <input type="date" value={targetHarvestAction.date} onChange={(event) => setTargetHarvestAction({ ...targetHarvestAction, date: event.target.value })} required />
                        </label>
                        <label className="worker-field">
                          <span>Time</span>
                          <input type="time" value={targetHarvestAction.time} onChange={(event) => setTargetHarvestAction({ ...targetHarvestAction, time: event.target.value })} required />
                        </label>
                      </div>
                      <div className="modal-actions compact-actions">
                        <button type="button" className="secondary-btn" onClick={() => setAdminActionModal(null)}>Cancel</button>
                        <button type="submit" className="primary-btn">Set date</button>
                      </div>
                    </form>
                  ) : null}

                  {adminActionModal.type === 'recommendFeed' ? (
                    <form className="worker-create-form" onSubmit={handleRecommendFeedActionSubmit}>
                      <label className="worker-field full-width">
                        <span>Available pond</span>
                        <select value={recommendFeedAction.pondId} onChange={(event) => setRecommendFeedAction({ ...recommendFeedAction, pondId: event.target.value })} required>
                          <option value="">Select a pond</option>
                          {data.ponds.map((pond) => (
                            <option key={pond.id} value={pond.id}>Pond {pond.number} · {pond.site?.name || 'Main site'}</option>
                          ))}
                        </select>
                      </label>
                      <label className="worker-field full-width">
                        <span>Feed size</span>
                        <select value={recommendFeedAction.feedSize} onChange={(event) => setRecommendFeedAction({ ...recommendFeedAction, feedSize: event.target.value })}>
                          <option value="1mm">1mm</option>
                          <option value="1.5mm">1.5mm</option>
                          <option value="2mm">2mm</option>
                          <option value="2.5mm">2.5mm</option>
                          <option value="3mm">3mm</option>
                          <option value="3.5mm">3.5mm</option>
                          <option value="4mm">4mm</option>
                          <option value="4.5mm">4.5mm</option>
                        </select>
                      </label>
                      <label className="worker-field full-width">
                        <span>Feed stock item</span>
                        <select value={recommendFeedAction.inventoryItemId} onChange={(event) => setRecommendFeedAction({ ...recommendFeedAction, inventoryItemId: event.target.value })}>
                          <option value="">Use default feed</option>
                          {data.inventoryItems.filter((item) => item.category === 'FEED' || item.category?.toUpperCase() === 'FEED').map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </label>
                      <div className="modal-actions compact-actions">
                        <button type="button" className="secondary-btn" onClick={() => setAdminActionModal(null)}>Cancel</button>
                        <button type="submit" className="primary-btn">Recommend</button>
                      </div>
                    </form>
                  ) : null}

                  {adminActionModal.type === 'mortality' ? (
                    <form className="worker-create-form" onSubmit={handleMortalityActionSubmit}>
                      <label className="worker-field full-width">
                        <span>Available pond</span>
                        <select value={mortalityAction.pondId} onChange={(event) => setMortalityAction({ ...mortalityAction, pondId: event.target.value })} required>
                          <option value="">Select a pond</option>
                          {data.ponds.map((pond) => (
                            <option key={pond.id} value={pond.id}>Pond {pond.number} · {pond.site?.name || 'Main site'}</option>
                          ))}
                        </select>
                      </label>
                      <div className="inline-fields">
                        <label className="worker-field">
                          <span>Mortality count</span>
                          <input type="number" min="1" step="1" value={mortalityAction.count} onChange={(event) => setMortalityAction({ ...mortalityAction, count: event.target.value })} required />
                        </label>
                        <label className="worker-field">
                          <span>Observed at</span>
                          <input type="datetime-local" value={mortalityAction.observedAt ? new Date(mortalityAction.observedAt).toISOString().slice(0, 16) : ''} onChange={(event) => setMortalityAction({ ...mortalityAction, observedAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} />
                        </label>
                      </div>
                      <label className="worker-field full-width">
                        <span>Mortality cause</span>
                        <input value={mortalityAction.cause} onChange={(event) => setMortalityAction({ ...mortalityAction, cause: event.target.value })} placeholder="Low oxygen / disease / stress" />
                      </label>
                      <div className="modal-actions compact-actions">
                        <button type="button" className="secondary-btn" onClick={() => setAdminActionModal(null)}>Cancel</button>
                        <button type="submit" className="primary-btn">Save record</button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : null}
            {selectedPond && selectedPondSummary ? (
              <div className="pond-modal-backdrop" onClick={() => { setSelectedPondId(null); setSelectedPond(null); setSelectedPondSummary(null); }}>
                <div className="pond-modal-card" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="pond-modal-close" aria-label="Close pond details" onClick={() => { setSelectedPondId(null); setSelectedPond(null); setSelectedPondSummary(null); }}>×</button>
                  <PondSummaryPanel
                    pond={selectedPond}
                    summary={selectedPondSummary}
                    isOwner={isOwner}
                    form={pondLogForm}
                    inventoryItems={data.inventoryItems}
                    onFormChange={setPondLogForm}
                    onSubmit={handleWorkerPondLogEnhanced}
                    onRecordHarvest={(harvest: any) => { setLastCreatedHarvest({ id: harvest.id, pondId: harvest.pondId, numberHarvested: harvest.numberHarvested }); setToastMessage(`${harvest.numberHarvested} fish recorded — Undo`); }}
                    onApplyRecommendedFeed={handleApplyRecommendedFeed}
                    onUpdateHarvest={handleUpdateHarvest}
                    token={token}
                    apiBaseUrl={apiBaseUrl}
                    loadData={loadData}
                    setToastMessage={setToastMessage}
                  />
                </div>
              </div>
            ) : null}

            {isOwner && selectedPond ? (
              <Panel eyebrow="Harvest" title="Record harvest">
                {showHarvestForm ? (
                  <form className="owner-form" onSubmit={handleRecordHarvestSubmit}>
                    <input placeholder="Quantity (fish)" value={harvestForm.numberHarvested} onChange={(e) => setHarvestForm({ ...harvestForm, numberHarvested: e.target.value })} required />
                    <input placeholder="Avg weight (g)" value={harvestForm.avgWeightGrams} onChange={(e) => setHarvestForm({ ...harvestForm, avgWeightGrams: e.target.value })} />
                    <input placeholder="Biomass (kg)" value={harvestForm.biomassKg} onChange={(e) => setHarvestForm({ ...harvestForm, biomassKg: e.target.value })} />
                    <input placeholder="Method" value={harvestForm.method} onChange={(e) => setHarvestForm({ ...harvestForm, method: e.target.value })} />
                    <input placeholder="Destination" value={harvestForm.destination} onChange={(e) => setHarvestForm({ ...harvestForm, destination: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="primary-btn" type="submit">Record harvest</button>
                      <button type="button" className="secondary-btn" onClick={() => setShowHarvestForm(false)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <button type="button" className="primary-btn" onClick={() => setShowHarvestForm(true)}>Record harvest</button>
                    {lastCreatedHarvest ? <button type="button" className="secondary-btn" style={{ marginLeft: 8 }} onClick={() => undoLastHarvest()}>Undo last</button> : null}
                  </div>
                )}
              </Panel>
            ) : null}

          </section>
        ) : null}

        {activeNav === 'tasks' ? (
          <section className="dashboard-grid wide-left">
            {isOwner ? (
              <Panel eyebrow="Admin task dispatch" title="Create and send worker task">
                <form className="owner-form" onSubmit={handleCreateTask}>
                  <input placeholder="Task title" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required />
                  <textarea placeholder="Task details" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} />
                  <select value={taskForm.assigneeId} onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })} required>
                    <option value="">Assign worker</option>
                    {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name || worker.email}</option>)}
                  </select>
                  <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                  </select>
                  <input type="datetime-local" value={taskForm.dueAt} onChange={(event) => setTaskForm({ ...taskForm, dueAt: event.target.value })} />
                  <button className="primary-btn" type="submit"><Send size={16} />Send task</button>
                </form>
              </Panel>
            ) : (
              <Panel eyebrow="Assigned work" title="My tasks">
                <div className="record-list">
                  {data.tasks.length === 0 ? <p className="empty-copy">No tasks assigned yet.</p> : data.tasks.map((task) => (
                    <button key={task.id} type="button" className={selectedTask?.id === task.id ? 'record-row task-row active' : 'record-row task-row'} onClick={() => setSelectedTaskId(task.id)}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.assignees?.map((a: any) => a.user?.name).join(', ') || 'Unassigned'} | {titleCase(task.status || 'OPEN')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>
            )}

            <Panel eyebrow={isOwner ? 'Worker visibility' : 'Task detail'} title={selectedTask ? selectedTask.title : (isOwner ? 'Sent tasks' : 'No task selected')}>
              {selectedTask ? (
                <div className="analysis-card">
                  <strong>{selectedTask.title}</strong>
                  <p>{selectedTask.description || 'No additional task notes.'}</p>
                  <div className="record-row"><strong>Assigned to</strong><span>{selectedTask.assignees?.map((a: any) => a.user?.name).join(', ') || 'Unassigned'}</span></div>
                  <div className="record-row"><strong>Status</strong><span>{titleCase(selectedTask.status || 'OPEN')}</span></div>
                  <div className="record-row"><strong>Priority</strong><span>{titleCase(selectedTask.priority || 'MEDIUM')}</span></div>
                  <div className="record-row"><strong>Due</strong><span>{selectedTask.dueAt ? new Date(selectedTask.dueAt).toLocaleString() : 'No deadline'}</span></div>
                </div>
              ) : (
                <p className="empty-copy">Select a task to inspect the details.</p>
              )}
            </Panel>
          </section>
        ) : null}

        {activeNav === 'workers' && isOwner ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow="Staff directory" title="Worker access control">
              <div className="worker-toolbar">
                <button type="button" className="primary-btn" onClick={() => setShowWorkerCreateModal(true)}>
                  <Plus size={16} />Add worker
                </button>
                <div className="worker-search-wrap">
                  <input
                    value={workerSearchTerm}
                    onChange={(event) => setWorkerSearchTerm(event.target.value)}
                    placeholder="Search worker name or email"
                    aria-label="Search workers"
                  />
                </div>
                <div className="worker-filter-row">
                  <button
                    type="button"
                    className={workerStatusFilter === 'all' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={workerStatusFilter === 'active' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('active')}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={workerStatusFilter === 'blocked' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('blocked')}
                  >
                    Blocked
                  </button>
                </div>
              </div>

              {showWorkerCreateModal ? (
                <div className="modal-backdrop" onClick={() => setShowWorkerCreateModal(false)}>
                  <div className="modal worker-modal" onClick={(event) => event.stopPropagation()}>
                    <h3>New worker profile</h3>
                    <form className="worker-create-form" onSubmit={handleCreateWorker}>
                      <label className="worker-field">
                        <span>Full name</span>
                        <input
                          value={workerForm.fullName}
                          onChange={(event) => {
                            const next = event.target.value;
                            const suggested = buildWorkerEmailFromName(next);
                            setWorkerForm((current) => ({
                              ...current,
                              fullName: next,
                              email: !current.email || current.email === buildWorkerEmailFromName(current.fullName) ? suggested : current.email,
                            }));
                          }}
                          placeholder="John Smith"
                          required
                        />
                      </label>

                      <label className="worker-field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={workerForm.email}
                          onChange={(event) => setWorkerForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="johnsmith@gmail.com"
                          required
                        />
                      </label>

                      <label className="worker-field">
                        <span>Password</span>
                        <input
                          type="password"
                          value={workerForm.password}
                          onChange={(event) => setWorkerForm((current) => ({ ...current, password: event.target.value }))}
                          placeholder="Create a strong password"
                          required
                        />
                      </label>

                      <div className="worker-form-footer">
                        <small className="helper-text">Suggested email: {buildWorkerEmailFromName(workerForm.fullName) || 'Enter full name first'}</small>
                        <small className="helper-text strong-note">Password must include 8+ characters, uppercase, lowercase, and numbers.</small>
                        <div className="modal-actions compact-actions">
                          <button type="button" className="secondary-btn" onClick={() => setShowWorkerCreateModal(false)}>Cancel</button>
                          <button className="primary-btn" type="submit">Create worker</button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              <div className="record-list worker-card-list">
                {filteredWorkers.length === 0 ? (
                  <div className="empty-employee-card">
                    <p className="empty-copy">No workers match this search or status.</p>
                  </div>
                ) : (
                  filteredWorkers.map((worker) => {
                    const isExpanded = expandedWorkerId === worker.id;
                    return (
                      <div
                        key={worker.id}
                        className={worker.blocked ? 'worker-card blocked' : 'worker-card'}
                        onClick={() => setExpandedWorkerId((current) => current === worker.id ? null : worker.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setExpandedWorkerId((current) => current === worker.id ? null : worker.id);
                          }
                        }}
                      >
                        <div className="worker-card-top">
                          <div className="worker-avatar">{(worker.name || worker.email || 'W').charAt(0).toUpperCase()}</div>
                          <div className="worker-card-head">
                            <strong>{worker.name || worker.email}</strong>
                          </div>
                          <span className={worker.blocked ? 'status-chip blocked' : 'status-chip active'}>
                            {worker.blocked ? 'Blocked' : 'Active'}
                          </span>
                        </div>

                        {isExpanded ? (
                          <>
                            <div className="worker-meta-grid compact-meta-grid">
                              <div>
                                <small>Email</small>
                                <span>{worker.email}</span>
                              </div>
                              <div>
                                <small>Password</small>
                                <span>{worker.password || workerPasswords[worker.id || worker.email] || 'Assigned password'}</span>
                              </div>
                              <div>
                                <small>Created</small>
                                <span>{worker.createdAt ? new Date(worker.createdAt).toLocaleString() : 'Recent'}</span>
                              </div>
                              <div>
                                <small>Access</small>
                                <span>{worker.blocked ? 'Revoked' : 'Granted'}</span>
                              </div>
                            </div>

                            <div className="worker-card-actions">
                              <button type="button" className="secondary-btn compact-btn" onClick={(event) => {
                                event.stopPropagation();
                                void copyWorkerDetail(getWorkerCredentialsText(worker), 'Credentials');
                              }}>
                                Copy
                              </button>
                              <button
                                type="button"
                                className={worker.blocked ? 'secondary-btn compact-btn' : 'primary-btn compact-btn'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setWorkerAccessModal({ open: true, worker, action: worker.blocked ? 'unblock' : 'block' });
                                }}
                              >
                                {worker.blocked ? 'Unblock' : 'Block'}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
            <Panel eyebrow="Access rules" title="Staff management">
              <div className="analysis-card">
                <p>Blocked workers cannot sign in with their email and password until the admin restores access.</p>
                <ul className="bullet-list">
                  <li>Workers are created with their assigned email and password.</li>
                  <li>Each worker record shows their creation date and current status.</li>
                  <li>Only the admin can block or unblock a worker profile.</li>
                </ul>
              </div>
            </Panel>
          </section>
        ) : null}

        {activeNav === 'finance' && isOwner ? (
          <>
            <section className="metrics-grid">
              <Metric label="Sales" value={formatDalasi(overview.finance.income)} detail="All sales records" icon={Wallet} tone="blue" />
              <Metric label="Running Cost" value={formatDalasi(overview.finance.expenses)} detail={`${overview.finance.budgetUsedPercent}% fixed cost used`} icon={TrendingDown} tone="orange" />
              <Metric label="Fixed Cost" value={formatDalasi(overview.finance.budget)} detail={`${formatDalasi(overview.finance.budgetRemaining)} remaining`} icon={CalendarClock} tone="navy" />
              <Metric label="Net profit/loss" value={formatDalasi(overview.finance.profit)} detail={`${overview.finance.profitMargin}% margin | ${overview.finance.status}`} icon={overview.finance.status === 'PROFIT' ? TrendingUp : TrendingDown} tone={overview.finance.status === 'PROFIT' ? 'green' : 'orange'} />
            </section>

            <section className="finance-section">
              <Panel eyebrow="Finance ledger" title="Finance ledger records" className="finance-worksheet-panel">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button type="button" className="primary-btn" onClick={() => setShowFinanceForm((current) => !current)}><Plus size={16} />{showFinanceForm ? 'Close' : 'Add row'}</button>
                </div>

                {showFinanceForm ? (
                  <form className="finance-form" onSubmit={handleCreateFinanceRecord} style={{ display: 'grid', gridTemplateColumns: '140px 180px 150px 140px 110px 160px 130px 180px 1fr', gap: 12, marginBottom: 18, alignItems: 'center', padding: 12, background: 'rgba(15, 23, 42, 0.03)', border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 12 }}>
                    <select value={financeForm.type} onChange={(event) => setFinanceForm({ ...financeForm, type: event.target.value })}>
                      <option value="EXPENSE">Running Cost</option>
                      <option value="INCOME">Sales</option>
                      <option value="BUDGET">Fixed Cost</option>
                    </select>
                    <input placeholder="Category" value={financeForm.category} onChange={(event) => setFinanceForm({ ...financeForm, category: event.target.value })} required />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min="0" step="0.01" placeholder="Qty" value={financeForm.quantity} onChange={(event) => {
                        const quantity = event.target.value;
                        const unitPrice = Number(financeForm.unitPrice) || 0;
                        const nextAmount = quantity && unitPrice ? (Number(quantity) * unitPrice).toFixed(2) : '';
                        setFinanceForm({ ...financeForm, quantity, amount: nextAmount });
                      }} />
                      <select value={financeForm.unit} onChange={(event) => setFinanceForm({ ...financeForm, unit: event.target.value })}>
                        {financeUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>
                    <input type="number" min="0" step="0.01" placeholder="Unit price" value={financeForm.unitPrice} onChange={(event) => {
                      const unitPrice = event.target.value;
                      const quantity = Number(financeForm.quantity) || 0;
                      const nextAmount = quantity && unitPrice ? (quantity * Number(unitPrice)).toFixed(2) : '';
                      setFinanceForm({ ...financeForm, unitPrice, amount: nextAmount });
                    }} />
                    <input placeholder="Amount" value={financeForm.amount} readOnly />
                    <select value={financeForm.pondId} onChange={(event) => setFinanceForm({ ...financeForm, pondId: event.target.value })}>
                      <option value="">All ponds</option>
                      {data.ponds.map((pond) => <option key={pond.id} value={pond.id}>Pond {pond.number}</option>)}
                    </select>
                    <button className="primary-btn" type="submit"><Plus size={16} />Save</button>
                    <button type="button" className="secondary-btn" onClick={() => { setShowFinanceForm(false); setFinanceForm({ type: 'EXPENSE', category: '', quantity: '', unit: 'kg', unitPrice: '', amount: '', pondId: '' }); }}>Cancel</button>
                  </form>
                ) : null}

                <FinanceTable records={data.financeRecords} onDelete={(id) => showDeleteConfirmation('finance', id, `Finance record ${id}`)} />
              </Panel>
            </section>
          </>
        ) : null}

        {activeNav === 'inventory' && isOwner ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow="Inventory" title="Stock levels">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" className="primary-btn" onClick={() => setShowInventoryForm((current) => !current)}>
                  <Plus size={16} />{showInventoryForm ? 'Close' : 'Add stock item'}
                </button>
              </div>

              {showInventoryForm ? (
                <div className="modal-backdrop" onClick={() => setShowInventoryForm(false)}>
                  <div className="modal modal-md" onClick={(event) => event.stopPropagation()}>
                    <h3>Add stock item</h3>
                    <form className="compact-form inventory-form" onSubmit={handleCreateInventoryItem}>
                      <select value={inventoryForm.category} onChange={(event) => {
                        const nextCategory = event.target.value;
                        setInventoryForm({
                          ...inventoryForm,
                          category: nextCategory,
                          unit: getInventoryUnitForCategory(nextCategory),
                        });
                      }} required>
                        <option value="">Category</option>
                        <option value="FEED">Feed</option>
                        <option value="MEDICINE">Medicine</option>
                        <option value="CHEMICAL">Chemical</option>
                        <option value="EQUIPMENT">Equipment</option>
                        <option value="SUPPLIES">Supplies</option>
                      </select>
                      {inventoryForm.category === 'FEED' ? (
                        <select value={inventoryForm.feedSize} onChange={(event) => setInventoryForm({ ...inventoryForm, feedSize: event.target.value })}>
                          {['1mm','1.5mm','2mm','2.5mm','3mm','3.5mm','4mm','4.5mm','5mm'].map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      ) : null}
                      <input placeholder="Unit" value={inventoryForm.unit} readOnly />
                      <input placeholder="Current stock" type="number" value={inventoryForm.currentStock} onChange={(event) => setInventoryForm({ ...inventoryForm, currentStock: event.target.value })} />
                      <input placeholder="Min stock" type="number" value={inventoryForm.minStock} onChange={(event) => setInventoryForm({ ...inventoryForm, minStock: event.target.value })} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="secondary-btn" onClick={() => setShowInventoryForm(false)}>Cancel</button>
                        <button className="primary-btn" type="submit">Save item</button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              {restockItemId ? (
                <div className="modal-backdrop" onClick={() => setRestockItemId(null)}>
                  <div className="modal modal-sm" onClick={(event) => event.stopPropagation()}>
                    <h3>Restock item</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <input type="number" min="1" step="0.1" placeholder="Quantity" value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="secondary-btn" onClick={() => setRestockItemId(null)}>Cancel</button>
                        <button type="button" className="primary-btn" onClick={() => {
                          if (!restockItemId) return;
                          void handleInventoryRestock(restockItemId, restockQuantity);
                        }}>Restock</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="inventory-grid">
                {data.inventoryItems.length === 0 ? (
                  <p className="empty-copy">No inventory items yet.</p>
                ) : (
                  data.inventoryItems.map((item) => {
                    const low = Number(item.currentStock || 0) <= Number(item.minStock || 0);
                    const status = low ? 'Low stock' : Number(item.currentStock || 0) > Number(item.minStock || 0) * 2 ? 'Healthy' : 'Watching';
                    const latestTransaction = item.transactions?.[0];
                    return (
                      <div key={item.id} className={low ? 'inventory-card danger' : 'inventory-card'}>
                        <div className="inventory-card-header">
                          <div>
                            <strong>{item.name}</strong>
                            <span>{item.category} · {item.unit}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button type="button" className="primary-btn compact-btn" onClick={(event) => { event.stopPropagation(); setRestockItemId(item.id); setRestockQuantity(''); }} aria-label="Restock item">+</button>
                          </div>
                        </div>
                        <div className="inventory-metrics">
                          <div>
                            <span>On hand</span>
                            <strong>{item.currentStock ?? 0}</strong>
                          </div>
                          <div>
                            <span>Minimum</span>
                            <strong>{item.minStock ?? 0}</strong>
                          </div>
                          <div>
                            <span>Unit</span>
                            <strong>{item.unit || '—'}</strong>
                          </div>
                        </div>
                        <div className="inventory-transaction">
                          <small>Created</small>
                          <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Not recorded'}</span>
                        </div>
                        <div className="inventory-transaction">
                          <small>Last movement</small>
                          <span>{latestTransaction ? `${latestTransaction.change > 0 ? '+' : ''}${latestTransaction.change} · ${latestTransaction.reason || 'Adjustment'} · ${new Date(latestTransaction.createdAt).toLocaleDateString()}` : 'No transactions yet'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
            <Panel eyebrow="Alerting" title="Low stock monitor">
              <div className="analysis-card"><strong>{overview.lowStock} low-stock item(s)</strong><p>Inventory costs remain in finance. Workers cannot see inventory cost data.</p></div>
            </Panel>
          </section>
        ) : null}

        {activeNav === 'harvests' && isOwner ? (
          <section className="dashboard-grid wide-left">
            <HarvestCalendar />
          </section>
        ) : null}

      </main>

     {toastMessage ? (
       <div className="toast">
         <span>{toastMessage}</span>
         {pendingFinanceDelete ? <button type="button" className="secondary-btn" style={{ marginLeft: 12 }} onClick={() => void undoFinanceDelete()}>Undo</button> : null}
         {recentlyDeleted ? <button type="button" className="secondary-btn" style={{ marginLeft: 12 }} onClick={() => void undoDeleteInventory()}>Undo</button> : (lastCreatedHarvest ? <button type="button" className="secondary-btn" style={{ marginLeft: 12 }} onClick={() => void undoLastHarvest()}>Undo</button> : null)}
       </div>
     ) : null}
      </div>
    </>
  );
}

function PondSummaryPanel({
  pond,
  summary,
  isOwner,
  form,
  inventoryItems,
  onFormChange,
  onSubmit,
  onRecordHarvest,
  onApplyRecommendedFeed,
  onUpdateHarvest,
  token,
  apiBaseUrl,
  loadData,
  setToastMessage,
}: {
  pond: any | null;
  summary: any | null;
  isOwner: boolean;
  form: {
    feedKg: string;
    feedSize: string;
    feedGrams: string;
    inventoryItemId: string;
    appetite: string;
    behavior: string;
    ph: string;
    dissolvedO2: string;
    ammonia: string;
    waterAddedPercent: string;
    waterRemovedPercent: string;
    waterComment: string;
    mortality: string;
    mortalityCause: string;
    avgWeightGrams: string;
    growthComment: string;
    harvestQuantity: string;
    harvestAvgWeight: string;
    harvestBiomassKg: string;
    harvestMethod: string;
    harvestDestination: string;
  };
  inventoryItems: any[];
  onFormChange: (form: any) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRecordHarvest?: (harvest: any) => void;
  onApplyRecommendedFeed: (pondId: string, recommendedSize: string) => Promise<void> | void;
  onUpdateHarvest: (harvestId: string, payload: { numberHarvested?: number; avgWeightGrams?: number | null; biomassKg?: number | null; method?: string | null; destination?: string | null }) => Promise<void> | void;
  token: string | null;
  apiBaseUrl: string;
  loadData: () => Promise<void>;
  setToastMessage: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  if (!pond || !summary) {
    return (
      <Panel eyebrow="Pond inspection" title="Select a pond">
        <p className="empty-copy">Click a pond to see this pond's production history and current status.</p>
      </Panel>
    );
  }

  const initialStock = pond.initial_population ?? pond.current_population ?? 0;
  const currentAvg = summary.growthHistory && summary.growthHistory.length ? summary.growthHistory[0].avgWeightGrams : (pond.initialAvgWeightG ?? 'Not recorded');
  const targetAvg = pond.targetHarvestKg ? (pond.targetHarvestKg * 1000).toFixed(0) + ' g' : 'Not planned';
  const daysRemaining = summary.harvest ? summary.harvest.daysRemaining : null;
  const growthProgress = summary.harvest ? summary.harvest.progressPercent : null;
  const currentFeedSize = summary.latestFeedSize || summary.recommendedFeedSize || '4mm';
  const recommendedFeedSize = summary.recommendedFeedSize || getRecommendedFeedSize(typeof currentAvg === 'number' ? currentAvg : Number(pond.initialAvgWeightG ?? 0));
  const feedNeedsChange = currentFeedSize !== recommendedFeedSize;
  const harvestDateValue = pond.targetHarvestDate ? new Date(pond.targetHarvestDate).toISOString().slice(0,10) : (summary.harvest ? new Date(summary.harvest.expectedHarvestDate).toISOString().slice(0,10) : '');

  const [targetDate, setTargetDate] = useState<string>(harvestDateValue);
  const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null);
  const [harvestEditForm, setHarvestEditForm] = useState({
    numberHarvested: '',
    avgWeightGrams: '',
    biomassKg: '',
    method: '',
    destination: '',
  });

  useEffect(() => {
    setTargetDate(harvestDateValue);
  }, [pond.id, harvestDateValue]);

  async function saveTargetDate(value: string | null) {
    if (!token || !isOwner) return setToastMessage('Not authorized');
    const body: any = {};
    if (value) body.targetHarvestDate = new Date(value).toISOString();
    else body.targetHarvestDate = null;
    try {
      const r = await fetch(`${apiBaseUrl}/ponds/${pond.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' }, body: JSON.stringify(body) });
      if (r.ok) {
        setToastMessage(value ? 'Target date set' : 'Target date cleared');
        await loadData();
      } else {
        const bodyText = await r.text().catch(() => '');
        let parsed;
        try { parsed = JSON.parse(bodyText || '{}'); } catch { parsed = { error: bodyText || r.statusText }; }
        setToastMessage(parsed.error || parsed.message || `Server error ${r.status}`);
      }
    } catch (e) {
      setToastMessage('Error updating target date');
    }
  }

  return (
    <Panel eyebrow={`Pond ${pond.number}`} title={isOwner ? 'Admin inspection view' : 'Worker pond update'}>
      <div className="pond-detail-stack">
        <div className="pond-detail-card">
          <div className="detail-card-header">
            <div>
              <span className="eyebrow">Fixed pond details</span>
              <h3>Operational overview</h3>
            </div>
            <Fish size={28} />
          </div>
          <div className={`pond-detail ${!isOwner ? 'worker-large' : ''}`}>
            <div><span>Initial stock</span><strong>{initialStock} fish</strong></div>
            <div><span>Current live</span><strong>{summary.currentLive} fish</strong></div>
            <div><span>Total mortality</span><strong>{summary.totalMortality} fish</strong></div>
            <div><span>Total feed</span><strong>{summary.totalFeedKg ?? 0} kg</strong></div>
            <div><span>Current Feed size</span><strong>{currentFeedSize}</strong></div>
            <div><span>Current avg weight</span><strong>{typeof currentAvg === 'number' ? `${currentAvg} g` : currentAvg}</strong></div>
            <div><span>Growth progress</span><strong>{growthProgress !== null ? `${growthProgress}%` : 'Missing data'}</strong></div>
            <div><span>Target avg weight</span><strong>{targetAvg}</strong></div>
            <div className={summary.harvest?.expectedHarvestDate ? 'target-date-highlight' : ''}>
              <span>Target harvest date</span>
              <strong>{summary.harvest?.expectedHarvestDate ? new Date(summary.harvest.expectedHarvestDate).toLocaleDateString() : 'Not planned'}</strong>
              {summary.harvest?.expectedHarvestDate ? <small className="target-date-alert">Harvest scheduled</small> : null}
            </div>
            <div><span>Total harvested</span><strong>{summary.totalHarvested} fish</strong></div>
            {isOwner ? (
              <div className="target-date-row"><span>Update target date</span><div className="inline-update-actions"><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /><button type="button" className="primary-btn" onClick={() => void saveTargetDate(targetDate)}>Set</button><button type="button" className="secondary-btn" onClick={() => { setTargetDate(''); void saveTargetDate(null); }}>Clear</button></div></div>
            ) : null}
          </div>
        </div>

      </div>

      {!isOwner ? (
        <form className="worker-log-form" onSubmit={onSubmit}>
          <select value={form.feedSize || currentFeedSize} onChange={(event) => onFormChange({ ...form, feedSize: event.target.value })} disabled={Boolean(summary.recommendedFeedSize || summary.latestFeedSize)}>
            <option value="1mm">1mm</option>
            <option value="1.5mm">1.5mm</option>
            <option value="2mm">2mm</option>
            <option value="2.5mm">2.5mm</option>
            <option value="3mm">3mm</option>
            <option value="3.5mm">3.5mm</option>
            <option value="4mm">4mm</option>
            <option value="4.5mm">4.5mm</option>
          </select>
          <select value={form.inventoryItemId || ''} onChange={(event) => onFormChange({ ...form, inventoryItemId: event.target.value })}>
            <option value="">Feed stock item (optional)</option>
            {inventoryItems.filter((item) => String(item.category || '').toUpperCase().includes('FEED') || String(item.name || '').toLowerCase().includes('feed')).map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.currentStock ?? 0} {item.unit || 'kg'})</option>
            ))}
          </select>
          <input type="number" min="0" step="10" placeholder="Feed grams" value={form.feedGrams} onChange={(event) => onFormChange({ ...form, feedGrams: event.target.value, feedKg: event.target.value ? (Number(event.target.value) / 1000).toFixed(3) : '' })} />
          <select value={form.appetite} onChange={(event) => onFormChange({ ...form, appetite: event.target.value })}>
            <option value="5">Appetite 5 - excellent</option>
            <option value="4">Appetite 4 - good</option>
            <option value="3">Appetite 3 - fair</option>
            <option value="2">Appetite 2 - poor</option>
            <option value="1">Appetite 1 - very poor</option>
          </select>
          <input placeholder="Fish behavior" value={form.behavior} onChange={(event) => onFormChange({ ...form, behavior: event.target.value })} />
          <input placeholder="pH" value={form.ph} onChange={(event) => onFormChange({ ...form, ph: event.target.value })} />
          <input placeholder="Dissolved oxygen" value={form.dissolvedO2} onChange={(event) => onFormChange({ ...form, dissolvedO2: event.target.value })} />
          <input placeholder="Ammonia" value={form.ammonia} onChange={(event) => onFormChange({ ...form, ammonia: event.target.value })} />
          <input placeholder="Water added %" value={form.waterAddedPercent} onChange={(event) => onFormChange({ ...form, waterAddedPercent: event.target.value })} />
          <input placeholder="Water removed %" value={form.waterRemovedPercent} onChange={(event) => onFormChange({ ...form, waterRemovedPercent: event.target.value })} />
          <input placeholder="Dead fish" value={form.mortality} onChange={(event) => onFormChange({ ...form, mortality: event.target.value })} />
          <input placeholder="Mortality cause" value={form.mortalityCause} onChange={(event) => onFormChange({ ...form, mortalityCause: event.target.value })} />
          <input type="number" min="0" step="1" placeholder="Average weight (g)" value={form.avgWeightGrams} onChange={(event) => onFormChange({ ...form, avgWeightGrams: event.target.value })} />
          <input placeholder="Growth note" value={form.growthComment} onChange={(event) => onFormChange({ ...form, growthComment: event.target.value })} />
          <textarea placeholder="Water or behavior note" value={form.waterComment} onChange={(event) => onFormChange({ ...form, waterComment: event.target.value })} />
          <button className="primary-btn" type="submit"><Upload size={16} />Submit pond update</button>
        </form>
      ) : null}
    </Panel>
  );
}

function FinanceTable({ records, onDelete }: { records: any[]; onDelete: (id: string) => void }) {
  if (records.length === 0) return <p className="empty-copy">No finance records yet.</p>;
  return (
    <div className="finance-table-wrap">
      <table className="finance-table">
        <thead><tr><th>No.</th><th>Type</th><th>Category</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th>Pond</th><th>Date</th><th></th></tr></thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id}>
              <td>{index + 1}</td>
              <td>{formatFinanceType(record.type)}</td>
              <td>{record.category || '-'}</td>
              <td>{record.quantity ? `${record.quantity} ${record.unit || ''}`.trim() : '-'}</td>
              <td>{record.unitPrice ? formatDalasi(record.unitPrice) : '-'}</td>
              <td>{formatDalasi(record.amount)}</td>
              <td>{record.pond ? `Pond ${record.pond.number}` : 'All ponds'}</td>
              <td>{new Date(record.recordedAt).toLocaleDateString()}</td>
              <td><button className="danger-icon" onClick={() => { onDelete(record.id); }} aria-label="Delete finance record"><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Activity; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div><span>{label}</span><Icon size={20} /></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({ eyebrow, title, children, className }: { eyebrow: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>
      {children}
    </section>
  );
}

function RecordList({ records, emptyTitle, render }: { records: any[]; emptyTitle: string; render: (record: any) => ReactNode }) {
  if (records.length === 0) return <p className="empty-copy">{emptyTitle}</p>;
  return <div className="record-list">{records.map((record) => <div className="record-row" key={record.id}>{render(record)}</div>)}</div>;
}

export default App;



