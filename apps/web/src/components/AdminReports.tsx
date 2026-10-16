import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, FileText, Fish, Package, Printer, Users, Wallet, ClipboardList, Activity } from 'lucide-react';

type ReportCategory = 'ponds' | 'finance' | 'users' | 'performance' | 'my-performance' | 'inventory' | 'task-history';
type ReportColumn = {
  key: string;
  label: string;
  value: (row: any) => string | number | null | undefined;
  render?: (row: any) => ReactNode;
};
type ReportFilter = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

const reportCategories: Array<{ id: ReportCategory; label: string; icon: typeof Fish }> = [
  { id: 'ponds', label: 'Ponds', icon: Fish },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'performance', label: 'Performance', icon: Activity },
  { id: 'my-performance', label: 'My Performance', icon: Activity },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'task-history', label: 'Task History', icon: ClipboardList },
];

const dateRangeOptions = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

function reportIdFromPath() {
  const match = window.location.pathname.match(/^\/(?:admin\/)?reports\/(ponds|finance|users|performance|my-performance|inventory|task-history)\/?$/);
  return (match?.[1] as ReportCategory | undefined) || null;
}

function formatDate(value: unknown, includeTime = false) {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

function formatMoney(value: unknown) {
  return `D${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function asText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(asText).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(asText).join(' ');
  return String(value);
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isNearSearchWord(term: string, word: string) {
  if (term.length < 5 || Math.abs(term.length - word.length) > 1) return false;
  let termIndex = 0;
  let wordIndex = 0;
  let edits = 0;
  while (termIndex < term.length && wordIndex < word.length) {
    if (term[termIndex] === word[wordIndex]) {
      termIndex += 1;
      wordIndex += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (term.length > word.length) termIndex += 1;
      else if (word.length > term.length) wordIndex += 1;
      else {
        termIndex += 1;
        wordIndex += 1;
      }
    }
  }
  return edits + (termIndex < term.length || wordIndex < word.length ? 1 : 0) <= 1;
}

function dateInRange(value: unknown, range: string, from: string, to: string) {
  if (range === 'all') return true;
  if (!value) return false;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (range === 'today') return date.toDateString() === now.toDateString();
  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    const start = new Date();
    start.setDate(now.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return date >= start && date <= now;
  }
  if (range === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (range === 'custom') {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }
  return true;
}

function exportExcel(title: string, columns: ReportColumn[], rows: any[]) {
  const escape = (value: unknown) => asText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cellValue = (column: ReportColumn, row: any) => {
    const value = column.value(row);
    return /(date|time|At$|login)/i.test(column.key) && value != null ? formatDate(value, true) : value;
  };
  const table = `<table><thead><tr>${columns.map((column) => `<th>${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escape(cellValue(column, row))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const workbook = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>${escape(title)}</h2>${table}</body></html>`;
  const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `aquaculture-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportDataTable({
  title,
  totalLabel,
  rows,
  columns,
  filters,
  dateField,
  initialFilters,
  pondReport = false,
  requiredColumns = [],
  compactFilters = false,
  loading,
  error,
}: {
  title: string;
  totalLabel: string;
  rows: any[];
  columns: ReportColumn[];
  filters: ReportFilter[];
  dateField?: string;
  initialFilters?: Record<string, string>;
  pondReport?: boolean;
  requiredColumns?: string[];
  compactFilters?: boolean;
  loading: boolean;
  error?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>(() => initialFilters || {});
  const [dateRange, setDateRange] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState(dateField && columns.some((column) => column.key === dateField) ? dateField : columns[0]?.key || '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilterKey, setColumnFilterKey] = useState('');
  const [columnFilterValue, setColumnFilterValue] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const identifierColumn = columns.find((column) => column.key === (pondReport ? 'pondNumber' : columns[0]?.key));
  const dateColumn = dateField ? columns.find((column) => column.key === dateField) : undefined;
  const shownColumns = columnFilterKey
    ? [...new Map([identifierColumn, dateColumn, ...requiredColumns.map((key) => columns.find((column) => column.key === key)), columns.find((column) => column.key === columnFilterKey)]
      .filter((column): column is ReportColumn => Boolean(column))
      .map((column) => [column.key, column])).values()]
    : columns;
  const displayedValue = (column: ReportColumn, row: any) => {
    const value = column.value(row);
    return column.key === dateField && value != null ? formatDate(value, true) : asText(value);
  };

  const filteredRows = useMemo(() => {
    const searchTerms = normalizeSearchText(search).split(/\s+/).filter(Boolean);
    const filtered = rows.filter((row) => {
      if (searchTerms.length) {
        const renderedDates = dateField ? columns.filter((column) => column.key === dateField).map((column) => formatDate(column.value(row), true)).join(' ') : '';
        const rowText = normalizeSearchText(`${asText(row)} ${columns.map((column) => asText(column.value(row))).join(' ')} ${renderedDates}`);
        const compactRowText = rowText.replace(/\s/g, '');
        const rowWords = rowText.split(/\s+/);
        if (!searchTerms.every((term) => rowText.includes(term) || compactRowText.includes(term) || rowWords.some((word) => isNearSearchWord(term, word)))) return false;
      }
      if (dateField && !dateInRange(row[dateField], dateRange, dateFrom, dateTo)) return false;
      if (columnFilterKey && columnFilterValue) {
        const filterColumn = columns.find((column) => column.key === columnFilterKey);
        if (!filterColumn || displayedValue(filterColumn, row) !== columnFilterValue) return false;
      }
      return Object.entries(selectedFilters).every(([key, selected]) => {
        if (!selected) return true;
        const rowValue = row[key];
        return Array.isArray(rowValue) ? rowValue.map(String).includes(selected) : String(rowValue ?? '') === selected;
      });
    });
    const column = columns.find((item) => item.key === sortKey);
    if (column) filtered.sort((left, right) => {
      const a = column.value(left);
      const b = column.value(right);
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : asText(a).localeCompare(asText(b), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [columnFilterKey, columnFilterValue, columns, dateField, dateFrom, dateRange, dateTo, filters, rows, search, selectedFilters, sortDirection, sortKey]);
  const columnFilterOptions = useMemo(() => {
    const selectedColumn = columns.find((column) => column.key === columnFilterKey);
    if (!selectedColumn) return [];
    const values = new Map<string, string>();
    rows.forEach((row) => {
      const value = displayedValue(selectedColumn, row).trim();
      if (value && value !== '—' && !values.has(value)) values.set(value, value);
    });
    return [...values.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [columnFilterKey, columns, dateField, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const activeColumnFilter = columns.find((column) => column.key === columnFilterKey);

  useEffect(() => setPage(0), [search, selectedFilters, dateRange, dateFrom, dateTo, columnFilterKey, columnFilterValue]);
  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };
  const table = (tableRows: any[], print = false) => (
    <div className={`admin-report-table-scroll${print ? ' admin-report-print-table' : ''}`}>
      <table className="admin-report-table">
        <thead>
          <tr>{shownColumns.map((column) => (
            <th key={column.key}>
              <button type="button" className="report-sort-header" onClick={() => toggleSort(column.key)}>
                {column.label}
                {sortKey === column.key ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}
              </button>
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {tableRows.map((row, index) => (
            <tr key={String(row.id || `${index}-${asText(row)}`)}>
              {shownColumns.map((column) => <td key={column.key}>{column.render ? column.render(row) : asText(column.value(row)) || '—'}</td>)}
            </tr>
          ))}
          {!print && !tableRows.length && !loading && !error ? <tr><td colSpan={shownColumns.length} className="admin-report-empty">No records match the current search and filters.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="admin-report-table-card">
      <div className="admin-report-table-heading">
        <div><h3>{title}</h3><p>Total {totalLabel}: {rows.length} <span>·</span> Showing: {filteredRows.length}</p></div>
        <div className="admin-report-actions">
          <button type="button" className="secondary-btn" onClick={() => window.print()}><Printer size={16} />Print / PDF</button>
          <button type="button" className="primary-btn" onClick={() => exportExcel(title, shownColumns, filteredRows)} disabled={!filteredRows.length}><Download size={16} />Excel</button>
        </div>
      </div>
      <div className="admin-report-filters">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={pondReport ? 'Search pond updates...' : 'Search all columns...'} aria-label={`Search ${title}`} />
        {filters.map((filter) => (
          <label key={filter.key}>
            <span className="sr-only">{filter.label}</span>
            <select value={selectedFilters[filter.key] || ''} onChange={(event) => setSelectedFilters((current) => ({ ...current, [filter.key]: event.target.value }))}>
              <option value="">{pondReport && filter.label === 'Pond' ? 'All ponds' : `All ${filter.label}`}</option>
              {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ))}
        <label>
          <span className="sr-only">Filter by column</span>
          <select value={columnFilterKey} onChange={(event) => { setColumnFilterKey(event.target.value); setColumnFilterValue(''); }}>
            <option value="">All columns</option>
            {columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
        </label>
        {columnFilterKey ? (
          <label>
            <span className="sr-only">{activeColumnFilter ? `Filter ${activeColumnFilter.label} by value` : 'Column filter value'}</span>
            <select value={columnFilterValue} onChange={(event) => setColumnFilterValue(event.target.value)}>
              <option value="">{activeColumnFilter ? `All ${activeColumnFilter.label}` : 'All values'}</option>
              {columnFilterOptions.map((option) => <option key={option.value} value={option.value}>{activeColumnFilter ? `${activeColumnFilter.label}: ${option.label}` : option.label}</option>)}
            </select>
          </label>
        ) : null}
        {dateField && !compactFilters ? (
          <>
            <label>
              <span className="sr-only">Date range</span>
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                {dateRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {dateRange === 'custom' ? <>
              <input aria-label="Start date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <input aria-label="End date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </> : null}
          </>
        ) : null}
        {!compactFilters ? <label className="report-sort-select">
          <span>Sort by</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
            {columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
        </label> : null}
      </div>
      {activeColumnFilter && columnFilterValue ? (
        <p className="admin-report-active-filter">Filtering {activeColumnFilter.label}: {columnFilterValue}</p>
      ) : null}
      {loading ? <div className="admin-report-skeleton" aria-label="Loading report"><span /><span /><span /><span /><span /></div> : null}
      {error ? <div className="admin-report-error" role="alert">{error}</div> : null}
      {!loading && !error ? table(pageRows) : null}
      {!loading && !error ? table(filteredRows, true) : null}
      <div className="admin-report-pagination">
        <span>Page {page + 1} of {pageCount}</span>
        <div>
          <button type="button" className="secondary-btn" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <button type="button" className="secondary-btn" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}

function makeOptions(rows: any[], key: (row: any) => unknown, label: (row: any) => string) {
  const options = new Map<string, string>();
  rows.forEach((row) => {
    const value = String(key(row) ?? '');
    if (value && !options.has(value)) options.set(value, label(row));
  });
  return [...options.entries()].map(([value, optionLabel]) => ({ value, label: optionLabel }));
}

export function AdminReports({
  data,
  users,
  loading,
  error,
  isAdmin,
  currentUser,
}: {
  data: any;
  users: any[];
  loading: boolean;
  error?: string | null;
  isAdmin: boolean;
  currentUser: any;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(reportIdFromPath());

  useEffect(() => {
    const updateRoute = () => setCategory(reportIdFromPath());
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  const selectCategory = (next: ReportCategory | null) => {
    const basePath = isAdmin ? '/admin/reports' : '/reports';
    const path = next ? `${basePath}/${next}` : basePath;
    window.history.pushState({}, '', path);
    setCategory(next);
  };
  const ponds = data.ponds || [];
  const pondLabel = (id: string) => {
    const pond = ponds.find((item: any) => item.id === id);
    return pond ? `Pond ${pond.number}` : '—';
  };
  const latest = (items: any[], dateKey: string) => [...items].sort((a, b) => new Date(b[dateKey] || 0).getTime() - new Date(a[dateKey] || 0).getTime())[0];
  const feedByPond = (pondId: string) => (data.feedings || []).filter((item: any) => item.pondId === pondId).reduce((sum: number, item: any) => sum + Number(item.quantityKg || 0), 0);
  const mortalityByPond = (pondId: string) => (data.mortalityLogs || []).filter((item: any) => item.pondId === pondId).reduce((sum: number, item: any) => sum + Number(item.numberDead || 0), 0);
  const harvestByPond = (pondId: string) => (data.harvests || []).filter((item: any) => item.pondId === pondId).reduce((sum: number, item: any) => sum + Number(item.numberHarvested || 0), 0);
  const userLabel = (user: any) => user?.name || user?.email || 'Unknown';

  const financeRows = useMemo(() => {
    let balance = 0;
    return [...(data.financeRecords || [])].sort((a: any, b: any) => new Date(a.recordedAt || 0).getTime() - new Date(b.recordedAt || 0).getTime()).map((item: any) => {
      const isIncome = item.type === 'SALES' || item.type === 'INCOME';
      const amount = Number(item.amount || 0);
      balance += isIncome ? amount : -amount;
      const transactionType = item.type === 'SALES' ? 'Sales' : item.type === 'FIXED_COST' ? 'Fixed Cost' : 'Running Cost';
      return { ...item, dateValue: item.recordedAt, pondLabel: pondLabel(item.pondId), categoryLabel: item.category || item.type, transactionType, transactionTypeCode: item.type, income: isIncome ? amount : 0, expense: isIncome ? 0 : amount, balance };
    });
  }, [data.financeRecords, ponds]);

  const usersRows = useMemo(() => {
    const deduped = new Map<string, any>();
    [...users, ...((data.farms || []).flatMap((farm: any) => farm.members || []))].forEach((user: any) => {
      const id = String(user.id || user.email || '');
      if (id && !deduped.has(id)) deduped.set(id, user);
    });
    return [...deduped.values()].map((user: any) => {
      const assignedPonds = ponds.filter((pond: any) => pond.assignedUserId === user.id);
      const assignedTasks = (data.tasks || []).filter((task: any) => task.assignees?.some((assignment: any) => assignment.userId === user.id || assignment.user?.id === user.id));
      const completed = assignedTasks.filter((task: any) => task.status === 'COMPLETED').length;
      const pending = assignedTasks.filter((task: any) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length;
      return {
        ...user,
        nameValue: userLabel(user),
        roleLabel: user.role?.name || user.role || '—',
        blocked: Boolean(user.blocked),
        pondsAssigned: assignedPonds.length,
        assignedPondIds: assignedPonds.map((pond: any) => pond.id),
        tasksCompleted: completed,
        tasksPending: pending,
        performance: assignedTasks.length ? Math.round(completed / assignedTasks.length * 100) : 0,
        lastLogin: user.lastLogin || null,
      };
    });
  }, [data.farms, data.tasks, ponds, users]);

  const growthMeasurements = useMemo(() => data.growthMeasurements || ponds.flatMap((pond: any) => pond.growthMeasurements || []), [data.growthMeasurements, ponds]);
  const performanceRows = useMemo(() => ponds.map((pond: any) => {
    const growth = [...growthMeasurements].filter((item: any) => item.pondId === pond.id).sort((a: any, b: any) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
    const first = growth[0];
    const last = growth[growth.length - 1];
    const dayDiff = first && last ? Math.max(0, (new Date(last.measuredAt).getTime() - new Date(first.measuredAt).getTime()) / 86400000) : 0;
    const growthRate = dayDiff > 0 ? (Number(last.avgWeightGrams) - Number(first.avgWeightGrams)) / dayDiff : null;
    const initialStock = Number(pond.initial_population || 0);
    const currentStock = Number(pond.current_population ?? Math.max(0, initialStock - mortalityByPond(pond.id) - harvestByPond(pond.id)));
    const weight = last?.avgWeightGrams ?? pond.initialAvgWeightG;
    const biomassNow = Number(weight || 0) * currentStock / 1000;
    const biomassStart = Number(pond.initialAvgWeightG || 0) * initialStock / 1000;
    const feedUsed = feedByPond(pond.id);
    const fcr = biomassNow > biomassStart ? feedUsed / (biomassNow - biomassStart) : null;
    const harvestLogs = (data.harvests || []).filter((item: any) => item.pondId === pond.id);
    return {
      ...pond,
      pondName: `Pond ${pond.number}`,
      initialStock,
      currentStock,
      mortalityCount: mortalityByPond(pond.id),
      growthRate,
      fcr,
      harvestWeight: harvestLogs.reduce((sum: number, item: any) => sum + Number(item.biomassKg ?? (Number(item.avgWeightGrams || 0) * Number(item.numberHarvested || 0) / 1000)), 0),
      harvestDate: latest(harvestLogs, 'recordedAt')?.recordedAt,
      survival: initialStock > 0 ? currentStock / initialStock * 100 : null,
      growth,
    };
  }), [data.feedings, data.harvests, data.mortalityLogs, ponds, growthMeasurements]);

  const inventoryRows = useMemo(() => (data.inventoryItems || []).map((item: any) => {
    const transactions = item.transactions || [];
    const quantityIn = transactions.filter((transaction: any) => Number(transaction.change) > 0).reduce((sum: number, transaction: any) => sum + Number(transaction.change), 0);
    const quantityUsed = transactions.filter((transaction: any) => Number(transaction.change) < 0).reduce((sum: number, transaction: any) => sum + Math.abs(Number(transaction.change)), 0);
    const lastRestocked = latest(transactions.filter((transaction: any) => Number(transaction.change) > 0), 'createdAt')?.createdAt;
    return {
      ...item,
      categoryLabel: item.category || '—',
      quantityIn,
      quantityUsed,
      balance: Number(item.currentStock || 0),
      costPerUnit: null,
      lastRestocked,
      stockStatus: Number(item.currentStock || 0) <= 0 ? 'Out of stock' : Number(item.currentStock || 0) <= Number(item.minStock || 0) ? 'Low stock' : 'In stock',
    };
  }), [data.inventoryItems]);

  const taskRows = useMemo(() => (data.tasks || []).map((task: any) => {
    const assignedTo = (task.assignees || []).map((assignment: any) => userLabel(assignment.user)).join(', ');
    const pondMatch = ponds.find((pond: any) => new RegExp(`\\bpond\\s*#?${pond.number}\\b`, 'i').test(`${task.title || ''} ${task.description || ''}`));
    const status = task.status === 'COMPLETED' ? 'Done' : task.status === 'CANCELLED' ? 'Cancelled' : task.status === 'BLOCKED' ? 'Blocked' : task.dueAt && new Date(task.dueAt).getTime() < Date.now() ? 'Late' : 'Pending';
    const normalizedTitle = String(task.title || '').toLowerCase();
    const taskType = ['feeding', 'cleaning', 'water check', 'medication'].find((type) => normalizedTitle.includes(type)) || 'Other';
    return {
      ...task,
      dateValue: task.createdAt,
      pondId: pondMatch?.id || '',
      pondName: pondMatch ? `Pond ${pondMatch.number}` : '—',
      taskType,
      assignedTo,
      completedBy: '—',
      scheduledTime: task.dueAt,
      completedTime: task.completedAt || null,
      statusLabel: status,
      notes: task.description || '',
      userIds: (task.assignees || []).map((assignment: any) => assignment.userId || assignment.user?.id),
      taskTitle: task.title || '',
    };
  }), [data.tasks, ponds]);

  const allPondHistoryRows = useMemo(() => {
    const records: Array<{ id: string; pondId: string; pondNumber: number; date: number; user: string; kind: string; values: Record<string, string> }> = [];
    const appetite = (value: number | null | undefined) => value == null ? '' : ({ 5: 'Excellent', 4: 'Good', 3: 'Fair', 2: 'Poor', 1: 'Very poor' } as Record<number, string>)[value] || String(value);
    const add = (pond: any, item: any, kind: string, dateValue: unknown, values: Record<string, string>) => {
      if (!dateValue) return;
      const date = new Date(String(dateValue)).getTime();
      if (Number.isNaN(date)) return;
      records.push({ id: `${kind}-${item?.id || date}`, pondId: pond.id, pondNumber: pond.number, date, user: userLabel(item?.worker), kind, values });
    };
    ponds.forEach((pond: any) => {
      const stockedAt = pond.stockedAt || pond.createdAt;
      if (stockedAt) add(pond, { id: `${pond.id}-stocked` }, 'Stocking', stockedAt, { note: `${pond.initial_population || 0} fish stocked` });
      (data.feedings || []).filter((item: any) => item.pondId === pond.id).forEach((item: any) => add(pond, item, 'Feeding', item.date, {
        feedItem: item.feedType || item.feedBrand || '',
        feedAmount: item.quantityKg == null ? '' : `${Number(item.quantityKg) * 1000} g`,
        feedSize: item.feedSize || '',
        appetite: appetite(item.appetite),
        behavior: item.observation || '',
      }));
      (data.waterLogs || []).filter((item: any) => item.pondId === pond.id).forEach((item: any) => add(pond, item, 'Water check', item.measuredAt, {
        ph: item.ph == null ? '' : String(item.ph),
        ammonia: item.ammonia == null ? '' : String(item.ammonia),
        note: item.comment || '',
      }));
      (data.mortalityLogs || []).filter((item: any) => item.pondId === pond.id).forEach((item: any) => add(pond, item, 'Mortality', item.observedAt, {
        mortality: item.numberDead == null ? '' : String(item.numberDead),
        mortalityCause: item.possibleCause || '',
      }));
      (pond.growthMeasurements || []).forEach((item: any) => add(pond, item, 'Growth', item.measuredAt, {
        averageWeight: item.avgWeightGrams == null ? '' : String(item.avgWeightGrams),
        note: item.comment || '',
      }));
      (data.harvests || []).filter((item: any) => item.pondId === pond.id).forEach((item: any) => add(pond, item, 'Harvest', item.recordedAt, {
        averageWeight: item.avgWeightGrams == null ? '' : String(item.avgWeightGrams),
        note: `${item.numberHarvested || 0} fish harvested${item.method ? ` · ${item.method}` : ''}`,
      }));
    });

    const grouped: Array<{ id: string; pondId: string; pondNumber: number; date: number; user: string; kinds: Set<string>; values: Record<string, string> }> = [];
    records.sort((left, right) => left.date - right.date).forEach((record) => {
      const row = [...grouped].reverse().find((entry) =>
        entry.pondId === record.pondId
        && record.date - entry.date <= 120000
        && !entry.kinds.has(record.kind)
        && (entry.user === record.user || entry.user === 'Unknown' || record.user === 'Unknown')
      );
      if (row) {
        row.date = Math.max(row.date, record.date);
        row.kinds.add(record.kind);
        row.values = { ...row.values, ...Object.fromEntries(Object.entries(record.values).filter(([, value]) => value)) };
        if (row.user === 'Unknown') row.user = record.user;
      } else {
        grouped.push({ id: record.id, pondId: record.pondId, pondNumber: record.pondNumber, date: record.date, user: record.user, kinds: new Set([record.kind]), values: record.values });
      }
    });
    return grouped.sort((left, right) => right.date - left.date).map((row) => {
      const feedItem = row.values.feedItem;
      const inventoryItem = (data.inventoryItems || []).find((item: any) => String(item.name || '').toLowerCase() === String(feedItem || '').toLowerCase());
      return {
        ...row.values,
        id: row.id,
        dateValue: row.date,
        pondId: row.pondId,
        pondNumber: row.pondNumber,
        feedStock: inventoryItem?.name || feedItem || '',
        user: row.user,
      };
    });
  }, [data.feedings, data.harvests, data.inventoryItems, data.mortalityLogs, data.waterLogs, ponds]);
  const pondFilters = [
    { key: 'pondId', label: 'Pond', options: makeOptions(ponds, (pond) => pond.id, (pond) => `Pond ${pond.number}`) },
  ];
  const personalRows = usersRows.filter((user: any) => user.id === currentUser?.id);
  const reportTables: Partial<Record<ReportCategory, { title: string; total: string; date: string; rows: any[]; filters: ReportFilter[]; columns: ReportColumn[] }>> = {
    ponds: {
      title: 'Recent pond updates',
      total: 'Updates',
      date: 'dateValue',
      rows: allPondHistoryRows,
      filters: pondFilters,
      columns: [
        { key: 'pondNumber', label: 'Pond No.', value: (row) => `Pond ${row.pondNumber}` },
        { key: 'feedStock', label: 'Feed Stock Item', value: (row) => row.feedStock },
        { key: 'feedSize', label: 'Feed Size', value: (row) => row.feedSize },
        { key: 'feedAmount', label: 'Feed (g)', value: (row) => row.feedAmount },
        { key: 'appetite', label: 'Appetite', value: (row) => row.appetite },
        { key: 'behavior', label: 'Behavior', value: (row) => row.behavior },
        { key: 'ph', label: 'pH', value: (row) => row.ph },
        { key: 'ammonia', label: 'Ammonia', value: (row) => row.ammonia },
        { key: 'mortality', label: 'Mortality', value: (row) => row.mortality },
        { key: 'mortalityCause', label: 'Mortality Cause', value: (row) => row.mortalityCause },
        { key: 'averageWeight', label: 'Avg. Wt. (g)', value: (row) => row.averageWeight },
        { key: 'note', label: 'Note', value: (row) => row.note },
        { key: 'dateValue', label: 'Date & Time', value: (row) => row.dateValue, render: (row) => formatDate(row.dateValue, true) },
      ],
    },
    finance: {
      title: 'Finance report',
      total: 'Transactions',
      date: 'dateValue',
      rows: financeRows,
      filters: [
        { key: 'transactionTypeCode', label: 'Record type', options: [
          { value: 'RUNNING_COST', label: 'Running Cost' },
          { value: 'FIXED_COST', label: 'Fixed Cost' },
          { value: 'SALES', label: 'Sales' },
        ] },
      ],
      columns: [
        { key: 'transactionId', label: 'Transaction ID', value: (row) => row.transactionId },
        { key: 'transactionType', label: 'Transaction Type', value: (row) => row.transactionType },
        { key: 'dateValue', label: 'Date', value: (row) => row.dateValue ? new Date(row.dateValue).getTime() : null, render: (row) => formatDate(row.dateValue) },
        { key: 'pondLabel', label: 'Pond', value: (row) => row.pondLabel },
        { key: 'categoryLabel', label: 'Category', value: (row) => row.categoryLabel },
        { key: 'description', label: 'Description', value: (row) => row.description },
        { key: 'income', label: 'Income', value: (row) => row.income, render: (row) => row.income ? formatMoney(row.income) : '—' },
        { key: 'expense', label: 'Expense', value: (row) => row.expense, render: (row) => row.expense ? formatMoney(row.expense) : '—' },
        { key: 'balance', label: 'Balance', value: (row) => row.balance, render: (row) => formatMoney(row.balance) },
        { key: 'recordedBy', label: 'Recorded By', value: (row) => userLabel(row.recordedBy) },
        { key: 'receipt', label: 'Receipt', value: () => '—' },
      ],
    },
    users: {
      title: 'Users report',
      total: 'Users',
      date: 'lastLogin',
      rows: usersRows,
      filters: [{ key: 'nameValue', label: 'Name', options: makeOptions(usersRows, (user) => user.nameValue, (user) => user.nameValue) }],
      columns: [
        { key: 'reportId', label: 'User ID', value: (row) => row.reportId },
        { key: 'nameValue', label: 'Name', value: (row) => row.nameValue },
        { key: 'roleLabel', label: 'Role', value: (row) => row.roleLabel },
        { key: 'phone', label: 'Phone', value: (row) => row.phone },
        { key: 'pondsAssigned', label: 'Ponds Assigned', value: (row) => row.pondsAssigned },
        { key: 'tasksCompleted', label: 'Tasks Completed', value: (row) => row.tasksCompleted },
        { key: 'tasksPending', label: 'Tasks Pending', value: (row) => row.tasksPending },
        { key: 'performance', label: 'Performance Score %', value: (row) => row.performance },
        { key: 'lastLogin', label: 'Last Login', value: (row) => row.lastLogin ? new Date(row.lastLogin).getTime() : null, render: (row) => formatDate(row.lastLogin, true) },
      ],
    },
    performance: {
      title: 'Farm performance report',
      total: 'Ponds',
      date: 'harvestDate',
      rows: performanceRows,
      filters: [],
      columns: [
        { key: 'pondName', label: 'Pond', value: (row) => `Pond ${row.number}` },
        { key: 'species', label: 'Species', value: (row) => row.species },
        { key: 'initialStock', label: 'Initial Stock', value: (row) => row.initialStock },
        { key: 'currentStock', label: 'Current Stock', value: (row) => row.currentStock },
        { key: 'mortalityCount', label: 'Mortality', value: (row) => row.mortalityCount },
        { key: 'growthRate', label: 'Growth Rate (g/day)', value: (row) => row.growthRate },
        { key: 'fcr', label: 'FCR', value: (row) => row.fcr },
        { key: 'harvestWeight', label: 'Harvest Weight (kg)', value: (row) => row.harvestWeight },
        { key: 'harvestDate', label: 'Harvest Date', value: (row) => row.harvestDate ? new Date(row.harvestDate).getTime() : null, render: (row) => formatDate(row.harvestDate) },
        { key: 'survival', label: 'Survival %', value: (row) => row.survival },
      ],
    },
    'my-performance': {
      title: 'My role performance',
      total: 'Users',
      date: 'lastLogin',
      rows: personalRows,
      filters: [],
      columns: [
        { key: 'reportId', label: 'User ID', value: (row) => row.reportId },
        { key: 'nameValue', label: 'Name', value: (row) => row.nameValue },
        { key: 'roleLabel', label: 'Role', value: (row) => row.roleLabel },
        { key: 'pondsAssigned', label: 'Ponds Assigned', value: (row) => row.pondsAssigned },
        { key: 'tasksCompleted', label: 'Tasks Completed', value: (row) => row.tasksCompleted },
        { key: 'tasksPending', label: 'Tasks Pending', value: (row) => row.tasksPending },
        { key: 'performance', label: 'Performance Score %', value: (row) => row.performance },
        { key: 'lastLogin', label: 'Last Login', value: (row) => row.lastLogin ? new Date(row.lastLogin).getTime() : null, render: (row) => formatDate(row.lastLogin, true) },
      ],
    },
    inventory: {
      title: 'Inventory report',
      total: 'Items',
      date: 'lastRestocked',
      rows: inventoryRows,
      filters: [{ key: 'categoryLabel', label: 'Category', options: makeOptions(inventoryRows, (item) => item.categoryLabel, (item) => item.categoryLabel) }],
      columns: [
        { key: 'reportId', label: 'Item ID', value: (row) => row.reportId },
        { key: 'name', label: 'Item Name', value: (row) => row.name },
        { key: 'categoryLabel', label: 'Category', value: (row) => row.categoryLabel },
        { key: 'quantityIn', label: 'Quantity In', value: (row) => row.quantityIn },
        { key: 'quantityUsed', label: 'Quantity Used', value: (row) => row.quantityUsed },
        { key: 'balance', label: 'Current Balance', value: (row) => row.balance },
        { key: 'unit', label: 'Unit', value: (row) => row.unit },
        { key: 'costPerUnit', label: 'Cost per Unit', value: (row) => row.costPerUnit },
        { key: 'lastRestocked', label: 'Last Restocked', value: (row) => row.lastRestocked ? new Date(row.lastRestocked).getTime() : null, render: (row) => formatDate(row.lastRestocked) },
        { key: 'stockStatus', label: 'Status', value: (row) => row.stockStatus, render: (row) => <span className={`report-stock-status ${row.stockStatus === 'Low stock' || row.stockStatus === 'Out of stock' ? 'alert' : ''}`}>{row.stockStatus}</span> },
      ],
    },
    'task-history': {
      title: 'Task history report',
      total: 'Tasks',
      date: 'dateValue',
      rows: taskRows,
      filters: [{ key: 'assignedTo', label: 'Assigned to', options: makeOptions(taskRows, (task) => task.assignedTo, (task) => task.assignedTo) }],
      columns: [
        { key: 'reportId', label: 'Task ID', value: (row) => row.reportId },
        { key: 'title', label: 'Task Name', value: (row) => row.title },
        { key: 'dateValue', label: 'Date', value: (row) => row.dateValue ? new Date(row.dateValue).getTime() : null, render: (row) => formatDate(row.dateValue) },
        { key: 'pondName', label: 'Pond', value: (row) => row.pondName },
        { key: 'taskType', label: 'Task Type', value: (row) => row.taskType },
        { key: 'assignedTo', label: 'Assigned To', value: (row) => row.assignedTo },
        { key: 'completedBy', label: 'Completed By', value: (row) => row.completedBy },
        { key: 'scheduledTime', label: 'Scheduled Time', value: (row) => row.scheduledTime ? new Date(row.scheduledTime).getTime() : null, render: (row) => formatDate(row.scheduledTime, true) },
        { key: 'completedTime', label: 'Completed Time', value: (row) => row.completedTime ? new Date(row.completedTime).getTime() : null, render: (row) => formatDate(row.completedTime, true) },
        { key: 'statusLabel', label: 'Status', value: (row) => row.statusLabel },
        { key: 'notes', label: 'Notes', value: (row) => row.notes },
      ],
    },
  };

  const financeIncome = financeRows.reduce((sum: number, item: any) => sum + item.income, 0);
  const financeExpense = financeRows.reduce((sum: number, item: any) => sum + item.expense, 0);
  const growthPoints = performanceRows.flatMap((pond: any) => pond.growth.map((measurement: any) => ({ date: measurement.measuredAt, weight: Number(measurement.avgWeightGrams) })));
  const minGrowth = Math.min(...growthPoints.map((point: any) => point.weight), 0);
  const maxGrowth = Math.max(...growthPoints.map((point: any) => point.weight), 1);
  const availableCategories = isAdmin
    ? reportCategories.filter(({ id }) => id !== 'my-performance')
    : reportCategories.filter(({ id }) => ['ponds', 'performance', 'my-performance', 'task-history'].includes(id));
  const categoryIsAvailable = category != null && availableCategories.some((item) => item.id === category);
  const currentReportTable = categoryIsAvailable && category ? reportTables[category] : undefined;

  useEffect(() => {
    if (category && !categoryIsAvailable) {
      window.history.replaceState({}, '', isAdmin ? '/admin/reports' : '/reports');
      setCategory(null);
    }
  }, [category, categoryIsAvailable, isAdmin]);

  return (
    <section className="admin-reports">
      <header className="admin-reports-heading">
        <div>
          <p className="eyebrow">{isAdmin ? 'ADMIN REPORTING' : 'MY REPORTS'}</p>
          <h2>{category ? reportCategories.find((item) => item.id === category)?.label : 'Reports'}</h2>
        </div>
        {categoryIsAvailable ? <button type="button" className="secondary-btn" onClick={() => selectCategory(null)}>All report categories</button> : null}
      </header>

      {!categoryIsAvailable ? (
        <div className="admin-report-category-grid">
          {availableCategories.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} className={`admin-report-category category-${id}`} onClick={() => selectCategory(id)}>
              <span className="admin-report-category-icon"><Icon size={21} /></span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      ) : null}

      {category && currentReportTable ? (
        <>
          {category === 'finance' ? (
            <div className="admin-report-summary-grid">
              <div><span>Total Income</span><strong>{formatMoney(financeIncome)}</strong></div>
              <div><span>Total Expense</span><strong>{formatMoney(financeExpense)}</strong></div>
              <div><span>Net Profit</span><strong>{formatMoney(financeIncome - financeExpense)}</strong></div>
              <div><span>Pending Dues</span><strong>—</strong></div>
            </div>
          ) : null}
          {category === 'finance' ? (
            <div className="admin-report-chart">
              <h3>Income vs Expense</h3>
              {financeIncome || financeExpense ? (
                <div className="finance-report-bars">
                  <div>
                    <span>Income</span>
                    <div><i className="income" style={{ width: `${Math.max(4, financeIncome / Math.max(financeIncome, financeExpense) * 100)}%` }} /></div>
                    <strong>{formatMoney(financeIncome)}</strong>
                  </div>
                  <div>
                    <span>Expense</span>
                    <div><i className="expense" style={{ width: `${Math.max(4, financeExpense / Math.max(financeIncome, financeExpense) * 100)}%` }} /></div>
                    <strong>{formatMoney(financeExpense)}</strong>
                  </div>
                </div>
              ) : <p>No finance records available to chart.</p>}
            </div>
          ) : null}
          {category === 'performance' ? (
        <div className="admin-report-chart-grid">
              <section className="admin-report-chart"><h3>Growth curve</h3>
                {growthPoints.length ? <svg viewBox="0 0 600 180" role="img" aria-label="Growth curve">
                  {performanceRows.map((pond: any, pondIndex: number) => pond.growth.length ? (
                    <polyline
                      key={pond.id}
                      fill="none"
                      stroke={['#1565c0', '#2e7d32', '#f57c00', '#7c4dff', '#d32f2f'][pondIndex % 5]}
                      strokeWidth="3"
                      points={pond.growth.map((point: any, index: number) => {
                        const x = pond.growth.length === 1 ? 300 : 12 + index / (pond.growth.length - 1) * 576;
                        const y = 160 - ((Number(point.avgWeightGrams) - minGrowth) / Math.max(1, maxGrowth - minGrowth)) * 140;
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  ) : null)}
                </svg> : <p>No growth measurements have been recorded.</p>}
                {performanceRows.some((pond: any) => pond.growth.length) ? <div className="admin-report-growth-legend">{performanceRows.filter((pond: any) => pond.growth.length).map((pond: any, index: number) => <span key={pond.id}><i style={{ background: ['#1565c0', '#2e7d32', '#f57c00', '#7c4dff', '#d32f2f'][performanceRows.indexOf(pond) % 5] }} />Pond {pond.number}</span>)}</div> : null}
              </section>
              <section className="admin-report-chart"><h3>Survival rate</h3>
                {performanceRows.length ? performanceRows.map((pond: any) => <div key={pond.id} className="admin-report-bar-row"><span>Pond {pond.number}</span><div><i style={{ width: `${Math.min(100, Math.max(0, pond.survival || 0))}%` }} /></div><strong>{pond.survival == null ? '—' : `${pond.survival.toFixed(1)}%`}</strong></div>) : <p>No ponds available.</p>}
              </section>
        </div>
          ) : null}
          <ReportDataTable
            key={category}
            title={currentReportTable.title}
            totalLabel={currentReportTable.total}
            dateField={currentReportTable.date}
            rows={currentReportTable.rows}
            filters={currentReportTable.filters}
            columns={currentReportTable.columns}
            pondReport={category === 'ponds'}
            compactFilters
            requiredColumns={category === 'finance' ? ['transactionType'] : []}
            initialFilters={category === 'task-history' && !isAdmin && currentUser?.id
              ? { userIds: currentUser.id }
              : undefined}
            loading={loading}
            error={error}
          />
          {category === 'inventory' && inventoryRows.some((row: any) => row.stockStatus !== 'In stock') ? <p className="admin-inventory-alert">Low or out-of-stock inventory items need attention.</p> : null}
        </>
      ) : null}
    </section>
  );
}
