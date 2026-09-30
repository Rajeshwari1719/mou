import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import { mouService } from '../services/mouService';

const initialForm = {
  college_name: '',
  department_name: '',
  mou_date: '',
  valid_upto: '',
  national_or_international: 'National',
  students_benefited: '',
  contact_name: '',
  contact_email: '',
  purpose: '',
};

const EditMOUPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    const loadMou = async () => {
      try {
        const response = await mouService.getMou(id);
        const mou = response.mou || {};
        setExisting(mou);
        setForm({
          college_name: mou.college_name || '',
          department_name: mou.department_name || '',
          mou_date: mou.mou_date ? String(mou.mou_date).slice(0, 10) : '',
          valid_upto: mou.valid_upto ? String(mou.valid_upto).slice(0, 10) : '',
          national_or_international: mou.national_or_international || 'National',
          students_benefited: mou.students_benefited ?? 0,
          contact_name: mou.contact_name || '',
          contact_email: mou.contact_email || '',
          purpose: mou.purpose || '',
        });
      } catch (err) {
        setError(err.message || 'Could not load the MOU.');
      } finally {
        setLoading(false);
      }
    };

    loadMou();
  }, [id]);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      college_id: existing?.college_id ?? null,
      department_id: existing?.department_id ?? null,
      college_name: String(form.college_name || '').trim(),
      department_name: String(form.department_name || '').trim(),
      students_benefited: Number(form.students_benefited || 0),
      contact_name: String(form.contact_name || '').trim(),
      contact_email: String(form.contact_email || '').trim(),
      purpose: String(form.purpose || '').trim(),
    };

    if (!payload.college_name || !payload.mou_date) {
      setError('Partner name and MOU date are required.');
      setSaving(false);
      return;
    }

    try {
      await mouService.updateMou(id, payload);
      navigate(`/mous/${id}`);
    } catch (err) {
      setError(err.message || 'Could not save the MOU.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading MOU details...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">MOU #{id}</p>
          <h1 className="text-3xl font-bold text-gray-900">Edit MOU</h1>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/mous/${id}`)}>Back</Button>
      </div>

      <form onSubmit={save} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Partner Name" name="college_name" required value={form.college_name} onChange={update} placeholder="Organization name" />
          <Input label="Department" name="department_name" value={form.department_name} onChange={update} placeholder="Department" />
          <Input label="MOU Date" name="mou_date" required type="date" value={form.mou_date} onChange={update} />
          <Input label="Valid Until" name="valid_upto" type="date" value={form.valid_upto} onChange={update} />
          <Select label="Type" name="national_or_international" value={form.national_or_international} onChange={update} options={[{ value: 'National', label: 'National' }, { value: 'International', label: 'International' }]} />
          <Input label="Students Benefited" name="students_benefited" type="number" min="0" value={form.students_benefited} onChange={update} placeholder="0" />
          <Input label="Contact Person" name="contact_name" value={form.contact_name} onChange={update} placeholder="Full name" />
          <Input label="Contact Email" name="contact_email" type="email" value={form.contact_email} onChange={update} placeholder="name@example.com" />
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Objectives</label>
            <textarea name="purpose" value={form.purpose} onChange={update} className="min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500" placeholder="Enter objectives and collaboration details" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/mous')}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </div>
  );
};

export default EditMOUPage;
