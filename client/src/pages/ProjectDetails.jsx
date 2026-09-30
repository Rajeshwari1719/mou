import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, Edit, FileText, Trash2, University } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import Select from '../components/Select';
import StatusBadge from '../components/StatusBadge';
import { projectService } from '../services/projectService';
import { mouService } from '../services/mouService';
import { jsPDF } from 'jspdf';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatDate';

const Field = ({ label, value }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="mt-1 break-words font-medium text-gray-900">{value || '-'}</p>
  </div>
);

export default function ProjectDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [mous, setMous] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [response, mousResponse] = await Promise.all([projectService.getProject(id), mouService.getMous()]);
        if (!response.project) {
          toast.error('Project not found');
          navigate('/projects', { replace: true });
          return;
        }
        setProject(response.project);
        setMous(mousResponse.mous || []);
        setForm({
          mou_id: response.project.mou_id || '',
          title: response.project.title || '',
          description: response.project.description || '',
          start_date: response.project.start_date ? String(response.project.start_date).slice(0, 10) : '',
          end_date: response.project.end_date ? String(response.project.end_date).slice(0, 10) : '',
          status: response.project.status || 'Active',
        });
      } catch (error) {
        toast.error(error.message || 'Could not load project details.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, navigate]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await projectService.updateProject(id, { ...form, title: form.title.trim(), description: form.description.trim() });
      const response = await projectService.getProject(id);
      setProject(response.project);
      setEditOpen(false);
      toast.success('Project updated');
    } catch (error) {
      toast.error(error.message || 'Could not update project.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this project? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await projectService.deleteProject(id);
      toast.success('Project deleted');
      navigate('/projects', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Could not delete project.');
      setDeleting(false);
    }
  };

  const download = () => {
    const document = new jsPDF();
    const lines = [
      'PROJECT DETAILS',
      '',
      `Project Title: ${project.title || '-'}`,
      `Status: ${project.status || '-'}`,
      `Start Date: ${formatDate(project.start_date)}`,
      `End Date: ${formatDate(project.end_date)}`,
      '',
      'DESCRIPTION',
      ...(document.splitTextToSize(project.description || 'No description provided.', 170)),
      '',
      'ASSOCIATED MOU',
      `Partner: ${project.college_name || 'No MOU associated'}`,
      `MOU Number: ${project.mou_serial_no || project.mou_id || '-'}`,
      `MOU Date: ${formatDate(project.mou_date)}`,
      `Valid Until: ${formatDate(project.valid_upto)}`,
      `Department: ${project.department_name || '-'}`,
    ];
    document.setFontSize(16);
    document.text(lines[0], 20, 20);
    document.setFontSize(11);
    document.text(lines.slice(1), 20, 32);
    document.save(`${project.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}-details.pdf`);
  };

  if (loading) return <p className="text-gray-500">Loading project details...</p>;
  if (!project) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Project Details</p>
          <h1 className="text-3xl font-bold text-gray-900">{project.title}</h1>
          <p className="mt-1 text-sm text-gray-500">Project ID: {project.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}><Download size={17} /> Download</Button>
          {user?.role === 'admin' && <><Button variant="secondary" onClick={() => setEditOpen(true)}><Edit size={17} /> Edit</Button><Button variant="danger" loading={deleting} onClick={remove}><Trash2 size={17} /> Delete</Button></>}
          <Button variant="secondary" onClick={() => navigate('/projects')}>
            <ArrowLeft size={17} /> Back to Projects
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <p className="text-sm text-gray-500">Project Information</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">{project.title}</h2>
            </div>
            <StatusBadge status={project.status || 'Active'} />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Field label="Project Title" value={project.title} />
            <Field label="Status" value={project.status} />
            <Field label="Start Date" value={formatDate(project.start_date)} />
            <Field label="End Date" value={formatDate(project.end_date)} />
          </div>

          <div className="mt-7 border-t border-gray-100 pt-6">
            <p className="text-sm text-gray-500">Project Description / Details</p>
            <p className="mt-2 whitespace-pre-wrap leading-7 text-gray-700">
              {project.description || 'No project description was provided.'}
            </p>
          </div>
        </section>

        <section className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Associated MOU</h2>
          </div>

          <div className="mt-5 space-y-5">
            <Field label="MOU Number" value={project.mou_serial_no ? `MOU #${project.mou_serial_no}` : project.mou_id} />
            <Field label="MOU / Partner Name" value={project.college_name} />
            <Field label="MOU Date" value={formatDate(project.mou_date)} />
            <Field label="MOU Valid Until" value={formatDate(project.valid_upto)} />
            <Field label="Department" value={project.department_name} />
            <Field label="MOU Type" value={project.national_or_international} />

            {project.mou_id && <div className="border-t border-gray-100 pt-5">
              <Button className="w-full" variant="secondary" onClick={() => navigate(`/mous/${project.mou_id}`)}>
                <University size={17} /> View Associated MOU
              </Button>
            </div>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <CalendarDays size={19} className="text-blue-600" /> Project Timeline
          </div>
          <p className="mt-3 text-sm text-gray-600">
            {project.start_date || project.end_date
              ? `${project.start_date ? formatDate(project.start_date) : 'Start date not set'} → ${project.end_date ? formatDate(project.end_date) : 'End date not set'}`
              : 'No timeline dates were provided.'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">MOU Purpose</p>
          <p className="mt-2 text-sm leading-6 text-gray-700">{project.mou_purpose || 'No MOU purpose recorded.'}</p>
        </div>
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Project" size="lg">
        {form && <form onSubmit={save} className="space-y-4">
          <Select label="Associated MOU" required value={form.mou_id} onChange={(event) => setForm({ ...form, mou_id: event.target.value })} options={mous.map((mou) => ({ value: mou.id, label: `${mou.college_name} (${formatDate(mou.mou_date)})` }))} />
          <Input label="Title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" rows={4} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Start Date" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            <Input label="End Date" type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
          </div>
          <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} options={[{ value: 'Active', label: 'Active' }, { value: 'Completed', label: 'Completed' }]} />
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save Changes</Button></div>
        </form>}
      </Modal>
    </div>
  );
}
