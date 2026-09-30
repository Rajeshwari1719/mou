import { ArrowUpRight, Briefcase, Building2, FileText, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { reportService } from '../services/reportService';
import { mouService } from '../services/mouService';
import { projectService } from '../services/projectService';
import { internService } from '../services/internService';
import { formatDate } from '../utils/formatDate';
import { getMouStatus } from '../utils/mouStatus';
import Button from '../components/Button';

const formatDateLabel = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffDays = Math.round((Date.now() - date.getTime()) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(value);
};

const DashboardPage = () => {
  const [metrics, setMetrics] = useState(null);
  const [mous, setMous] = useState([]);
  const [projects, setProjects] = useState([]);
  const [interns, setInterns] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const fileInputRef = useRef(null);

  const loadDashboard = () => {
    reportService.getReports().then(setMetrics).catch(() => {});
    Promise.all([
      mouService.getMous(),
      projectService.getProjects(),
      internService.getInterns(),
    ])
      .then(([mouRes, projectRes, internRes]) => {
        setMous(mouRes.mous || []);
        setProjects(projectRes.projects || []);
        setInterns(internRes.interns || []);
      })
      .catch(() => {
        setMous([]);
        setProjects([]);
        setInterns([]);
      });
  };

  useEffect(() => {
    const timer = setTimeout(loadDashboard, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || importing) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(extension)) {
      toast.error('Please select an .xlsx or .csv file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImporting(true);
    setImportResult(null);
    setImportPreview(null);
    try {
      const result = await mouService.previewImport(file);
      setPendingImportFile(file);
      setImportPreview(result);
      toast.success('Import validated. Review the preview before applying changes.');
    } catch (error) {
      const responseMessage = error.message;
      toast.error(responseMessage || (error.request ? 'Backend is unavailable. Check that the server is running on port 4000.' : 'Failed to import Excel file.'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingImportFile || !importPreview?.previewToken || importing) return;
    setImporting(true);
    try {
      const result = await mouService.importExcel(pendingImportFile, importPreview.previewToken);
      setImportResult(result.results);
      setImportPreview(null);
      setPendingImportFile(null);
      toast.success(`Excel imported: ${result.results.inserted} added, ${result.results.updated} updated`);
      loadDashboard();
    } catch (error) {
      toast.error(error.message || 'Import failed. Validate the file again and retry.');
    } finally { setImporting(false); }
  };

  const statusData = useMemo(() => {
    const active = metrics?.activeMous ?? mous.filter((mou) => getMouStatus(mou.valid_upto) === 'Active').length;
    const expiringSoon = metrics?.expiringSoonMous ?? 0;
    const expired = metrics?.expiredMous ?? mous.filter((mou) => getMouStatus(mou.valid_upto) === 'Expired').length;
    const max = Math.max(active, expiringSoon, expired, 1);
    return [
      { label: 'Active', count: active },
      { label: 'Expiring Soon', count: expiringSoon },
      { label: 'Expired', count: expired },
    ].map((item) => ({ ...item, percent: Math.max((item.count / max) * 100, item.count ? 10 : 0) }));
  }, [metrics, mous]);

  const recentActivity = useMemo(() => {
    const activity = [
      ...mous.map((mou) => ({
        title: 'MOU updated',
        detail: `${mou.college_name || 'Partner'} ${mou.mou_date ? `started ${formatDate(mou.mou_date)}` : 'record updated'}`,
        date: mou.updated_at || mou.created_at || mou.mou_date,
      })),
      ...projects.map((project) => ({
        title: 'Project added',
        detail: `${project.title || 'Project'} for MOU #${project.mou_id}`,
        date: project.updated_at || project.created_at || project.start_date,
      })),
      ...interns.map((intern) => ({
        title: 'Intern added',
        detail: `${intern.student_name || 'Student'} assigned to internship`,
        date: intern.updated_at || intern.created_at || intern.start_date,
      })),
    ].filter((item) => item.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    return activity;
  }, [mous, projects, interns]);

  const liveStats = metrics ? [
    { label: 'Total MOUs', value: metrics.totalMous, change: 'Current database total', icon: FileText, to: '/mous' },
    { label: 'Active Partners', value: metrics.activeMous, change: 'Valid today', icon: Building2, to: '/mous' },
    { label: 'Projects', value: metrics.projects, change: 'Current database total', icon: Briefcase, to: '/projects' },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Overview</p>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={handleExcelUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={16} />
              {importing ? 'Importing…' : 'Upload Excel'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {liveStats.map(({ label, value, change, icon: Icon, to }) => (
          <Link key={label} to={to} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900">{value}</h2>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
                <Icon size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-sm text-green-600">
              <ArrowUpRight size={16} /> {change}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">MOU Status Distribution</h3>
          <div className="mt-6 space-y-4">
            {statusData.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm text-gray-600">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-200">
                  <div
                    className="h-2.5 rounded-full bg-blue-600"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <div className="mt-5 space-y-4">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-500">No recent activity found.</p>
            ) : (
              recentActivity.map((item, index) => (
                <div key={`${item.title}-${index}`} className="border-l-2 border-blue-500 pl-4">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-600">{item.detail}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDateLabel(item.date)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {importPreview && (
        <section className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm" aria-label="Import preview">
          <h3 className="text-lg font-semibold text-gray-900">Review import before applying</h3>
          <p className="mt-2 text-sm text-gray-600">{importPreview.results.inserted} new, {importPreview.results.updated} updates, {importPreview.results.errors.length} invalid rows, {importPreview.results.duplicates} duplicates skipped. Blank optional cells preserve existing values.</p>
          {importPreview.results.errors.length > 0 && <ul className="mt-3 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-sm text-red-700">{importPreview.results.errors.map((row) => <li key={row.row}>Row {row.row}: {row.errors.join('; ')}</li>)}</ul>}
          <div className="mt-4 flex gap-3">
            <Button type="button" loading={importing} onClick={confirmImport}>Confirm import</Button>
            <Button type="button" variant="secondary" disabled={importing} onClick={() => { setImportPreview(null); setPendingImportFile(null); }}>Cancel</Button>
          </div>
        </section>
      )}

      {importResult && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Excel Import Summary</h3>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              {importResult.inserted} MOU(s) added
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              {importResult.updated} MOU(s) updated
            </span>
            {importResult.duplicates > 0 && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                {importResult.duplicates} duplicate row(s) skipped
              </span>
            )}
            {importResult.skipped > 0 && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                {importResult.skipped} blank row(s) skipped
              </span>
            )}
          </div>
          {importResult.errors?.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                {importResult.errors.length} row(s) had problems:
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-amber-700">
                {importResult.errors.map((err) => (
                  <li key={err.row}>
                    <span className="font-medium">Row {err.row}:</span> {err.errors.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
