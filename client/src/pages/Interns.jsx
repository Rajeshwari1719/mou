import Button from '../components/Button';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Select from '../components/Select';
import { internService } from '../services/internService';
import { mouService } from '../services/mouService';
import { projectService } from '../services/projectService';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatDate';

const columns = [
  { key: 'student_name', label: 'Intern Name' },
  { key: 'start_date', label: 'Start Date', render: (value) => formatDate(value) },
  { key: 'end_date', label: 'End Date', render: (value) => formatDate(value) },
  { key: 'status', label: 'Status', render: (value) => <StatusBadge status={value} /> },
];

const InternsPage = () => {
  const [interns, setInterns] = useState([]);
  const [mous, setMous] = useState([]);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const initialForm = { intern_name: '', mou_id: '', project_id: '', start_date: '', end_date: '', status: 'Active' };
  const [form, setForm] = useState(initialForm);
  const { user } = useAuth();

  const load = async () => {
    const [internsRes, mousRes, projectRes] = await Promise.all([
      internService.getInterns(),
      mouService.getMous(),
      projectService.getProjects(),
    ]);
    setInterns(internsRes.interns || []);
    setMous(mousRes.mous || []);
    setProjects(projectRes.projects || []);
  };

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, []);

  const openEditor = (intern = null) => {
    setEditing(Boolean(intern));
    setForm(intern ? {
      intern_name: intern.student_name || '',
      mou_id: intern.mou_id || '',
      project_id: intern.project_id || '',
      start_date: intern.start_date ? String(intern.start_date).slice(0, 10) : '',
      end_date: intern.end_date ? String(intern.end_date).slice(0, 10) : '',
      status: intern.status || 'Active',
    } : initialForm);
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        intern_name: form.intern_name,
        mou_id: form.mou_id,
        project_id: form.project_id || null,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
      };
      if (editing) await internService.updateIntern(selected.id, payload);
      else await internService.createIntern(payload);
      setOpen(false);
      await load();
      const updated = editing ? (await internService.getInterns()).interns.find((intern) => String(intern.id) === String(selected.id)) : null;
      if (updated) setSelected(updated);
      toast.success(editing ? 'Intern updated' : 'Intern added');
    } catch (error) {
      toast.error(error.message || 'Could not save intern.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm('Delete this intern record?')) return;
    setDeleting(true);
    try {
      await internService.deleteIntern(selected.id);
      setDetailsOpen(false);
      setSelected(null);
      await load();
      toast.success('Intern deleted');
    } catch (error) {
      toast.error(error.message || 'Could not delete intern.');
    } finally {
      setDeleting(false);
    }
  };

  const selectedMou = selected && mous.find((mou) => String(mou.id) === String(selected.mou_id));
  const selectedProject = selected && projects.find((project) => String(project.id) === String(selected.project_id));
  const projectOptions = projects.filter((project) => String(project.mou_id) === String(form.mou_id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Internship</p>
          <h1 className="text-3xl font-bold text-gray-900">Interns</h1>
        </div>
        {user?.role === 'admin' && <Button onClick={() => openEditor()}>Add Intern</Button>}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <Table columns={columns} data={interns} onRowClick={(intern) => { setSelected(intern); setDetailsOpen(true); }} />
      </div>
      <Modal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} title="Intern Details" size="lg">
        {selected && <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div><p className="text-sm text-gray-500">Intern Name</p><p className="mt-1 font-medium text-gray-900">{selected.student_name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selected.status} /></div></div>
            <div><p className="text-sm text-gray-500">Start Date</p><p className="mt-1 font-medium text-gray-900">{formatDate(selected.start_date)}</p></div>
            <div><p className="text-sm text-gray-500">End Date</p><p className="mt-1 font-medium text-gray-900">{formatDate(selected.end_date)}</p></div>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <p className="text-sm text-gray-500">Associated MOU</p>
            <p className="mt-1 font-medium text-gray-900">{selectedMou ? `${selectedMou.college_name} (${formatDate(selectedMou.mou_date)})` : 'No MOU associated'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Related Project</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{selectedProject ? `${selectedProject.title} (${selectedProject.status})` : 'No project selected'}</p>
          </div>
          {user?.role === 'admin' && <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => { setDetailsOpen(false); openEditor(selected); }}>Edit</Button><Button variant="danger" loading={deleting} onClick={remove}>Delete</Button></div>}
        </div>}
      </Modal>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit Intern' : 'Add Intern'}>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Intern Name" required value={form.intern_name} onChange={e => setForm({ ...form, intern_name: e.target.value })} placeholder="Enter intern name" />
          <Select label="Associated MOU" required value={form.mou_id} onChange={e => setForm({ ...form, mou_id: e.target.value, project_id: '' })} options={mous.map(m => ({ value: m.id, label: `${m.college_name} (${formatDate(m.mou_date)})` }))} />
          <Select label="Related Project" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={[{ value: '', label: 'No related project' }, ...projectOptions.map(project => ({ value: project.id, label: `${project.title} (${project.status})` }))]} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={[{ value: 'Active', label: 'Active' }, { value: 'Completed', label: 'Completed' }]} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save Changes' : 'Save Intern'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InternsPage;
