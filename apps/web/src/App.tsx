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
  inventoryItems: any[];
  tasks: any[];
  aiReports: any[];
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
  inventoryItems: [],
  tasks: [],
  aiReports: [],
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
  { id: 'ai', label: 'AI Assistant', icon: BrainCircuit },
];

const workerNav = [
  { id: 'command', label: "Today's Work", icon: ClipboardList },
  { id: 'ponds', label: 'My Ponds', icon: Fish },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'ai', label: 'AI Field Help', icon: BrainCircuit },
];

function formatDalasi(value: number) {
  return `D${Math.round(value || 0).toLocaleString()}`;
}

function titleCase(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function buildAiSuggestion(note: string) {
  const clean = note.trim();
  if (!clean) return 'Record an observation to generate a professional draft.';

  const lowered = clean.toLowerCase();
  const hasMortality = lowered.includes('dead') || lowered.includes('mortality') || lowered.includes('die');
  const hasWaterIssue = lowered.includes('green') || lowered.includes('cloudy') || lowered.includes('muddy') || lowered.includes('water');
  const hasLowActivity = lowered.includes('less active') || lowered.includes('inactive') || lowered.includes('slow') || lowered.includes('weak');
  const hasFeedIssue = lowered.includes('feed') || lowered.includes('appetite') || lowered.includes('eat') || lowered.includes('ration');
  const hasOxygen = lowered.includes('oxygen') || lowered.includes('dissolved') || lowered.includes('gasping') || lowered.includes('stress');
  const hasDiseaseClue = lowered.includes('lesion') || lowered.includes('spot') || lowered.includes('fungus') || lowered.includes('tail');
  const hasAlgae = lowered.includes('algae') || lowered.includes('green water') || lowered.includes('bloom');

  let recommendation = `Suggested observation:\n${clean}\n\nOperational response: compare the latest water values with yesterday's readings before the next feeding cycle. Keep the note concise, document the current condition, and schedule a follow-up check in the next 12-24 hours.`;

  if (hasMortality) {
    recommendation = `Suggested observation:\n${clean}\n\nMortality risk is elevated. Check dissolved oxygen, ammonia, and feed delivery immediately, then inspect the affected area for signs of crowding or poor water circulation before the next feeding.`;
  }
  if (hasWaterIssue && !hasMortality) {
    recommendation = `Suggested observation:\n${clean}\n\nWater quality is likely contributing to the change. Review clarity, dissolved oxygen, and ammonia first, then reduce feed load and plan a water exchange check before the next cycle.`;
  }
  if (hasLowActivity) {
    recommendation = `Suggested observation:\n${clean}\n\nFish behavior suggests stress or declining conditions. Reduce feed briefly, verify oxygen saturation, and compare this pond with the previous 24 hours of activity before increasing the ration again.`;
  }
  if (hasFeedIssue && !hasLowActivity) {
    recommendation = `Suggested observation:\n${clean}\n\nFeeding response is inconsistent. Check feed quality, compare appetite with nearby ponds, and slightly reduce the next ration until the feed pattern stabilizes.`;
  }
  if (hasOxygen) {
    recommendation = `Suggested observation:\n${clean}\n\nOxygen risk is the likely priority. Measure early-morning dissolved oxygen, confirm aeration performance, and delay heavy feeding until readings are stable and consistent.`;
  }
  if (hasDiseaseClue) {
    recommendation = `Suggested observation:\n${clean}\n\nVisible health signs require targeted follow-up. Separate affected fish if needed, review recent water quality changes, and escalate for veterinary or technical inspection if the condition persists or spreads.`;
  }
  if (hasAlgae) {
    recommendation = `Suggested observation:\n${clean}\n\nThe pond appears to have water-quality drift. Reduce feed, check algae loading, and verify dissolved oxygen and circulation before continuing a normal feeding plan.`;
  }

  const closure = (hasMortality || hasOxygen || hasDiseaseClue)
    ? 'Escalate with a clear note if the condition worsens or spreads.'
    : 'Manager approval is required before treatment or large operational changes.';

  return `${recommendation}\n\n${closure}`;
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
  const [aiOpen, setAiOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiState>(emptyState);
  const [fieldNote, setFieldNote] = useState('Fed Pond 3. Fish appetite was strong. No dead fish. Water level normal.');
  const [selectedPondId, setSelectedPondId] = useState<string | null>(null);
  const [selectedPond, setSelectedPond] = useState<any | null>(null);
  const [selectedPondSummary, setSelectedPondSummary] = useState<any | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pondLogForm, setPondLogForm] = useState({
    feedKg: '',
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
  });
  const [newPond, setNewPond] = useState({
    siteName: '',
    number: '',
    species: 'CATFISH',
    capacity: '',
    initialPopulation: '',
    stockedAt: '',
    initialAvgWeightG: '',
    targetHarvestKg: '',
    assignedUserId: '',
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
  });

  const isOwner = currentUser?.role === 'OWNER';
  const canViewFinance = hasPermission(currentUser?.role, 'FINANCE_VIEW');
  const canViewInventory = hasPermission(currentUser?.role, 'INVENTORY_VIEW');
  const navItems = isOwner ? ownerNav : workerNav;

  const readQueuedSyncEntries = useCallback(() => {
    if (typeof window === 'undefined') return [] as Array<Record<string, any>>;
    try {
      return JSON.parse(localStorage.getItem('aquasphere-sync-queue') || '[]');
    } catch {
      return [] as Array<Record<string, any>>;
    }
  }, []);

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
    localStorage.setItem('aquasphere-sync-queue', JSON.stringify([...entries, nextEntry]));
    setPendingSyncCount([...entries, nextEntry].length);
  }, [readQueuedSyncEntries]);

  const generateAiSuggestionText = useCallback(async () => {
    if (!token || !fieldNote.trim()) {
      setAiSuggestion(buildAiSuggestion(fieldNote));
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/ai/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: fieldNote }),
      });

      if (response.ok) {
        const body = await response.json();
        setAiSuggestion(body.suggestion || buildAiSuggestion(fieldNote));
        return;
      }

      setAiSuggestion(buildAiSuggestion(fieldNote));
    } catch (error) {
      console.error('AI suggestion failed', error);
      setAiSuggestion(buildAiSuggestion(fieldNote));
    } finally {
      setAiLoading(false);
    }
  }, [apiBaseUrl, fieldNote, token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [farmsRes, pondsRes, feedingsRes, waterRes, mortalityRes, inventoryRes, tasksRes, financeRes, aiRes, notificationsRes] = await Promise.all([
      fetch(`${apiBaseUrl}/farms`, { headers }),
      fetch(`${apiBaseUrl}/ponds`, { headers }),
      fetch(`${apiBaseUrl}/feedings`, { headers }),
      fetch(`${apiBaseUrl}/water-quality`, { headers }),
      fetch(`${apiBaseUrl}/mortality`, { headers }),
      fetch(`${apiBaseUrl}/inventory`, { headers }),
      fetch(`${apiBaseUrl}/tasks`, { headers }),
      fetch(`${apiBaseUrl}/finance`, { headers }),
      fetch(`${apiBaseUrl}/ai/reports`, { headers }),
      fetch(`${apiBaseUrl}/notifications`, { headers }),
    ]);

    const next = { ...emptyState };
    if (farmsRes.ok) next.farms = (await farmsRes.json()).farms || [];
    if (pondsRes.ok) next.ponds = (await pondsRes.json()).ponds || [];
    if (feedingsRes.ok) next.feedings = (await feedingsRes.json()).feedings || [];
    if (waterRes.ok) next.waterLogs = (await waterRes.json()).waterLogs || [];
    if (mortalityRes.ok) next.mortalityLogs = (await mortalityRes.json()).mortalityLogs || [];
    if (inventoryRes.ok) next.inventoryItems = (await inventoryRes.json()).items || [];
    if (tasksRes.ok) next.tasks = (await tasksRes.json()).tasks || [];
    if (financeRes.ok) {
      const finance = await financeRes.json();
      next.finance = finance.dashboard || null;
      next.financeRecords = finance.records || [];
    }
    if (aiRes.ok) next.aiReports = (await aiRes.json()).reports || [];
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
        Authorization: `Bearer ${token}`,
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
          Authorization: `Bearer ${token}`,
        },
      });
      if (flushResponse.ok) {
        localStorage.removeItem('aquasphere-sync-queue');
        setPendingSyncCount(0);
        await loadData();
      }
    }
  }, [apiBaseUrl, loadData, readQueuedSyncEntries, token]);

  useEffect(() => {
    loadData().catch((err) => console.error('Failed to load AquaSphere data', err));
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

    const payload = {
      pondId: selectedPondId,
      feedKg: pondLogForm.feedKg,
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
    };

    if (!navigator.onLine) {
      queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      setPondLogForm({ feedKg: '', appetite: '5', behavior: 'Normal', ph: '', dissolvedO2: '', ammonia: '', waterAddedPercent: '', waterRemovedPercent: '', waterComment: '', mortality: '0', mortalityCause: '' });
      return;
    }

    const headers = { 'Content-Type': 'application/json', Authorization: `****** };
    const calls: Promise<Response>[] = [];

    if (Number(pondLogForm.feedKg) > 0) {
      calls.push(fetch(`${apiBaseUrl}/feedings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          quantityKg: Number(pondLogForm.feedKg),
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

    try {
      const settled = await Promise.allSettled(calls);
      const failures = settled.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        console.error('Some pond update calls failed, queuing for sync', failures);
        queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      } else {
        setPondLogForm({ feedKg: '', appetite: '5', behavior: 'Normal', ph: '', dissolvedO2: '', ammonia: '', waterAddedPercent: '', waterRemovedPercent: '', waterComment: '', mortality: '0', mortalityCause: '' });
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
    const response = await fetch(`${apiBaseUrl}/ponds/${pondId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const body = await response.json();
    setSelectedPond(body.pond);
    setSelectedPondSummary(body.summary);
  }

  async function handleCreatePond(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;
    const assignedUserId = newPond.assignedUserId || workers[0]?.id || undefined;
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
        assignedUserId,
      }, 'pond');
      return;
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
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
        assignedUserId,
      }),
    });
    if (pondRes.ok) {
      setNewPond({ siteName: '', number: '', species: 'CATFISH', capacity: '', initialPopulation: '', stockedAt: '', initialAvgWeightG: '', targetHarvestKg: '', assignedUserId: '' });
      await loadData();
    }
  }

  async function deletePond(pondId: string) {
    if (!token || !isOwner) return;
    const response = await fetch(`${apiBaseUrl}/ponds/${pondId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      if (selectedPondId === pondId) {
        setSelectedPondId(null);
        setSelectedPond(null);
        setSelectedPondSummary(null);
      }
      await loadData();
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  async function deleteFinanceRecord(id: string) {
    if (!token || !isOwner) return;
    const response = await fetch(`${apiBaseUrl}/finance/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) await loadData();
  }

  async function handleCreateInventoryItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isOwner) return;
    const response = await fetch(`${apiBaseUrl}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: inventoryForm.name,
        category: inventoryForm.category,
        unit: inventoryForm.unit,
        currentStock: Number(inventoryForm.currentStock) || 0,
        minStock: Number(inventoryForm.minStock) || 0,
      }),
    });
    if (response.ok) {
      setInventoryForm({ name: '', category: '', unit: '', currentStock: '', minStock: '' });
      await loadData();
    }
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

    if (!navigator.onLine) {
      const payload = {
        pondId: selectedPondId,
        feedKg: pondLogForm.feedKg,
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
      };
      queueOfflineSyncEntry('pond_update', payload, 'pond_daily_log', selectedPondId);
      setPondLogForm({ feedKg: '', appetite: '5', behavior: 'Normal', ph: '', dissolvedO2: '', ammonia: '', waterAddedPercent: '', waterRemovedPercent: '', waterComment: '', mortality: '0', mortalityCause: '' });
      return;
    }

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const calls: Promise<Response>[] = [];

    if (Number(pondLogForm.feedKg) > 0) {
      calls.push(fetch(`${apiBaseUrl}/feedings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pondId: selectedPondId,
          quantityKg: Number(pondLogForm.feedKg),
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
      setPondLogForm({ feedKg: '', appetite: '5', behavior: 'Normal', ph: '', dissolvedO2: '', ammonia: '', waterAddedPercent: '', waterRemovedPercent: '', waterComment: '', mortality: '0', mortalityCause: '' });
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
              <h1>AquaSphere</h1>
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

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
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
            <h2>AquaSphere</h2>
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
            <button className="icon-btn" aria-label="Notifications"><Bell size={18} /><span>{data.notifications.filter((item) => !item.read).length}</span></button>
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
                  <><strong>{record.title}</strong><span>{titleCase(record.status || 'OPEN')}</span></>
                )} />
              </Panel>
              <Panel eyebrow="AI recommendation" title="Immediate action">
                <div className="insight-callout">
                  <BrainCircuit size={28} />
                  <p>Pond records now combine feeding, mortality, water quality, and harvest timing so the owner can inspect each pond without calling workers.</p>
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
                  <select value={newPond.assignedUserId} onChange={(event) => setNewPond({ ...newPond, assignedUserId: event.target.value })}>
                    <option value="">Assign worker (optional)</option>
                    {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name || worker.email}</option>)}
                  </select>
                  <input placeholder="Initial fish" value={newPond.initialPopulation} onChange={(event) => setNewPond({ ...newPond, initialPopulation: event.target.value })} />
                  <input type="date" value={newPond.stockedAt} onChange={(event) => setNewPond({ ...newPond, stockedAt: event.target.value })} />
                  <input placeholder="Initial avg g" value={newPond.initialAvgWeightG} onChange={(event) => setNewPond({ ...newPond, initialAvgWeightG: event.target.value })} />
                  <input placeholder="Target kg" value={newPond.targetHarvestKg} onChange={(event) => setNewPond({ ...newPond, targetHarvestKg: event.target.value })} />
                  <button className="primary-btn" type="submit"><Plus size={16} />Create pond</button>
                </form>
              ) : <p className="empty-copy">Workers cannot create ponds. You only see ponds assigned to you.</p>}
              <div className="pond-grid">
                {data.ponds.map((pond) => (
                  <button className="pond-card pond-button" key={pond.id} onClick={() => openPond(pond.id)}>
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
                            deletePond(pond.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.stopPropagation();
                              deletePond(pond.id);
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
            <PondSummaryPanel pond={selectedPond} summary={selectedPondSummary} isOwner={isOwner} form={pondLogForm} onFormChange={setPondLogForm} onSubmit={handleWorkerPondLogEnhanced} />
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
            <section className="dashboard-grid wide-left">
              <Panel eyebrow="Finance ledger" title="Excel-style records">
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
                <FinanceTable records={data.financeRecords} onDelete={deleteFinanceRecord} />
              </Panel>
              <Panel eyebrow="Analysis" title="Finance status">
                <div className="analysis-card">
                  <strong>{overview.finance.status === 'PROFIT' ? 'Running on profit' : 'Running at a loss'}</strong>
                  <p>Income is {formatDalasi(overview.finance.income)} and expenses are {formatDalasi(overview.finance.expenses)}. Net position is {formatDalasi(overview.finance.profit)}.</p>
                </div>
              </Panel>
            </section>
          </>
        ) : null}

        {activeNav === 'inventory' && isOwner ? (
          <section className="dashboard-grid">
            <Panel eyebrow="Inventory" title="Stock levels">
              <form className="compact-form" onSubmit={handleCreateInventoryItem}>
                <input placeholder="Item name" value={inventoryForm.name} onChange={(event) => setInventoryForm({ ...inventoryForm, name: event.target.value })} required />
                <input placeholder="Category" value={inventoryForm.category} onChange={(event) => setInventoryForm({ ...inventoryForm, category: event.target.value })} required />
                <input placeholder="Unit" value={inventoryForm.unit} onChange={(event) => setInventoryForm({ ...inventoryForm, unit: event.target.value })} required />
                <input placeholder="Current stock" type="number" value={inventoryForm.currentStock} onChange={(event) => setInventoryForm({ ...inventoryForm, currentStock: event.target.value })} />
                <input placeholder="Min stock" type="number" value={inventoryForm.minStock} onChange={(event) => setInventoryForm({ ...inventoryForm, minStock: event.target.value })} />
                <button className="primary-btn" type="submit"><Plus size={16} />Add stock item</button>
              </form>
              <RecordList records={data.inventoryItems} emptyTitle="No inventory items yet" render={(item) => <><strong>{item.name}</strong><span>{item.currentStock} {item.unit} | minimum {item.minStock}</span></>} />
            </Panel>
            <Panel eyebrow="Alerting" title="Low stock monitor">
              <div className="analysis-card"><strong>{overview.lowStock} low-stock item(s)</strong><p>Inventory costs remain in finance. Workers cannot see inventory cost data.</p></div>
            </Panel>
          </section>
        ) : null}

        {activeNav === 'ai' ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow="AI assistant" title="Observation wording and guidance">
              <textarea className="field-note" value={fieldNote} onChange={(event) => setFieldNote(event.target.value)} />
              <div className="ai-actions">
                <button type="button" className="primary-btn" onClick={generateAiSuggestionText} disabled={aiLoading}> {aiLoading ? 'Generating...' : 'Generate AI suggestion'} </button>
              </div>
              <pre className="ai-output">{aiSuggestion || buildAiSuggestion(fieldNote)}</pre>
            </Panel>
            <Panel eyebrow="AI history" title="Stored reports">
              <RecordList records={data.aiReports} emptyTitle="No AI reports yet" render={(item) => <><strong>{item.title || 'AI summary'}</strong><span>{new Date(item.createdAt).toLocaleDateString()}</span></>} />
            </Panel>
          </section>
        ) : null}
      </main>

     {aiOpen ? (
       <div className="floating-ai-panel">
         <div className="floating-ai-header">
           <div>
             <p className="eyebrow">AI Assistant</p>
             <strong>Field guidance</strong>
           </div>
           <button type="button" className="collapse-btn" onClick={() => setAiOpen(false)} aria-label="Collapse AI panel">
             ×
           </button>
         </div>
         <textarea className="field-note floating-note" value={fieldNote} onChange={(event) => setFieldNote(event.target.value)} />
         <div className="ai-actions">
           <button type="button" className="primary-btn" onClick={generateAiSuggestionText} disabled={aiLoading}>{aiLoading ? 'Generating...' : 'Generate'}</button>
         </div>
         <pre className="ai-output">{aiSuggestion || buildAiSuggestion(fieldNote)}</pre>
       </div>
     ) : (
       <button type="button" className="floating-ai-toggle" onClick={() => setAiOpen(true)} aria-label="Open AI panel">
         <BrainCircuit size={18} />
         <span>AI</span>
       </button>
     )}
    </div>
  );
}

function PondSummaryPanel({
  pond,
  summary,
  isOwner,
  form,
  onFormChange,
  onSubmit,
}: {
  pond: any | null;
  summary: any | null;
  isOwner: boolean;
  form: {
    feedKg: string;
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
  };
  onFormChange: (form: any) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  if (!pond || !summary) {
    return (
      <Panel eyebrow="Pond inspection" title="Select a pond">
        <p className="empty-copy">Click a pond to see today's feed, mortality, pH, water movement, behavior, worker update, and harvest timing.</p>
      </Panel>
    );
  }

  return (
    <Panel eyebrow={`Pond ${pond.number}`} title={isOwner ? 'Owner inspection view' : 'Worker pond update'}>
      <div className="pond-detail">
        <Fish size={34} />
        <div><span>Fed today</span><strong>{summary.fedToday ? `${summary.todayFeedKg} kg` : 'No'}</strong></div>
        <div><span>Mortality today</span><strong>{summary.todayMortality}</strong></div>
        <div><span>Fish behavior</span><strong>{summary.reactive === null ? 'No feed note' : summary.reactive ? 'Reactive' : 'Not reactive'}</strong></div>
        <div><span>pH</span><strong>{summary.ph ?? 'Not recorded'}</strong></div>
        <div><span>Water added</span><strong>{summary.waterAddedPercent ?? 0}%</strong></div>
        <div><span>Water removed</span><strong>{summary.waterRemovedPercent ?? 0}%</strong></div>
        <div><span>Water issue</span><strong>{summary.waterIssue ? 'Needs review' : 'Normal'}</strong></div>
        <div><span>Updated by</span><strong>{summary.lastUpdatedBy?.name || 'No update today'}</strong></div>
        <div><span>Harvest target</span><strong>{summary.harvest ? `${summary.harvest.targetWeightKg} kg` : 'Not planned'}</strong></div>
        <div><span>Harvest date</span><strong>{summary.harvest ? new Date(summary.harvest.expectedHarvestDate).toLocaleDateString() : 'Missing data'}</strong></div>
        <div><span>Growth progress</span><strong>{summary.harvest ? `${summary.harvest.progressPercent}%` : 'Missing data'}</strong></div>
      </div>
      {!isOwner ? (
        <form className="worker-log-form" onSubmit={onSubmit}>
          <input placeholder="Feed used kg" value={form.feedKg} onChange={(event) => onFormChange({ ...form, feedKg: event.target.value })} />
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
              <td><button className="danger-icon" onClick={() => onDelete(record.id)} aria-label="Delete finance record"><Trash2 size={15} /></button></td>
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

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="panel">
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
