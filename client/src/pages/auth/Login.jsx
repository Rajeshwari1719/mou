import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import Input from '../../components/Input';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: location.state?.email || '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.message || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const email = formData.email.trim().toLowerCase();
    if (!email || !formData.password) { setError('Email and password are required.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email address.'); return; }
    setLoading(true);

    try {
      await login(email, formData.password);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (requestError) {
      const message = requestError.message || 'Login failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
            M
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MOU Management Portal</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="admin@example.com"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="password123"
          />

          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">Need an account? <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-700">Sign up</Link></p>
      </div>
    </div>
  );
};

export default LoginPage;
