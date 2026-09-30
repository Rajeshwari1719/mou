import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { mouService } from '../services/mouService';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import Table from '../components/Table';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatDate';
import { getMouStatus } from '../utils/mouStatus';

const columns = [
  { key: 'college_name', label: 'Partner' },
  { key: 'department_name', label: 'Department' },
  { key: 'mou_date', label: 'Start Date', render: (value) => formatDate(value) },
  { key: 'valid_upto', label: 'Valid Until', render: (value) => formatDate(value) },
  { key: 'national_or_international', label: 'Type' },
  { key: 'students_benefited', label: 'Students Benefited' },
  { key: 'contact_name', label: 'Contact Person' },
  { key: 'contact_email', label: 'Contact Email' },
  {
    key: 'status',
    label: 'Status',
    render: (_, row) => <StatusBadge status={getMouStatus(row.valid_upto)} />,
  },
];

const MOUsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mous, setMous] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      mouService.getMous({ search, page, limit: 25 }).then((r) => { setMous(r.mous || []); setPagination(r.pagination || { totalPages: 1 }); }).catch((e) => setError(e.message || 'Could not load MOUs.')).finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [search, page]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Management</p>
          <h1 className="text-3xl font-bold text-gray-900">MOUs</h1>
        </div>
        {user?.role === 'admin' && <Link to="/mous/new"><Button>Create MOU</Button></Link>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search MOU number, partner, department, or purpose" className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {error && <p className="p-3 text-red-700">{error}</p>}
        <Table columns={columns} data={mous} loading={loading} onRowClick={(mou) => navigate(`/mous/${mou.id}`)} />
        {!loading && pagination.totalPages > 1 && <div className="mt-4 flex items-center justify-between text-sm text-gray-600"><span>Page {page} of {pagination.totalPages}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>}
      </div>
    </div>
  );
};

export default MOUsPage;
