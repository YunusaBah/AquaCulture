import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
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
  Wallet,
} from 'lucide-react';
import { hasPermission } from './lib/permissions';

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
  { id: 'command', label: 'Owner Dashboard', icon: Activity },
  { id: 'ponds', label: 'Ponds', icon: Fish },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'inventory', label: 'Inventory', icon: Package },
];

const workerNav = [
  { id: 'command', label: "Today's Work", icon: ClipboardList },
  { id: 'ponds', label: 'My Ponds', icon: Fish },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
];

function formatDalasi(value: number) {
  return `D${Math.round(value || 0).toLocaleString()}`;
}

function titleCase(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
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
  const [email, setEmail] = useState('owner@aquaculture.localapp');
  const [password, setPassword] = useState('Owner7614091');
  const [error, setError] = useState('');
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
    species: 'CATFISH',
    capacity: '',
    initialPopulation: '',
    stockedAt: '',
    initialAvgWeightG: '',
    targetHarvestKg: '',
  });
  const [financeForm, setFinanceForm] = useState({
    type: 'EXPENSE',
    category: '',
    description: '',
    quantity: '',
    unit: '',
    unitPrice: '',
    amount: '',
    pondId: '',
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    priority: 'HIGH',
    dueAt: '',
  });
  const [inventoryForm, setInventoryForm] = useState({
    name: '',
    category: '',
    unit: '',
    currentStock: '',
    minStock: '',
    sku: '',
  });
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
    const members = data.farms.flatMap((farm) => farm.members || []);
    const farmWorkers = members.filter((member) => member.role?.name === 'WORKER');
    if (farmWorkers.length > 0) return farmWorkers;
    return [
      { id: 'worker-dev', email: 'worker@aquaculture.localapp', name: 'Field Worker', role: { name: 'WORKER' } },
    ];
  }, [data.farms]);

  const selectedTask = useMemo(() => {
    if (!data.tasks.length) return null;
    return data.tasks.find((task) => task.id === selectedTaskId) || data.tasks[0];
  }, [data.tasks, selectedTaskId]);

  const overview = useMemo(() => {
    const totalFeed = data.feedings.reduce((sum, item) => sum + Number(item.quantityKg || 0), 0);
    const totalMortality = data.mortalityLogs.reduce((sum, item) => sum + Number(item.numberDead || 0), 0);
    const lowStock = data.inventoryItems.filter((item) => Number(item.currentStock || 0) <= Number(item.minStock || 0)).length;
    const finance = data.finance || { income: 0, expenses: 0, budget: 0, profit: 0, status: 'PROFIT', profitMargin: 0, budgetUsedPercent: 0 };
    return { totalFeed, totalMortality, lowStock, finance, healthScore: totalMortality > 10 ? 82 : 96 };
  }, [data]);


  const feedRecommendations = useMemo(() => data.ponds
    .map((pond) => {
      const avg = Number(pond.initialAvgWeightG ?? 0);
      const recommendedSize = getRecommendedFeedSize(avg);
      const currentSize = pond.feedLogs?.[0]?.feedSize || recommendedSize;
      return {
        id: pond.id,
        number: pond.number,
        site: pond.site?.name || 'Farm site',
        avgWeight: avg,
        recommendedSize,
        currentSize,
        needsChange: currentSize !== recommendedSize,
      };
    })
    .filter((pond) => pond.avgWeight > 0)
    .sort((a, b) => Number(b.needsChange) - Number(a.needsChange) || b.avgWeight - a.avgWeight)
    .slice(0, 5), [data.ponds]);

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

  async function handleCreatePond(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;
    if (!navigator.onLine) {
      queueOfflineSyncEntry('pond_create', {
        siteName: newPond.siteName,
        number: newPond.number,
        species: newPond.species,
        capacity: newPond.capacity,
        initialPopulation: newPond.initialPopulation,
        stockedAt: newPond.stockedAt,
        initialAvgWeightG: newPond.initialAvgWeightG,
        targetHarvestKg: newPond.targetHarvestKg,
      }, 'pond');
      return;
    }
    const headers = { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' };
    const allSites = data.farms.flatMap((farm) => farm.sites || []);
    let site = allSites.find((item) => item.name?.toLowerCase() === newPond.siteName.toLowerCase());
    if (!site) {
      const siteRes = await fetch(`${apiBaseUrl}/sites`, { method: 'POST', headers, body: JSON.stringify({ name: newPond.siteName }) });
      if (!siteRes.ok) return;
      site = (await siteRes.json()).site;
    }

    const pondRes = await fetch(`${apiBaseUrl}/ponds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteId: site.id,
        number: Number(newPond.number),
        species: newPond.species,
        capacity: Number(newPond.capacity),
        initialPopulation: Number(newPond.initialPopulation) || undefined,
        stockedAt: newPond.stockedAt || undefined,
        initialAvgWeightG: Number(newPond.initialAvgWeightG) || undefined,
        targetHarvestKg: Number(newPond.targetHarvestKg) || undefined,
      }),
    });
    if (pondRes.ok) {
      setNewPond({ siteName: '', number: '', species: 'CATFISH', capacity: '', initialPopulation: '', stockedAt: '', initialAvgWeightG: '', targetHarvestKg: '' });
      await loadData();
    }
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'pond' | 'finance' | 'inventory' | null; id?: string; label?: string }>({ open: false, type: null });
  const [taskComment, setTaskComment] = useState('');
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ item: any; timeoutId?: number } | null>(null);

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
    const response = await fetch(`${apiBaseUrl}/finance/${id}`, { method: 'DELETE', headers: { Authorization: token ? 'Bearer ' + token : '' } });
    if (response.ok) await loadData();
    cancelDeleteConfirmation();
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
      sku: item.sku || undefined,
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
    if (!navigator.onLine) {
      queueOfflineSyncEntry('finance_record_create', {
        ...financeForm,
        quantity: Number(financeForm.quantity) || undefined,
        unitPrice: Number(financeForm.unitPrice) || undefined,
        amount: Number(financeForm.amount) || undefined,
      }, 'finance_record');
      return;
    }
    const response = await fetch(`${apiBaseUrl}/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        ...financeForm,
        quantity: Number(financeForm.quantity) || undefined,
        unitPrice: Number(financeForm.unitPrice) || undefined,
        amount: Number(financeForm.amount) || undefined,
        pondId: financeForm.pondId || undefined,
      }),
    });
    if (response.ok) {
      setFinanceForm({ type: 'EXPENSE', category: '', description: '', quantity: '', unit: '', unitPrice: '', amount: '', pondId: '' });
      await loadData();
    }
  }

  async function handleCreateInventoryItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;
    const response = await fetch(`${apiBaseUrl}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      body: JSON.stringify({
        name: inventoryForm.name,
        category: inventoryForm.category,
        unit: inventoryForm.unit,
        sku: inventoryForm.sku || undefined,
        currentStock: Number(inventoryForm.currentStock) || 0,
        minStock: Number(inventoryForm.minStock) || 0,
      }),
    });
    if (response.ok) {
      setInventoryForm({ name: '', category: '', unit: '', currentStock: '', minStock: '', sku: '' });
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
          <p className="auth-copy">Owner management and worker field operations with permanent farm records.</p>
          <div className="login-grid">
            <button type="button" onClick={() => { setEmail('owner@aquaculture.localapp'); setPassword('Owner7614091'); }}>Farm Owner</button>
            <button type="button" onClick={() => { setEmail('worker@aquaculture.localapp'); setPassword('Worker5221'); }}>Farm Worker</button>
          </div>
          <form className="auth-form" onSubmit={handleLogin}>
            <label>Email<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input value={password} type="password" onChange={(event) => setPassword(event.target.value)} /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          </form>
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

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
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
            <p className="modal-note">This action cannot be undone.</p>
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
            <p className="eyebrow">{isOwner ? 'Owner Control' : 'Field Work'}</p>
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
            <strong>{isOwner ? 'Owner permissions' : 'Worker permissions'}</strong>
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
            <div className={isOnline ? 'sync-status online' : 'sync-status offline'}>
              <span className="sync-dot" />
              {isOnline ? 'Online' : 'Offline'} · {pendingSyncCount} pending sync
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
            <button className="secondary-btn" onClick={() => { localStorage.removeItem('aquaculture-token'); localStorage.removeItem('aquaculture-user'); setToken(null); setCurrentUser(null); }}>Log out</button>
          </div>
        </header>

        {activeNav === 'command' ? (
          <>
            <section className="metrics-grid">
              <Metric label="Farm health" value={`${overview.healthScore}%`} detail="Based on mortality and water risk" icon={Activity} tone="blue" />
              <Metric label="Feed logged" value={`${overview.totalFeed || 0} kg`} detail="Stored feeding records" icon={Sprout} tone="green" />
              <Metric label="Mortality" value={`${overview.totalMortality || 0} fish`} detail="Stored mortality records" icon={AlertTriangle} tone="orange" />
              {isOwner ? (
                <Metric label="Net position" value={formatDalasi(overview.finance.profit)} detail={overview.finance.status === 'PROFIT' ? 'Running profit' : 'Running loss'} icon={overview.finance.status === 'PROFIT' ? TrendingUp : TrendingDown} tone={overview.finance.status === 'PROFIT' ? 'green' : 'orange'} />
              ) : (
                <Metric label="My ponds" value={String(data.ponds.length)} detail="Assigned to you" icon={Fish} tone="navy" />
              )}
            </section>
            <section className="dashboard-grid">
              <Panel eyebrow={isOwner ? 'Owner oversight' : 'Today'} title={isOwner ? 'Pond activity status' : "Today's checklist"}>
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
              <Panel eyebrow="Recommendation" title="Immediate action">
                <div className="insight-callout">
                  <BrainCircuit size={28} />
                  <p>Pond records now combine feeding, mortality, water quality, and harvest timing so the owner can inspect each pond without calling workers.</p>
                </div>
              </Panel>
              <Panel eyebrow="Feed recommendation" title="Feed by fish size">
                <div className="record-list">
                  {feedRecommendations.length === 0 ? (
                    <p className="empty-copy">No feed-size data yet for active ponds.</p>
                  ) : (
                    feedRecommendations.map((pond) => (
                      <div
                        className={pond.needsChange ? 'record-row alert-row priority-row' : 'record-row priority-row'}
                        key={pond.id}
                        style={pond.needsChange ? { borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.04)' } : { borderLeft: '4px solid #2e7d32', background: 'rgba(46, 125, 50, 0.03)' }}
                      >
                        <div className="priority-row-main">
                          <div>
                            <strong>Pond {pond.number}</strong>
                            <span>{pond.site}</span>
                          </div>
                          <span className={pond.needsChange ? 'priority-label warning' : 'priority-label success'}>
                            {pond.needsChange ? 'Priority action' : 'On target'}
                          </span>
                        </div>
                        <div className="pond-stats">
                          <span>{pond.avgWeight} g</span>
                          <span>{pond.currentSize}</span>
                          <span className={pond.needsChange ? 'warning-chip' : 'success-chip'}>{pond.needsChange ? 'Adjust to ' + pond.recommendedSize : 'Good size'}</span>
                          <button type="button" className="secondary-btn compact-btn" onClick={() => applyRecommendedFeedSize(pond.id, pond.recommendedSize)}>
                            {pond.needsChange ? `Use ${pond.recommendedSize}` : 'Keep this size'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
              <Panel eyebrow="Notifications" title="Recent updates">
                <RecordList records={data.notifications.slice(0, 5)} emptyTitle="No notifications yet" render={(item) => <><strong>{item.title}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></>} />
              </Panel>
            </section>
          </>
        ) : null}

        {activeNav === 'ponds' ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow={isOwner ? 'Owner pond management' : 'Assigned ponds'} title="Pond registry">
              {isOwner ? (
                <form className="compact-form pond-form-grid" onSubmit={handleCreatePond}>
                  <input placeholder="Site name" value={newPond.siteName} onChange={(event) => setNewPond({ ...newPond, siteName: event.target.value })} required />
                  <input placeholder="Pond no." value={newPond.number} onChange={(event) => setNewPond({ ...newPond, number: event.target.value })} required />
                  <select value={newPond.species} onChange={(event) => setNewPond({ ...newPond, species: event.target.value })}>
                    <option value="CATFISH">Catfish</option><option value="TILAPIA">Tilapia</option><option value="TROUT">Trout</option><option value="SHRIMP">Shrimp</option><option value="OTHER">Other</option>
                  </select>
                  <input placeholder="Capacity" value={newPond.capacity} onChange={(event) => setNewPond({ ...newPond, capacity: event.target.value })} required />
                  <input placeholder="Initial fish" value={newPond.initialPopulation} onChange={(event) => setNewPond({ ...newPond, initialPopulation: event.target.value })} />
                  <input type="date" value={newPond.stockedAt} onChange={(event) => setNewPond({ ...newPond, stockedAt: event.target.value })} />
                  <input placeholder="Initial avg g" value={newPond.initialAvgWeightG} onChange={(event) => setNewPond({ ...newPond, initialAvgWeightG: event.target.value })} />
                  <input placeholder="Target kg" value={newPond.targetHarvestKg} onChange={(event) => setNewPond({ ...newPond, targetHarvestKg: event.target.value })} />
                  <button className="primary-btn" type="submit"><Plus size={16} />Create pond</button>
                </form>
              ) : <p className="empty-copy">Workers cannot create ponds. You only see ponds assigned to you.</p>}
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
              <Panel eyebrow="Owner task dispatch" title="Create and send worker task">
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

        {activeNav === 'finance' && isOwner ? (
          <>
            <section className="metrics-grid">
              <Metric label="Income" value={formatDalasi(overview.finance.income)} detail="All income records" icon={Wallet} tone="blue" />
              <Metric label="Expenses" value={formatDalasi(overview.finance.expenses)} detail={`${overview.finance.budgetUsedPercent}% budget used`} icon={TrendingDown} tone="orange" />
              <Metric label="Budget" value={formatDalasi(overview.finance.budget)} detail={`${formatDalasi(overview.finance.budgetRemaining)} remaining`} icon={CalendarClock} tone="navy" />
              <Metric label="Net profit/loss" value={formatDalasi(overview.finance.profit)} detail={`${overview.finance.profitMargin}% margin | ${overview.finance.status}`} icon={overview.finance.status === 'PROFIT' ? TrendingUp : TrendingDown} tone={overview.finance.status === 'PROFIT' ? 'green' : 'orange'} />
            </section>

            <section className="finance-section">
              <Panel eyebrow="Finance ledger" title="Excel-style records" className="finance-worksheet-panel">
                <form className="finance-form" onSubmit={handleCreateFinanceRecord}>
                  <select value={financeForm.type} onChange={(event) => setFinanceForm({ ...financeForm, type: event.target.value })}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option><option value="BUDGET">Budget</option></select>
                  <input placeholder="Category" value={financeForm.category} onChange={(event) => setFinanceForm({ ...financeForm, category: event.target.value })} required />
                  <input placeholder="Description" value={financeForm.description} onChange={(event) => setFinanceForm({ ...financeForm, description: event.target.value })} />
                  <input placeholder="Qty" value={financeForm.quantity} onChange={(event) => setFinanceForm({ ...financeForm, quantity: event.target.value })} />
                  <input placeholder="Unit" value={financeForm.unit} onChange={(event) => setFinanceForm({ ...financeForm, unit: event.target.value })} />
                  <input placeholder="Unit price" value={financeForm.unitPrice} onChange={(event) => setFinanceForm({ ...financeForm, unitPrice: event.target.value })} />
                  <input placeholder="Amount" value={financeForm.amount} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} />
                  <select value={financeForm.pondId} onChange={(event) => setFinanceForm({ ...financeForm, pondId: event.target.value })}><option value="">No pond</option>{data.ponds.map((pond) => <option key={pond.id} value={pond.id}>Pond {pond.number}</option>)}</select>
                  <button className="primary-btn" type="submit"><Plus size={16} />Add row</button>
                </form>

                <FinanceTable records={data.financeRecords} onDelete={(id) => showDeleteConfirmation('finance', id, `Finance record ${id}`)} />
              </Panel>
            </section>
          </>
        ) : null}

        {activeNav === 'inventory' && isOwner ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow="Inventory" title="Stock levels">
              <form className="compact-form inventory-form" onSubmit={handleCreateInventoryItem}>
                <input placeholder="Item name" value={inventoryForm.name} onChange={(event) => setInventoryForm({ ...inventoryForm, name: event.target.value })} required />
                      <select value={inventoryForm.category} onChange={(event) => setInventoryForm({ ...inventoryForm, category: event.target.value })} required>
                        <option value="">Category</option>
                        <option value="FEED">Feed</option>
                        <option value="MEDICINE">Medicine</option>
                        <option value="CHEMICAL">Chemical</option>
                        <option value="EQUIPMENT">Equipment</option>
                        <option value="SUPPLIES">Supplies</option>
                      </select>
                      <input placeholder="Unit" value={inventoryForm.unit} onChange={(event) => setInventoryForm({ ...inventoryForm, unit: event.target.value })} required />
                      <input placeholder="SKU (optional)" value={inventoryForm.sku} onChange={(event) => setInventoryForm({ ...inventoryForm, sku: event.target.value })} />
                      <input placeholder="Current stock" type="number" value={inventoryForm.currentStock} onChange={(event) => setInventoryForm({ ...inventoryForm, currentStock: event.target.value })} />
                      <input placeholder="Min stock" type="number" value={inventoryForm.minStock} onChange={(event) => setInventoryForm({ ...inventoryForm, minStock: event.target.value })} />
                      <button className="primary-btn" type="submit"><Plus size={16} />Add stock item</button>
                    </form>

              <form className="compact-form inventory-adjust-form" onSubmit={handleInventoryAdjustment}>
                <select value={inventoryAdjustment.itemId} onChange={(event) => setInventoryAdjustment({ ...inventoryAdjustment, itemId: event.target.value })} required>
                  <option value="">Select item</option>
                  {data.inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select value={inventoryAdjustment.type} onChange={(event) => setInventoryAdjustment({ ...inventoryAdjustment, type: event.target.value })}>
                  <option value="ADD">Restock</option>
                  <option value="USE">Use / issue</option>
                </select>
                <input placeholder="Quantity" type="number" min="1" value={inventoryAdjustment.quantity} onChange={(event) => setInventoryAdjustment({ ...inventoryAdjustment, quantity: event.target.value })} required />
                <input placeholder="Reason" value={inventoryAdjustment.reason} onChange={(event) => setInventoryAdjustment({ ...inventoryAdjustment, reason: event.target.value })} />
                <button className="primary-btn" type="submit">Apply</button>
              </form>

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
                                                    <span className={low ? 'warning-chip' : 'success-chip'}>{status}</span>
                                                    <button type="button" className="danger-icon" onClick={() => showDeleteConfirmation('inventory', item.id, item.name)} aria-label="Delete inventory item"><Trash2 size={14} /></button>
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
                            <span>SKU</span>
                            <strong>{item.sku || '—'}</strong>
                          </div>
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
         {recentlyDeleted ? <button type="button" className="secondary-btn" style={{ marginLeft: 12 }} onClick={() => void undoDeleteInventory()}>Undo</button> : (lastCreatedHarvest ? <button type="button" className="secondary-btn" style={{ marginLeft: 12 }} onClick={() => void undoLastHarvest()}>Undo</button> : null)}
       </div>
     ) : null}
    </div>
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

  const [targetDate, setTargetDate] = useState<string>(
    pond.targetHarvestDate ? new Date(pond.targetHarvestDate).toISOString().slice(0,10) : (summary.harvest ? new Date(summary.harvest.expectedHarvestDate).toISOString().slice(0,10) : '')
  );
  const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null);
  const [harvestEditForm, setHarvestEditForm] = useState({
    numberHarvested: '',
    avgWeightGrams: '',
    biomassKg: '',
    method: '',
    destination: '',
  });

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
    <Panel eyebrow={`Pond ${pond.number}`} title={isOwner ? 'Owner inspection view' : 'Worker pond update'}>
      <div className={`pond-detail ${!isOwner ? 'worker-large' : ''}`}>
        <Fish size={34} />
        <div><span>Initial stock</span><strong>{initialStock} fish</strong></div>
        <div><span>Current live</span><strong>{summary.currentLive} fish</strong></div>
        <div><span>Total mortality</span><strong>{summary.totalMortality} fish</strong></div>
        <div><span>Total harvested</span><strong>{summary.totalHarvested} fish</strong></div>
        <div><span>Total feed</span><strong>{summary.totalFeedKg ?? 0} kg</strong></div>
        <div><span>Feed size</span><strong>{currentFeedSize}</strong></div>
        <div><span>Today feed</span><strong>{summary.todayFeedKg ?? 0} kg</strong></div>
        <div><span>Current avg weight</span><strong>{typeof currentAvg === 'number' ? `${currentAvg} g` : currentAvg}</strong></div>
        <div><span>Target avg weight</span><strong>{targetAvg}</strong></div>
        <div><span>Target date</span><strong>{summary.harvest ? new Date(summary.harvest.expectedHarvestDate).toLocaleDateString() : 'Not planned'}</strong>
          {isOwner ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              <button type="button" className="primary-btn" onClick={() => void saveTargetDate(targetDate)}>Set</button>
              <button type="button" className="secondary-btn" onClick={() => { setTargetDate(''); void saveTargetDate(null); }}>Clear</button>
            </div>
          ) : null}
        </div>
        <div><span>Growth progress</span><strong>{growthProgress !== null ? `${growthProgress}%` : 'Missing data'}</strong></div>
        <div><span>Recommended size</span><strong>{recommendedFeedSize}</strong></div>
      </div>

      <div className="record-row priority-row" style={feedNeedsChange ? { borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.04)' } : { borderLeft: '4px solid #2e7d32', background: 'rgba(46, 125, 50, 0.03)' }}>
        <div className="priority-row-main">
          <div>
            <strong>Feed size status</strong>
            <span>{typeof currentAvg === 'number' ? `${currentAvg} g current average` : 'Average weight pending'}</span>
          </div>
          <span className={feedNeedsChange ? 'priority-label warning' : 'priority-label success'}>
            {feedNeedsChange ? 'Priority action' : 'On target'}
          </span>
        </div>
        <div className="pond-stats">
          <span>{currentFeedSize}</span>
          <span className={feedNeedsChange ? 'warning-chip' : 'success-chip'}>
            {feedNeedsChange ? 'Switch to ' + recommendedFeedSize : 'Good size'}
          </span>
          <button
            type="button"
            className="secondary-btn compact-btn"
            onClick={() => void onApplyRecommendedFeed(pond.id, recommendedFeedSize)}
          >
            {feedNeedsChange ? `Apply ${recommendedFeedSize}` : 'Keep this size'}
          </button>
        </div>
      </div>

      <section style={{ marginTop: 12 }}>
        <h3 className="eyebrow">Feed plan</h3>
        <div className="record-row"><strong>Latest feed size</strong><span>{summary.latestFeedSize || summary.recommendedFeedSize || 'Not recorded'}</span></div>
        <div className="record-row"><strong>Latest feed type</strong><span>{summary.latestFeedType || 'Not recorded'}</span></div>
        <div className="record-row"><strong>Today's feeding</strong><span>{summary.todayFeedKg ?? 0} kg</span></div>
        <div className="record-row"><strong>Recommended size for current average</strong><span>{recommendedFeedSize}</span></div>
      </section>

      <section style={{ marginTop: 12 }}>
        <h3 className="eyebrow">Monthly growth</h3>
        {summary.growthHistory && summary.growthHistory.length ? (
          <div className="record-list">
            {summary.growthHistory.map((g: any) => (
              <div className="stat-row" key={g.measuredAt}><strong>{new Date(g.measuredAt).toLocaleDateString()}</strong><span>{g.avgWeightGrams} g</span></div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">No growth measurements recorded yet.</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <h3 className="eyebrow">Harvest history</h3>
        {summary.harvestHistory && summary.harvestHistory.length ? (
          <div className="record-list">
            {summary.harvestHistory.map((h: any) => (
              <div className="record-row" key={h.id || h.recordedAt}>
                {editingHarvestId === h.id ? (
                  <form
                    className="owner-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await onUpdateHarvest(h.id, {
                        numberHarvested: harvestEditForm.numberHarvested ? Number(harvestEditForm.numberHarvested) : undefined,
                        avgWeightGrams: harvestEditForm.avgWeightGrams ? Number(harvestEditForm.avgWeightGrams) : undefined,
                        biomassKg: harvestEditForm.biomassKg ? Number(harvestEditForm.biomassKg) : undefined,
                        method: harvestEditForm.method || undefined,
                        destination: harvestEditForm.destination || undefined,
                      });
                      setEditingHarvestId(null);
                    }}
                    style={{ width: '100%' }}
                  >
                    <input
                      placeholder="Quantity"
                      value={harvestEditForm.numberHarvested}
                      onChange={(event) => setHarvestEditForm({ ...harvestEditForm, numberHarvested: event.target.value })}
                    />
                    <input
                      placeholder="Avg weight (g)"
                      value={harvestEditForm.avgWeightGrams}
                      onChange={(event) => setHarvestEditForm({ ...harvestEditForm, avgWeightGrams: event.target.value })}
                    />
                    <input
                      placeholder="Biomass (kg)"
                      value={harvestEditForm.biomassKg}
                      onChange={(event) => setHarvestEditForm({ ...harvestEditForm, biomassKg: event.target.value })}
                    />
                    <input
                      placeholder="Method"
                      value={harvestEditForm.method}
                      onChange={(event) => setHarvestEditForm({ ...harvestEditForm, method: event.target.value })}
                    />
                    <input
                      placeholder="Destination"
                      value={harvestEditForm.destination}
                      onChange={(event) => setHarvestEditForm({ ...harvestEditForm, destination: event.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="primary-btn">Save</button>
                      <button type="button" className="secondary-btn" onClick={() => setEditingHarvestId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>{new Date(h.recordedAt).toLocaleDateString()}</strong>
                      <span>{h.numberHarvested} fish</span>
                    </div>
                    <div className="pond-stats">
                      <span>{h.avgWeightGrams ? `${h.avgWeightGrams} g` : '-'}</span>
                      <span>{h.biomassKg ? `${h.biomassKg} kg` : '-'}</span>
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() => {
                          setEditingHarvestId(h.id);
                          setHarvestEditForm({
                            numberHarvested: String(h.numberHarvested || ''),
                            avgWeightGrams: h.avgWeightGrams ? String(h.avgWeightGrams) : '',
                            biomassKg: h.biomassKg ? String(h.biomassKg) : '',
                            method: h.method || '',
                            destination: h.destination || '',
                          });
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="stat-row"><strong>Total harvested</strong><span>{summary.totalHarvested} fish</span></div>
            <div className="stat-row"><strong>Remaining</strong><span>{summary.currentLive} fish</span></div>
          </div>
        ) : (
          <p className="empty-copy">No harvests recorded yet.</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <h3 className="eyebrow">Latest health</h3>
        <div className="record-row"><strong>Fish behavior</strong><span>{summary.behavior || 'Not recorded'}</span></div>
        <div className="record-row"><strong>Feed response</strong><span>{summary.reactive === null ? 'Not recorded' : summary.reactive ? 'Good' : 'Poor'}</span></div>
        <div className="record-row"><strong>Mortality today</strong><span>{summary.todayMortality || 0}</span></div>
        <div className="record-row"><strong>pH</strong><span>{summary.ph ?? 'Not recorded'}</span></div>
        <div className="record-row"><strong>Water status</strong><span>{summary.waterIssue ? 'Needs review' : 'Normal'}</span></div>
      </section>

      <div style={{ marginTop: 12 }} className="record-row"><strong>Last updated</strong><span>{summary.lastUpdatedAt ? new Date(summary.lastUpdatedAt).toLocaleString() : 'No recent update'}</span></div>

      {!isOwner ? (
        <form className="worker-log-form" onSubmit={onSubmit}>
          <select value={form.feedSize || '4mm'} onChange={(event) => onFormChange({ ...form, feedSize: event.target.value })}>
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
        <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th><th>Pond</th><th></th></tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{new Date(record.recordedAt).toLocaleDateString()}</td>
              <td>{titleCase(record.type)}</td>
              <td>{record.category}</td>
              <td>{record.description || '-'}</td>
              <td>{record.quantity ?? '-'}</td>
              <td>{record.unit || '-'}</td>
              <td>{record.unitPrice ? formatDalasi(record.unitPrice) : '-'}</td>
              <td>{formatDalasi(record.amount)}</td>
              <td>{record.pond ? `Pond ${record.pond.number}` : '-'}</td>
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



