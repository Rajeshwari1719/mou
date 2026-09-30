import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const defaultProfile = {
  name: '',
  email: '',
  role: 'viewer',
  age: '',
  gender: '',
  phone: '',
  department: '',
  designation: '',
  address: '',
};

const ProfilePage = () => {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(() => ({
    ...defaultProfile,
    ...user,
    age: user?.age ?? '',
    gender: user?.gender ?? '',
    phone: user?.phone ?? '',
    department: user?.department ?? '',
    designation: user?.designation ?? '',
    address: user?.address ?? '',
  }));
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: formData.name,
        email: formData.email,
        age: formData.age === '' ? null : Number(formData.age),
        gender: formData.gender || null,
        phone: formData.phone || null,
        department: formData.department || null,
        designation: formData.designation || null,
        address: formData.address || null,
      });
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error(error?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Account</p>
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit Profile
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4 border-b border-gray-200 pb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{user?.name || 'Admin User'}</h2>
            <p className="text-sm text-gray-500">{user?.role || 'admin'}</p>
          </div>
        </div>

        {isEditing ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-gray-700">
                Full Name
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                Email
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                Age
                <input
                  type="number"
                  name="age"
                  min="18"
                  max="100"
                  value={formData.age}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                Gender
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                Phone
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                Department
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
                Designation
                <input
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
                Address
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="3"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.name || 'Not available'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.email || 'Not available'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.role || 'admin'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Gender</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.gender || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Age</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.age ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.phone || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Department</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.department || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Designation</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.designation || 'Not specified'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500">Address</p>
              <p className="mt-1 text-lg font-medium text-gray-900">{user?.address || 'Not specified'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
