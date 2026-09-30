import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import { useState } from 'react';
import { mouService } from '../services/mouService';

const CreateMOUPage = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    college_name: '',
    department_name: '',
    mou_date: '',
    valid_upto: '',
    national_or_international: 'National',
    students_benefited: '',
    contact_name: '',
    contact_email: '',
    purpose: '',
  });
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const save = async (e) => { 
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      college_name: String(form.college_name || '').trim(),
      department_name: String(form.department_name || '').trim(),
      students_benefited: form.students_benefited === '' ? 0 : Number(form.students_benefited),
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
      await mouService.createMou(payload);
      navigate('/mous');
    } catch (err) {
      setError(err.message || 'Could not save the MOU.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">MOU</p>
          <h1 className="text-3xl font-bold text-gray-900">Create MOU</h1>
        </div>
        <Button variant="secondary" onClick={() => navigate('/mous')}>Back</Button>
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
          <Button variant="secondary" onClick={() => navigate('/mous')}>Cancel</Button>
          <Button type="submit" loading={saving}>Save MOU</Button>
        </div>
      </form>
    </div>
  );
};

export default CreateMOUPage;
