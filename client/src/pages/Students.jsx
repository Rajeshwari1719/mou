import { useEffect, useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import Select from '../components/Select';
import api from '../services/api';
import { studentService } from '../services/studentService';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', college_id: '', department_id: '' });

  const load = async () => {
    const [studentsRes, collegesRes, departmentsRes] = await Promise.all([
      studentService.getStudents(),
      api.get('/colleges'),
      api.get('/departments'),
    ]);
    setStudents(studentsRes.students || []);
    setColleges(collegesRes.data.colleges || []);
    setDepartments(departmentsRes.data.departments || []);
  };

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await studentService.createStudent({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        college_id: form.college_id || null,
        department_id: form.department_id || null,
      });
      setOpen(false);
      setForm({ name: '', email: '', phone: '', college_id: '', department_id: '' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-600 mt-1">Manage students benefiting from MOUs</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>Add Student</Button>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map(student => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{student.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{student.email || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{student.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{student.college_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Student">
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select label="Partner" value={form.college_id} onChange={(e) => setForm({ ...form, college_id: e.target.value })} options={(colleges || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} options={(departments || []).map((d) => ({ value: d.id, label: d.name }))} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Student</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
