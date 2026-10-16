import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, Printer } from 'lucide-react';

export type PondQuickAction = 'update' | 'restock' | 'targetHarvest' | 'harvestQuantity' | 'recommendFeed' | 'mortality';

type PondColumn = {
  key: string;
  label: string;
  value: (row: any) => string | number | null;
  render?: (row: any) => ReactNode;
};

function pondNumber(pond: any) {
  return `POND-${String(pond.number).padStart(3, '0')}`;
}

function dateValue(value?: string | number | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB');
}

function getRecommendedFeedSize(weight: number | null) {
  if (!weight || weight <= 0) return '4mm';
  if (weight < 50) return '1mm';
  if (weight < 100) return '1.5mm';
  if (weight < 200) return '2mm';
  if (weight < 350) return '2.5mm';
  if (weight < 500) return '3mm';
  if (weight < 700) return '3.5mm';
  if (weight < 900) return '4mm';
  return '4.5mm';
}

function searchableText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return `${value.toLocaleDateString()} ${value.toISOString()}`;
  if (Array.isArray(value)) return value.map(searchableText).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(searchableText).join(' ');
  return '';
}

function exportRows(columns: PondColumn[], rows: any[]) {
  const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${columns.map((column) => `<th>${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escape(column.value(row) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pond-registry.xls';
  link.click();
  URL.revokeObjectURL(url);
}

export function PondRegistryTable({
  ponds,
  feedings,
  mortalities,
  harvests,
  isAdmin,
  loading,
  error,
  onAddPond,
  onQuickAction,
  onViewDetails,
}: {
  ponds: any[];
  feedings: any[];
  mortalities: any[];
  harvests: any[];
  isAdmin: boolean;
  loading: boolean;
  error?: string | null;
  onAddPond: () => void;
  onQuickAction: (action: PondQuickAction) => void;
  onViewDetails: (pondId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const rows = useMemo(() => ponds.map((pond) => {
    const feedLogs = feedings.filter((log) => log.pondId === pond.id);
    const mortalityTotal = mortalities.filter((log) => log.pondId === pond.id).reduce((total, log) => total + Number(log.numberDead || 0), 0);
    const harvestTotal = harvests.filter((log) => log.pondId === pond.id).reduce((total, log) => total + Number(log.numberHarvested || 0), 0);
    const initialStock = Number(pond.initial_population ?? pond.current_population ?? 0);
    const currentLive = Math.max(0, initialStock - mortalityTotal - harvestTotal);
    const latestFeed = [...feedLogs].sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())[0];
    const latestGrowth = [...(pond.growthMeasurements || [])].sort((left: any, right: any) => new Date(right.measuredAt || 0).getTime() - new Date(left.measuredAt || 0).getTime())[0];
    const averageWeight = Number(latestGrowth?.avgWeightGrams ?? pond.initialAvgWeightG ?? 0) || null;
    const recommendedAmount = Number((currentLive * Number(averageWeight || 0) * 0.03 / 1000).toFixed(2));
    const recommendedSize = getRecommendedFeedSize(averageWeight) || latestFeed?.feedSize || pond.recommendedFeedSize || '4mm';
    return {
      ...pond,
      pondNumber: pondNumber(pond),
      initialStock,
      currentLive,
      mortalityTotal,
      feedTotal: feedLogs.reduce((total, log) => total + Number(log.quantityKg || 0), 0),
      currentFeedSize: latestFeed?.feedSize || pond.recommendedFeedSize || '—',
      averageWeight,
      targetWeight: pond.targetHarvestKg == null ? null : Number(pond.targetHarvestKg) * 1000,
      harvestTotal,
      recommendedFeed: `${recommendedAmount} kg - ${recommendedSize}`,
      speciesName: pond.species || '',
      registeredAt: pond.createdAt || null,
    };
  }), [feedings, harvests, mortalities, ponds]);

  const columns: PondColumn[] = [
    { key: 'number', label: 'Pond No.', value: (row) => row.pondNumber, render: (row) => <button type="button" className="pond-number-link" onClick={() => onViewDetails(row.id)}>{row.pondNumber}</button> },
    { key: 'initialStock', label: 'Initial', value: (row) => row.initialStock },
    { key: 'currentLive', label: 'Live', value: (row) => row.currentLive, render: (row) => <strong className="pond-live-count">{Number(row.currentLive).toLocaleString()}</strong> },
    { key: 'mortalityTotal', label: 'Mortality', value: (row) => row.mortalityTotal },
    { key: 'feedTotal', label: 'Feed Used (kg)', value: (row) => row.feedTotal, render: (row) => Number(row.feedTotal).toFixed(2) },
    { key: 'currentFeedSize', label: 'Feed Size', value: (row) => row.currentFeedSize },
    { key: 'averageWeight', label: 'Avg. Wt. (g)', value: (row) => row.averageWeight },
    { key: 'targetWeight', label: 'Target Wt. (g)', value: (row) => row.targetWeight },
    { key: 'harvestTotal', label: 'Harvest', value: (row) => row.harvestTotal },
    { key: 'recommendedFeed', label: 'Rec. Feed', value: (row) => row.recommendedFeed },
    { key: 'registeredTimestamp', label: 'Reg. Date', value: (row) => row.registeredAt ? new Date(row.registeredAt).getTime() : null, render: (row) => dateValue(row.registeredAt) },
  ];

  const filteredRows = useMemo(() => {
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (!terms.length) return true;
      const searchableRow = searchableText(row).toLocaleLowerCase();
      return terms.every((term) => searchableRow.includes(term));
    });
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  useEffect(() => setPage((current) => Math.min(current, pageCount - 1)), [pageCount]);
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <section className="pond-registry">
      <header className="pond-registry-heading">
        <div><p className="eyebrow">{isAdmin ? 'POND MANAGEMENT' : 'YOUR ASSIGNED PONDS'}</p><h2>Pond Registry</h2></div>
      </header>
      <div className="pond-quick-actions" aria-label="Pond quick actions">
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('update')}>Update</button>
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('restock')}>Restock</button>
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('targetHarvest')}>Harvest target</button>
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('harvestQuantity')}>Record harvest</button>
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('recommendFeed')}>Recommend feed</button>
        <button type="button" className="secondary-btn" onClick={() => onQuickAction('mortality')}>Mortality</button>
        {isAdmin ? <button type="button" className="primary-btn" onClick={onAddPond}>Add pond</button> : null}
      </div>
      <div className="pond-registry-toolbar">
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search all pond information..." aria-label="Search all pond information" />
        <button type="button" className="secondary-btn" onClick={() => window.print()}><Printer size={16} />PDF / Print</button>
        <button type="button" className="secondary-btn" onClick={() => exportRows(columns, filteredRows)} disabled={!filteredRows.length}><Download size={16} />Excel</button>
      </div>
      <div className="pond-registry-summary"><strong>Total Ponds: {rows.length}</strong><span>Showing: {filteredRows.length}</span><span>Page {page + 1} of {pageCount}</span></div>
      {error ? <div className="pond-registry-error" role="alert">{error}</div> : null}
      {loading ? <div className="pond-registry-loading"><span /><span /><span /><span /></div> : null}
      {!loading && !rows.length ? <div className="pond-registry-empty">No ponds are registered yet.</div> : null}
      {!loading && rows.length > 0 && !filteredRows.length ? <div className="pond-registry-empty">No ponds match the current search and filters.</div> : null}
      {!loading && filteredRows.length ? (
        <div className="pond-registry-table-wrap"><table className="pond-registry-table">
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(column.value(row) ?? '—')}</td>)}</tr>)}</tbody>
        </table></div>
      ) : null}
      {!loading && filteredRows.length ? <footer className="pond-registry-pagination"><div><button type="button" className="secondary-btn" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><button type="button" className="secondary-btn" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div></footer> : null}
    </section>
  );
}
