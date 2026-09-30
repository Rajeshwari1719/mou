import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import Select from '../components/Select';
import { mouService } from '../services/mouService';
import { projectService } from '../services/projectService';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatDate';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [mous, setMous] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ mou_id: '', title: '', description: '', start_date: '', end_date: '', status: 'Active' });
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const [projectsRes, mousRes] = await Promise.all([
      projectService.getProjects(),
      mouService.getMous(),
    ]);
    setProjects((projectsRes.projects || []).sort((a,b) => new Date(a.start_date || 0) - new Date(b.start_date || 0)));
    setMous(mousRes.mous || []);
  };

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await projectService.createProject({
        mou_id: form.mou_id || null,
        title: form.title.trim(),
        description: form.description.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
      });
      setOpen(false);
      setForm({ mou_id: '', title: '', description: '', start_date: '', end_date: '', status: 'Active' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setImporting(true);
      const res = await projectService.importProjects(formData);
      await load();
      alert(`Imported ${res.results.inserted} projects`);
    } catch (e) {
      alert(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    return status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 mt-1">Manage research and collaborative projects</p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && <label className="inline-flex items-center rounded bg-white border px-3 py-2 text-sm cursor-pointer">
            <input type="file" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
            {importing ? 'Importing...' : 'Import Projects (Excel/CSV)'}
          </label>}
          {user?.role === 'admin' && <Button variant="primary" onClick={() => setOpen(true)}>Create Project</Button>}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Associated MOU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map(project => (
                <tr key={project.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/projects/${project.id}`)}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{project.title}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{project.college_name || 'No MOU associated'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(project.start_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Create Project">
        <form onSubmit={save} className="space-y-4">
          <Select label="Associated MOU" required value={form.mou_id} onChange={(e) => setForm({ ...form, mou_id: e.target.value })} options={mous.map((m) => ({ value: m.id, label: `${m.college_name} (${formatDate(m.mou_date)})` }))} />
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500" rows={4} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="End Date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[{ value: 'Active', label: 'Active' }, { value: 'Completed', label: 'Completed' }]} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Project</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
